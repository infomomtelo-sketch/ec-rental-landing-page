/**
 * Online rent payments through Stripe Connect.
 *
 * Each landlord connects their own Stripe account (a Standard account, onboarded through a Stripe-hosted page).
 * Tenants pay from the tenant portal by bank transfer (ACH) or card on a Stripe Checkout page, and the payment is
 * a direct charge on the landlord's account: the money, Stripe's fees, refunds and disputes are all the landlord's,
 * and EC Rental never holds tenant funds. A paid payment is written to `transactions` as rent, so it shows up in
 * Transactions, Tax Reports, the dashboard and the tenant's own payment history.
 *
 * Bank transfers take a few business days, so a payment stays "processing" until Stripe reports the result. The
 * Worker creates its own Connect webhook endpoint (signing secret kept in app_settings), and also re-reads the
 * Checkout session when the tenant comes back from Stripe, so a late webhook never leaves a payment stuck.
 * Needs Connect switched on in EC Rental's Stripe dashboard; never Title 22's Stripe account.
 */
import { billingEnabled, getSetting, hasActivePlan, keyMode, setSetting, stripe, verifySignature, type BillingEnv } from "./billing";

export interface RentPaymentsEnv extends BillingEnv {
  /** Optional override for the Connect webhook's signing secret, if the endpoint is made in the Stripe dashboard. */
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
}
interface RentUser { id: number; name: string; email: string; role: string; company: string; }
type SendEmail = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
type StripeObject = Record<string, any>;
interface PayoutAccount { user_id: number; mode: string; account_id: string; charges_enabled: number; payouts_enabled: number; details_submitted: number; }
interface RentPayment { id: number; tenancy_id: number; property_id: number; landlord_user_id: number; tenant_user_id: number; account_id: string; amount_cents: number; period: string; status: string; method: string; session_id: string | null; }

const CONNECT_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired", "account.updated"];
const MAX_RENT_CENTS = 50000 * 100;
class ConnectOff extends Error {}

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const dollars = (cents: number) => "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Today's date in Fresno, as YYYY-MM-DD (the format transactions use). */
const localDate = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
function periodLabel(period: string): string {
  const m = period.match(/^(\d{4})-(\d{2})$/);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, 15)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : "";
}

async function payoutAccount(env: RentPaymentsEnv, userId: number): Promise<PayoutAccount | null> {
  return env.DB.prepare("SELECT * FROM payout_accounts WHERE user_id = ? AND mode = ?").bind(userId, keyMode(env)).first<PayoutAccount>();
}
const accountStatus = (a: PayoutAccount | null) => (!a ? "none" : a.charges_enabled ? "ready" : "pending");

/** Saves what Stripe says about a connected account (can it take payments, can it pay out). */
async function saveAccount(env: RentPaymentsEnv, acct: StripeObject): Promise<void> {
  await env.DB.prepare("UPDATE payout_accounts SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?, updated_at = ? WHERE account_id = ?")
    .bind(acct.charges_enabled ? 1 : 0, acct.payouts_enabled ? 1 : 0, acct.details_submitted ? 1 : 0, new Date().toISOString(), String(acct.id)).run();
}

/** Makes sure Stripe sends events from connected accounts to us. The signing secret is only shown once, so it's stored. */
async function ensureConnectWebhook(env: RentPaymentsEnv, origin: string): Promise<void> {
  if (env.STRIPE_CONNECT_WEBHOOK_SECRET || !origin.startsWith("https://")) return;
  const endpointUrl = origin + "/api/stripe/connect-webhook";
  const settingKey = `stripe_connect_webhook:${keyMode(env)}:${endpointUrl}`;
  if (await getSetting(env, settingKey)) return;
  const existing = await stripe(env, "GET", "webhook_endpoints", { limit: 100 });
  for (const ep of existing.data || []) if (ep.url === endpointUrl) await stripe(env, "DELETE", "webhook_endpoints/" + ep.id);
  const ep = await stripe(env, "POST", "webhook_endpoints", { url: endpointUrl, enabled_events: CONNECT_EVENTS, connect: "true", description: "EC Rental online rent payments (created by the site)" });
  await setSetting(env, settingKey, JSON.stringify({ id: ep.id, secret: ep.secret }));
}

