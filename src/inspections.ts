/**
 * Inspections (v2): move-in, move-out, routine and annual inspections built room by room from photos.
 * Each photo is saved privately in R2 and read by the vision model, which pre-fills a condition rating
 * and notes that the inspector can correct. Finishing writes a short summary; a move-out can be compared
 * with the property's move-in to draft which changes look like wear and tear and which look like damage.
 * Repairs can be turned into maintenance requests. Inspection photos are never served publicly.
 */
import { aiText, clean, MODEL } from "./ai-assist";
import { textRun } from "./ai-text";

interface InspectionEnv { AI: Ai; DB: D1Database; PHOTOS?: R2Bucket; }
interface InspectionRow { id: number; property_id: number; inspector_name: string; inspection_date: string; overall_condition: string; summary: string; status: string; created_at: string; property_address: string; }
interface ItemRow { id: number; inspection_id: number; room_area: string; r2_key: string; condition: string; notes: string; repair_needed: number; repair_item: string; maintenance_id: number | null; created_at: string; }
interface DetailsRow { inspection_id: number; type: string; compare_to: number | null; comparison: string; }
interface ReportRow { inspection_id: number; report_text: string; status: string; signed_at: string; signed_by: string; }

/** Loads the inspection's written report draft, if one was generated. */
async function loadReport(env: InspectionEnv, inspectionId: number): Promise<ReportRow | null> {
  return env.DB.prepare("SELECT * FROM inspection_reports WHERE inspection_id = ?").bind(inspectionId).first<ReportRow>();
}

const VISION_MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";
const WHISPER_MODEL = "@cf/openai/whisper";
const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const INSPECTION_TYPES = ["move_in", "move_out", "routine", "annual"];
export const CONDITIONS = ["good", "fair", "poor", "damaged"];
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_ITEMS = 150;

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function str(v: unknown, max = 500): string { return v === undefined || v === null ? "" : String(v).trim().slice(0, max); }
export function typeLabel(t: string): string { return ({ move_in: "move-in", move_out: "move-out", routine: "routine", annual: "annual" } as Record<string, string>)[t] || "routine"; }

/** Pulls the first JSON object or array out of a model reply ("Sure! {...}"). */
function parseJson<T>(text: string, open: "{" | "["): T | null {
  const close = open === "{" ? "}" : "]";
  const start = text.indexOf(open), end = text.lastIndexOf(close);
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)) as T; } catch { return null; }
}

async function ownedInspection(env: InspectionEnv, userId: number, id: number): Promise<InspectionRow | null> {
  return env.DB.prepare("SELECT i.*, p.address AS property_address FROM inspections i JOIN properties p ON i.property_id = p.id WHERE i.id = ? AND p.user_id = ?").bind(id, userId).first<InspectionRow>();
}

/** Reads one photo with the vision model. Never throws: a failed read leaves the fields for the inspector. */
export async function readPhoto(env: { AI: Ai }, room: string, type: string, bytes: ArrayBuffer): Promise<{ condition: string; notes: string; repair_needed: number; repair_item: string }> {
  const prompt = [
    `This photo is from the ${room} during a ${typeLabel(type)} inspection of a rental home.`,
    "Describe only what is visible, objectively, like a home inspector writing a condition report: walls, floors, ceiling, fixtures, appliances, windows, doors. Note specific marks, stains, holes, cracks, leaks, missing or broken parts and their location. Don't guess at causes or things you can't see, and don't describe people.",
    'Return only JSON: {"condition":"good|fair|poor|damaged","notes":"1 to 3 short sentences","repair_needed":true|false,"repair_item":"a few words naming the repair, or empty"}',
    "good = clean and working; fair = normal wear; poor = worn out or dirty enough to need attention; damaged = broken, holes, leaks or other damage.",
  ].join("\n");
  try {
    const out = await env.AI.run(VISION_MODEL as Parameters<Ai["run"]>[0], { messages: [{ role: "user", content: prompt }], image: Array.from(new Uint8Array(bytes)), max_tokens: 300 } as never);
    const text = aiText(out);
    const p = parseJson<{ condition?: unknown; notes?: unknown; repair_needed?: unknown; repair_item?: unknown }>(text, "{");
    if (!p) return { condition: "", notes: clean(text).slice(0, 600), repair_needed: 0, repair_item: "" };
    const condition = CONDITIONS.includes(str(p.condition).toLowerCase()) ? str(p.condition).toLowerCase() : "";
    const repair = p.repair_needed === true || p.repair_needed === "true" || condition === "damaged";
    return { condition, notes: str(p.notes, 600), repair_needed: repair ? 1 : 0, repair_item: repair ? str(p.repair_item, 120) : "" };
  } catch (err) {
    console.error("[inspection-photo]", err);
    return { condition: "", notes: "", repair_needed: 0, repair_item: "" };
  }
}

