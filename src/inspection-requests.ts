// "Book an in-person inspection" from the dashboard. Requests are saved as leads (signups.plan = 'inspection_request')
// so they show on the admin Chat Leads page, and EC Rental gets an email. Launch bonus: an account's first request
// is free, scheduled once its subscription is paid (not during the free trial). Fresno and Clovis area only.

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
interface ReqEnv { DB: D1Database; }
interface ReqUser { id: number; name: string; email: string; }
const NOTIFY_TO = "info@ecrentalpm.com";
const TYPES: Record<string, string> = { move_in: "Move-in", move_out: "Move-out", routine: "Routine", annual: "Annual" };

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function parse(message: string): Record<string, unknown> { try { return JSON.parse(message || "{}"); } catch { return {}; } }

/** Handles /api/inspection-requests for a signed-in landlord. Returns null for other paths. */
export async function handleInspectionRequests(request: Request, env: ReqEnv, url: URL, user: ReqUser, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/inspection-requests") return null;
  const mine = () => env.DB.prepare("SELECT id, message, status, created_at FROM signups WHERE plan = 'inspection_request' AND lower(email) = lower(?) ORDER BY created_at DESC LIMIT 50").bind(user.email).all<{ id: number; message: string; status: string; created_at: string }>();

  if (request.method === "GET") {
    const rows = await mine();
    return json({ freeAvailable: rows.results.length === 0, requests: rows.results.map(({ message, ...r }) => ({ ...r, ...parse(message) })) });
  }
  if (request.method !== "POST") return json({ error: "Not found" }, 404);

  const body = await request.json() as Record<string, unknown>;
  const type = str(body.type, 20), dates = str(body.preferred_dates, 300), notes = str(body.notes, 1000), phone = str(body.phone, 30);
  if (!(type in TYPES)) return json({ error: "Choose the kind of inspection." }, 400);
  if (!phone) return json({ error: "Add a phone number so the inspector can confirm the visit." }, 400);
  const prop = await env.DB.prepare("SELECT id, address, city, state, zip FROM properties WHERE id = ? AND user_id = ?").bind(Number(body.property_id), user.id).first<{ id: number; address: string; city: string; state: string; zip: string }>();
  if (!prop) return json({ error: "Choose one of your properties." }, 400);

  const previous = await mine();
  const free = previous.results.length === 0;
  const billing = await env.DB.prepare("SELECT status FROM billing WHERE user_id = ?").bind(user.id).first<{ status: string }>().catch(() => null);
  const address = [prop.address, prop.city, [prop.state, prop.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const details = { source: "inspection_request", user_id: user.id, property_id: prop.id, address, type, preferred_dates: dates, notes, free, billing_status: billing?.status || "none" };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(user.name, "", user.email, phone, "1", "inspection_request", JSON.stringify(details), "pending", new Date().toISOString()).run();

  if (notify) {
    const lines = [
      `Landlord: ${user.name} (${user.email}, ${phone})`, `Property: ${address}`, `Inspection: ${TYPES[type]}`,
      `Preferred dates: ${dates || "not given"}`, ...(notes ? [`Notes: ${notes}`] : []),
      free ? "Launch bonus: FREE (first request on this account)" : "Not their first request: quote your usual price",
      `Plan status: ${details.billing_status}${free && details.billing_status !== "active" ? " (bonus applies once their first payment goes through)" : ""}`,
    ];
    try {
      await notify(NOTIFY_TO, `In-person inspection request: ${prop.address}`,
        `<p>A landlord booked an in-person inspection on ecrentalpm.com. Call them to confirm a time.</p><p>${lines.map(esc).join("<br>")}</p>`,
        "A landlord booked an in-person inspection on ecrentalpm.com. Call them to confirm a time.\n\n" + lines.join("\n"));
    } catch (err) { console.error("[inspection-request] email", err); }
  }
  return json({ success: true, free });
}
