// Free rent review for landlords (/rent-review page): saves the request as a lead, emails EC Rental, and shows a
// rent range only when there are 3+ similar EC Rental listings to compare. No made-up market numbers.

import { rentComps, type AiAssistEnv } from "./ai-assist";

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
const NOTIFY_TO = "info@ecrentalpm.com";

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }

export async function handleRentReview(request: Request, env: AiAssistEnv, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/public/rent-review" || request.method !== "POST") return null;
  if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
  const body = await request.json() as Record<string, unknown>;
  if (str(body.website, 100)) return json({ success: true, comps: null }); // spam trap: a hidden field people never fill in
  const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30);
  const street = str(body.street, 200), city = str(body.city, 100) || "Fresno", zip = str(body.zip, 10);
  const beds = Math.min(Math.floor(num(body.bedrooms)), 10), baths = Math.min(num(body.bathrooms), 10), sqft = Math.min(Math.floor(num(body.square_feet)), 20000);
  const currentRent = Math.min(Math.round(num(body.current_rent)), 100000);
  const type = str(body.property_type, 30), features = str(body.features, 600), status = str(body.status, 40), message = str(body.message, 1000);
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone) return json({ error: "Please enter your name, email and phone." }, 400);
  if (!street || !/^\d{5}$/.test(zip)) return json({ error: "Please enter the property's street address and 5-digit ZIP." }, 400);

  const comps = await rentComps(env, { id: 0, beds, zip, city });
  let range: { low: number; median: number; high: number; count: number; area: string } | null = null;
  if (comps.rents.length >= 3) {
    const s = [...comps.rents].sort((a, b) => a - b);
    const q = (p: number) => { const i = p * (s.length - 1), lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
    range = { low: Math.round(q(0.25)), median: Math.round(q(0.5)), high: Math.round(q(0.75)), count: s.length, area: comps.area };
  }

  const details = { source: "rent_review", street, city, zip, property_type: type, bedrooms: beds, bathrooms: baths, square_feet: sqft, current_rent: currentRent, status, features, message, comps: range };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(name, "", email, phone, "1", "rent_review", JSON.stringify(details), "pending", new Date().toISOString()).run();

  if (notify) {
    const lines = [
      `Name: ${name}`, `Email: ${email}`, `Phone: ${phone}`,
      `Property: ${street}, ${city} ${zip}`,
      `Type: ${type || "not given"} · ${beds} bd / ${baths} ba${sqft ? ` · ${sqft} sq ft` : ""}`,
      `Status: ${status || "not given"}${currentRent ? ` · current rent $${currentRent}` : ""}`,
      ...(features ? [`Features: ${features}`] : []), ...(message ? [`Message: ${message}`] : []),
      range ? `EC Rental comps (${range.count}, ${range.area}): $${range.low} to $${range.high}, median $${range.median}` : "Not enough EC Rental comps yet; price it by hand.",
    ];
    try {
      await notify(NOTIFY_TO, `Rent review request: ${street}, ${city}`,
        `<p>A landlord asked for a free rent review on ecrentalpm.com. Reply within 1 business day.</p><p>${lines.map(esc).join("<br>")}</p>`,
        "A landlord asked for a free rent review on ecrentalpm.com. Reply within 1 business day.\n\n" + lines.join("\n"));
    } catch (err) { console.error("[rent-review] email", err); }
  }
  return json({ success: true, comps: range });
}
