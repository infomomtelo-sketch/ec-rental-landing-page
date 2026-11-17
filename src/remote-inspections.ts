/**
 * Tello Inspect, the free remote AI inspection (/tello-inspect page; /ai-inspection redirects there). Anyone (landlord, tenant, buyer, homeowner) fills in a short form,
 * adds photos room by room, and the vision model reads each photo the same way it does for dashboard inspections.
 * Finishing writes a summary, saves the request as a lead for EC Rental, and emails the requester a private report
 * link. Each inspection has a random token: the report and its photos are only readable with it, never public.
 *
 * Shot list (Ziprent-style, Nov 2026): every room is a dropdown of categories. Every room carries the common
 * categories (ceiling, walls, floor, lighting, switches) and then its own. Each photo category takes 3 photos
 * from 3 different angles. Almost every category has yes/no checks and a comment box — the comment is typed
 * in and only needs one word: cleaning, damage, repair or replace. The report is one box per category:
 * the category's photos, what Tello saw in each, and the person's comment.
 */
import { aiText, clean, MODEL } from "./ai-assist";
import { readPhoto, overallFrom, typeLabel } from "./inspections";
import { textRun } from "./ai-text";

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
interface RemoteEnv { AI: Ai; DB: D1Database; PHOTOS?: R2Bucket; }
interface RemoteRow { id: number; token: string; name: string; email: string; phone: string; role: string; address: string; city: string; state: string; postcode: string; latitude: number | null; longitude: number | null; type: string; notes: string; status: string; overall: string; summary: string; created_at: string; finished_at: string | null; organization_id: number | null; }
interface RemoteItem { id: number; inspection_id: number; room: string; r2_key: string; condition: string; notes: string; repair_needed: number; repair_item: string; created_at: string; shot: string | null; for_item_id: number | null; category: string; }

const NOTIFY_TO = "info@ecrentalpm.com";
const TYPES = ["move_in", "move_out", "routine"];
const ROOMS = ["Exterior front", "Exterior back", "Entry", "Living room", "Dining room", "Kitchen", "Hallway", "Primary bedroom", "Bedroom 2", "Bedroom 3", "Primary bathroom", "Bathroom 2", "Laundry", "Garage", "Yard", "Roof", "HVAC / water heater"];
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 40;
const COMMENT_MAX = 120;
const FLOOR_TYPES = ["carpet", "tile", "wood"];

// ---------------------------------------------------------------- shot list
// Mirrors the template in public/tello-inspect.html — keep the two in sync.
// A room name resolves to a template; rooms that share a template collapse
// into one section (every exterior room is the Exterior section, the HVAC
// room is the Systems section).

interface ShotCheck { key: string; label: string; }
interface ShotCategory { key: string; label: string; photo?: boolean; floorType?: boolean; checks?: ShotCheck[]; }
interface ShotTemplate { id: string; label: string; cats: ShotCategory[]; }

const COMMON_CATS: ShotCategory[] = [
  { key: "ceiling", label: "Ceiling" },
  { key: "walls", label: "Walls" },
  { key: "floor", label: "Floor", floorType: true },
  { key: "lighting", label: "Lighting" },
  { key: "switches", label: "Switches" },
];
const SHOT_TEMPLATES: Record<string, ShotTemplate> = {
  living: { id: "living", label: "Living room", cats: [...COMMON_CATS, { key: "window", label: "Window" }] },
  bathroom: { id: "bathroom", label: "Bathroom", cats: [...COMMON_CATS,
    { key: "toilet", label: "Toilet", checks: [{ key: "flushing", label: "Flushing works?" }] },
    { key: "vanity", label: "Vanity" },
    { key: "faucets", label: "Faucets", checks: [{ key: "hot_cold", label: "Hot and cold water run?" }] },
    { key: "shower", label: "Shower" },
    { key: "mirror", label: "Mirror" },
    { key: "exhaust_fan", label: "Exhaust fan", checks: [{ key: "works", label: "Works?" }] },
    { key: "bathtub", label: "Bathtub" },
  ] },
  kitchen: { id: "kitchen", label: "Kitchen", cats: [...COMMON_CATS,
    { key: "appliances", label: "Appliances", checks: [{ key: "stove_heats", label: "Stove heats?" }, { key: "fridge_cold", label: "Fridge cold?" }, { key: "dishwasher_runs", label: "Dishwasher runs?" }] },
    { key: "cabinets", label: "Cabinets" },
    { key: "countertops", label: "Countertops" },
    { key: "sink_faucets", label: "Sink + faucets", checks: [{ key: "hot_cold", label: "Hot and cold water run?" }] },
    { key: "plumbing", label: "Plumbing under sink" },
  ] },
  bedroom: { id: "bedroom", label: "Bedroom", cats: [...COMMON_CATS,
    { key: "closet", label: "Closet" },
    { key: "window", label: "Window" },
  ] },
  dining: { id: "dining", label: "Dining room", cats: [...COMMON_CATS, { key: "window", label: "Window" }] },
  hallway: { id: "hallway", label: "Hallway / Entry", cats: [...COMMON_CATS,
    { key: "front_door", label: "Front door + locks", checks: [{ key: "keys_tested", label: "All keys tested?" }] },
    { key: "doorbell", label: "Doorbell", checks: [{ key: "works", label: "Works?" }] },
  ] },
  laundry: { id: "laundry", label: "Laundry", cats: [...COMMON_CATS,
    { key: "washer", label: "Washer", checks: [{ key: "runs", label: "Runs?" }] },
    { key: "dryer", label: "Dryer", checks: [{ key: "runs", label: "Runs?" }] },
    { key: "hookups", label: "Hookups" },
  ] },
  systems: { id: "systems", label: "Systems", cats: [
    { key: "ac", label: "A/C", checks: [{ key: "works", label: "Works?" }] },
    { key: "heater", label: "Heater", checks: [{ key: "works", label: "Works?" }] },
  ] },
  exterior: { id: "exterior", label: "Exterior", cats: [
    { key: "front_door", label: "Front door + locks", checks: [{ key: "keys_tested", label: "All keys tested?" }] },
    { key: "porch", label: "Porch / steps" },
    { key: "exterior_walls", label: "Exterior walls" },
    { key: "yard_front", label: "Front yard" },
    { key: "yard_back", label: "Back yard" },
    { key: "yard_side", label: "Side yard" },
    { key: "driveway", label: "Driveway / walkway" },
    { key: "garage", label: "Garage" },
  ] },
};
const DETECTOR_CATS: ShotCategory[] = [
  { key: "smoke", label: "Smoke detector", photo: false, checks: [{ key: "present", label: "Present?" }, { key: "functional", label: "Functional?" }, { key: "needs_battery", label: "Needs battery?" }] },
  { key: "co", label: "Carbon monoxide detector", photo: false, checks: [{ key: "available", label: "Available?" }, { key: "tested", label: "Tested?" }] },
];

