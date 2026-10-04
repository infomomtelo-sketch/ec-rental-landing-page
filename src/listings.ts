/**
 * Rental listings: landlord CRUD, photo storage in R2, public listing API,
 * and a Zillow Rentals feed (hotPadsItems v2.1 format, single-unit listings) that only carries listings Zillow will accept.
 */

import { saveListingLead, type Notify } from "./leads";

export interface ListingsEnv { DB: D1Database; PHOTOS?: R2Bucket; }
interface ListingUser { id: number; name: string; company: string; email: string; }

interface ListingRow {
  id: number; user_id: number; property_id: number | null; title: string; property_type: string;
  street: string; unit: string; city: string; state: string; zip: string;
  rent: number; deposit: number; application_fee: number; bedrooms: number; full_baths: number; half_baths: number;
  square_feet: number | null; date_available: string; lease_term: string; description: string; amenities: string;
  laundry: string; parking_type: string; cats_allowed: number; small_dogs_allowed: number; large_dogs_allowed: number;
  smoking_allowed: number; furnished: number; contact_name: string; contact_email: string; contact_phone: string;
  status: string; syndicate_zillow: number; created_at: string; updated_at: string;
}
interface PhotoRow { id: number; listing_id: number; r2_key: string; caption: string; sort_order: number; }

export const PROPERTY_TYPES = ["HOUSE", "CONDO", "TOWNHOUSE"];
const STATUSES = ["draft", "active", "rented"];
const LEASE_TERMS = ["12 Months", "6 Months", "monthly", "contactForDetails"];
const PARKING_TYPES = ["", "garageAttached", "garageLot", "coveredLot", "street", "surfaceLot", "other", "none"];
const LAUNDRY_OPTIONS = ["", "in_unit", "shared", "hookups", "none"];
const MAX_PHOTOS = 25;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 500): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }
function int(v: unknown): number { return Math.floor(num(v)); }
function bool(v: unknown): number { return v === true || v === 1 || v === "1" || v === "true" || v === "on" ? 1 : 0; }
function oneOf(v: unknown, allowed: string[], fallback: string): string { const s = str(v); return allowed.includes(s) ? s : fallback; }
function digits(v: unknown): string { return str(v).replace(/\D/g, "").slice(0, 15); }

/** Validates and normalizes listing input. Returns an error message or the clean record. */
function parseListing(body: Record<string, unknown>): { error: string } | { data: Omit<ListingRow, "id" | "user_id" | "created_at" | "updated_at"> } {
  const data = {
    property_id: body.property_id ? int(body.property_id) || null : null,
    title: str(body.title, 120),
    property_type: oneOf(body.property_type, PROPERTY_TYPES, "HOUSE"),
    street: str(body.street, 200), unit: str(body.unit, 20), city: str(body.city, 100),
    state: str(body.state, 2).toUpperCase() || "CA", zip: str(body.zip, 10),
    rent: num(body.rent), deposit: num(body.deposit), application_fee: num(body.application_fee),
    bedrooms: int(body.bedrooms), full_baths: int(body.full_baths), half_baths: int(body.half_baths),
    square_feet: body.square_feet ? int(body.square_feet) || null : null,
    date_available: /^\d{4}-\d{2}-\d{2}$/.test(str(body.date_available)) ? str(body.date_available) : "",
    lease_term: oneOf(body.lease_term, LEASE_TERMS, "12 Months"),
    description: str(body.description, 5000), amenities: str(body.amenities, 1000),
    laundry: oneOf(body.laundry, LAUNDRY_OPTIONS, ""), parking_type: oneOf(body.parking_type, PARKING_TYPES, ""),
    cats_allowed: bool(body.cats_allowed), small_dogs_allowed: bool(body.small_dogs_allowed), large_dogs_allowed: bool(body.large_dogs_allowed),
    smoking_allowed: bool(body.smoking_allowed), furnished: bool(body.furnished),
    contact_name: str(body.contact_name, 100), contact_email: str(body.contact_email, 200).toLowerCase(), contact_phone: digits(body.contact_phone),
    status: oneOf(body.status, STATUSES, "draft"), syndicate_zillow: bool(body.syndicate_zillow),
  };
  if (!data.street || !data.city || !data.zip) return { error: "Street, city and ZIP are required." };
  if (!/^[A-Z]{2}$/.test(data.state)) return { error: "State must be a two-letter code, like CA." };
  if (!data.rent) return { error: "Monthly rent is required." };
  if (!/^\S+@\S+\.\S+$/.test(data.contact_email)) return { error: "A contact email is required." };
  if (data.contact_phone.length < 10) return { error: "A contact phone number with area code is required." };
  return { data };
}

