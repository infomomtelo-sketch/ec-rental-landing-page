/**
 * Renter leads for listings: Zillow's Lead Delivery HTTP POST callback, the landlord's view of
 * inquiries on their own listings, and the email that tells the listing contact about a new lead.
 * Leads are stored in `signups` as plan 'tenant_application' (same as website listing inquiries).
 */

export interface LeadsEnv { DB: D1Database; ZILLOW_LEAD_KEY?: string; }
export type Notify = (to: string, subject: string, html: string, text: string) => Promise<boolean>;

interface LeadListing { id: number; street: string; unit: string; city: string; bedrooms: number; rent: number; contact_email: string; }
export interface Lead { source: "listing" | "zillow"; name: string; email: string; phone: string; moveIn: string; message: string; leadType?: string; extra?: Record<string, string>; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 500): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function address(l: LeadListing): string { return [l.street + (l.unit ? " #" + l.unit : ""), l.city].filter(Boolean).join(", "); }
// Constant-time compare so the lead key can't be guessed byte by byte from response timing.
function sameSecret(a: string, b: string): boolean { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

const LEAD_TYPES: Record<string, string> = { question: "Question", tourRequest: "Tour request", applicationRequest: "Application request" };

/** Stores a lead for a listing and emails the listing's contact. */
export async function saveListingLead(env: LeadsEnv, listing: LeadListing, lead: Lead, notify?: Notify, origin = ""): Promise<void> {
  const details = { source: lead.source, listingId: listing.id, area: address(listing), bedrooms: listing.bedrooms, budget: "$" + Math.round(listing.rent) + "/mo listing", moveIn: lead.moveIn, message: lead.message, leadType: lead.leadType || "", ...(lead.extra || {}) };
  await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, '', ?, ?, 'tenant', 'tenant_application', ?, 'pending', ?)")
    .bind(lead.name || lead.email, lead.email, lead.phone, JSON.stringify(details), new Date().toISOString()).run();
  if (!notify || !listing.contact_email) return;
  const from = lead.source === "zillow" ? "Zillow" : "your website";
  const kind = lead.leadType && LEAD_TYPES[lead.leadType] ? LEAD_TYPES[lead.leadType] + " " : "";
  const lines: [string, string][] = [["Name", lead.name], ["Email", lead.email], ["Phone", lead.phone], ["Move-in", lead.moveIn], ["Message", lead.message]];
  const shown = lines.filter(([, v]) => v);
  await notify(listing.contact_email, "New renter " + (kind ? kind.toLowerCase() : "inquiry ") + "for " + address(listing),
    "<p>New " + esc(kind.toLowerCase() || "inquiry ") + "from " + from + " for <strong>" + esc(address(listing)) + "</strong>:</p><ul>" + shown.map(([k, v]) => "<li><strong>" + k + ":</strong> " + esc(v) + "</li>").join("") + "</ul>" + (origin ? "<p><a href=\"" + origin + "/dashboard\">Open your dashboard</a></p>" : ""),
    "New " + (kind.toLowerCase() || "inquiry ") + "from " + from + " for " + address(listing) + ":\n\n" + shown.map(([k, v]) => k + ": " + v).join("\n") + (origin ? "\n\n" + origin + "/dashboard" : "")).catch(() => false);
}

/** POST /api/zillow/leads?key=... : Zillow Lead Delivery HTTP POST callback (form-encoded). */
export async function handleZillowLeadRoute(request: Request, env: LeadsEnv, url: URL, notify?: Notify): Promise<Response | null> {
  if (url.pathname !== "/api/zillow/leads") return null;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!env.ZILLOW_LEAD_KEY) return json({ error: "Zillow lead delivery isn't set up yet." }, 503);
  if (!sameSecret(str(url.searchParams.get("key"), 200), env.ZILLOW_LEAD_KEY)) return json({ error: "Unauthorized" }, 401);

  let fields: Record<string, string> = {};
  const type = request.headers.get("Content-Type") || "";
  if (type.includes("application/json")) { const b = await request.json() as Record<string, unknown>; for (const k in b) fields[k] = str(b[k], 2000); }
  else { const form = await request.formData(); form.forEach((v, k) => { if (typeof v === "string") fields[k] = str(v, 2000); }); }

  const email = str(fields.email, 200).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "email is required" }, 400);
  const m = str(fields.listingId, 40).match(/^ECR(\d+)$/i);
  const listing = m ? await env.DB.prepare("SELECT id, street, unit, city, bedrooms, rent, contact_email FROM listings WHERE id = ?").bind(parseInt(m[1])).first<LeadListing>() : null;
  // Accept leads for unknown or removed listings too (200), so Zillow doesn't retry; they are kept for the admin.
  const target: LeadListing = listing || { id: 0, street: "Unknown listing " + str(fields.listingId, 40), unit: "", city: str(fields.listingCity, 60), bedrooms: 0, rent: 0, contact_email: "" };
  const moving = str(fields.movingDate, 8);
  const extra: Record<string, string> = {};
  for (const k of ["moveInTimeframe", "leaseLengthMonths", "numBedroomsSought", "incomeYearly", "employer", "jobTitle", "introduction"]) if (fields[k]) extra[k] = str(fields[k], 300);
  await saveListingLead(env, target, {
    source: "zillow", name: str(fields.name, 100), email, phone: str(fields.phone, 30),
    moveIn: /^\d{8}$/.test(moving) ? moving.slice(0, 4) + "-" + moving.slice(4, 6) + "-" + moving.slice(6) : moving,
    message: str(fields.message, 2000), leadType: str(fields.leadType, 40), extra,
  }, notify, url.origin);
  return json({ success: true });
}

/** GET /api/listings/leads : inquiries (website and Zillow) on the signed-in landlord's listings. */
export async function handleLandlordLeadRoute(request: Request, env: LeadsEnv, url: URL, user: { id: number }): Promise<Response | null> {
  if (url.pathname !== "/api/listings/leads" || request.method !== "GET") return null;
  const rows = await env.DB.prepare("SELECT s.id, s.name, s.email, s.phone, s.message, s.created_at FROM signups s JOIN listings l ON l.id = (CASE WHEN json_valid(s.message) THEN json_extract(s.message, '$.listingId') END) WHERE s.plan = 'tenant_application' AND l.user_id = ? ORDER BY s.created_at DESC LIMIT 200")
    .bind(user.id).all<{ id: number; name: string; email: string; phone: string; message: string; created_at: string }>();
  return json(rows.results.map((r) => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.message); } catch { /* keep empty */ } return { id: r.id, name: r.name, email: r.email, phone: r.phone, created_at: r.created_at, source: d.source || "listing", listingId: d.listingId, home: d.area, moveIn: d.moveIn || "", message: d.message || "", leadType: d.leadType || "" }; }));
}
