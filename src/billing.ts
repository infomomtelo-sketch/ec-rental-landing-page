/**
 * Paid plans through Stripe: Checkout for new subscriptions, a webhook that keeps the account's plan in step
 * with Stripe, plan changes, and the Stripe billing portal (card, invoices, cancel).
 *
 * Everything stays switched off until the STRIPE_SECRET_KEY secret is set. The Worker then sets Stripe up by
 * itself on first use: it creates the three monthly prices (found again by lookup key), the webhook endpoint
 * (its signing secret is kept in app_settings) and a billing portal configuration. STRIPE_WEBHOOK_SECRET
 * overrides the stored signing secret if you'd rather create the webhook in the Stripe dashboard.
 * New Solo Landlord customers start on the intro offer instead of the free trial: $3 today covers their first
 * three months, then the plan renews at $29/month unless they cancel. In Stripe that is a one-time $3 line item
 * plus a trial that ends three months from checkout. The larger plans keep the free trial.
 * This must be EC Rental's own Stripe account, never Title 22's.
 */
import { isAdmin } from "./admin";

export interface BillingEnv {
  DB: D1Database;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_TRIAL_DAYS?: string;
  /** Only for local tests against a fake Stripe server. */
  STRIPE_API_BASE?: string;
  /** Comma-separated site owner emails (see src/admin.ts); they never see the billing banner. */
  ADMIN_EMAILS?: string;
}
interface BillingUser { id: number; name: string; email: string; plan: string; role: string; }
interface BillingRow { user_id: number; customer_id: string | null; subscription_id: string | null; status: string; plan: string | null; trial_end: string | null; period_end: string | null; cancel_at_period_end: number; }
type StripeObject = Record<string, any>;

export const PLANS: Record<string, { name: string; price: number; limit: number }> = {
  solo: { name: "Solo Landlord", price: 29, limit: 3 },
  manager: { name: "Property Manager", price: 79, limit: 25 },
  portfolio: { name: "Portfolio", price: 199, limit: 999999 },
};
/** The intro offer: one payment of `price` dollars covers the first `months` months of `plan`. */
export const INTRO = { plan: "solo", price: 3, months: 3 };
const LOOKUP_PREFIX = "ecrental_";
const lookupKey = (plan: string) => LOOKUP_PREFIX + plan + "_monthly";
const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
/** Stripe statuses that count as a working, paid-up (or trialing) plan. */
const GOOD_STATUSES = ["active", "trialing"];

/** True when the landlord has a paid-up or trialing plan. */
export async function hasActivePlan(env: BillingEnv, userId: number): Promise<boolean> {
  const row = await env.DB.prepare("SELECT status FROM billing WHERE user_id = ?").bind(userId).first<{ status: string }>();
  return !!row && GOOD_STATUSES.includes(row.status);
}

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
export function billingEnabled(env: BillingEnv): boolean { return !!env.STRIPE_SECRET_KEY; }
/** Test and live keys get separate webhook and portal settings, so switching keys just works. */
export function keyMode(env: BillingEnv): string { return env.STRIPE_SECRET_KEY!.includes("_live_") ? "live" : "test"; }
function trialDays(env: BillingEnv): number { const n = parseInt(env.STRIPE_TRIAL_DAYS ?? "14"); return Number.isFinite(n) && n > 0 ? Math.min(n, 90) : 0; }
const isoFromUnix = (t: unknown) => (typeof t === "number" && t > 0 ? new Date(t * 1000).toISOString() : null);

/** Flattens {a: {b: 1}, c: [x, y]} into Stripe's form encoding: a[b]=1&c[0]=x&c[1]=y */
function formEncode(params: Record<string, unknown>, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item !== null && typeof item === "object" ? formEncode(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") formEncode(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

/** Calls the Stripe API. `account` acts on a landlord's connected Stripe account (rent payments, src/rent-payments.ts). */
export async function stripe(env: BillingEnv, method: "GET" | "POST" | "DELETE", path: string, params: Record<string, unknown> = {}, account?: string): Promise<StripeObject> {
  const base = env.STRIPE_API_BASE || "https://api.stripe.com";
  const body = formEncode(params).toString();
  const target = method === "GET" && body ? `${base}/v1/${path}?${body}` : `${base}/v1/${path}`;
  const res = await fetch(target, {
    method,
    headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY, "Content-Type": "application/x-www-form-urlencoded", ...(account ? { "Stripe-Account": account } : {}) },
    body: method === "GET" ? undefined : body,
  });
  const data = await res.json().catch(() => ({})) as StripeObject;
  if (!res.ok) throw new Error(`Stripe ${method} ${path} ${res.status}: ${data?.error?.message || "unknown error"}`);
  return data;
}

export async function getSetting(env: BillingEnv, key: string): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}
export async function setSetting(env: BillingEnv, key: string, value: string): Promise<void> {
  await env.DB.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(key, value, new Date().toISOString()).run();
}