function templateForRoom(room: string): ShotTemplate {
  const r = String(room || "").toLowerCase();
  if (r === "systems") return SHOT_TEMPLATES.systems;
  if (r === "exterior") return SHOT_TEMPLATES.exterior;
  if (r.includes("living")) return SHOT_TEMPLATES.living;
  if (r.includes("kitchen")) return SHOT_TEMPLATES.kitchen;
  if (r.includes("bedroom")) return SHOT_TEMPLATES.bedroom;
  if (r.includes("bathroom")) return SHOT_TEMPLATES.bathroom;
  if (r.includes("dining")) return SHOT_TEMPLATES.dining;
  if (r === "entry" || r === "hallway") return SHOT_TEMPLATES.hallway;
  if (r.includes("laundry")) return SHOT_TEMPLATES.laundry;
  if (r.includes("hvac")) return SHOT_TEMPLATES.systems;
  if (r.includes("exterior") || r === "yard" || r === "garage" || r === "roof") return SHOT_TEMPLATES.exterior;
  return { id: "other", label: room, cats: COMMON_CATS.slice() };
}

/** The section a picked room belongs to — exterior rooms collapse into one Exterior section, HVAC into Systems. */
function sectionRoom(room: string): string {
  const t = templateForRoom(room);
  if (t.id === "exterior") return "Exterior";
  if (t.id === "systems") return "Systems";
  return room;
}

function findCategory(room: string, key: string): ShotCategory | null {
  if (room === "Detectors") return DETECTOR_CATS.find((c) => c.key === key) || null;
  return templateForRoom(room).cats.find((c) => c.key === key) || null;
}

// ------------------------------------------------------------ categories

interface CategoryRecord { room: string; category: string; floor_type: string; answers: Record<string, string>; comment: string; }

function parseAnswers(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (val === "yes" || val === "no") out[k] = val;
  }
  return out;
}

/** Category records for an inspection. Defensive: if migration 0003 hasn't run yet, the table is missing and this returns [] instead of breaking the page. */
async function loadCategories(env: RemoteEnv, inspId: number): Promise<CategoryRecord[]> {
  try {
    const rows = await env.DB.prepare("SELECT room, category, floor_type, answers, comment FROM remote_inspection_categories WHERE inspection_id = ? ORDER BY id").bind(inspId).all<{ room: string; category: string; floor_type: string; answers: string; comment: string }>();
    return rows.results.map((r) => {
      let answers: Record<string, string> = {};
      try { answers = parseAnswers(JSON.parse(r.answers || "{}")); } catch { answers = {}; }
      return { room: r.room, category: r.category, floor_type: r.floor_type || "", answers, comment: r.comment || "" };
    });
  } catch {
    return [];
  }
}

