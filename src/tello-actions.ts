import { textRun } from "./ai-text";
/**
 * Tello does things, with your OK. In the dashboard chat a landlord can say "record Unit 2's rent" or "mark the sink repair done".
 * /api/tello/propose only turns that into a proposed action (nothing is changed); /api/tello/confirm runs it after the landlord
 * taps Confirm. Only the actions listed here exist, every id is checked against the signed-in landlord's own rows both times,
 * and nothing here emails or messages a tenant.
 */
export interface ActionEnv { DB: D1Database; AI: Ai; }
interface ActionUser { id: number; role: string; }

export type TelloAction =
  | { type: "record_rent"; property_id: number; amount: number; date: string }
  | { type: "maintenance_status"; maintenance_id: number; status: "resolved" | "open" }
  | { type: "maintenance_priority"; maintenance_id: number; priority: string }
  | { type: "add_repair"; property_id: number; description: string; priority: string };

const PRIORITIES = ["emergency", "high", "normal", "low"];
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast", FALLBACK = "@cf/meta/llama-3.1-8b-instruct-fast";

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
/** Today in California, YYYY-MM-DD. */
function today(now = new Date()): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + "T00:00:00Z"));
function prettyDate(s: string): string { return new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }); }

interface PropRow { id: number; address: string; tenant_name: string; rent_amount: number; }
interface MaintRow { id: number; property_id: number; description: string; priority: string; status: string; address: string; }