const priceCache = new Map<string, string>();
/** The monthly price for a plan, created in Stripe the first time it's needed. */
async function priceId(env: BillingEnv, plan: string): Promise<string> {
  const key = keyMode(env) + ":" + plan;
  const cached = priceCache.get(key);
  if (cached) return cached;
  const found = await stripe(env, "GET", "prices", { lookup_keys: [lookupKey(plan)], active: "true", limit: 1 });
  let id: string | undefined = found.data?.[0]?.id;
  if (!id) {
    const p = PLANS[plan];
    const created = await stripe(env, "POST", "prices", {
      currency: "usd", unit_amount: p.price * 100, recurring: { interval: "month" }, lookup_key: lookupKey(plan),
      product_data: { name: "EC Rental " + p.name, metadata: { plan } }, metadata: { plan },
    });
    id = created.id as string;
  }
  priceCache.set(key, id);
  return id;
}

function planFromSubscription(sub: StripeObject): string | null {
  const price = sub.items?.data?.[0]?.price;
  const fromKey = typeof price?.lookup_key === "string" && price.lookup_key.startsWith(LOOKUP_PREFIX) ? price.lookup_key.slice(LOOKUP_PREFIX.length).replace(/_monthly$/, "") : null;
  const plan = fromKey || price?.metadata?.plan || sub.metadata?.plan || null;
  return plan && plan in PLANS ? plan : null;
}

/** Makes sure Stripe will call our webhook. The signing secret is only shown once, so it's stored when created. */
async function ensureWebhook(env: BillingEnv, origin: string): Promise<void> {
  if (env.STRIPE_WEBHOOK_SECRET || !origin.startsWith("https://")) return;
  const endpointUrl = origin + "/api/stripe/webhook";
  const settingKey = `stripe_webhook:${keyMode(env)}:${endpointUrl}`;
  if (await getSetting(env, settingKey)) return;
  // An endpoint we can't read the secret of is useless to us, so replace it.
  const existing = await stripe(env, "GET", "webhook_endpoints", { limit: 100 });
  for (const ep of existing.data || []) if (ep.url === endpointUrl) await stripe(env, "DELETE", "webhook_endpoints/" + ep.id);
  const ep = await stripe(env, "POST", "webhook_endpoints", { url: endpointUrl, enabled_events: WEBHOOK_EVENTS, description: "EC Rental plans (created by the site)" });
  await setSetting(env, settingKey, JSON.stringify({ id: ep.id, secret: ep.secret }));
}

async function webhookSecrets(env: BillingEnv): Promise<string[]> {
  if (env.STRIPE_WEBHOOK_SECRET) return [env.STRIPE_WEBHOOK_SECRET];
  const rows = await env.DB.prepare("SELECT value FROM app_settings WHERE key LIKE ?").bind(`stripe_webhook:${keyMode(env)}:%`).all<{ value: string }>();
  return rows.results.map((r) => { try { return JSON.parse(r.value).secret as string; } catch { return ""; } }).filter(Boolean);
}

async function portalConfiguration(env: BillingEnv): Promise<string> {
  const settingKey = `stripe_portal:${keyMode(env)}`;
  const saved = await getSetting(env, settingKey);
  if (saved) return saved;
  const conf = await stripe(env, "POST", "billing_portal/configurations", {
    business_profile: { headline: "EC Rental Property Management billing" },
    features: {
      payment_method_update: { enabled: "true" },
      invoice_history: { enabled: "true" },
      customer_update: { enabled: "true", allowed_updates: ["email", "name", "address"] },
      subscription_cancel: { enabled: "true", mode: "at_period_end" },
    },
  });
  await setSetting(env, settingKey, conf.id);
  return conf.id;
}

async function billingRow(env: BillingEnv, userId: number): Promise<BillingRow | null> {
  return env.DB.prepare("SELECT * FROM billing WHERE user_id = ?").bind(userId).first<BillingRow>();
}

