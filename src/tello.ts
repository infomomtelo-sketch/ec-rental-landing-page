/**
 * Tello's view of a landlord's account. Builds the "Today" briefing (rent not recorded, leases ending, urgent repairs,
 * new applications, documents to sign...) shown on the dashboard and in Ask Tello, the account snapshot Tello answers
 * questions from, and the optional morning email (daily cron). Read-only: Tello never changes the landlord's data.
 */
import { keyMode, type BillingEnv } from "./billing";

export interface TelloEnv extends BillingEnv { DB: D1Database; ELEVENLABS_API_KEY?: string; ELEVENLABS_VOICE_ID?: string; DEEPINFRA_API_KEY?: string; TELLO_KOKORO_VOICE?: string; }
type SendEmail = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
interface TelloUser { id: number; name: string; role: string; }

export type Urgency = "now" | "soon" | "info";
export interface BriefingItem { kind: string; urgency: Urgency; title: string; detail: string; page: string; }
export interface Briefing { date: string; items: BriefingItem[]; snapshot: string; }

const DAY = 86400000;
const URGENCY_ORDER: Record<Urgency, number> = { now: 0, soon: 1, info: 2 };

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const plural = (n: number, one: string, many = one + "s") => n + " " + (n === 1 ? one : many);
/** Today's date in Fresno as a UTC-midnight timestamp, so date math ignores time zones. */
function todayUtc(now = new Date()): number { return Date.parse(now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T00:00:00Z"); }
const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const dateOnly = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? Date.parse(s.slice(0, 10) + "T00:00:00Z") : NaN);
const clip = (s: string, n: number) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

interface Property { id: number; address: string; city: string; rent_amount: number; tenant_name: string; lease_start: string; lease_end: string; status: string; }

/** Everything Tello knows about one landlord's account today. */
export async function buildBriefing(env: TelloEnv, userId: number, now = new Date()): Promise<Briefing> {
  const today = todayUtc(now), d = new Date(today), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const items: BriefingItem[] = [];
  const add = (kind: string, urgency: Urgency, title: string, detail: string, page: string) => items.push({ kind, urgency, title, detail, page });

  const [propsRes, reminder, maintRes, appsRes, docsRes, invitesRes, listingsRes, inquiries, billing, txRes] = await Promise.all([
    env.DB.prepare("SELECT id, address, city, rent_amount, tenant_name, lease_start, lease_end, status FROM properties WHERE user_id = ? ORDER BY address LIMIT 200").bind(userId).all<Property>(),
    env.DB.prepare("SELECT due_day, late_after FROM rent_reminder_settings WHERE user_id = ?").bind(userId).first<{ due_day: number; late_after: number }>(),
    env.DB.prepare("SELECT m.id, m.description, m.priority, m.created_at, p.address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? AND m.status = 'open' ORDER BY m.created_at LIMIT 100").bind(userId).all<{ id: number; description: string; priority: string; created_at: string; address: string }>(),
    env.DB.prepare("SELECT a.first_name, a.last_name, a.created_at, l.street FROM applications a JOIN listings l ON a.listing_id = l.id WHERE a.landlord_user_id = ? AND a.status IN ('new', 'reviewing') ORDER BY a.created_at DESC LIMIT 50").bind(userId).all<{ first_name: string; last_name: string; created_at: string; street: string }>(),
    env.DB.prepare("SELECT d.title, s.status, s.requested_at FROM document_signing s JOIN documents d ON d.id = s.document_id WHERE d.user_id = ? AND s.status IN ('awaiting_landlord', 'awaiting_tenant') ORDER BY s.requested_at LIMIT 50").bind(userId).all<{ title: string; status: string; requested_at: string }>(),
    env.DB.prepare("SELECT t.email, t.invite_expires_at, p.address FROM tenancies t JOIN properties p ON p.id = t.property_id WHERE t.landlord_user_id = ? AND t.status = 'invited' LIMIT 50").bind(userId).all<{ email: string; invite_expires_at: string; address: string }>(),
    env.DB.prepare("SELECT property_id, status, street FROM listings WHERE user_id = ? LIMIT 200").bind(userId).all<{ property_id: number | null; status: string; street: string }>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM signups s JOIN listings l ON l.id = (CASE WHEN json_valid(s.message) THEN json_extract(s.message, '$.listingId') END) WHERE s.plan = 'tenant_application' AND l.user_id = ? AND s.created_at >= ?").bind(userId, new Date(today - 3 * DAY).toISOString()).first<{ n: number }>(),
    env.DB.prepare("SELECT status, trial_end, period_end, cancel_at_period_end FROM billing WHERE user_id = ?").bind(userId).first<{ status: string; trial_end: string | null; period_end: string | null; cancel_at_period_end: number }>(),
    env.DB.prepare("SELECT t.property_id, t.type, t.amount, t.date FROM transactions t JOIN properties p ON p.id = t.property_id WHERE p.user_id = ? AND t.date >= ? ORDER BY t.date").bind(userId, iso(Date.UTC(y, 0, 1) - 45 * DAY)).all<{ property_id: number; type: string; amount: number; date: string }>(),
  ]);
  const props = propsRes.results, tx = txRes.results;

  // Rent: a property with a tenant and a rent amount is "not recorded" once the grace days after the due date pass.
  const dueDay = reminder?.due_day || 1, grace = reminder?.late_after || 5;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const due = Date.UTC(y, m, Math.min(dueDay, lastDay)), period = iso(due).slice(0, 7);
  const rented = props.filter((p) => p.rent_amount > 0 && (p.status === "occupied" || !!p.tenant_name));
  const online = rented.length ? await env.DB.prepare(`SELECT DISTINCT property_id FROM rent_payments WHERE landlord_user_id = ? AND period = ? AND status IN ('paid', 'processing')`).bind(userId, period).all<{ property_id: number }>() : { results: [] };
  const paidOnline = new Set(online.results.map((r) => r.property_id));
  const rentThisMonth = new Map<number, number>();
  for (const t of tx) if (t.type === "rent" && t.date >= iso(due - 15 * DAY) && t.date <= iso(today)) rentThisMonth.set(t.property_id, (rentThisMonth.get(t.property_id) || 0) + t.amount);
  const rentStatus = new Map<number, string>();
  for (const p of rented) {
    const covered = paidOnline.has(p.id) || (rentThisMonth.get(p.id) || 0) >= p.rent_amount - 0.005;
    if (covered) { rentStatus.set(p.id, "recorded"); continue; }
    const who = p.tenant_name ? p.tenant_name + " at " : "";
    if (today >= due + grace * DAY) { rentStatus.set(p.id, "not recorded, past due"); add("rent", "now", `Rent not recorded: ${who}${p.address}`, `${money(p.rent_amount)} was due ${longDate(due)}. If it came in another way, add it in Transactions so reminders stop.`, "transactions"); }
    else if (today >= due) { rentStatus.set(p.id, "not recorded yet, inside grace period"); add("rent", "soon", `Rent due: ${who}${p.address}`, `${money(p.rent_amount)} was due ${longDate(due)} and isn't recorded yet. It counts as late after ${shortDate(due + grace * DAY)}.`, "transactions"); }
    else rentStatus.set(p.id, `due ${shortDate(due)}`);
  }

  // Leases ending in the next 60 days, or already past their end date while still rented.
  for (const p of rented) {
    const end = dateOnly(p.lease_end); if (isNaN(end)) continue;
    const days = Math.round((end - today) / DAY), who = p.tenant_name ? `${p.tenant_name}'s lease` : "The lease";
    if (days < 0 && days >= -45) add("lease", "soon", `Lease ended: ${p.address}`, `${who} ended ${shortDate(end)}. Renew it in Documents; if rent keeps being accepted, it usually continues month to month.`, "documents");
    else if (days >= 0 && days <= 30) add("lease", "now", `Lease ends in ${plural(days, "day")}: ${p.address}`, `${who} ends ${longDate(end)}. Decide on a renewal or a move-out inspection now.`, "documents");
    else if (days > 30 && days <= 60) add("lease", "soon", `Lease ends ${shortDate(end)}: ${p.address}`, `${who} ends in ${plural(days, "day")}. In California a rent increase needs 30 days' written notice (90 if over 10%).`, "documents");
  }

  // Repairs: emergencies and high priority first, then anything open over two weeks.
  const maint = maintRes.results;
  for (const r of maint.filter((r) => r.priority === "emergency" || r.priority === "high")) add("maintenance", "now", `${r.priority === "emergency" ? "Emergency" : "High priority"} repair: ${r.address}`, clip(r.description, 120), "maintenance");
  const stale = maint.filter((r) => r.priority !== "emergency" && r.priority !== "high" && today - Date.parse(r.created_at) > 14 * DAY);
  if (stale.length) add("maintenance", "soon", `${plural(stale.length, "repair request")} open over 2 weeks`, stale.slice(0, 3).map((r) => `${r.address}: ${clip(r.description, 50)}`).join("; "), "maintenance");
  const others = maint.length - stale.length - maint.filter((r) => r.priority === "emergency" || r.priority === "high").length;
  if (others > 0) add("maintenance", "info", `${plural(others, "other open repair request")}`, "Use AI triage on each one for a priority and a reply to the tenant.", "maintenance");

  // Signatures, applications, inquiries, invites.
  const toSign = docsRes.results.filter((s) => s.status === "awaiting_landlord");
  if (toSign.length) add("document", "now", `${plural(toSign.length, "document")} waiting for your signature`, `Your tenant signed ${toSign.slice(0, 3).map((s) => `"${clip(s.title, 40)}"`).join(", ")}. Countersign it to finish.`, "documents");
  const waiting = docsRes.results.filter((s) => s.status === "awaiting_tenant" && today - Date.parse(s.requested_at) > 5 * DAY);
  if (waiting.length) add("document", "info", `${plural(waiting.length, "document")} still unsigned by tenants`, "Sent more than 5 days ago. A quick text to your tenant usually does it.", "documents");
  const apps = appsRes.results;
  if (apps.length) add("application", "soon", `${plural(apps.length, "application")} to review`, apps.slice(0, 3).map((a) => `${a.first_name} ${a.last_name.slice(0, 1)}. for ${a.street}`).join(", ") + ". Open each one and tap AI summary.", "applications");
  if (inquiries?.n) add("inquiry", "soon", `${plural(inquiries.n, "new renter inquiry", "new renter inquiries")}`, "From the last 3 days. Quick replies rent homes faster; Draft reply writes one for you.", "listings");
  const expiring = invitesRes.results.filter((t) => Date.parse(t.invite_expires_at) - Date.now() < 2 * DAY);
  if (expiring.length) add("tenant", "info", `${plural(expiring.length, "tenant invite")} not accepted`, expiring.slice(0, 2).map((t) => `${t.email} (${t.address})`).join(", ") + (Date.parse(expiring[0].invite_expires_at) < Date.now() ? ". The invite expired; resend it from Tenants." : ". Expiring soon; resend it from Tenants if needed."), "tenants");

  // Vacant homes with no active listing, and draft listings.
  const listed = new Set(listingsRes.results.filter((l) => l.status === "active" && l.property_id).map((l) => l.property_id));
  const vacant = props.filter((p) => p.status === "vacant" && !listed.has(p.id));
  if (vacant.length) add("listing", "soon", `${plural(vacant.length, "vacant home")} not listed`, vacant.slice(0, 3).map((p) => p.address).join(", ") + ". Make a listing so it shows on your page and the Zillow feed.", "listings");
  const drafts = listingsRes.results.filter((l) => l.status === "draft");
  if (drafts.length) add("listing", "info", `${plural(drafts.length, "listing")} still a draft`, drafts.slice(0, 3).map((l) => l.street).join(", ") + ". Set it to Active when it's ready.", "listings");

  // Plan and payouts.
  if (billing?.status === "past_due" || billing?.status === "unpaid") add("billing", "now", "Your EC Rental payment didn't go through", "Update your card in Settings, Plan & Billing to keep reminders and online rent working.", "settings");
  if (env.STRIPE_SECRET_KEY) {
    const payout = await env.DB.prepare("SELECT details_submitted, charges_enabled FROM payout_accounts WHERE user_id = ? AND mode = ?").bind(userId, keyMode(env)).first<{ details_submitted: number; charges_enabled: number }>();
    if (payout && !payout.charges_enabled) add("payments", "info", "Online rent payments aren't finished", "Stripe still needs a few details. Tap Finish Stripe setup in Settings.", "settings");
  }
  if (!props.length) add("start", "info", "Add your first property", "Tap + Add Property on Properties. Then I can track rent, leases and repairs for you.", "properties");

  items.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);

  // The snapshot Tello answers from: plain facts, no emails, phone numbers or bank details.
  const yearStart = `${y}-01-01`;
  const sum = (type: string, from: string) => tx.filter((t) => t.type === type && t.date >= from).reduce((s, t) => s + t.amount, 0);
  const monthStart = iso(Date.UTC(y, m, 1));
  const lines: string[] = [
    `Today is ${longDate(today)}, ${y}. Rent is due on day ${dueDay} of each month; it counts as late ${grace} days after.`,
    `Properties (${props.length}, ${props.filter((p) => p.status === "occupied").length} occupied, ${props.filter((p) => p.status === "vacant").length} vacant):`,
    ...props.slice(0, 40).map((p) => `- ${p.address}${p.city ? ", " + p.city : ""}: ${p.status}; rent ${money(p.rent_amount)}/mo; tenant ${p.tenant_name || "none"}; lease ${p.lease_start || "?"} to ${p.lease_end || "?"}; this month's rent: ${rentStatus.get(p.id) || "n/a"}`),
    `Money recorded in Transactions: rent this month ${money(sum("rent", monthStart))}; this year rent ${money(sum("rent", yearStart))}, expenses ${money(sum("expense", yearStart))}.`,
    `Open repair requests (${maint.length}):`, ...maint.slice(0, 15).map((r) => `- ${r.address}: ${r.priority}, opened ${shortDate(Date.parse(r.created_at))}: ${clip(r.description, 90)}`),
    `Applications to review: ${apps.length ? apps.slice(0, 8).map((a) => `${a.first_name} ${a.last_name} for ${a.street} (received ${shortDate(Date.parse(a.created_at))})`).join("; ") : "none"}.`,
    `Documents out for signature: ${docsRes.results.length ? docsRes.results.slice(0, 8).map((s) => `"${clip(s.title, 40)}" ${s.status === "awaiting_landlord" ? "waiting for the landlord" : "waiting for the tenant"}`).join("; ") : "none"}.`,
    `Listings: ${listingsRes.results.length ? listingsRes.results.slice(0, 15).map((l) => `${l.street} (${l.status})`).join("; ") : "none"}. New renter inquiries in the last 3 days: ${inquiries?.n || 0}.`,
    `Tenant portal invites not accepted yet: ${invitesRes.results.length}.`,
    billing ? `EC Rental plan status: ${billing.status}${billing.cancel_at_period_end ? " (cancels at period end)" : ""}.` : "EC Rental plan: not started.",
    `Today's briefing: ${items.length ? items.map((i) => `[${i.urgency}] ${i.title}. ${i.detail}`).join(" | ") : "nothing needs attention."}`,
  ];
  return { date: iso(today), items, snapshot: lines.join("\n") };
}

