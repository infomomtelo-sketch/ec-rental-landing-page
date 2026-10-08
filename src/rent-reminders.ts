/**
 * Automatic rent reminders. Once a day (cron in wrangler.toml) every landlord who switched reminders on gets their
 * active tenants emailed a few days before rent is due, and again a few days after the due date if that month's rent
 * still isn't recorded. Settings live on the dashboard's Settings page (/api/rent-reminders). Needs an active plan.
 */
import { hasActivePlan, keyMode, type BillingEnv } from "./billing";

export interface RemindersEnv extends BillingEnv { DB: D1Database; }
type SendEmail = (to: string, subject: string, html: string, text: string) => Promise<boolean>;
interface Settings { enabled: number; due_day: number; days_before: number; late_after: number; }
interface ReminderUser { id: number; role: string; }

const DEFAULTS: Settings = { enabled: 0, due_day: 1, days_before: 3, late_after: 5 };
const DAY = 86400000;

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function escapeHtml(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const clampInt = (v: unknown, min: number, max: number, fallback: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

/** Today's date in Fresno as a UTC-midnight timestamp, so date math ignores time zones. */
function todayUtc(now = new Date()): number { return Date.parse(now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) + "T00:00:00Z"); }
/** Due date for a month (YYYY-MM) as a UTC-midnight timestamp; the due day is capped at the month's last day. */
function dueDate(year: number, month0: number, dueDay: number): number {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return Date.UTC(year, month0, Math.min(dueDay, last));
}
const periodOf = (t: number) => iso(t).slice(0, 7);
const monthName = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

async function getSettings(env: RemindersEnv, userId: number): Promise<Settings> {
  const row = await env.DB.prepare("SELECT enabled, due_day, days_before, late_after FROM rent_reminder_settings WHERE user_id = ?").bind(userId).first<Settings>();
  return row || { ...DEFAULTS };
}

/** Landlord routes: GET /api/rent-reminders and PUT /api/rent-reminders. */
export async function handleRentReminderRoutes(request: Request, env: RemindersEnv, url: URL, user: ReminderUser): Promise<Response | null> {
  if (url.pathname !== "/api/rent-reminders") return null;
  if (user.role === "tenant") return json({ error: "This is for landlord accounts." }, 403);
  if (request.method === "GET") return json({ ...(await getSettings(env, user.id)), planOk: await hasActivePlan(env, user.id) });
  if (request.method === "PUT") {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const s: Settings = { enabled: body.enabled ? 1 : 0, due_day: clampInt(body.due_day, 1, 28, 1), days_before: clampInt(body.days_before, 1, 10, 3), late_after: clampInt(body.late_after, 1, 15, 5) };
    if (s.enabled && !(await hasActivePlan(env, user.id))) return json({ error: "Rent reminders come with an EC Rental plan. Choose a plan in Plan & Billing first." }, 402);
    await env.DB.prepare("INSERT INTO rent_reminder_settings (user_id, enabled, due_day, days_before, late_after, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, due_day = excluded.due_day, days_before = excluded.days_before, late_after = excluded.late_after, updated_at = excluded.updated_at")
      .bind(user.id, s.enabled, s.due_day, s.days_before, s.late_after, new Date().toISOString()).run();
    return json({ ...s, planOk: true });
  }
  return json({ error: "Not found" }, 404);
}

interface Tenancy { id: number; property_id: number; tenant_email: string; tenant_name: string; address: string; rent_amount: number; }

/** Rent for a month counts as covered when it was paid (or is clearing) online, or the landlord recorded enough rent near the due date. */
async function rentCovered(env: RemindersEnv, t: Tenancy, period: string, due: number, today: number): Promise<boolean> {
  const online = await env.DB.prepare("SELECT 1 FROM rent_payments WHERE tenancy_id = ? AND period = ? AND status IN ('paid', 'processing') LIMIT 1").bind(t.id, period).first();
  if (online) return true;
  const sum = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE property_id = ? AND type = 'rent' AND date >= ? AND date <= ?")
    .bind(t.property_id, iso(due - 15 * DAY), iso(today)).first<{ total: number }>();
  return (sum?.total || 0) >= t.rent_amount - 0.005;
}

/** Sends today's reminders and late notices. Each (tenancy, month, kind) is sent at most once. Returns how many went out. */
export async function runRentReminders(env: RemindersEnv, sendEmail: SendEmail, origin: string, now = new Date()): Promise<number> {
  const today = todayUtc(now);
  const landlords = await env.DB.prepare("SELECT s.user_id, s.due_day, s.days_before, s.late_after, u.email AS landlord_email, u.name AS landlord_name, u.company FROM rent_reminder_settings s JOIN users u ON u.id = s.user_id WHERE s.enabled = 1")
    .all<Settings & { user_id: number; landlord_email: string; landlord_name: string; company: string }>();
  let sent = 0;
  for (const l of landlords.results) {
    if (!(await hasActivePlan(env, l.user_id))) continue;
    const payOnline = !!(await env.DB.prepare("SELECT 1 FROM payout_accounts WHERE user_id = ? AND mode = ? AND charges_enabled = 1").bind(l.user_id, keyMode(env)).first());
    const tenancies = await env.DB.prepare("SELECT t.id, t.property_id, u.email AS tenant_email, u.name AS tenant_name, p.address, p.rent_amount FROM tenancies t JOIN users u ON u.id = t.tenant_user_id JOIN properties p ON p.id = t.property_id WHERE t.landlord_user_id = ? AND t.status = 'active' AND p.rent_amount > 0")
      .bind(l.user_id).all<Tenancy>();
    if (!tenancies.results.length) continue;
    const d = new Date(today), y = d.getUTCFullYear(), m = d.getUTCMonth();
    // Due dates around today: last month, this month and next month.
    const dues = [-1, 0, 1].map((k) => dueDate(y, m + k, l.due_day));
    const from = l.company || l.landlord_name || "your landlord";
    for (const t of tenancies.results) {
      for (const due of dues) {
        const period = periodOf(due);
        let kind: "reminder" | "late" | null = null;
        if (today >= due - l.days_before * DAY && today < due) kind = "reminder";
        else if (today >= due + l.late_after * DAY && today <= due + (l.late_after + 7) * DAY) kind = "late";
        if (!kind) continue;
        if (await env.DB.prepare("SELECT 1 FROM rent_reminder_log WHERE tenancy_id = ? AND period = ? AND kind = ?").bind(t.id, period, kind).first()) continue;
        if (await rentCovered(env, t, period, due, today)) continue;
        const portal = origin + "/tenant";
        const payLine = payOnline ? `You can pay online by bank transfer or card in your tenant portal: ${portal}` : `Pay ${from} the way you usually do. Your tenant portal: ${portal}`;
        const payHtml = payOnline ? `<p><a href="${portal}" style="display:inline-block;background:#123a30;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:700">Pay rent online</a></p><p>Bank transfer or card, on a secure Stripe page.</p>` : `<p>Pay ${escapeHtml(from)} the way you usually do. <a href="${portal}">Open your tenant portal</a></p>`;
        const amount = money(t.rent_amount), month = monthName(due), address = t.address;
        const subject = kind === "reminder" ? `Rent reminder: ${amount} due ${dayName(due)}` : `Rent for ${month} hasn't been recorded yet`;
        const lead = kind === "reminder"
          ? `This is a friendly reminder from ${from} that rent of ${amount} for ${address} is due on ${dayName(due)}.`
          : `Rent of ${amount} for ${address} was due on ${dayName(due)}, and ${from} hasn't recorded it yet.`;
        const tail = kind === "late" ? "If you've already paid, thank you, and you can ignore this email. If something's wrong, please reach out to your landlord." : "If you've already paid, thank you.";
        const ok = await sendEmail(t.tenant_email, subject,
          `<p>Hi ${escapeHtml(t.tenant_name || "there")},</p><p>${escapeHtml(lead)}</p>${payHtml}<p>${escapeHtml(tail)}</p><p style="color:#6b7280;font-size:12px">Sent by EC Rental on behalf of ${escapeHtml(from)}.</p>`,
          `Hi ${t.tenant_name || "there"},\n\n${lead}\n\n${payLine}\n\n${tail}\n\nSent by EC Rental on behalf of ${from}.`).catch(() => false);
        if (!ok) continue;
        await env.DB.prepare("INSERT OR IGNORE INTO rent_reminder_log (tenancy_id, period, kind, sent_at) VALUES (?, ?, ?, ?)").bind(t.id, period, kind, new Date().toISOString()).run();
        sent++;
        if (kind === "late") await sendEmail(l.landlord_email, `Late rent notice sent: ${address}`,
          `<p>We emailed ${escapeHtml(t.tenant_name || t.tenant_email)} a friendly notice that rent of <strong>${amount}</strong> for <strong>${escapeHtml(address)}</strong> (due ${escapeHtml(dayName(due))}) hasn't been recorded yet.</p><p>If they paid you another way, add it in Transactions as Rent Collected so they aren't reminded again. <a href="${origin}/dashboard">Open your dashboard</a></p>`,
          `We emailed ${t.tenant_name || t.tenant_email} a friendly notice that rent of ${amount} for ${address} (due ${dayName(due)}) hasn't been recorded yet.\n\nIf they paid you another way, add it in Transactions as Rent Collected so they aren't reminded again.\n\n${origin}/dashboard`).catch(() => false);
      }
    }
  }
  return sent;
}