export function overallFrom(items: { condition: string; repair_needed: number }[]): string {
  const repairs = items.filter((i) => i.repair_needed).length;
  if (items.some((i) => i.condition === "damaged") || repairs > 2) return "Needs Attention";
  if (repairs > 0 || items.some((i) => i.condition === "poor")) return "Fair";
  return "Good";
}

function roomLines(items: ItemRow[]): string {
  const rooms = new Map<string, string[]>();
  for (const i of items) {
    const line = `${i.condition || "not rated"}${i.notes ? ": " + i.notes : ""}${i.repair_needed ? " (repair: " + (i.repair_item || "yes") + ")" : ""}`;
    rooms.set(i.room_area, [...(rooms.get(i.room_area) || []), line]);
  }
  return Array.from(rooms, ([room, lines]) => `${room}:\n${lines.map((l) => "  - " + l).join("\n")}`).join("\n");
}

export async function handleInspectionRoutes(request: Request, env: InspectionEnv, url: URL, user: { id: number }): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith("/api/inspections")) return null;
  const now = new Date().toISOString();

  if (path === "/api/inspections" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT i.*, p.address AS property_address, d.type, (SELECT COUNT(*) FROM inspection_items t WHERE t.inspection_id = i.id) AS item_count FROM inspections i JOIN properties p ON i.property_id = p.id LEFT JOIN inspection_details d ON d.inspection_id = i.id WHERE p.user_id = ? ORDER BY i.inspection_date DESC, i.id DESC").bind(user.id).all();
    return json(rows.results);
  }

  if (path === "/api/inspections" && request.method === "POST") {
    const b = await request.json() as Record<string, unknown>;
    const propertyId = Number(b.property_id);
    if (!(await env.DB.prepare("SELECT id FROM properties WHERE id = ? AND user_id = ?").bind(propertyId, user.id).first())) return json({ error: "Choose one of your properties." }, 400);
    const type = INSPECTION_TYPES.includes(str(b.type)) ? str(b.type) : "routine";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(str(b.inspection_date)) ? str(b.inspection_date) : now.slice(0, 10);
    let compareTo: number | null = null;
    if (type === "move_out" && b.compare_to) {
      const c = await env.DB.prepare("SELECT i.id FROM inspections i JOIN properties p ON i.property_id = p.id WHERE i.id = ? AND i.property_id = ? AND p.user_id = ?").bind(Number(b.compare_to), propertyId, user.id).first<{ id: number }>();
      if (!c) return json({ error: "The move-in inspection to compare with must be for the same property." }, 400);
      compareTo = c.id;
    }
    const r = await env.DB.prepare("INSERT INTO inspections (property_id, inspector_name, inspection_date, overall_condition, summary, status, created_at) VALUES (?, ?, ?, '', '', 'in_progress', ?)").bind(propertyId, str(b.inspector_name, 100), date, now).run();
    const id = r.meta.last_row_id;
    await env.DB.prepare("INSERT INTO inspection_details (inspection_id, type, compare_to, comparison) VALUES (?, ?, ?, '')").bind(id, type, compareTo).run();
    return json({ success: true, id });
  }

  const one = path.match(/^\/api\/inspections\/(\d+)(\/.*)?$/);
  if (!one) return json({ error: "Not found" }, 404);
  const insp = await ownedInspection(env, user.id, parseInt(one[1]));
  if (!insp) return json({ error: "Not found" }, 404);
  const rest = one[2] || "";
  const details = await env.DB.prepare("SELECT * FROM inspection_details WHERE inspection_id = ?").bind(insp.id).first<DetailsRow>();
  const type = details?.type || "routine";
  const items = async () => (await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY room_area, id").bind(insp.id).all<ItemRow>()).results;

  if (rest === "" && request.method === "GET") {
    const legacy = await env.DB.prepare("SELECT id, room_area, ai_condition, ai_recommendation, ai_repair_needed FROM inspection_photos WHERE inspection_id = ? ORDER BY id").bind(insp.id).all();
    let comparison: unknown = [];
    try { comparison = details?.comparison ? JSON.parse(details.comparison) : []; } catch { comparison = []; }
    const compareInfo = details?.compare_to ? await env.DB.prepare("SELECT id, inspection_date FROM inspections WHERE id = ?").bind(details.compare_to).first() : null;
    const report = await loadReport(env, insp.id);
    return json({ inspection: { ...insp, type, compare_to: details?.compare_to ?? null }, compare_inspection: compareInfo, items: await items(), comparison, photos: legacy.results, report: report ? { text: report.report_text, status: report.status, signed_at: report.signed_at, signed_by: report.signed_by } : null });
  }

  if (rest === "" && request.method === "DELETE") {
    const all = await items();
    if (env.PHOTOS && all.length) await env.PHOTOS.delete(all.map((i) => i.r2_key));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM inspection_items WHERE inspection_id = ?").bind(insp.id),
      env.DB.prepare("DELETE FROM inspection_details WHERE inspection_id = ?").bind(insp.id),
      env.DB.prepare("DELETE FROM inspection_photos WHERE inspection_id = ?").bind(insp.id),
      env.DB.prepare("UPDATE inspection_details SET compare_to = NULL WHERE compare_to = ?").bind(insp.id),
      env.DB.prepare("DELETE FROM inspections WHERE id = ?").bind(insp.id),
    ]);
    return json({ success: true });
  }

  // Add one photo to a room: saved to R2, then read by the AI.
  if (rest === "/items" && request.method === "POST") {
    if (!env.PHOTOS) return json({ error: "Photo storage isn't set up yet." }, 503);
    const room = str(url.searchParams.get("room"), 60);
    if (!room) return json({ error: "Pick the room first." }, 400);
    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    const ext = PHOTO_TYPES[contentType];
    if (!ext) return json({ error: "Photos must be JPEG, PNG or WebP." }, 400);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: "Each photo must be under 5 MB." }, 400);
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM inspection_items WHERE inspection_id = ?").bind(insp.id).first<{ n: number }>();
    if (count && count.n >= MAX_ITEMS) return json({ error: `An inspection can have up to ${MAX_ITEMS} photos.` }, 400);
    const key = `inspections/${insp.id}/${crypto.randomUUID()}.${ext}`;
    await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType } });
    const ai = await readPhoto(env, room, type, bytes);
    const r = await env.DB.prepare("INSERT INTO inspection_items (inspection_id, room_area, r2_key, condition, notes, repair_needed, repair_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(insp.id, room, key, ai.condition, ai.notes, ai.repair_needed, ai.repair_item, now).run();
    if (insp.status === "completed") await env.DB.prepare("UPDATE inspections SET status = 'in_progress' WHERE id = ?").bind(insp.id).run();
    return json({ success: true, item: { id: r.meta.last_row_id, inspection_id: insp.id, room_area: room, condition: ai.condition, notes: ai.notes, repair_needed: ai.repair_needed, repair_item: ai.repair_item, maintenance_id: null }, ai_read: !!(ai.condition || ai.notes) });
  }

  // Voice note on one photo: transcribe it and append it to the item's notes, so the inspector can
  // talk through what they see instead of typing it. A failed transcription returns an error and
  // the inspector types instead; nothing is saved half-done.
  const voice = rest.match(/^\/items\/(\d+)\/voice$/);
  if (voice && request.method === "POST") {
    const row = await env.DB.prepare("SELECT * FROM inspection_items WHERE id = ? AND inspection_id = ?").bind(parseInt(voice[1]), insp.id).first<ItemRow>();
    if (!row) return json({ error: "Not found" }, 404);
    const contentType = (request.headers.get("Content-Type") || "").split(";")[0].trim();
    if (!contentType.startsWith("audio/")) return json({ error: "Send an audio recording." }, 400);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_VOICE_BYTES) return json({ error: "A voice note must be under 2 MB (about two minutes)." }, 400);
    let transcript = "";
    try {
      const out: any = await env.AI.run(WHISPER_MODEL as Parameters<Ai["run"]>[0], { audio: Array.from(new Uint8Array(bytes)) } as never);
      transcript = String(out?.text || "").trim();
    } catch (err) { console.error("[inspection-voice]", err); return json({ error: "The voice note couldn't be transcribed. Please type the note instead." }, 502); }
    if (!transcript) return json({ error: "Nothing was heard in that recording. Please try again." }, 502);
    const notes = ((row.notes ? row.notes.replace(/\s+$/, "") + "\n" : "") + "Voice note: " + transcript).slice(0, 2000);
    await env.DB.prepare("UPDATE inspection_items SET notes = ? WHERE id = ?").bind(notes, row.id).run();
    return json({ success: true, transcript: transcript.slice(0, 1000), notes });
  }

  const item = rest.match(/^\/items\/(\d+)(\/image|\/maintenance)?$/);
  if (item) {
    const row = await env.DB.prepare("SELECT * FROM inspection_items WHERE id = ? AND inspection_id = ?").bind(parseInt(item[1]), insp.id).first<ItemRow>();
    if (!row) return json({ error: "Not found" }, 404);

    if (item[2] === "/image" && request.method === "GET") {
      const obj = env.PHOTOS ? await env.PHOTOS.get(row.r2_key) : null;
      if (!obj) return new Response("Not found", { status: 404 });
      return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }

    if (item[2] === "/maintenance" && request.method === "POST") {
      if (row.maintenance_id) return json({ error: "A maintenance request was already created for this item." }, 400);
      const description = `${row.room_area}: ${row.repair_item || "repair needed"}${row.notes ? ". " + row.notes : ""} (found in the ${typeLabel(type)} inspection on ${insp.inspection_date})`.slice(0, 1000);
      const priority = row.condition === "damaged" ? "high" : "normal";
      const r = await env.DB.prepare("INSERT INTO maintenance_requests (property_id, tenant_name, description, priority, status, created_at) VALUES (?, '', ?, ?, 'open', ?)").bind(insp.property_id, description, priority, now).run();
      await env.DB.prepare("UPDATE inspection_items SET maintenance_id = ? WHERE id = ?").bind(r.meta.last_row_id, row.id).run();
      return json({ success: true, maintenance_id: r.meta.last_row_id });
    }

    if (!item[2] && request.method === "PUT") {
      const b = await request.json() as Record<string, unknown>;
      const condition = b.condition === undefined ? row.condition : CONDITIONS.includes(str(b.condition)) || str(b.condition) === "" ? str(b.condition) : null;
      if (condition === null) return json({ error: "Condition must be good, fair, poor or damaged." }, 400);
      const repair = b.repair_needed === undefined ? row.repair_needed : (b.repair_needed === true || b.repair_needed === 1 || b.repair_needed === "true" ? 1 : 0);
      await env.DB.prepare("UPDATE inspection_items SET room_area = ?, condition = ?, notes = ?, repair_needed = ?, repair_item = ? WHERE id = ?").bind(
        b.room_area === undefined ? row.room_area : str(b.room_area, 60) || row.room_area, condition,
        b.notes === undefined ? row.notes : str(b.notes, 1000), repair,
        b.repair_item === undefined ? row.repair_item : str(b.repair_item, 120), row.id).run();
      return json({ success: true });
    }

    if (!item[2] && request.method === "DELETE") {
      if (env.PHOTOS) await env.PHOTOS.delete(row.r2_key);
      await env.DB.prepare("DELETE FROM inspection_items WHERE id = ?").bind(row.id).run();
      return json({ success: true });
    }
  }

  // Finish: overall condition, AI summary and (for a move-out) the comparison with the move-in.
  if (rest === "/finish" && request.method === "POST") {
    const all = await items();
    if (!all.length) return json({ error: "Add at least one photo first." }, 400);
    const overall = overallFrom(all);
    const repairs = all.filter((i) => i.repair_needed).length;
    let summary = `Inspected ${new Set(all.map((i) => i.room_area)).size} areas with ${all.length} photos. ${repairs} item${repairs === 1 ? "" : "s"} need repair. Overall: ${overall}.`;
    try {
      const out = await textRun(env, { messages: [
        { role: "system", content: "You write short, factual rental inspection summaries for a property manager in California. Don't describe people." },
        { role: "user", content: `Summarize this ${typeLabel(type)} inspection of ${insp.property_address} in 2 to 4 plain sentences: overall condition, the main problems by room, and what to fix first. Use only these notes:\n${roomLines(all)}` },
      ], max_tokens: 300 } as never);
      const text = clean(aiText(out));
      if (text) summary = text.slice(0, 1500);
    } catch (err) { console.error("[inspection-summary]", err); }

    let comparison: unknown[] = [];
    if (type === "move_out" && details?.compare_to) {
      const before = (await env.DB.prepare("SELECT * FROM inspection_items WHERE inspection_id = ? ORDER BY room_area, id").bind(details.compare_to).all<ItemRow>()).results;
      const legacyBefore = before.length ? [] : (await env.DB.prepare("SELECT room_area, ai_condition, ai_recommendation FROM inspection_photos WHERE inspection_id = ?").bind(details.compare_to).all<{ room_area: string; ai_condition: string; ai_recommendation: string }>()).results;
      const beforeText = before.length ? roomLines(before) : legacyBefore.map((p) => `${p.room_area}:\n  - ${p.ai_condition} ${p.ai_recommendation}`).join("\n");
      try {
        const out = await textRun(env, { messages: [
          { role: "system", content: "You help a California landlord compare move-in and move-out inspection notes. Be careful and neutral; this is a draft the landlord will review, not a legal decision." },
          { role: "user", content: [
            "MOVE-IN notes:", beforeText || "(none)", "", "MOVE-OUT notes:", roomLines(all), "",
            "List each change between move-in and move-out, room by room. Skip rooms with no meaningful change. For each, judge whether it looks like normal wear and tear (for example light scuffs, faded paint, minor carpet wear from normal use) or possible tenant damage beyond normal wear (for example holes, burns, broken fixtures, large stains), or unclear when the notes don't say enough.",
            'Return only a JSON array: [{"room":"","change":"what changed, one sentence","assessment":"wear and tear|possible damage|unclear","note":"short reason"}]. Return [] if nothing changed.',
          ].join("\n") },
        ], max_tokens: 900 } as never);
        const parsed = parseJson<Record<string, unknown>[]>(aiText(out), "[");
        if (parsed) comparison = parsed.filter((c) => c && str(c.room) && str(c.change)).slice(0, 40).map((c) => ({
          room: str(c.room, 60), change: str(c.change, 400),
          assessment: ["wear and tear", "possible damage", "unclear"].includes(str(c.assessment).toLowerCase()) ? str(c.assessment).toLowerCase() : "unclear",
          note: str(c.note, 300),
        }));
      } catch (err) { console.error("[inspection-compare]", err); }
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE inspections SET overall_condition = ?, summary = ?, status = 'completed' WHERE id = ?").bind(overall, summary, insp.id),
      env.DB.prepare("UPDATE inspection_details SET comparison = ? WHERE inspection_id = ?").bind(JSON.stringify(comparison), insp.id),
    ]);
    return json({ success: true, overall_condition: overall, summary, comparison });
  }

  // The written report: the AI drafts the full room-by-room report from the items (photos already
  // read, voice notes already in the notes), the inspector edits it as one document and signs it.
  // Generating again replaces the draft and clears any signature, so the signed copy is always
  // the one the inspector actually reviewed.
  if (rest === "/report" && request.method === "POST") {
    if (insp.status !== "completed") return json({ error: "Finish the inspection first, then write the report." }, 400);
    const all = await items();
    if (!all.length) return json({ error: "Add at least one photo first." }, 400);
    let comparison: unknown[] = [];
    try { comparison = details?.comparison ? JSON.parse(details.comparison) : []; } catch { comparison = []; }
    let text = "";
    try {
      const out = await textRun(env, { messages: [
        { role: "system", content: "You write rental inspection reports for a California property manager. Be factual and plain, room by room, like a home inspector writing a condition report. Use only what the notes say; never guess at causes or things the notes don't mention, and don't describe people." },
        { role: "user", content: [
          `Write the full written report for this ${typeLabel(type)} inspection of ${insp.property_address} on ${insp.inspection_date}, inspected by ${insp.inspector_name || "the inspector"}. Overall condition: ${insp.overall_condition}.`,
          "",
          "Start with one short Overview paragraph (overall condition, how many areas were inspected, the main problems). Then one section per room, in this order, with the room name as a heading and 1 to 3 sentences of findings for that room. Then a section headed \"Repairs needed\" listing each repair with its room, or the single line \"No repairs were flagged.\"",
          ...(type === "move_out" && comparison.length ? ["", "Then a section headed \"Changes since move-in\" with one line per change, saying whether it looks like wear and tear or possible damage, using only these comparisons:", JSON.stringify(comparison)] : []),
          "",
          "Use only these inspection notes:",
          roomLines(all),
        ].join("\n") },
      ], max_tokens: 1500 } as never);
      text = clean(aiText(out));
    } catch (err) { console.error("[inspection-report]", err); }
    if (!text) return json({ error: "The AI couldn't write the report. Please try again." }, 502);
    const reportText = text.slice(0, 12000);
    await env.DB.prepare("INSERT INTO inspection_reports (inspection_id, report_text, status, signed_at, signed_by) VALUES (?, ?, 'draft', '', '') ON CONFLICT(inspection_id) DO UPDATE SET report_text = excluded.report_text, status = 'draft', signed_at = '', signed_by = ''").bind(insp.id, reportText).run();
    return json({ success: true, report: { text: reportText, status: "draft", signed_at: "", signed_by: "" } });
  }

  if (rest === "/report" && request.method === "PUT") {
    const b = await request.json() as Record<string, unknown>;
    const text = str(b.text, 12000);
    if (!text) return json({ error: "The report can't be empty." }, 400);
    const existing = await loadReport(env, insp.id);
    if (!existing) return json({ error: "Write the report first." }, 400);
    // Editing after signing clears the signature: the signed copy must be the reviewed one.
    await env.DB.prepare("UPDATE inspection_reports SET report_text = ?, status = 'draft', signed_at = '', signed_by = '' WHERE inspection_id = ?").bind(text, insp.id).run();
    return json({ success: true, report: { text, status: "draft", signed_at: "", signed_by: "" } });
  }

  if (rest === "/report/sign" && request.method === "POST") {
    const existing = await loadReport(env, insp.id);
    if (!existing || !existing.report_text) return json({ error: "Write the report first." }, 400);
    const signedBy = insp.inspector_name || "Inspector";
    await env.DB.prepare("UPDATE inspection_reports SET status = 'signed', signed_at = ?, signed_by = ? WHERE inspection_id = ?").bind(now, signedBy, insp.id).run();
    return json({ success: true, report: { text: existing.report_text, status: "signed", signed_at: now, signed_by: signedBy } });
  }

  return json({ error: "Not found" }, 404);
}