async function connectWebhookSecrets(env: RentPaymentsEnv): Promise<string[]> {
  if (env.STRIPE_CONNECT_WEBHOOK_SECRET) return [env.STRIPE_CONNECT_WEBHOOK_SECRET];
  const rows = await env.DB.prepare("SELECT value FROM app_settings WHERE key LIKE ?").bind(`stripe_connect_webhook:${keyMode(env)}:%`).all<{ value: string }>();
  return rows.results.map((r) => { try { return JSON.parse(r.value).secret as string; } catch { return ""; } }).filter(Boolean);
}

/**
 * Brings a rent payment in line with its Checkout session, read back from Stripe so a forged or replayed event
 * can't mark anything paid. Paying records the rent in transactions exactly once and emails the landlord.
 */
async function syncPayment(env: RentPaymentsEnv, row: RentPayment, sendEmail: SendEmail, origin: string): Promise<string> {
  if (!row.session_id || row.status === "paid") return row.status;
  const session = await stripe(env, "GET", "checkout/sessions/" + row.session_id, {}, row.account_id);
  if (session.status === "expired") {
    await env.DB.prepare("UPDATE rent_payments SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'started'").bind(new Date().toISOString(), row.id).run();
    return row.status === "started" ? "expired" : row.status;
  }
  if (session.status !== "complete" || !session.payment_intent) return row.status;
  const pi = await stripe(env, "GET", "payment_intents/" + session.payment_intent, { expand: ["payment_method"] }, row.account_id);
  const method = pi.payment_method?.type === "us_bank_account" ? "bank" : pi.payment_method?.type === "card" ? "card" : String(pi.payment_method?.type || "");
  const status = pi.status === "succeeded" ? "paid" : pi.status === "requires_payment_method" || pi.status === "canceled" ? "failed" : "processing";
  if (status === row.status) return status;
  const now = new Date().toISOString();
  const update = await env.DB.prepare("UPDATE rent_payments SET status = ?, method = ?, payment_intent = ?, failure = ?, paid_at = ?, updated_at = ? WHERE id = ? AND status != 'paid'")
    .bind(status, method, String(pi.id), status === "failed" ? String(pi.last_payment_error?.message || "The payment didn't go through.").slice(0, 300) : "", status === "paid" ? now : null, now, row.id).run();
  if (!update.meta.changes || (status !== "paid" && status !== "failed")) return status;

  const info = await env.DB.prepare("SELECT p.address, u.name AS tenant_name, l.email AS landlord_email FROM properties p JOIN users u ON u.id = ? JOIN users l ON l.id = ? WHERE p.id = ?")
    .bind(row.tenant_user_id, row.landlord_user_id, row.property_id).first<{ address: string; tenant_name: string; landlord_email: string }>();
  const address = info?.address || "your property", tenant = info?.tenant_name || "Your tenant", month = periodLabel(row.period);
  const how = method === "bank" ? "bank transfer" : method === "card" ? "card" : "online payment";
  if (status === "paid") {
    const tx = await env.DB.prepare("INSERT INTO transactions (property_id, type, amount, description, date, created_at) VALUES (?, 'rent', ?, ?, ?, ?)")
      .bind(row.property_id, row.amount_cents / 100, `Rent paid online by ${tenant} (${how})${month ? " for " + month : ""}`, localDate(), now).run();
    await env.DB.prepare("UPDATE rent_payments SET transaction_id = ? WHERE id = ?").bind(Number(tx.meta.last_row_id), row.id).run();
    if (info) await sendEmail(info.landlord_email, `Rent received: ${dollars(row.amount_cents)} for ${address}`,
      `<p>${escapeHtml(tenant)} paid <strong>${dollars(row.amount_cents)}</strong> rent${month ? " for " + month : ""} for <strong>${escapeHtml(address)}</strong> by ${how}.</p><p>Stripe pays it out to your bank on your usual payout schedule. It's already recorded in your Transactions.</p><p><a href="${origin}/dashboard">Open your dashboard</a></p>`,
      `${tenant} paid ${dollars(row.amount_cents)} rent${month ? " for " + month : ""} for ${address} by ${how}.\n\nStripe pays it out to your bank on your usual payout schedule. It's already recorded in your Transactions.\n\n${origin}/dashboard`).catch(() => false);
  } else if (info) {
    await sendEmail(info.landlord_email, `Rent payment failed for ${address}`,
      `<p>${escapeHtml(tenant)}'s ${how} of <strong>${dollars(row.amount_cents)}</strong>${month ? " for " + month : ""} for <strong>${escapeHtml(address)}</strong> didn't go through. They can try again from their tenant portal.</p>`,
      `${tenant}'s ${how} of ${dollars(row.amount_cents)}${month ? " for " + month : ""} for ${address} didn't go through. They can try again from their tenant portal.`).catch(() => false);
  }
  return status;
}