/** Rooms the photographer must cover, chosen at the start and locked in: named rooms from the allowlist plus up to 3 typed-in extras. */
function parseRooms(v: unknown, other: unknown): string[] {
  const out: string[] = [];
  const list = Array.isArray(v) ? v : [];
  for (const r of list) { const s = str(r, 60); if (ROOMS.includes(s) && !out.includes(s)) out.push(s); }
  const extra = String(other ?? "").split(",").map((s) => s.trim().slice(0, 60)).filter(Boolean);
  for (const s of extra) { if (!out.includes(s) && out.length < 12) out.push(s); }
  return out.slice(0, 12);
}
async function requiredRooms(env: RemoteEnv, inspId: number): Promise<string[]> {
  const r = await env.DB.prepare("SELECT room FROM remote_inspection_rooms WHERE inspection_id = ? ORDER BY rowid").bind(inspId).all<{ room: string }>();
  return r.results.map((x) => x.room);
}

interface LoadedItem { id: number; room: string; category: string; condition: string; notes: string; repair_needed: number; repair_item: string; shot: string | null; }

/** Items with their category. Falls back to the pre-0003 shape when the category column doesn't exist yet. */
async function loadItemsWithCategory(env: RemoteEnv, inspId: number): Promise<LoadedItem[]> {
  try {
    const rows = await env.DB.prepare("SELECT i.id, i.room, i.category, i.condition, i.notes, i.repair_needed, i.repair_item, s.shot FROM remote_inspection_items i LEFT JOIN remote_inspection_shots s ON s.item_id = i.id WHERE i.inspection_id = ? ORDER BY i.id").bind(inspId).all<LoadedItem>();
    return rows.results.map((r) => ({ ...r, category: r.category || "" }));
  } catch {
    const rows = await env.DB.prepare("SELECT i.id, i.room, i.condition, i.notes, i.repair_needed, i.repair_item, s.shot FROM remote_inspection_items i LEFT JOIN remote_inspection_shots s ON s.item_id = i.id WHERE i.inspection_id = ? ORDER BY i.id").bind(inspId).all<LoadedItem>();
    return rows.results.map((r) => ({ ...r, category: "" }));
  }
}

/**
 * What is still missing before the report can be sent: every category in every required
 * section needs at least one photo (where it takes photos), its floor type (floor only),
 * its yes/no checks answered, and its comment written. Detectors always gate. Systems
 * gates only when the HVAC room was picked (a home may have no A/C at all, and the
 * yes/no + four-word answers have no "not present" — forcing it would invent a finding).
 * A category where Tello flagged damage needs one more angle of it.
 */
