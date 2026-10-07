/**
 * Tello Inspect, the free remote AI inspection (/tello-inspect page; /ai-inspection redirects there). Anyone (landlord, tenant, buyer, homeowner) fills in a short form,
 * adds photos room by room, and the vision model reads each photo the same way it does for dashboard inspections.
 * Finishing writes a summary, saves the request as a lead for EC Rental, and emails the requester a private report
 * link. Each inspection has a random token: the report and its photos are only readable with it, never public.
 */
import { aiText, clean, MODEL } from "./ai-assist";
import { readPhoto, overallFrom, typeLabel } from "./inspections";

type Notify = (to: string, subject: string, html: string, text: string) => Promise<unknown>;
interface RemoteEnv { AI: Ai; DB: D1Database; PHOTOS?: R2Bucket; }
interface RemoteRow { id: number; token: string; name: string; email: string; phone: string; role: string; address: string; type: string; notes: string; status: string; overall: string; summary: string; created_at: string; finished_at: string | null; }
interface RemoteItem { id: number; inspection_id: number; room: string; r2_key: string; condition: string; notes: string; repair_needed: number; repair_item: string; created_at: string; }

const NOTIFY_TO = "info@ecrentalpm.com";
const TYPES = ["move_in", "move_out", "routine"];
const ROLES: Record<string, string> = { landlord: "Landlord or owner", manager: "Property manager", tenant: "Tenant", buyer: "Home buyer", homeowner: "Homeowner", other: "Other" };
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 40;