/** POST /api/stripe/connect-webhook. Public; trusted only through the Stripe-Signature header. */
export async function handleConnectWebhook(request: Request, env: RentPaymentsEnv, url: URL, sendEmail: SendEmail): Promise<Response> {
  if (!billingEnabled(env)) return json({ error: "Payments are not set up" }, 404);
  const payload = await request.text();
  const header = request.headers.get("Stripe-Signature") || "";
  let ok = false;
  for (const secret of await connectWebhookSecrets(env)) if (await verifySignature(payload, header, secret)) { ok = true; break; }
  if (!ok) return json({ error: "Bad signature" }, 400);
  const event = JSON.parse(payload) as StripeObject;
  const obj = event.data?.object || {};
  if (event.type === "account.updated" && obj.id) {
    await saveAccount(env, await stripe(env, "GET", "accounts/" + obj.id));
  } else if (event.type?.startsWith("checkout.session.") && obj.id && event.account) {
    // Only act when the event came from the same connected account the payment was made on.
    const row = await env.DB.prepare("SELECT * FROM rent_payments WHERE session_id = ? AND account_id = ?").bind(String(obj.id), String(event.account)).first<RentPayment>();
    if (row) await syncPayment(env, row, sendEmail, url.origin);
  }
  return json({ received: true });
}

/** Landlord routes: GET /api/rent-payments (status + recent payments), POST /api/rent-payments/connect (Stripe setup). */
export async function handleLandlordRentPayments(request: Request, env: RentPaymentsEnv, url: URL, user: RentUser): Promise<Response | null> {
  if (url.pathname !== "/api/rent-payments" && !url.pathname.startsWith("/api/rent-payments/")) return null;
  try { return await landlordRoutes(request, env, url, user); }
  catch (err) {
    // Show Stripe's own reason too: it names the step still missing in EC Rental's Stripe Connect setup.
    if (err instanceof ConnectOff) return json({ error: "Online rent payments aren't open for new landlords yet. Please try again later." + (err.message ? "\n\nStripe says: " + err.message : "") }, 503);
    throw err;
  }
}