async function missingCategories(env: RemoteEnv, inspId: number, rooms: string[]): Promise<string[]> {
  const cats = await loadCategories(env, inspId);
  const byKey = new Map(cats.map((c) => [c.room + "||" + c.category, c]));
  const all = await loadItemsWithCategory(env, inspId);
  const missing: string[] = [];
  const checkCat = (room: string, sectionLabel: string, cat: ShotCategory) => {
    const rec = byKey.get(room + "||" + cat.key);
    const photos = all.filter((i) => i.room === room && (i.category || "") === cat.key);
    const parts: string[] = [];
    if (cat.photo !== false && photos.length < 1) parts.push("a photo");
    if (cat.floorType && !(rec && rec.floor_type)) parts.push("the floor type");
    for (const ch of cat.checks || []) {
      const a = rec ? rec.answers[ch.key] : undefined;
      if (a !== "yes" && a !== "no") { parts.push("the yes/no checks"); break; }
    }
    if (!rec || !rec.comment.trim()) parts.push("your comment");
    if (parts.length) { missing.push(sectionLabel + " — " + cat.label + ": " + parts.join(" + ")); return; }
    const flagged = photos.filter((i) => i.repair_needed);
    if (flagged.length && photos.length < 2) missing.push(sectionLabel + " — " + cat.label + ": one more angle of " + (flagged[0].repair_item || "the damage"));
  };
  const seen = new Set<string>();
  for (const room of rooms) {
    const sec = sectionRoom(room);
    if (seen.has(sec)) continue;
    seen.add(sec);
    const t = templateForRoom(sec);
    for (const cat of t.cats) checkCat(sec, t.label, cat);
  }
  for (const cat of DETECTOR_CATS) checkCat("Detectors", "Detectors", cat);
  return missing;
}
const ROLES: Record<string, string> = { landlord: "Landlord or owner", manager: "Property manager", tenant: "Tenant", buyer: "Home buyer", homeowner: "Homeowner", other: "Other" };

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
/** A coordinate from the address lookup, or null when it is missing or out of range. */
function geoNum(v: unknown, min: number, max: number): number | null { const n = typeof v === "string" || typeof v === "number" ? Number(v) : NaN; return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function newToken(): string { const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
function sameToken(a: string, b: string): boolean { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

function publicView(r: RemoteRow) {
  return { id: r.id, name: r.name, role: r.role, address: r.address, city: r.city || "", state: r.state || "", postcode: r.postcode || "", latitude: r.latitude ?? null, longitude: r.longitude ?? null, type: r.type, status: r.status, overall: r.overall, summary: r.summary, created_at: r.created_at, finished_at: r.finished_at };
}
function itemView(i: RemoteItem) {
  return { id: i.id, room: i.room, category: i.category || "", condition: i.condition, notes: i.notes, repair_needed: i.repair_needed, repair_item: i.repair_item, shot: i.shot || "", for_item_id: i.for_item_id || null };
}

interface OrgBrand { slug: string; brand_name: string | null; brand_logo_url: string | null; primary_color: string | null; support_email: string | null; }

/** Public brand fields for the runner page header / report footer, or null when the inspection has no organization. */
async function orgBrand(env: RemoteEnv, organizationId: number | null | undefined): Promise<OrgBrand | null> {
  if (!organizationId) return null;
  return env.DB.prepare("SELECT slug, brand_name, brand_logo_url, primary_color, support_email FROM organizations WHERE id = ?").bind(organizationId).first<OrgBrand>();
}

/** Resolve a partner slug (from /inspect/<slug>) to an organization id. Unknown slugs resolve to null — the inspection still runs, unbranded. */
async function orgIdForSlug(env: RemoteEnv, slug: unknown): Promise<number | null> {
  const s = str(slug, 80).toLowerCase();
  if (!s) return null;
  const org = await env.DB.prepare("SELECT id FROM organizations WHERE slug = ?").bind(s).first<{ id: number }>();
  return org ? org.id : null;
}

/** Handles /api/public/ai-inspections*. `allow` is the per-IP rate limit for starting and finishing. */
export async function handleRemoteInspections(request: Request, env: RemoteEnv, url: URL, allow: () => Promise<boolean>, notify?: Notify): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/public/ai-inspections")) return null;

  if (path === "/api/public/ai-inspections" && request.method === "POST") {
    if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    const b = await request.json() as Record<string, unknown>;
    if (str(b.website, 100)) return json({ error: "Something went wrong." }, 400); // spam trap
    const name = str(b.name, 100), email = str(b.email, 200), phone = str(b.phone, 30);
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Please enter your name and email so we can send your report." }, 400);
    const role = str(b.role, 20) in ROLES ? str(b.role, 20) : "other";
    const type = TYPES.includes(str(b.type, 20)) ? str(b.type, 20) : "routine";
    const rooms = parseRooms(b.rooms, b.otherRooms);
    if (!rooms.length) return json({ error: "Pick at least one room to inspect." }, 400);
    const organizationId = await orgIdForSlug(env, b.org);
    const token = newToken();
    // Property auto-fill: when the address came from the auto-search pick,
    // the page also sends the match's city/state/ZIP + map-pin coordinates.
    // All optional — old payloads without them still work, and the insert
    // falls back to the old shape when migration 0003 hasn't run yet.
    const city = str(b.city, 100), stateName = str(b.state, 100), postcode = str(b.postcode, 20);
    const latitude = geoNum(b.latitude, -90, 90), longitude = geoNum(b.longitude, -180, 180);
    let id: number;
    try {
      const r = await env.DB.prepare("INSERT INTO remote_inspections (token, name, email, phone, role, address, city, state, postcode, latitude, longitude, type, notes, status, created_at, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)")
        .bind(token, name, email, phone, role, str(b.address, 200), city, stateName, postcode, latitude, longitude, type, str(b.notes, 1000), new Date().toISOString(), organizationId).run();
      id = r.meta.last_row_id as number;
    } catch (err) {
      const r = await env.DB.prepare("INSERT INTO remote_inspections (token, name, email, phone, role, address, type, notes, status, created_at, organization_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)")
        .bind(token, name, email, phone, role, str(b.address, 200), type, str(b.notes, 1000), new Date().toISOString(), organizationId).run();
      id = r.meta.last_row_id as number;
    }
    for (const room of rooms) await env.DB.prepare("INSERT OR IGNORE INTO remote_inspection_rooms (inspection_id, room) VALUES (?, ?)").bind(id, room).run();
    return json({ success: true, id, token, rooms });
  }

  const m = path.match(/^\/api\/public\/ai-inspections\/(\d+)(\/finish|\/categories|\/photos(?:\/(\d+))?)?$/);
  if (!m) return json({ error: "Not found" }, 404);
  const insp = await env.DB.prepare("SELECT * FROM remote_inspections WHERE id = ?").bind(parseInt(m[1])).first<RemoteRow>();
  if (!insp || !sameToken(url.searchParams.get("t") || "", insp.token)) return json({ error: "This report link isn't valid." }, 404);
  const items = async () => (await env.DB.prepare("SELECT i.*, s.shot, s.for_item_id FROM remote_inspection_items i LEFT JOIN remote_inspection_shots s ON s.item_id = i.id WHERE i.inspection_id = ? ORDER BY i.id").bind(insp.id).all<RemoteItem>()).results;

  if (!m[2] && request.method === "GET") {
    const rooms = await requiredRooms(env, insp.id);
    const removed = await env.DB.prepare("SELECT COUNT(*) AS n FROM remote_inspection_deleted WHERE inspection_id = ?").bind(insp.id).first<{ n: number }>();
    return json({ inspection: publicView(insp), items: (await items()).map(itemView), rooms, removed: removed ? removed.n : 0, organization: await orgBrand(env, insp.organization_id), categories: await loadCategories(env, insp.id) });
  }

  // Save one category's answers: floor type, yes/no checks, and the typed comment.
  // The comment is a free-text box — it only needs one word (cleaning, damage,
  // repair or replace) but it is typed, not picked, so any short text is stored.
  if (m[2] === "/categories" && request.method === "POST") {
    if (insp.status !== "open") return json({ error: "This report is already finished." }, 400);
    const b = await request.json() as Record<string, unknown>;
    const room = str(b.room, 60);
    const key = str(b.category, 60);
    const cat = room && key ? findCategory(room, key) : null;
    if (!cat) return json({ error: "That category isn't part of this inspection." }, 400);
    const rooms = await requiredRooms(env, insp.id);
    const allowed = room === "Detectors" || room === "Systems" || rooms.some((r) => sectionRoom(r) === room);
    if (!allowed) return json({ error: "That room isn't part of this inspection." }, 400);
    const floorType = cat.floorType && typeof b.floor_type === "string" && FLOOR_TYPES.includes(b.floor_type) ? b.floor_type : "";
    const answers: Record<string, string> = {};
    const rawAnswers = parseAnswers(b.answers);
    for (const ch of cat.checks || []) if (rawAnswers[ch.key]) answers[ch.key] = rawAnswers[ch.key];
    const comment = str(b.comment, COMMENT_MAX);
    try {
      await env.DB.prepare(
        "INSERT INTO remote_inspection_categories (inspection_id, room, category, floor_type, answers, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(inspection_id, room, category) DO UPDATE SET floor_type = excluded.floor_type, answers = excluded.answers, comment = excluded.comment"
      ).bind(insp.id, room, key, floorType, JSON.stringify(answers), comment, new Date().toISOString()).run();
    } catch (err) {
      return json({ error: "Category saving isn't set up yet — the database update for the new shot list hasn't run." }, 503);
    }
    return json({ success: true, category: { room, category: key, floor_type: floorType, answers, comment } });
  }

  // Add one photo to a category: saved privately to R2, then read by the AI.
  if (m[2] === "/photos" && request.method === "POST") {
    if (insp.status !== "open") return json({ error: "This report is already finished." }, 400);
    if (!env.PHOTOS) return json({ error: "Photo storage isn't set up yet." }, 503);
    const room = str(url.searchParams.get("room"), 60);
    if (!room) return json({ error: "Pick the room first." }, 400);
    const category = str(url.searchParams.get("category"), 60);
    const angle = url.searchParams.get("angle") || "";
    const shot = /^angle[123]$/.test(angle) ? angle : "closeup";
    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    const ext = PHOTO_TYPES[contentType];
    if (!ext) return json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: "Each photo must be under 5 MB." }, 400);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM remote_inspection_items WHERE inspection_id = ?").bind(insp.id).first<{ n: number }>();
    if (count && count.n >= MAX_PHOTOS) return json({ error: `You can add up to ${MAX_PHOTOS} photos.` }, 400);
    const key = `remote-inspections/${insp.id}/${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType } });
    const ai = await readPhoto(env, room, insp.type, bytes);
    let itemId: number;
    try {
      const r = await env.DB.prepare("INSERT INTO remote_inspection_items (inspection_id, room, category, r2_key, condition, notes, repair_needed, repair_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(insp.id, room, category, key, ai.condition, ai.notes, ai.repair_needed, ai.repair_item, new Date().toISOString()).run();
      itemId = r.meta.last_row_id as number;
    } catch {
      // Pre-migration fallback: the category column doesn't exist yet.
      const r = await env.DB.prepare("INSERT INTO remote_inspection_items (inspection_id, room, r2_key, condition, notes, repair_needed, repair_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(insp.id, room, key, ai.condition, ai.notes, ai.repair_needed, ai.repair_item, new Date().toISOString()).run();
      itemId = r.meta.last_row_id as number;
    }
    await env.DB.prepare("INSERT INTO remote_inspection_shots (item_id, shot, for_item_id) VALUES (?, ?, NULL)").bind(itemId, shot).run();
    return json({ success: true, item: { id: itemId, room, category, shot, for_item_id: null, ...ai } });
  }

  if (m[3]) {
    const item = await env.DB.prepare("SELECT * FROM remote_inspection_items WHERE id = ? AND inspection_id = ?").bind(parseInt(m[3]), insp.id).first<RemoteItem>();
    if (!item) return json({ error: "Not found" }, 404);
    if (request.method === "GET") {
      const obj = env.PHOTOS ? await env.PHOTOS.get(item.r2_key) : null;
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    if (request.method === "DELETE") {
      if (insp.status !== "open") return json({ error: "This report is already finished." }, 400);
      const shot = await env.DB.prepare("SELECT shot FROM remote_inspection_shots WHERE item_id = ?").bind(item.id).first<{ shot: string }>();
      await env.DB.prepare("INSERT INTO remote_inspection_deleted (inspection_id, item_id, room, shot, condition, notes, repair_needed, repair_item, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(insp.id, item.id, item.room, shot ? shot.shot : "", item.condition, item.notes, item.repair_needed, item.repair_item, new Date().toISOString()).run();
      if (env.PHOTOS) await env.PHOTOS.delete(item.r2_key);
      await env.DB.prepare("DELETE FROM remote_inspection_shots WHERE item_id = ?").bind(item.id).run();
      await env.DB.prepare("DELETE FROM remote_inspection_items WHERE id = ?").bind(item.id).run();
      return json({ success: true });
    }
  }

  // Finish: overall rating, AI summary, lead for EC Rental, report link emailed to the requester.
  if (m[2] === "/finish" && request.method === "POST") {
    if (insp.status !== "open") return json({ success: true, overall: insp.overall, summary: insp.summary });
    if (!(await allow())) return json({ error: "Too many requests. Please wait a minute and try again." }, 429);
    const all = await items();
    if (!all.length) return json({ error: "Add at least one photo first." }, 400);
    const missing = await missingCategories(env, insp.id, await requiredRooms(env, insp.id));
    if (missing.length) return json({ error: "Still needed: " + missing.join("; ") + "." }, 400);
    const overall = overallFrom(all);
    const rooms = new Set(all.map((i) => i.room)).size;
    const repairs = all.filter((i) => i.repair_needed);
    let summary = `We reviewed ${all.length} photo${all.length === 1 ? "" : "s"} across ${rooms} area${rooms === 1 ? "" : "s"}. ${repairs.length} item${repairs.length === 1 ? "" : "s"} may need repair. Overall: ${overall}.`;
    // The full read: Tello reads the photo notes together with the person's
    // comment for each category, and names the specific thing it sees in
    // each photo. Grouped by room + category so the report is one box per
    // category — and a move-out comparison can match on room + category.
    const cats = await loadCategories(env, insp.id);
    const catByKey = new Map(cats.map((c) => [c.room + "||" + c.category, c]));
    const catLabel = (room: string, key: string): string => {
      const found = findCategory(room, key);
      return found ? found.label : (key ? key.replace(/_/g, " ") : "Photos");
    };
    const boxOrder: string[] = [];
    const boxes = new Map<string, RemoteItem[]>();
    for (const it of all) {
      const k = it.room + "||" + (it.category || "");
      if (!boxes.has(k)) { boxes.set(k, []); boxOrder.push(k); }
      boxes.get(k)!.push(it);
    }
    for (const c of cats) {
      const k = c.room + "||" + c.category;
      if (!boxes.has(k)) { boxes.set(k, []); boxOrder.push(k); }
    }
    const notes = boxOrder.map((k) => {
      const [room, key] = k.split("||");
      const rec = catByKey.get(k);
      const lines: string[] = [`${room} — ${catLabel(room, key)}:`];
      if (rec) {
        if (rec.floor_type) lines.push(`  Floor type: ${rec.floor_type}`);
        const cat = findCategory(room, key);
        for (const ch of cat?.checks || []) {
          const a = rec.answers[ch.key];
          if (a === "yes" || a === "no") lines.push(`  ${ch.label} ${a === "yes" ? "Yes" : "No"}`);
        }
        if (rec.comment) lines.push(`  Person's comment: ${rec.comment}`);
      }
      for (const i of boxes.get(k) || []) {
        lines.push(`  Photo (${i.shot || "photo"}): ${i.condition || "not rated"}${i.notes ? ", " + i.notes : ""}${i.repair_needed ? " (repair: " + (i.repair_item || "yes") + ")" : ""}`);
      }
      return lines.join("\n");
    }).join("\n");
    const moveOutNote = insp.type === "move_out"
      ? " This is a move-out check with no move-in baseline attached, so describe move-out condition only — do not invent a comparison."
      : "";
    try {
      const out = await textRun(env, { messages: [
        { role: "system", content: "You write short, plain, factual home condition summaries from photo notes. Only use the notes given. Name the specific thing you see in each photo — a stain, a crack, a broken part — never a generic verdict. Include the person's own comment for each category. Don't describe people. This is an AI photo review, not a licensed home inspection, so don't claim anything the photos can't show." },
        { role: "user", content: `Summarize this ${typeLabel(insp.type)} photo review for a ${ROLES[insp.role] || "reader"} in 3 to 5 sentences: the overall condition, the main issues by room and category, and what to look at first.${moveOutNote}\n\n${notes}` },
      ], max_tokens: 500 } as never);
      const text = clean(aiText(out));
      if (text) summary = text.slice(0, 1500);
    } catch (err) { console.error("[remote-inspection-summary]", err); }
    const removedRow = await env.DB.prepare("SELECT COUNT(*) AS n FROM remote_inspection_deleted WHERE inspection_id = ?").bind(insp.id).first<{ n: number }>();
    const removedCount = removedRow ? removedRow.n : 0;
    if (removedCount > 0) summary += `\n\nNote: ${removedCount} photo${removedCount === 1 ? "" : "s"} ${removedCount === 1 ? "was" : "were"} removed before this report was finished.`;

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE remote_inspections SET status = 'done', overall = ?, summary = ?, finished_at = ? WHERE id = ?").bind(overall, summary, now, insp.id).run();
    const reportUrl = `https://${url.host}/tello-inspect?id=${insp.id}&t=${insp.token}`;
    const details = { source: "ai_inspection", inspection_id: insp.id, role: insp.role, type: insp.type, address: insp.address, photos: all.length, repairs: repairs.length, overall, notes: insp.notes };
    await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(insp.name, "", insp.email, insp.phone || "", "1", "ai_inspection", JSON.stringify(details), "pending", now).run();

    if (notify) {
      const repairLines = repairs.slice(0, 10).map((i) => `${i.room}: ${i.repair_item || "repair needed"}`);
      const userText = [`Hi ${insp.name},`, "", `Your Tello Inspect report is ready. Overall: ${overall}.`, "", summary, "", ...(repairLines.length ? ["Items that may need repair:", ...repairLines.map((l) => "- " + l), ""] : []),
        `See the full report with photos: ${reportUrl}`, "", "This is an AI review of your photos, not a licensed home inspection. For anything serious, such as structural, water or electrical concerns, hire a licensed home inspector.", "", "EC Rental Property Management"].join("\n");
      const userHtml = `<p>Hi ${esc(insp.name)},</p><p>Your Tello Inspect report is ready. <strong>Overall: ${esc(overall)}</strong></p><p>${esc(summary)}</p>` +
        (repairLines.length ? `<p><strong>Items that may need repair</strong><br>${repairLines.map(esc).join("<br>")}</p>` : "") +
        `<p><a href="${esc(reportUrl)}">See the full report with photos</a></p><p style="color:#6b7280;font-size:13px">This is an AI review of your photos, not a licensed home inspection. For anything serious, such as structural, water or electrical concerns, hire a licensed home inspector.</p><p>EC Rental Property Management</p>`;
      try { await notify(insp.email, "Your Tello Inspect report", userHtml, userText); } catch (err) { console.error("[remote-inspection] email requester", err); }
      const lines = [`Name: ${insp.name}`, `Email: ${insp.email}`, `Phone: ${insp.phone || "not given"}`, `They are: ${ROLES[insp.role] || "Other"}`,
        `Address: ${insp.address || "not given"}`, `Type: ${typeLabel(insp.type)}`, `Photos: ${all.length}, repairs flagged: ${repairs.length}, overall: ${overall}, photos removed: ${removedCount}`, ...(insp.notes ? [`Notes: ${insp.notes}`] : []), `Report: ${reportUrl}`];
      try {
        await notify(NOTIFY_TO, `Tello Inspect finished: ${insp.address || insp.name}`,
          `<p>Someone ran Tello Inspect on ecrentalpm.com. They got the report by email. Follow up if they have questions.</p><p>${lines.map(esc).join("<br>")}</p>`,
          "Someone ran Tello Inspect on ecrentalpm.com. They got the report by email. Follow up if they have questions.\n\n" + lines.join("\n"));
      } catch (err) { console.error("[remote-inspection] email EC Rental", err); }
      // If a landlord sent this inspection, the report goes to them too.
      const owner = await env.DB.prepare("SELECT u.email FROM users u JOIN remote_inspection_owners o ON o.owner_user_id = u.id WHERE o.inspection_id = ?").bind(insp.id).first<{ email: string }>();
      if (owner && owner.email && owner.email !== insp.email) {
        try {
          await notify(owner.email, `Tello Inspect finished: ${insp.address || insp.name}`,
            `<p>Hi,</p><p>${esc(insp.name)} finished the ${esc(typeLabel(insp.type))} inspection for ${esc(insp.address || "your property")}. <strong>Overall: ${esc(overall)}</strong></p><p>${esc(summary)}</p>` +
            (repairLines.length ? `<p><strong>Items that may need repair</strong><br>${repairLines.map(esc).join("<br>")}</p>` : "") +
            `<p><a href="${esc(reportUrl)}">See the full report with photos</a></p><p style="color:#6b7280;font-size:13px">This is an AI review of the photos sent, not a licensed home inspection.</p><p>EC Rental Property Management</p>`,
            `Hi,\n\n${insp.name} finished the ${typeLabel(insp.type)} inspection for ${insp.address || "your property"}. Overall: ${overall}.\n\n${summary}\n\nSee the full report with photos: ${reportUrl}\n\nThis is an AI review of the photos sent, not a licensed home inspection.\n\nEC Rental Property Management`);
        } catch (err) { console.error("[remote-inspection] email owner", err); }
      }
    }
    return json({ success: true, overall, summary, report_url: reportUrl, removed: removedCount });
  }

  return json({ error: "Not found" }, 404);
}