const LISTING_COLUMNS = ["property_id", "title", "property_type", "street", "unit", "city", "state", "zip", "rent", "deposit", "application_fee", "bedrooms", "full_baths", "half_baths", "square_feet", "date_available", "lease_term", "description", "amenities", "laundry", "parking_type", "cats_allowed", "small_dogs_allowed", "large_dogs_allowed", "smoking_allowed", "furnished", "contact_name", "contact_email", "contact_phone", "status", "syndicate_zillow"] as const;

async function photosFor(env: ListingsEnv, listingIds: number[]): Promise<Record<number, PhotoRow[]>> {
  const out: Record<number, PhotoRow[]> = {};
  if (listingIds.length === 0) return out;
  const rows = await env.DB.prepare(`SELECT id, listing_id, r2_key, caption, sort_order FROM listing_photos WHERE listing_id IN (${listingIds.map(() => "?").join(",")}) ORDER BY sort_order, id`).bind(...listingIds).all<PhotoRow>();
  for (const p of rows.results) (out[p.listing_id] ||= []).push(p);
  return out;
}
function photoUrl(origin: string, key: string): string { return `${origin}/photos/${key}`; }
function withPhotos(origin: string, l: ListingRow, photos: PhotoRow[] = []) { return { ...l, photos: photos.map((p) => ({ id: p.id, url: photoUrl(origin, p.r2_key), caption: p.caption })) }; }

/** What still keeps a listing out of the Zillow feed. Zillow rejects listings without photos, and the rest are needed for renters to act on it. */
export function zillowIssues(l: ListingRow, photoCount: number): string[] {
  const issues: string[] = [];
  if (!l.syndicate_zillow) issues.push("Zillow is switched off");
  if (l.status !== "active") issues.push("Status isn't Active");
  if (photoCount < 1) issues.push("Add at least 1 photo");
  if (l.description.trim().length < 50) issues.push("Write a description (50+ characters)");
  if (!l.date_available) issues.push("Set the date available");
  return issues;
}
function withZillow(origin: string, l: ListingRow, photos: PhotoRow[] = []) { return { ...withPhotos(origin, l, photos), zillow_issues: zillowIssues(l, photos.length) }; }

/** Public-safe shape: no owner ids, no draft fields. */
function publicListing(origin: string, l: ListingRow, photos: PhotoRow[] = []) {
  const { user_id, property_id, syndicate_zillow, created_at, ...rest } = withPhotos(origin, l, photos);
  return rest;
}