async function landlordRoutes(request: Request, env: RentPaymentsEnv, url: URL, user: RentUser): Promise<Response> {

  if (url.pathname === "/api/rent-payments" && request.method === "GET") {
    if (!billingEnabled(env)) return json({ enabled: false });
    let account = await payoutAccount(env, user.id);
    // Landlords come back from Stripe's setup pages before the webhook lands, so check with Stripe while not ready.
    if (account && !(account.charges_enabled && account.payouts_enabled)) {
      try { await saveAccount(env, await stripe(env, "GET", "accounts/" + account.account_id)); account = await payoutAccount(env, user.id); } catch (err) { console.error("[rent-payments] account refresh", err instanceof Error ? err.message : err); }
    }
    const payments = await env.DB.prepare("SELECT r.id, r.amount_cents, r.period, r.status, r.method, r.failure, r.created_at, r.paid_at, p.address, u.name AS tenant_name FROM rent_payments r JOIN properties p ON r.property_id = p.id JOIN users u ON r.tenant_user_id = u.id WHERE r.landlord_user_id = ? AND r.status IN ('processing', 'paid', 'failed') ORDER BY r.created_at DESC LIMIT 25").bind(user.id).all();
    return json({ enabled: true, status: accountStatus(account), payoutsEnabled: !!account?.payouts_enabled, planOk: await hasActivePlan(env, user.id), payments: payments.results });
  }

  if (url.pathname === "/api/rent-payments/connect" && request.method === "POST") {
    if (!billingEnabled(env)) return json({ error: "Online payments aren't switched on yet." }, 503);
    // Online rent payments come with an EC Rental plan (paid or in its free trial).
    if (!(await hasActivePlan(env, user.id))) return json({ error: "Online rent payments come with an EC Rental plan. Choose a plan in Plan & Billing first." }, 402);
    await ensureConnectWebhook(env, url.origin);
    let account = await payoutAccount(env, user.id);
    if (!account) {
      // Same setup as a Standard account (landlord's own full Stripe Dashboard, Stripe collects their details and
      // carries losses, landlord pays the fees), described with controller properties, which is how Stripe's newer
      // Connect platform setup expects it. Falls back to the older `type: "standard"` form.
      const base = { country: "US", email: user.email,
        business_profile: { name: user.company || user.name, product_description: "Residential rent collected through EC Rental Property Management" },
        metadata: { user_id: String(user.id) } };
      const acct = await stripe(env, "POST", "accounts", { ...base, controller: { fees: { payer: "account" }, losses: { payments: "stripe" }, requirement_collection: "stripe", stripe_dashboard: { type: "full" } } })
        .catch((first: Error) => stripe(env, "POST", "accounts", { ...base, type: "standard" }).catch((err: Error) => {
          console.error("[rent-payments] Stripe refused a connected account:", first.message, "|", err.message);
          // Stripe refuses until EC Rental's own Connect setup is finished (one-time, in the Stripe dashboard).
          if (!/connect/i.test(err.message)) throw err;
          throw new ConnectOff(first.message.replace(/^Stripe \w+ \S+ \d+: /, "").slice(0, 400));
        }));
      await env.DB.prepare("INSERT INTO payout_accounts (user_id, mode, account_id, charges_enabled, payouts_enabled, details_submitted, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(user.id, keyMode(env), acct.id, acct.charges_enabled ? 1 : 0, acct.payouts_enabled ? 1 : 0, acct.details_submitted ? 1 : 0, new Date().toISOString()).run();
      account = await payoutAccount(env, user.id);
    }
    const link = await stripe(env, "POST", "account_links", { account: account!.account_id, type: "account_onboarding", refresh_url: url.origin + "/dashboard?payouts=retry", return_url: url.origin + "/dashboard?payouts=done" });
    return json({ url: link.url });
  }
  return json({ error: "Not found" }, 404);
}

/** Tenant routes: GET /api/tenant/rent, POST /api/tenant/rent/checkout, GET /api/tenant/rent/status?session_id= */
export async function handleTenantRentPayments(request: Request, env: RentPaymentsEnv, url: URL, user: RentUser, sendEmail: SendEmail): Promise<Response | null> {
  if (url.pathname !== "/api/tenant/rent" && !url.pathname.startsWith("/api/tenant/rent/")) return null;
  if (user.role !== "tenant") return json({ error: "This is for tenant accounts." }, 403);
  const homeSql = "SELECT t.id AS tenancy_id, t.property_id, t.landlord_user_id, p.address, p.rent_amount FROM tenancies t JOIN properties p ON t.property_id = p.id WHERE t.tenant_user_id = ? AND t.status = 'active'";
  type Home = { tenancy_id: number; property_id: number; landlord_user_id: number; address: string; rent_amount: number };

  if (url.pathname === "/api/tenant/rent" && request.method === "GET") {
    const homes = (await env.DB.prepare(homeSql).bind(user.id).all<Home>()).results;
    const out = [];
    for (const h of homes) {
      const account = billingEnabled(env) ? await payoutAccount(env, h.landlord_user_id) : null;
      // Paid ones already show in the portal's payment history (they're rent transactions), so only list the rest.
      const pending = await env.DB.prepare("SELECT id, amount_cents, period, status, method, failure, created_at FROM rent_payments WHERE tenancy_id = ? AND tenant_user_id = ? AND status IN ('processing', 'failed') ORDER BY created_at DESC LIMIT 10").bind(h.tenancy_id, user.id).all();
      out.push({ tenancy_id: h.tenancy_id, can_pay_online: !!account?.charges_enabled, rent: h.rent_amount, payments: pending.results });
    }
    return json(out);
  }

  if (url.pathname === "/api/tenant/rent/checkout" && request.method === "POST") {
    if (!billingEnabled(env)) return json({ error: "Online rent payments aren't available yet." }, 503);
    const body = await request.json().catch(() => ({})) as { tenancy_id?: unknown; amount?: unknown; period?: unknown };
    const home = await env.DB.prepare(homeSql + " AND t.id = ?").bind(user.id, Number(body.tenancy_id)).first<Home>();
    if (!home) return json({ error: "Home not found" }, 404);
    const account = await payoutAccount(env, home.landlord_user_id);
    if (!account?.charges_enabled) return json({ error: "Your landlord hasn't set up online payments yet. Ask them how they'd like to be paid." }, 409);
    const cents = Math.round(Number(body.amount) * 100);
    if (!Number.isFinite(cents) || cents < 100 || cents > MAX_RENT_CENTS) return json({ error: "Enter an amount between $1 and $50,000." }, 400);
    const period = typeof body.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.period) ? body.period : localDate().slice(0, 7);
    await ensureConnectWebhook(env, url.origin);
    const now = new Date().toISOString();
    const res = await env.DB.prepare("INSERT INTO rent_payments (tenancy_id, property_id, landlord_user_id, tenant_user_id, account_id, amount_cents, period, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'started', ?, ?)")
      .bind(home.tenancy_id, home.property_id, home.landlord_user_id, user.id, account.account_id, cents, period, now, now).run();
    const paymentId = String(res.meta.last_row_id);
    const description = `Rent for ${home.address}, ${periodLabel(period)}`;
    const params: Record<string, unknown> = {
      mode: "payment",
      payment_method_types: ["us_bank_account", "card"],
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: cents, product_data: { name: description } } }],
      customer_email: user.email,
      client_reference_id: paymentId,
      metadata: { rent_payment_id: paymentId, tenancy_id: String(home.tenancy_id), period },
      payment_intent_data: { description, receipt_email: user.email, metadata: { rent_payment_id: paymentId, tenancy_id: String(home.tenancy_id), period } },
      success_url: url.origin + "/tenant?rent=done&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: url.origin + "/tenant?rent=canceled",
    };
    let session: StripeObject;
    try { session = await stripe(env, "POST", "checkout/sessions", params, account.account_id); }
    catch (err) {
      // A landlord whose Stripe account can't take bank debits yet still gets whatever methods it does accept.
      if (!(err instanceof Error && /payment method|us_bank_account/i.test(err.message))) throw err;
      delete params.payment_method_types;
      session = await stripe(env, "POST", "checkout/sessions", params, account.account_id);
    }
    await env.DB.prepare("UPDATE rent_payments SET session_id = ? WHERE id = ?").bind(String(session.id), Number(paymentId)).run();
    return json({ url: session.url });
  }

  if (url.pathname === "/api/tenant/rent/status" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM rent_payments WHERE session_id = ? AND tenant_user_id = ?").bind(String(url.searchParams.get("session_id") || ""), user.id).first<RentPayment>();
    if (!row) return json({ error: "Payment not found" }, 404);
    if (!billingEnabled(env)) return json({ status: row.status, amount_cents: row.amount_cents });
    return json({ status: await syncPayment(env, row, sendEmail, url.origin), amount_cents: row.amount_cents });
  }
  return json({ error: "Not found" }, 404);
}