/** Added to Tello's instructions when a signed-in landlord asks from the dashboard. */
export function accountGuide(name: string, snapshot: string): string {
  return `
You can see this landlord's account (read-only). Their name is ${name || "unknown"}. Answer questions about their rentals from these facts, using real addresses, names, amounts and dates. Never invent a tenant, payment or date that isn't listed; if something isn't here, say you don't see it and where in the dashboard they can check. "Not recorded" means not entered in Transactions or paid online; it might have been paid another way, so say that gently. You can't change anything yourself; tell them which page and button to use. When asked what needs attention, go through today's briefing most urgent first.
ACCOUNT FACTS:
${snapshot}
END OF ACCOUNT FACTS.`;
}

/** GET /api/tello/briefing and PUT /api/tello/settings for the signed-in landlord. */
export async function handleTelloRoutes(request: Request, env: TelloEnv, url: URL, user: TelloUser): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/tello/")) return null;
  if (user.role === "tenant") return json({ error: "This is for landlord accounts." }, 403);
  if (url.pathname === "/api/tello/briefing" && request.method === "GET") {
    const b = await buildBriefing(env, user.id);
    const s = await env.DB.prepare("SELECT morning_email FROM tello_settings WHERE user_id = ?").bind(user.id).first<{ morning_email: number }>();
    return json({ date: b.date, name: (user.name || "").split(" ")[0], items: b.items, morning_email: !!s?.morning_email });
  }
  if (url.pathname === "/api/tello/settings" && request.method === "PUT") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const on = body.morning_email ? 1 : 0;
    await env.DB.prepare("INSERT INTO tello_settings (user_id, morning_email, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET morning_email = excluded.morning_email, updated_at = excluded.updated_at").bind(user.id, on, new Date().toISOString()).run();
    return json({ morning_email: !!on });
  }
  if (url.pathname === "/api/tello/voice" && request.method === "POST") return tellVoice(request, env, user.id);
  return json({ error: "Not found" }, 404);
}

