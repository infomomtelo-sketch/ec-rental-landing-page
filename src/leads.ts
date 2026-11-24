/**
 * Renter leads for listings: Zillow's Lead Delivery HTTP POST callback, the landlord's view of
 * inquiries on their own listings, and the email that tells the listing contact about a new lead.
 * Leads are stored in `listing_inquiries` (migration 0004), one row per renter per listing per day.
 * Rows already in `signups` as plan 'tenant_application' are history and are never deleted.
 */

export interface LeadsEnv { DB: D1Database; ZILLOW_LEAD_KEY?: string; }
export type Notify = (to: string, subject: string, html: string, text: string) => Promise<boolean>;

interface LeadListing { id: number; street: string; unit: string; city: string; bedrooms: number; rent: number; contact_email: string; }
export interface Lead { source: "listing" | "zillow"; name: string; email: string; phone: string; moveIn: string; message: string; leadType?: string; extra?: Record<string, string>; }

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 500): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function address(l: LeadListing): string { return [l.street + (l.unit ? " #" + l.unit : ""), l.city].filter(Boolean).join(", "); }
function parseExtra(s: string): Record<string, string> { try { const p = JSON.parse(s || "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; } }
// Constant-time compare so the lead key can't be guessed byte by byte from response timing.
function sameSecret(a: string, b: string): boolean { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

const LEAD_TYPES: Record<string, string> = { question: "Question", tourRequest: "Tour request", applicationRequest: "Application request" };

/** Stores a lead for a listing and emails the listing's contact. Returns "duplicate" when the same
 *  email already inquired about this listing today (the UNIQUE on listing_inquiries); the caller
 *  decides what to tell the sender. */
export async function saveListingLead(env: LeadsEnv, listing: LeadListing, lead: Lead, notify?: Notify, origin = ""): Promise<"ok" | "duplicate"> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const addressText = address(listing);
  const bedrooms = String(listing.bedrooms || "");
  const budget = listing.rent ? "$" + Math.round(listing.rent) + "/mo listing" : "";
  const values = [lead.name || lead.email, lead.email, lead.phone, addressText, bedrooms, budget, lead.moveIn, lead.message, Object.keys(lead.extra || {}).length ? JSON.stringify(lead.extra) : "", lead.leadType || "", lead.source] as const;
  try {
    const res = await env.DB.prepare(
      "INSERT INTO listing_inquiries (listing_id, landlord_user_id, name, email, phone, listing_address, bedrooms, budget, move_in_date, message, extra, lead_type, source, status, inquiry_date, created_at) " +
      "SELECT l.id, l.user_id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ? FROM listings l WHERE l.id = ?")
      .bind(...values, today, now, listing.id).run();
    if ((res.meta.changes || 0) === 0) {
      // Unknown or removed listing (Zillow sends these too): keep the lead for the admin, with no landlord.
      await env.DB.prepare(
        "INSERT INTO listing_inquiries (listing_id, landlord_user_id, name, email, phone, listing_address, bedrooms, budget, move_in_date, message, extra, lead_type, source, status, inquiry_date, created_at) " +
        "VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)")
        .bind(listing.id, ...values, today, now).run();
    }
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(err instanceof Error ? err.message : String(err))) return "duplicate";
    throw err;
  }
  if (!notify || !listing.contact_email) return "ok";
  const from = lead.source === "zillow" ? "Zillow" : "your website";
  const kind = lead.leadType && LEAD_TYPES[lead.leadType] ? LEAD_TYPES[lead.leadType] + " " : "";
  const lines: [string, string][] = [["Name", lead.name], ["Email", lead.email], ["Phone", lead.phone], ["Move-in", lead.moveIn], ["Message", lead.message]];
  const shown = lines.filter(([, v]) => v);
  await notify(listing.contact_email, "New renter " + (kind ? kind.toLowerCase() : "inquiry ") + "for " + addressText,
    "<p>New " + esc(kind.toLowerCase() || "inquiry ") + "from " + from + " for <strong>" + esc(addressText) + "</strong>:</p><ul>" + shown.map(([k, v]) => "<li><strong>" + k + ":</strong> " + esc(v) + "</li>").join("") + "</ul>" + (origin ? "<p><a href=\"" + origin + "/dashboard\">Open your dashboard</a></p>" : ""),
    "New " + (kind.toLowerCase() || "inquiry ") + "from " + from + " for " + addressText + ":\n\n" + shown.map(([k, v]) => k + ": " + v).join("\n") + (origin ? "\n\n" + origin + "/dashboard" : "")).catch(() => false);
  return "ok";
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
  const rows = await env.DB.prepare("SELECT id, listing_id, name, email, phone, listing_address, bedrooms, budget, move_in_date, message, extra, lead_type, source, status, created_at FROM listing_inquiries WHERE landlord_user_id = ? ORDER BY created_at DESC LIMIT 200")
    .bind(user.id).all<{ id: number; listing_id: number | null; name: string; email: string; phone: string; listing_address: string; bedrooms: string; budget: string; move_in_date: string; message: string; extra: string; lead_type: string; source: string; status: string; created_at: string }>();
  return json(rows.results.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, created_at: r.created_at, source: r.source, listingId: r.listing_id, home: r.listing_address, bedrooms: r.bedrooms, budget: r.budget, moveIn: r.move_in_date, message: r.message, leadType: r.lead_type, status: r.status, extra: parseExtra(r.extra) })));
}
