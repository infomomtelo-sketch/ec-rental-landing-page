/**
 * Rental applications for listings: a public apply endpoint and landlord review routes.
 * We deliberately don't collect SSN, date of birth, or protected-class information;
 * credit and background checks happen with a screening partner that collects its own data.
 */

export interface ApplicationsEnv { DB: D1Database; }
interface AppUser { id: number; }

export const APPLICATION_STATUSES = ["new", "reviewing", "approved", "denied", "withdrawn"];
export const SCREENING_STATUSES = ["not_started", "invited", "complete"];

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 200): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
function money(v: unknown): number { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0; }
function date(v: unknown): string { const s = str(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

const FIELDS = ["first_name", "last_name", "email", "phone", "move_in_date", "occupants", "current_address", "current_rent", "time_at_address", "current_landlord_name", "current_landlord_phone", "reason_for_moving", "employer", "job_title", "employer_phone", "employment_length", "monthly_income", "other_income", "pets", "vehicles", "additional_info", "signature_name"] as const;

function parseApplication(b: Record<string, unknown>) {
  const occupants = Math.floor(Number(b.occupants));
  const data = {
    first_name: str(b.first_name, 60), last_name: str(b.last_name, 60), email: str(b.email).toLowerCase(), phone: str(b.phone, 30),
    move_in_date: date(b.move_in_date), occupants: Number.isFinite(occupants) && occupants > 0 && occupants < 30 ? occupants : 0,
    current_address: str(b.current_address, 250), current_rent: money(b.current_rent), time_at_address: str(b.time_at_address, 60),
    current_landlord_name: str(b.current_landlord_name, 100), current_landlord_phone: str(b.current_landlord_phone, 30), reason_for_moving: str(b.reason_for_moving, 500),
    employer: str(b.employer, 120), job_title: str(b.job_title, 100), employer_phone: str(b.employer_phone, 30), employment_length: str(b.employment_length, 60),
    monthly_income: money(b.monthly_income), other_income: str(b.other_income, 300),
    pets: str(b.pets, 300), vehicles: str(b.vehicles, 300), additional_info: str(b.additional_info, 2000),
    signature_name: str(b.signature_name, 120),
  };
  if (!data.first_name || !data.last_name) return { error: "Please enter your first and last name." };
  if (!isEmail(data.email)) return { error: "Please enter a valid email address." };
  if (data.phone.replace(/\D/g, "").length < 10) return { error: "Please enter a phone number with area code." };
  if (!data.occupants) return { error: "Please enter how many people will live in the home." };
  if (!data.current_address) return { error: "Please enter your current address." };
  if (b.consent !== true && b.consent !== "on" && b.consent !== "true") return { error: "Please check the box to certify your application and authorize screening." };
  if (data.signature_name.toLowerCase().replace(/\s+/g, " ") !== `${data.first_name} ${data.last_name}`.toLowerCase().replace(/\s+/g, " ")) return { error: "Please type your full name exactly as entered above to sign." };
  return { data };
}

/** POST /api/public/listings/:id/apply */
export async function handlePublicApplicationRoutes(request: Request, env: ApplicationsEnv, url: URL): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/public\/listings\/(\d+)\/apply$/);
  if (!m || request.method !== "POST") return null;
  const listingId = parseInt(m[1]);
  const listing = await env.DB.prepare("SELECT id, user_id FROM listings WHERE id = ? AND status = 'active'").bind(listingId).first<{ id: number; user_id: number }>();
  if (!listing) return json({ success: false, error: "This home is no longer accepting applications." }, 404);
  const parsed = parseApplication(await request.json() as Record<string, unknown>);
  if ("error" in parsed) return json({ success: false, error: parsed.error }, 400);
  const d = parsed.data!;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const dup = await env.DB.prepare("SELECT id FROM applications WHERE listing_id = ? AND email = ? AND created_at > ?").bind(listingId, d.email, since).first();
  if (dup) return json({ success: false, error: "We already received an application from this email for this home today. We'll be in touch." }, 409);
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO applications (listing_id, landlord_user_id, status, screening_status, ${FIELDS.join(", ")}, signed_at, signer_ip, created_at, updated_at) VALUES (?, ?, 'new', 'not_started', ${FIELDS.map(() => "?").join(", ")}, ?, ?, ?, ?)`)
    .bind(listing.id, listing.user_id, ...FIELDS.map((f) => d[f]), now, request.headers.get("CF-Connecting-IP") || "", now, now).run();
  return json({ success: true, reference: "APP-" + String(result.meta.last_row_id).padStart(5, "0") });
}

/** Landlord routes under /api/applications. */
export async function handleApplicationRoutes(request: Request, env: ApplicationsEnv, url: URL, user: AppUser): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/applications")) return null;

  if (path === "/api/applications" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT a.id, a.listing_id, a.status, a.screening_status, a.first_name, a.last_name, a.email, a.phone, a.move_in_date, a.occupants, a.monthly_income, a.created_at, l.street, l.unit, l.city, l.rent FROM applications a JOIN listings l ON a.listing_id = l.id WHERE a.landlord_user_id = ? ORDER BY a.created_at DESC LIMIT 500").bind(user.id).all();
    return json(rows.results);
  }

  const one = path.match(/^\/api\/applications\/(\d+)$/);
  if (one) {
    const id = parseInt(one[1]);
    const app = await env.DB.prepare("SELECT a.*, l.street, l.unit, l.city, l.state, l.zip, l.rent FROM applications a JOIN listings l ON a.listing_id = l.id WHERE a.id = ? AND a.landlord_user_id = ?").bind(id, user.id).first();
    if (!app) return json({ error: "Not found" }, 404);
    if (request.method === "GET") return json(app);
    if (request.method === "PUT") {
      const b = await request.json() as Record<string, unknown>;
      const status = b.status === undefined ? (app.status as string) : str(b.status, 20);
      const screening = b.screening_status === undefined ? (app.screening_status as string) : str(b.screening_status, 20);
      const notes = b.landlord_notes === undefined ? (app.landlord_notes as string) : str(b.landlord_notes, 5000);
      if (!APPLICATION_STATUSES.includes(status)) return json({ error: "Invalid status" }, 400);
      if (!SCREENING_STATUSES.includes(screening)) return json({ error: "Invalid screening status" }, 400);
      await env.DB.prepare("UPDATE applications SET status = ?, screening_status = ?, landlord_notes = ?, updated_at = ? WHERE id = ? AND landlord_user_id = ?").bind(status, screening, notes, new Date().toISOString(), id, user.id).run();
      return json({ success: true });
    }
  }
  return json({ error: "Not found" }, 404);
}