const voiceHits = new Map<number, number[]>();
function b64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
/** Tello's own voice for signed-in landlords: hosted Kokoro (af_heart, the voice in the Tello videos) when DEEPINFRA_API_KEY is set,
 *  else ElevenLabs when ELEVENLABS_API_KEY is set. With neither, the page falls back to the shared AI voice. */
async function tellVoice(request: Request, env: TelloEnv, userId: number): Promise<Response> {
  if (!env.DEEPINFRA_API_KEY && !env.ELEVENLABS_API_KEY) return json({ error: "voice_off" }, 503);
  const now = Date.now(), list = (voiceHits.get(userId) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 40) return json({ error: "Too many requests. Please wait a few minutes." }, 429);
  list.push(now); voiceHits.set(userId, list);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const text = String(body.text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 320);
  if (text.length < 2) return json({ error: "Nothing to say." }, 400);
  if (env.DEEPINFRA_API_KEY) {
    try {
      const r = await fetch("https://api.deepinfra.com/v1/openai/audio/speech", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.DEEPINFRA_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "hexgrad/Kokoro-82M", input: text, voice: (env.TELLO_KOKORO_VOICE || "af_heart").replace(/[^a-z_]/g, ""), response_format: "mp3" }),
      });
      if (r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        if (bytes.length > 500) return json({ audio: "data:audio/mpeg;base64," + b64(bytes) });
      } else console.error("tello voice kokoro", r.status);
    } catch (e) { console.error("tello voice kokoro", (e as Error)?.message); }
    if (!env.ELEVENLABS_API_KEY) return json({ error: "voice_failed" }, 503);
  }
  const voice = (env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL").replace(/[^A-Za-z0-9]/g, "");
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY as string, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_turbo_v2_5", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.25 } }),
    });
    if (!r.ok) { console.error("tello voice elevenlabs", r.status); return json({ error: "voice_failed" }, 503); }
    return json({ audio: "data:audio/mpeg;base64," + b64(new Uint8Array(await r.arrayBuffer())) });
  } catch (e) { console.error("tello voice elevenlabs", (e as Error)?.message); return json({ error: "voice_failed" }, 503); }
}