/** Landlord routes under /api/listings. Returns null when the path isn't a listings route. */
export async function handleListingRoutes(request: Request, env: ListingsEnv, url: URL, user: ListingUser): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/listings")) return null;
  const origin = url.origin;

  if (path === "/api/listings" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM listings WHERE user_id = ? ORDER BY updated_at DESC").bind(user.id).all<ListingRow>();
    const photos = await photosFor(env, rows.results.map((r) => r.id));
    return json(rows.results.map((l) => withZillow(origin, l, photos[l.id])));
  }

  if (path === "/api/listings" && request.method === "POST") {
    const parsed = parseListing(await request.json() as Record<string, unknown>);
    if ("error" in parsed) return json({ error: parsed.error }, 400);
    if (parsed.data.property_id && !(await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(parsed.data.property_id, user.id).first())) return json({ error: "Property not found" }, 404);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`INSERT INTO listings (user_id, ${LISTING_COLUMNS.join(", ")}, created_at, updated_at) VALUES (?, ${LISTING_COLUMNS.map(() => "?").join(", ")}, ?, ?)`)
      .bind(user.id, ...LISTING_COLUMNS.map((c) => parsed.data[c]), now, now).run();
    return json({ success: true, id: result.meta.last_row_id });
  }

  const one = path.match(/^\/api\/listings\/(\d+)$/);
  if (one) {
    const id = parseInt(one[1]);
    const listing = await env.DB.prepare("SELECT * FROM listings WHERE id = ? AND user_id = ?").bind(id, user.id).first<ListingRow>();
    if (!listing) return json({ error: "Not found" }, 404);
    if (request.method === "GET") { const photos = await photosFor(env, [id]); return json(withZillow(origin, listing, photos[id])); }
    if (request.method === "PUT") {
      const parsed = parseListing(await request.json() as Record<string, unknown>);
      if ("error" in parsed) return json({ error: parsed.error }, 400);
      if (parsed.data.property_id && !(await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(parsed.data.property_id, user.id).first())) return json({ error: "Property not found" }, 404);
      await env.DB.prepare(`UPDATE listings SET ${LISTING_COLUMNS.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND user_id = ?`)
        .bind(...LISTING_COLUMNS.map((c) => parsed.data[c]), new Date().toISOString(), id, user.id).run();
      return json({ success: true });
    }
    if (request.method === "DELETE") {
      const apps = await env.DB.prepare("SELECT COUNT(*) as n FROM applications WHERE listing_id = ?").bind(id).first<{ n: number }>();
      if (apps && apps.n > 0) return json({ error: "This listing has applications, so it can't be deleted. Set its status to Rented to hide it instead." }, 409);
      const photos = await env.DB.prepare("SELECT r2_key FROM listing_photos WHERE listing_id = ?").bind(id).all<{ r2_key: string }>();
      if (env.PHOTOS && photos.results.length) await env.PHOTOS.delete(photos.results.map((p) => p.r2_key));
      await env.DB.batch([env.DB.prepare("DELETE FROM listing_photos WHERE listing_id = ?").bind(id), env.DB.prepare("DELETE FROM listings WHERE id = ? AND user_id = ?").bind(id, user.id)]);
      return json({ success: true });
    }
  }

  const photoUpload = path.match(/^\/api\/listings\/(\d+)\/photos$/);
  if (photoUpload && request.method === "POST") {
    const id = parseInt(photoUpload[1]);
    if (!(await env.DB.prepare("SELECT id FROM listings WHERE id = ? AND user_id = ?").bind(id, user.id).first())) return json({ error: "Not found" }, 404);
    if (!env.PHOTOS) return json({ error: "Photo storage isn't set up yet. Run: npx wrangler r2 bucket create ec-rental-photos, then redeploy." }, 503);
    const type = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    const ext = PHOTO_TYPES[type];
    if (!ext) return json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: "Each photo must be under 5 MB." }, 400);
    const count = await env.DB.prepare("SELECT COUNT(*) as n FROM listing_photos WHERE listing_id = ?").bind(id).first<{ n: number }>();
    if (count && count.n >= MAX_PHOTOS) return json({ error: `A listing can have up to ${MAX_PHOTOS} photos.` }, 400);
    const key = `listings/${id}/${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: type } });
    const caption = str(url.searchParams.get("caption"), 60);
    const result = await env.DB.prepare("INSERT INTO listing_photos (listing_id, r2_key, caption, sort_order, created_at) VALUES (?, ?, ?, ?, ?)").bind(id, key, caption, count ? count.n : 0, new Date().toISOString()).run();
    await env.DB.prepare("UPDATE listings SET updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
    return json({ success: true, id: result.meta.last_row_id, url: photoUrl(origin, key) });
  }

  const photoDelete = path.match(/^\/api\/listings\/(\d+)\/photos\/(\d+)$/);
  if (photoDelete && request.method === "DELETE") {
    const [listingId, photoId] = [parseInt(photoDelete[1]), parseInt(photoDelete[2])];
    const photo = await env.DB.prepare("SELECT p.r2_key FROM listing_photos p JOIN listings l ON p.listing_id = l.id WHERE p.id = ? AND p.listing_id = ? AND l.user_id = ?").bind(photoId, listingId, user.id).first<{ r2_key: string }>();
    if (!photo) return json({ error: "Not found" }, 404);
    if (env.PHOTOS) await env.PHOTOS.delete(photo.r2_key);
    await env.DB.prepare("DELETE FROM listing_photos WHERE id = ?").bind(photoId).run();
    await env.DB.prepare("UPDATE listings SET updated_at = ? WHERE id = ?").bind(new Date().toISOString(), listingId).run();
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
}

/** Public routes: /api/public/listings, /photos/*, /feeds/zillow.xml. Returns null when not matched. */
export async function handlePublicListingRoutes(request: Request, env: ListingsEnv, url: URL, notify?: Notify): Promise<Response | null> {
  const path = url.pathname;
  const origin = url.origin;

  if (path === "/api/public/listings" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM listings WHERE status = 'active' ORDER BY updated_at DESC LIMIT 200").all<ListingRow>();
    const photos = await photosFor(env, rows.results.map((r) => r.id));
    return json(rows.results.map((l) => publicListing(origin, l, photos[l.id])));
  }

  const one = path.match(/^\/api\/public\/listings\/(\d+)$/);
  if (one && request.method === "GET") {
    const id = parseInt(one[1]);
    const l = await env.DB.prepare("SELECT * FROM listings WHERE id = ? AND status = 'active'").bind(id).first<ListingRow>();
    if (!l) return json({ error: "This listing is no longer available." }, 404);
    const photos = await photosFor(env, [id]);
    return json(publicListing(origin, l, photos[id]));
  }

  const inquiry = path.match(/^\/api\/public\/listings\/(\d+)\/inquiry$/);
  if (inquiry && request.method === "POST") {
    const id = parseInt(inquiry[1]);
    const l = await env.DB.prepare("SELECT id, street, unit, city, bedrooms, rent, contact_email FROM listings WHERE id = ? AND status = 'active'").bind(id).first<{ id: number; street: string; unit: string; city: string; bedrooms: number; rent: number; contact_email: string }>();
    if (!l) return json({ success: false, error: "This listing is no longer available." }, 404);
    const body = await request.json() as Record<string, unknown>;
    const name = str(body.name, 100), email = str(body.email, 200), phone = str(body.phone, 30), message = str(body.message, 2000), moveIn = str(body.moveIn, 20);
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !phone) return json({ success: false, error: "Please enter your name, email and phone." }, 400);
    // Saved as a tenant_application so it shows on the landlord's Listings page and the admin Leads page.
    await saveListingLead(env, l, { source: "listing", name, email, phone, moveIn, message }, notify, origin);
    return json({ success: true });
  }

  if (path.startsWith("/photos/") && request.method === "GET") {
    const key = decodeURIComponent(path.slice("/photos/".length));
    if (!/^listings\/\d+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(key)) return new Response("Not found", { status: 404 });
    if (!env.PHOTOS) return new Response("Photo storage not configured", { status: 503 });
    const obj = await env.PHOTOS.get(key);
    if (!obj) return new Response("Not found", { status: 404 });
    return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "public, max-age=86400", "ETag": obj.httpEtag } });
  }

  if (path === "/feeds/zillow.xml" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM listings WHERE status = 'active' AND syndicate_zillow = 1 ORDER BY id").all<ListingRow>();
    const photos = await photosFor(env, rows.results.map((r) => r.id));
    const ready = rows.results.filter((l) => zillowIssues(l, (photos[l.id] || []).length).length === 0);
    return new Response(buildZillowFeed(origin, ready, photos), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
  }

  return null;
}

function x(s: unknown): string { return String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
function el(name: string, value: unknown): string { return value === "" || value === null || value === undefined ? "" : `<${name}>${x(value)}</${name}>`; }

export const ZILLOW_COMPANY_ID = "ecrentalpm";

/** Zillow Rentals "hotPadsItems" v2.1 feed, single-unit structure (HOUSE | CONDO | TOWNHOUSE). */
export function buildZillowFeed(origin: string, listings: ListingRow[], photos: Record<number, PhotoRow[]>): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<hotPadsItems version="2.1">'];
  out.push(`<Company id="${ZILLOW_COMPANY_ID}">${el("name", "EC Rental Property Management LLC")}${el("website", origin)}${el("city", "Fresno")}${el("state", "CA")}</Company>`);
  for (const l of listings) {
    const p: string[] = [];
    p.push(`<listing id="ECR${l.id}" type="RENTAL" companyId="${ZILLOW_COMPANY_ID}" propertyType="${x(l.property_type)}">`);
    p.push(el("name", l.title));
    p.push(el("unit", l.unit));
    p.push(`<street hide="false">${x(l.street)}</street>`, el("city", l.city), el("state", l.state), el("zip", l.zip), el("country", "US"));
    p.push(el("lastUpdated", l.updated_at));
    p.push(el("contactName", l.contact_name), el("contactEmail", l.contact_email), el("contactPhone", l.contact_phone));
    const description = [l.description, l.amenities ? `Amenities: ${l.amenities}` : "", laundryText(l.laundry)].filter(Boolean).join("\n\n");
    p.push(el("description", description));
    p.push(el("leaseTerm", l.lease_term));
    p.push(el("website", `${origin}/listing?id=${l.id}`));
    p.push(el("isFurnished", l.furnished ? "true" : "false"), el("smokingAllowed", l.smoking_allowed ? "true" : "false"));
    if (l.parking_type) p.push(`<parking>${el("parkingType", l.parking_type)}</parking>`);
    p.push("<pets>",
      `<pet><petType>dogs</petType><petSize>small</petSize><allowed>${l.small_dogs_allowed ? "true" : "false"}</allowed></pet>`,
      `<pet><petType>dogs</petType><petSize>large</petSize><allowed>${l.large_dogs_allowed ? "true" : "false"}</allowed></pet>`,
      `<pet><petType>cats</petType><allowed>${l.cats_allowed ? "true" : "false"}</allowed></pet>`, "</pets>");
    const fees: string[] = [];
    if (l.deposit > 0) fees.push(fee(l.deposit, "securityDeposit", "moveIn", "refundable"));
    if (l.application_fee > 0) fees.push(fee(l.application_fee, "applicationFee", "atApplication", "nonRefundable"));
    if (fees.length) p.push(`<fees>${fees.join("")}</fees>`);
    for (const ph of photos[l.id] || []) p.push(ph.caption ? `<listingPhoto source="${x(photoUrl(origin, ph.r2_key))}">${el("caption", ph.caption.slice(0, 60))}</listingPhoto>` : `<listingPhoto source="${x(photoUrl(origin, ph.r2_key))}" />`);
    p.push(el("price", Math.round(l.rent)), el("pricingFrequency", "MONTH"));
    p.push(el("numBedrooms", l.bedrooms), el("numFullBaths", l.full_baths));
    if (l.half_baths) p.push(el("numHalfBaths", l.half_baths));
    if (l.square_feet) p.push(el("squareFeet", l.square_feet));
    p.push(el("dateAvailable", l.date_available));
    p.push(el("providerType", "propertyManagementSoftware"));
    p.push("</listing>");
    out.push(p.filter(Boolean).join(""));
  }
  out.push("</hotPadsItems>");
  return out.join("\n");
}
function fee(amount: number, type: string, timing: string, refundable: string): string {
  return `<fee><feeCalculationType value="${Math.round(amount)}" valueType="flatFee" /><feeType>${type}</feeType><feeTimingType>${timing}</feeTimingType><feeRequirementType>mandatory</feeRequirementType><feeRefundableType>${refundable}</feeRefundableType></fee>`;
}
function laundryText(v: string): string { return ({ in_unit: "Laundry: in unit", shared: "Laundry: shared on site", hookups: "Laundry: washer/dryer hookups", none: "" } as Record<string, string>)[v] || ""; }