function str(v: unknown, max: number): string { return String(v ?? "").trim().slice(0, max); }
function esc(s: string): string { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }
function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }); }
function newToken(): string { const b = new Uint8Array(24); crypto.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""); }
function sameToken(a: string, b: string): boolean { if (!a || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }

function publicView(r: RemoteRow) {
  return { id: r.id, name: r.name, role: r.role, address: r.address, type: r.type, status: r.status, overall: r.overall, summary: r.summary, created_at: r.created_at, finished_at: r.finished_at };
}
function itemView(i: RemoteItem) {
  return { id: i.id, room: i.room, condition: i.condition, notes: i.notes, repair_needed: i.repair_needed, repair_item: i.repair_item };
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
    const token = newToken();
    const r = await env.DB.prepare("INSERT INTO remote_inspections (token, name, email, phone, role, address, type, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)")
      .bind(token, name, email, phone, role, str(b.address, 200), type, str(b.notes, 1000), new Date().toISOString()).run();
    return json({ success: true, id: r.meta.last_row_id, token });
  }

  const m = path.match(/^\/api\/public\/ai-inspections\/(\d+)(\/finish|\/photos(?:\/(\d+))?)?$/);
  if (!m) return json({ error: "Not found" }, 404);
  const insp = await env.DB.prepare("SELECT * FROM remote_inspections WHERE id = ?").bind(parseInt(m[1])).first<RemoteRow>();
  if (!insp || !sameToken(url.searchParams.get("t") || "", insp.token)) return json({ error: "This report link isn't valid." }, 404);
  const items = async () => (await env.DB.prepare("SELECT * FROM remote_inspection_items WHERE inspection_id = ? ORDER BY id").bind(insp.id).all<RemoteItem>()).results;

  if (!m[2] && request.method === "GET") return json({ inspection: publicView(insp), items: (await items()).map(itemView) });

  // Add one photo to a room: saved privately to R2, then read by the AI.
  if (m[2] === "/photos" && request.method === "POST") {
    if (insp.status !== "open") return json({ error: "This report is already finished." }, 400);
    if (!env.PHOTOS) return json({ error: "Photo storage isn't set up yet." }, 503);
    const room = str(url.searchParams.get("room"), 60);
    if (!room) return json({ error: "Pick the room first." }, 400);
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
    const r = await env.DB.prepare("INSERT INTO remote_inspection_items (inspection_id, room, r2_key, condition, notes, repair_needed, repair_item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(insp.id, room, key, ai.condition, ai.notes, ai.repair_needed, ai.repair_item, new Date().toISOString()).run();
    return json({ success: true, item: { id: r.meta.last_row_id, room, ...ai } });
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
      if (env.PHOTOS) await env.PHOTOS.delete(item.r2_key);
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
    const overall = overallFrom(all);
    const rooms = new Set(all.map((i) => i.room)).size;
    const repairs = all.filter((i) => i.repair_needed);
    let summary = `We reviewed ${all.length} photo${all.length === 1 ? "" : "s"} across ${rooms} area${rooms === 1 ? "" : "s"}. ${repairs.length} item${repairs.length === 1 ? "" : "s"} may need repair. Overall: ${overall}.`;
    const notes = all.map((i) => `${i.room}: ${i.condition || "not rated"}${i.notes ? ", " + i.notes : ""}${i.repair_needed ? " (repair: " + (i.repair_item || "yes") + ")" : ""}`).join("\n");
    try {
      const out = await env.AI.run(MODEL as Parameters<Ai["run"]>[0], { messages: [
        { role: "system", content: "You write short, plain, factual home condition summaries from photo notes. Only use the notes given. Don't describe people. This is an AI photo review, not a licensed home inspection, so don't claim anything the photos can't show." },
        { role: "user", content: `Summarize this ${typeLabel(insp.type)} photo review for a ${ROLES[insp.role] || "reader"} in 2 to 4 sentences: the overall condition, the main issues by room, and what to look at first.\n\n${notes}` },
      ], max_tokens: 300 } as never);
      const text = clean(aiText(out));
      if (text) summary = text.slice(0, 1500);
    } catch (err) { console.error("[remote-inspection-summary]", err); }

    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE remote_inspections SET status = 'done', overall = ?, summary = ?, finished_at = ? WHERE id = ?").bind(overall, summary, now, insp.id).run();
    const reportUrl = `https://${url.host}/tello-inspect?id=${insp.id}&t=${insp.token}`;
    const details = { source: "ai_inspection", inspection_id: insp.id, role: insp.role, type: insp.type, address: insp.address, photos: all.length, repairs: repairs.length, overall, notes: insp.notes };
    await env.DB.prepare("INSERT INTO signups (name, company, email, phone, property_count, plan, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(insp.name, "", insp.email, insp.phone || "", "1", "ai_inspection", JSON.stringify(details), "pending", now).run();

    if (notify) {
      const repairLines = repairs.slice(0, 10).map((i) => `${i.room}: ${i.repair_item || "repair needed"}`);
      const userText = [`Hi ${insp.name},`, "", `Your Tello Inspect report is ready. Overall: ${overall}.`, "", summary, "", ...(repairLines.length ? ["Items that may need repair:", ...repairLines.map((l) => "- " + l), ""] : []),
        `See the full report with photos: ${reportUrl}`, "", "This is an AI review of your photos, not a licensed home inspection. Want a certified home inspector to visit? Reply to this email.", "", "EC Rental Property Management"].join("\n");
      const userHtml = `<p>Hi ${esc(insp.name)},</p><p>Your Tello Inspect report is ready. <strong>Overall: ${esc(overall)}</strong></p><p>${esc(summary)}</p>` +
        (repairLines.length ? `<p><strong>Items that may need repair</strong><br>${repairLines.map(esc).join("<br>")}</p>` : "") +
        `<p><a href="${esc(reportUrl)}">See the full report with photos</a></p><p style="color:#6b7280;font-size:13px">This is an AI review of your photos, not a licensed home inspection. Want a certified home inspector to visit? Reply to this email.</p><p>EC Rental Property Management</p>`;
      try { await notify(insp.email, "Your Tello Inspect report", userHtml, userText); } catch (err) { console.error("[remote-inspection] email requester", err); }
      const lines = [`Name: ${insp.name}`, `Email: ${insp.email}`, `Phone: ${insp.phone || "not given"}`, `They are: ${ROLES[insp.role] || "Other"}`,
        `Address: ${insp.address || "not given"}`, `Type: ${typeLabel(insp.type)}`, `Photos: ${all.length}, repairs flagged: ${repairs.length}, overall: ${overall}`, ...(insp.notes ? [`Notes: ${insp.notes}`] : []), `Report: ${reportUrl}`];
      try {
        await notify(NOTIFY_TO, `Tello Inspect finished: ${insp.address || insp.name}`,
          `<p>Someone ran Tello Inspect on ecrentalpm.com. They got the report by email. Follow up if they need repairs or an in-person inspection.</p><p>${lines.map(esc).join("<br>")}</p>`,
          "Someone ran Tello Inspect on ecrentalpm.com. They got the report by email. Follow up if they need repairs or an in-person inspection.\n\n" + lines.join("\n"));
      } catch (err) { console.error("[remote-inspection] email EC Rental", err); }
    }
    return json({ success: true, overall, summary, report_url: reportUrl });
  }

  return json({ error: "Not found" }, 404);
}