interface LandlordUser { id: number; name: string; email: string; }

/** Landlord-sent remote inspections: the landlord picks a property and a tenant, the rooms come from the property, and the tenant gets a link to photograph them. */
export async function handleLandlordRemote(request: Request, env: RemoteEnv, url: URL, user: LandlordUser, notify?: Notify): Promise<Response | null> {
  const path = url.pathname;
  if (path !== "/api/inspections/remote") return null;

  if (request.method === "GET") {
    const rows = (await env.DB.prepare("SELECT r.*, o.property_id, (SELECT COUNT(*) FROM remote_inspection_rooms WHERE inspection_id = r.id) AS rooms, (SELECT COUNT(*) FROM remote_inspection_items WHERE inspection_id = r.id) AS photos FROM remote_inspections r JOIN remote_inspection_owners o ON o.inspection_id = r.id WHERE o.owner_user_id = ? ORDER BY r.created_at DESC").bind(user.id).all()).results as Array<RemoteRow & { property_id: number; rooms: number; photos: number }>;
    return json(rows.map((r) => ({ id: r.id, property_id: r.property_id, name: r.name, email: r.email, address: r.address, type: r.type, status: r.status, overall: r.overall, photos: r.photos, rooms: r.rooms, created_at: r.created_at, finished_at: r.finished_at, link: `https://${url.host}/tello-inspect?id=${r.id}&t=${r.token}` })));
  }

  if (request.method === "POST") {
    const b = await request.json() as Record<string, unknown>;
    const propId = parseInt(String(b.property_id || ""));
    if (!propId) return json({ error: "Pick a property first." }, 400);
    const prop = await env.DB.prepare("SELECT id, address, tenant_name, tenant_email, tenant_phone FROM properties WHERE id = ? AND user_id = ?").bind(propId, user.id).first<{ id: number; address: string; tenant_name: string; tenant_email: string; tenant_phone: string }>();
    if (!prop) return json({ error: "Property not found." }, 404);
    const name = str(b.tenant_name, 100) || prop.tenant_name, email = str(b.tenant_email, 200) || prop.tenant_email;
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter the tenant's name and email so we can send them the link." }, 400);
    const type = TYPES.includes(str(b.type, 20)) ? str(b.type, 20) : "routine";
    const rooms = parseRooms(b.rooms, b.otherRooms);
    if (!rooms.length) return json({ error: "Pick at least one room to inspect." }, 400);
    // Partner white-label: the link can carry one of the landlord's OWN organizations
    // (validated against owner_user_id — a partner admin generates runner links under
    // their own brand only). A foreign or unknown id is rejected, not silently stored.
    let organizationId: number | null = null;
    if (b.organization_id !== undefined && b.organization_id !== null && b.organization_id !== "") {
      const org = await env.DB.prepare("SELECT id FROM organizations WHERE id = ? AND owner_user_id = ?").bind(Math.floor(Number(b.organization_id)) || 0, user.id).first<{ id: number }>();
      if (!org) return json({ error: "That organization isn't one of yours." }, 400);
      organizationId = org.id;
    }
    const token = newToken();
    const now = new Date().toISOString();
    const r = await env.DB.prepare("INSERT INTO remote_inspections (token, name, email, phone, role, address, type, notes, status, created_at, organization_id) VALUES (?, ?, ?, ?, 'tenant', ?, ?, '', 'open', ?, ?)")
      .bind(token, name, email, prop.tenant_phone || "", prop.address, type, now, organizationId).run();
    const id = r.meta.last_row_id as number;
    for (const room of rooms) await env.DB.prepare("INSERT OR IGNORE INTO remote_inspection_rooms (inspection_id, room) VALUES (?, ?)").bind(id, room).run();
    await env.DB.prepare("INSERT INTO remote_inspection_owners (inspection_id, owner_user_id, property_id) VALUES (?, ?, ?)").bind(id, user.id, propId).run();
    const link = `https://${url.host}/tello-inspect?id=${id}&t=${token}`;
    if (notify) {
      const subject = `${typeLabel(type)} inspection for ${prop.address}`;
      const text = [`Hi ${name},`, "", `${user.name} asked you to photograph ${prop.address} for a ${typeLabel(type)} inspection.`, "", "Open this link on your phone and follow the shot list — three angles of every ceiling, wall, floor, fixture and fitting, plus a few yes/no checks and your comment on each one. It takes a few minutes, and the report goes to you and your landlord when it's done.", "", link, "", "EC Rental Property Management"].join("\n");
      const html = `<p>Hi ${esc(name)},</p><p>${esc(user.name)} asked you to photograph ${esc(prop.address)} for a ${esc(typeLabel(type))} inspection.</p><p>Open this link on your phone and follow the shot list — three angles of every ceiling, wall, floor, fixture and fitting, plus a few yes/no checks and your comment on each one. It takes a few minutes, and the report goes to you and your landlord when it's done.</p><p><a href="${esc(link)}">Start the inspection</a></p><p>EC Rental Property Management</p>`;
      try { await notify(email, subject, html, text); } catch (err) { console.error("[remote-inspection] email tenant link", err); }
    }
    return json({ success: true, id, token, link, rooms });
  }

  return json({ error: "Not found" }, 404);
}