/** Checks a proposed action against this landlord's own rows. Returns the clean action and a plain-English summary, or an error. */
export async function checkAction(env: ActionEnv, userId: number, raw: unknown, now = new Date()): Promise<{ action: TelloAction; summary: string } | { error: string }> {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prop = (id: unknown) => { const n = Number(id); return Number.isInteger(n) ? env.DB.prepare("SELECT id, address, tenant_name, rent_amount FROM properties WHERE id = ? AND user_id = ?").bind(n, userId).first<PropRow>() : Promise.resolve(null); };
  const maint = (id: unknown) => { const n = Number(id); return Number.isInteger(n) ? env.DB.prepare("SELECT m.id, m.property_id, m.description, m.priority, m.status, p.address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE m.id = ? AND p.user_id = ?").bind(n, userId).first<MaintRow>() : Promise.resolve(null); };
  if (a.type === "record_rent") {
    const p = await prop(a.property_id); if (!p) return { error: "I couldn't match that to one of your properties." };
    const amount = Math.round(Number(a.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: "I need an amount greater than $0." };
    const date = typeof a.date === "string" && isDate(a.date) ? a.date : today(now);
    return { action: { type: "record_rent", property_id: p.id, amount, date }, summary: `Record ${money(amount)} rent received${p.tenant_name ? " from " + p.tenant_name : ""} for ${p.address}, dated ${prettyDate(date)}.` };
  }
  if (a.type === "maintenance_status") {
    const m = await maint(a.maintenance_id); if (!m) return { error: "I couldn't find that repair request." };
    const status = a.status === "open" ? "open" : "resolved";
    return { action: { type: "maintenance_status", maintenance_id: m.id, status }, summary: `Mark the repair "${m.description.slice(0, 80)}" at ${m.address} as ${status === "open" ? "open again" : "resolved"}.` };
  }
  if (a.type === "maintenance_priority") {
    const m = await maint(a.maintenance_id); if (!m) return { error: "I couldn't find that repair request." };
    if (typeof a.priority !== "string" || !PRIORITIES.includes(a.priority)) return { error: "Priority must be emergency, high, normal or low." };
    return { action: { type: "maintenance_priority", maintenance_id: m.id, priority: a.priority }, summary: `Change the priority of "${m.description.slice(0, 80)}" at ${m.address} from ${m.priority} to ${a.priority}.` };
  }
  if (a.type === "add_repair") {
    const p = await prop(a.property_id); if (!p) return { error: "I couldn't match that to one of your properties." };
    const description = String(a.description || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if (description.length < 3) return { error: "Tell me what needs fixing." };
    const priority = typeof a.priority === "string" && PRIORITIES.includes(a.priority) ? a.priority : "normal";
    return { action: { type: "add_repair", property_id: p.id, description, priority }, summary: `Add a ${priority}-priority repair request at ${p.address}: "${description}".` };
  }
  return { error: "That isn't something I can do yet." };
}

/** Runs one checked action. Call only after checkAction() and the landlord's Confirm. */
async function runAction(env: ActionEnv, userId: number, a: TelloAction): Promise<string> {
  const now = new Date().toISOString();
  if (a.type === "record_rent") {
    await env.DB.prepare("INSERT INTO transactions (property_id, type, amount, description, date, created_at) VALUES (?, 'rent', ?, ?, ?, ?)").bind(a.property_id, a.amount, "Rent recorded with Tello", a.date, now).run();
    return `Done. Recorded ${money(a.amount)} rent for ${prettyDate(a.date)}. You can see it in Transactions.`;
  }
  if (a.type === "maintenance_status") {
    await env.DB.prepare("UPDATE maintenance_requests SET status = ? WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)").bind(a.status, a.maintenance_id, userId).run();
    return a.status === "open" ? "Done. That repair is open again." : "Done. That repair is marked resolved.";
  }
  if (a.type === "maintenance_priority") {
    await env.DB.prepare("UPDATE maintenance_requests SET priority = ? WHERE id = ? AND property_id IN (SELECT id FROM properties WHERE user_id = ?)").bind(a.priority, a.maintenance_id, userId).run();
    return `Done. Priority is now ${a.priority}.`;
  }
  await env.DB.prepare("INSERT INTO maintenance_requests (property_id, tenant_name, description, priority, status, created_at) VALUES (?, '', ?, ?, 'open', ?)").bind(a.property_id, a.description, a.priority, now).run();
  return "Done. Added the repair request. You can see it under Maintenance.";
}

const PROMPT = (date: string, props: PropRow[], maints: MaintRow[]) => `You turn a landlord's request into ONE action for their property dashboard. Reply with JSON only, no other words.
Today is ${date}.
Allowed actions:
{"type":"record_rent","property_id":N,"amount":NUMBER,"date":"YYYY-MM-DD"}  (rent the landlord says was received; use the property's rent amount if they give none; use today if no date)
{"type":"maintenance_status","maintenance_id":N,"status":"resolved"|"open"}
{"type":"maintenance_priority","maintenance_id":N,"priority":"emergency"|"high"|"normal"|"low"}
{"type":"add_repair","property_id":N,"description":"short text","priority":"emergency"|"high"|"normal"|"low"}
If the message is a question, advice, or anything that is not clearly one of these, or you can't tell which property or repair they mean, reply {"type":"none"}. Never guess an id; use only ids from the lists.
PROPERTIES (id | address | tenant | monthly rent):
${props.map((p) => `${p.id} | ${p.address} | ${p.tenant_name || "no tenant"} | ${p.rent_amount}`).join("\n") || "(none)"}
OPEN REPAIRS (id | address | description | priority):
${maints.map((m) => `${m.id} | ${m.address} | ${m.description.slice(0, 80)} | ${m.priority}`).join("\n") || "(none)"}`;

async function askModel(env: ActionEnv, system: string, message: string): Promise<string> {
  const messages = [{ role: "system", content: system }, { role: "user", content: message }];
  for (const model of [MODEL, FALLBACK]) {
    try { return String((model === MODEL ? await textRun(env, { messages, max_tokens: 200 }) : (await env.AI.run(model as Parameters<Ai["run"]>[0], { messages, max_tokens: 200 } as never)) as { response?: string }).response || ""); }
    catch (err) { console.error("[tello-action-model]", err instanceof Error ? err.message : err); }
  }
  return "";
}

/** POST /api/tello/propose and /api/tello/confirm for a signed-in landlord. Returns null for other paths. */
export async function handleTelloActionRoutes(request: Request, env: ActionEnv, url: URL, user: ActionUser): Promise<Response | null> {
  if (url.pathname !== "/api/tello/propose" && url.pathname !== "/api/tello/confirm") return null;
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  if (user.role === "tenant") return json({ error: "This is for landlord accounts." }, 403);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;

  if (url.pathname === "/api/tello/confirm") {
    const checked = await checkAction(env, user.id, body.action);
    if ("error" in checked) return json({ error: checked.error }, 400);
    return json({ ok: true, message: await runAction(env, user.id, checked.action) });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (!message) return json({ action: null });
  const [props, maints] = await Promise.all([
    env.DB.prepare("SELECT id, address, tenant_name, rent_amount FROM properties WHERE user_id = ? ORDER BY id LIMIT 60").bind(user.id).all<PropRow>(),
    env.DB.prepare("SELECT m.id, m.property_id, m.description, m.priority, m.status, p.address FROM maintenance_requests m JOIN properties p ON m.property_id = p.id WHERE p.user_id = ? AND m.status != 'resolved' ORDER BY m.id DESC LIMIT 40").bind(user.id).all<MaintRow>(),
  ]);
  const out = await askModel(env, PROMPT(today(), props.results, maints.results), message);
  const m = out.match(/\{[\s\S]*\}/);
  let raw: unknown = null; try { raw = m ? JSON.parse(m[0]) : null; } catch { raw = null; }
  if (!raw || (raw as { type?: string }).type === "none") return json({ action: null });
  const checked = await checkAction(env, user.id, raw);
  if ("error" in checked) return json({ action: null, note: checked.error });
  return json({ action: checked.action, summary: checked.summary });
}