async function ensureCustomer(env: BillingEnv, user: BillingUser): Promise<string> {
  const row = await billingRow(env, user.id);
  if (row?.customer_id) return row.customer_id;
  const customer = await stripe(env, "POST", "customers", { email: user.email, name: user.name, metadata: { user_id: String(user.id) } });
  await env.DB.prepare("INSERT INTO billing (user_id, customer_id, status, updated_at) VALUES (?, ?, 'none', ?) ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id, updated_at = excluded.updated_at").bind(user.id, customer.id, new Date().toISOString()).run();
  return customer.id as string;
}

/** When the intro period would end if checkout happened now: the same day, `INTRO.months` months later. */
export function introEnd(now = new Date()): Date {
  const end = new Date(now.getTime());
  end.setUTCMonth(end.getUTCMonth() + INTRO.months);
  // Jan 31 + 1 month rolls into March; step back to the last day of the intended month instead.
  if (end.getUTCDate() !== now.getUTCDate()) end.setUTCDate(0);
  return end;
}

/** A Stripe Checkout page for the plan. New customers get the intro offer (Solo) or the free trial; returning ones don't. */
export async function createCheckout(env: BillingEnv, user: BillingUser, plan: string, origin: string): Promise<string> {
  await ensureWebhook(env, origin);
  const customer = await ensureCustomer(env, user);
  const row = await billingRow(env, user.id);
  const isNew = !row?.subscription_id;
  const intro = isNew && plan === INTRO.plan;
  const days = isNew && !intro ? trialDays(env) : 0;
  const lineItems: Record<string, unknown>[] = [{ price: await priceId(env, plan), quantity: 1 }];
  // Charged today on the first invoice; the monthly price starts when the trial ends.
  if (intro) lineItems.push({ price_data: { currency: "usd", unit_amount: INTRO.price * 100, product_data: { name: `EC Rental ${PLANS[plan].name}: first ${INTRO.months} months` } }, quantity: 1 });
  const session = await stripe(env, "POST", "checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: String(user.id),
    line_items: lineItems,
    subscription_data: {
      metadata: { user_id: String(user.id), plan, ...(intro ? { intro: "1" } : {}) },
      ...(intro ? { trial_end: Math.floor(introEnd().getTime() / 1000) } : days ? { trial_period_days: days } : {}),
    },
    metadata: { user_id: String(user.id), plan },
    allow_promotion_codes: "true",
    success_url: origin + "/dashboard?billing=success",
    cancel_url: origin + "/dashboard?billing=canceled",
  });
  return session.url as string;
}

/** Saves a subscription's state and moves the account onto its plan. */
async function applySubscription(env: BillingEnv, sub: StripeObject, fallbackUserId?: number): Promise<void> {
  let userId = parseInt(sub.metadata?.user_id) || fallbackUserId || 0;
  if (!userId && sub.customer) {
    const row = await env.DB.prepare("SELECT user_id FROM billing WHERE customer_id = ?").bind(String(sub.customer)).first<{ user_id: number }>();
    userId = row?.user_id || 0;
  }
  if (!userId) { console.warn("[stripe] subscription " + sub.id + " has no matching account"); return; }
  // Don't let an older, ended subscription overwrite a newer one on the same account.
  const current = await billingRow(env, userId);
  if (current?.subscription_id && current.subscription_id !== sub.id && GOOD_STATUSES.includes(current.status) && !GOOD_STATUSES.includes(sub.status)) return;
  const plan = planFromSubscription(sub);
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  await env.DB.prepare(
    "INSERT INTO billing (user_id, customer_id, subscription_id, status, plan, trial_end, period_end, cancel_at_period_end, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)" +
    " ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id, subscription_id = excluded.subscription_id, status = excluded.status, plan = excluded.plan, trial_end = excluded.trial_end, period_end = excluded.period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at"
  ).bind(userId, String(sub.customer || current?.customer_id || ""), sub.id, sub.status, plan, isoFromUnix(sub.trial_end), isoFromUnix(periodEnd), sub.cancel_at_period_end ? 1 : 0, new Date().toISOString()).run();
  if (plan && GOOD_STATUSES.includes(sub.status)) {
    // Never below the homes already in the account, so a smaller plan limit doesn't strand anyone's properties.
    await env.DB.prepare("UPDATE users SET plan = ?, property_limit = MAX(?, (SELECT COUNT(*) FROM properties WHERE user_id = ?)) WHERE id = ? AND role != 'tenant'").bind(plan, PLANS[plan].limit, userId, userId).run();
  }
}

