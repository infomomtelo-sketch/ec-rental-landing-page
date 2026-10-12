// Marketing video requests for tello.live ("Want a video like Tello's?"). The request form saves a lead
// (signups.plan = 'video_request') and emails EC Rental, so someone can follow up before any work starts.

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
const NOTIFY_TO = "info@ecrentalpm.com";
const VIDEO_TYPES = ["Promo / story video", "How-to / product guide", "App or website demo", "Social media clips", "Other"];
const BUDGETS = ["", "Under $500", "$500 to $1,500", "$1,500 to $5,000", "Over $5,000", "Not sure yet"];

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

export async function handleVideoRequest(request: Request, env: { DB: D1Database }, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/public/video-request" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await request.json() as Record<string, unknown>;
  if (str(body.website, 100)) return json({ success: true }); // spam trap: a hidden field people never fill in
  const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), business = str(body.business, 150);
  const site = str(body.site_url, 300), type = str(body.video_type, 60), budget = str(body.budget, 40), deadline = str(body.deadline, 40), details = str(body.details, 2000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter your name and email." }, 400);
  if (!business) return json({ error: "Please enter your business or app name." }, 400);
  if (!VIDEO_TYPES.includes(type)) return json({ error: "Please pick the kind of video you want." }, 400);
  if (!BUDGETS.includes(budget)) return json({ error: "Please pick a budget from the list." }, 400);
  if (details.length < 10) return json({ error: "Please tell us a little about the video you want." }, 400);

  const info = { source: "video_request", business, site_url: site, video_type: type, budget, deadline, details, page: str(body.page, 200) };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, business, email, phone, "", "video_request", JSON.stringify(info), "pending", new Date().toISOString()).run();

  if (notify) {
    const lines = [
      `Name: ${name}`, `Email: ${email}`, ...(phone ? [`Phone: ${phone}`] : []),
      `Business or app: ${business}`, ...(site ? [`Website or app link: ${site}`] : []),
      `Video: ${type}`, `Budget: ${budget || "not given"}`, `Needed by: ${deadline || "not given"}`, `Details: ${details}`,
    ];
    try {
      await notify(NOTIFY_TO, `tello.live video request: ${business}`,
        `<p>Someone asked for a marketing video like Tello's (tello.live). Reply within 1 business day.</p><p>${lines.map(esc).join("<br>")}</p>`,
        "Someone asked for a marketing video like Tello's (tello.live). Reply within 1 business day.\n\n" + lines.join("\n"));
    } catch (err) { console.error("[video-request] email", err); }
  }
  return json({ success: true });
}
