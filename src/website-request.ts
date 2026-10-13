// "Get a website" requests for tello.live (ownsite.app): a website with Tello included, or just the website.
// The form saves a lead (signups.plan = 'website_request') and emails EC Rental, so someone can follow up before any work starts.
import { HEALTH_MSG, looksLikeHealthCare } from "./biz-bots";

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
const NOTIFY_TO = "info@ecrentalpm.com";
const OFFERS = ["Website with Tello", "Website only"];

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

export async function handleWebsiteRequest(request: Request, env: { DB: D1Database }, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/public/website-request" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (str(body.hp, 100)) return json({ success: true }); // spam trap: a hidden field people never fill in
  const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), business = str(body.business, 150);
  const offer = str(body.offer, 40), details = str(body.details, 2000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter your name and email." }, 400);
  if (!business) return json({ error: "Please enter your business name." }, 400);
  if (!OFFERS.includes(offer)) return json({ error: "Please choose a website with Tello or a website only." }, 400);
  if (details.length < 10) return json({ error: "Please tell us a little about your business." }, 400);
  if (looksLikeHealthCare(business, details)) return json({ error: HEALTH_MSG }, 400);

  const info = { source: "website_request", business, offer, details };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, business, email, phone, "", "website_request", JSON.stringify(info), "pending", new Date().toISOString()).run();

  if (notify) {
    const lines = [`Name: ${name}`, `Email: ${email}`, ...(phone ? [`Phone: ${phone}`] : []), `Business: ${business}`, `Wants: ${offer}`, `About the business: ${details}`];
    try {
      await notify(NOTIFY_TO, `tello.live website request: ${business}`,
        `<p>Someone asked for a website (ownsite.app) on tello.live. Reply within 1 business day.</p><p>${lines.map(esc).join("<br>")}</p>`,
        "Someone asked for a website (ownsite.app) on tello.live. Reply within 1 business day.\n\n" + lines.join("\n"));
    } catch (err) { console.error("[website-request] email", err); }
  }
  return json({ success: true });
}