export async function verifySignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",").map((p) => p.split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - parseInt(t)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  const expected = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

/** POST /api/stripe/webhook. Public; trusted only through the Stripe-Signature header. */
export async function handleStripeWebhook(request: Request, env: BillingEnv): Promise<Response> {
  if (!billingEnabled(env)) return json({ error: "Billing is not set up" }, 404);
  const payload = await request.text();
  const header = request.headers.get("Stripe-Signature") || "";
  let ok = false;
  for (const secret of await webhookSecrets(env)) if (await verifySignature(payload, header, secret)) { ok = true; break; }
  if (!ok) return json({ error: "Bad signature" }, 400);
  const event = JSON.parse(payload) as StripeObject;
  const obj = event.data?.object || {};
  if (event.type === "checkout.session.completed" && obj.mode === "subscription" && obj.subscription) {
    // Read the subscription back from Stripe so a replayed or out-of-order event can't set a stale state.
    const sub = await stripe(env, "GET", "subscriptions/" + obj.subscription);
    await applySubscription(env, sub, parseInt(obj.client_reference_id) || undefined);
  } else if (event.type?.startsWith("customer.subscription.")) {
    const sub = event.type === "customer.subscription.deleted" ? obj : await stripe(env, "GET", "subscriptions/" + obj.id);
    await applySubscription(env, sub);
  }
  return json({ received: true });
}

/** Handles /api/billing/* for a signed-in landlord. Returns null for other paths. */
export async function handleBillingRoutes(request: Request, env: BillingEnv, url: URL, user: BillingUser): Promise<Response | null> {
  if (url.pathname !== "/api/billing" && !url.pathname.startsWith("/api/billing/")) return null;
  const plans = Object.entries(PLANS).map(([id, p]) => ({ id, name: p.name, price: p.price, limit: p.limit }));

  if (url.pathname === "/api/billing" && request.method === "GET") {
    if (!billingEnabled(env)) return json({ enabled: false, plans });
    const row = await billingRow(env, user.id);
    return json({
      enabled: true, plans, trialDays: row?.subscription_id ? 0 : trialDays(env), exempt: isAdmin(env, user),
      intro: row?.subscription_id ? null : INTRO,
      status: row?.status || "none", plan: row?.plan || user.plan, trialEnd: row?.trial_end || null, periodEnd: row?.period_end || null,
      cancelAtPeriodEnd: !!row?.cancel_at_period_end, hasCustomer: !!row?.customer_id,
    });
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  if (!billingEnabled(env)) return json({ error: "Online billing isn't switched on yet." }, 503);

  if (url.pathname === "/api/billing/checkout") {
    const body = await request.json().catch(() => ({})) as { plan?: string };
    const plan = body.plan && body.plan in PLANS ? body.plan : (user.plan in PLANS ? user.plan : "solo");
    const row = await billingRow(env, user.id);
    if (row && GOOD_STATUSES.includes(row.status)) return json({ error: "You already have an active subscription. Use Change plan or Manage billing." }, 409);
    return json({ url: await createCheckout(env, user, plan, url.origin) });
  }

  if (url.pathname === "/api/billing/change") {
    const body = await request.json().catch(() => ({})) as { plan?: string };
    if (!body.plan || !(body.plan in PLANS)) return json({ error: "Choose a plan." }, 400);
    const row = await billingRow(env, user.id);
    if (!row?.subscription_id || !GOOD_STATUSES.includes(row.status)) return json({ url: await createCheckout(env, user, body.plan, url.origin) });
    const sub = await stripe(env, "GET", "subscriptions/" + row.subscription_id);
    const item = sub.items?.data?.[0];
    if (!item) return json({ error: "Couldn't read your subscription. Use Manage billing instead." }, 500);
    const updated = await stripe(env, "POST", "subscriptions/" + row.subscription_id, {
      items: [{ id: item.id, price: await priceId(env, body.plan) }],
      proration_behavior: "create_prorations",
      cancel_at_period_end: "false",
      // The $3 intro only covers Solo: moving up to a bigger plan ends the intro period and starts its monthly billing now.
      ...(sub.status === "trialing" && sub.metadata?.intro === "1" && body.plan !== INTRO.plan ? { trial_end: "now" } : {}),
      metadata: { user_id: String(user.id), plan: body.plan },
    });
    await applySubscription(env, updated, user.id);
    return json({ success: true, plan: body.plan });
  }

  if (url.pathname === "/api/billing/portal") {
    const row = await billingRow(env, user.id);
    if (!row?.customer_id) return json({ error: "Start a subscription first." }, 400);
    const session = await stripe(env, "POST", "billing_portal/sessions", { customer: row.customer_id, configuration: await portalConfiguration(env), return_url: url.origin + "/dashboard?billing=portal" });
    return json({ url: session.url });
  }

  return json({ error: "Not found" }, 404);
}