/** Daily cron: emails the briefing to landlords who switched it on, only on days something needs them. Returns how many went out. */
export async function runTelloBriefings(env: TelloEnv, sendEmail: SendEmail, origin: string, now = new Date()): Promise<number> {
  const today = iso(todayUtc(now));
  const rows = await env.DB.prepare("SELECT s.user_id, u.email, u.name FROM tello_settings s JOIN users u ON u.id = s.user_id WHERE s.morning_email = 1 AND (s.last_sent IS NULL OR s.last_sent < ?) AND u.role != 'tenant'").bind(today).all<{ user_id: number; email: string; name: string }>();
  let sent = 0;
  for (const r of rows.results) {
    try {
      const b = await buildBriefing(env, r.user_id, now);
      const items = b.items.filter((i) => i.urgency !== "info");
      await env.DB.prepare("UPDATE tello_settings SET last_sent = ? WHERE user_id = ?").bind(today, r.user_id).run();
      if (!items.length) continue;
      const first = (r.name || "").split(" ")[0] || "there", link = origin + "/dashboard";
      const subject = `Tello: ${plural(items.length, "thing")} need${items.length === 1 ? "s" : ""} you today`;
      const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;color:#1a1a1a"><p style="font-size:16px">Good morning, ${escapeHtml(first)}. Here's what needs you today.</p>`
        + items.map((i) => `<div style="border-left:3px solid ${i.urgency === "now" ? "#b45309" : "#123a30"};padding:6px 12px;margin:10px 0"><strong>${escapeHtml(i.title)}</strong><br><span style="color:#4b5563">${escapeHtml(i.detail)}</span></div>`).join("")
        + `<p><a href="${link}" style="display:inline-block;background:#123a30;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Open my dashboard</a></p><p style="color:#6b7280;font-size:12px">Tello, your EC Rental assistant. Tello can be wrong, so check anything that matters. Turn this email off in Ask Tello on your dashboard.</p></div>`;
      const text = `Good morning, ${first}. Here's what needs you today.\n\n` + items.map((i) => `- ${i.title}\n  ${i.detail}`).join("\n") + `\n\nOpen your dashboard: ${link}\n\nTurn this email off in Ask Tello on your dashboard.`;
      if (await sendEmail(r.email, subject, html, text).catch(() => false)) sent++;
    } catch (err) { console.error("[tello-briefing]", r.user_id, err instanceof Error ? err.message : err); }
  }
  return sent;
}
