/**
 * Inspection audit (Tello Inspect): before a report can be signed, the photos are audited —
 * the code counts the rooms the property's listed layout requires, then Claude (Sonnet vision,
 * via the Anthropic API key this Worker already has) checks angle/coverage/quality and drafts
 * the room-by-room condition report. A blocked audit blocks signing; square-footage-inferred
 * spaces only raise warnings the landlord can acknowledge. The Landlord Override exists only
 * on landlord-initiated inspections — tenant-submitted links have no override path at all.
 * Workers AI is never used for the audit and there is no fallback: if Claude can't answer,
 * the audit fails closed. Photos stay private in R2 and are sent to Claude as base64.
 *
 * Routes (delegated from handleInspectionRoutes in inspections.ts — see PLANT-DIFF.md):
 *   POST /api/inspections/:id/audit           run the audit, returns the gate state
 *   POST /api/inspections/:id/audit-override  record a Landlord Override (landlord only)
 *   POST /api/inspections/:id/audit-ack       acknowledge coverage warnings (landlord only)
 *   assertFinalizable(env, userId, id)        the lock the /report/sign handler calls first
 */
import {
  DISCLAIMER, codePreCheck, deriveCoverage, isValidBaseline, makeOverride, makeWarningAck,
  mergeAudit, canFinalize, photoSetHash,
  type AiAuditResult, type AiPropertyAudit, type BaselineCandidateRecord, type CoverageWarning,
  type FinalizeVerdict, type MoveOutComparisonEntry, type OverrideRecord, type PhotoManifestEntry,
  type PriorityRepair, type PropertyMeta, type RoomReportEntry, type StoredAuditState,
  type ValidationError, type WarningAck,
} from "./inspection-audit";
import { buildAuditPrompt } from "./inspection-audit-prompt";

export interface InspectionAuditEnv {
  DB: D1Database;
  PHOTOS?: R2Bucket;
  ANTHROPIC_API_KEY?: string;
  INSPECT_AUDIT_MODEL?: string;
  HUB_MODEL?: string;
}

/** The session user as index.ts passes it (name/email/role ride along with id). */
export interface InspectionAuditUser { id: number; name?: string; email?: string; role?: string; }

interface InspectionAuditRow {
  id: number; property_id: number; inspector_name: string; inspection_date: string;
  overall_condition: string; summary: string; status: string; created_at: string;
  selected_rooms: string | null; initiated_by: string | null;
  audit_status: string | null; audit_errors: string | null; audit_warnings: string | null;
  audit_warnings_ack: string | null; audit_report: string | null; audit_run_at: string | null;
  audit_photo_set_hash: string | null; audit_override: string | null;
  property_address: string; property_city: string; property_state: string; property_zip: string;
  property_user_id: number;
  property_square_footage: number | null; property_bedrooms: number | null;
  property_bathrooms: number | null; property_property_type: string | null;
}
interface DetailsRow { inspection_id: number; type: string; compare_to: number | null; comparison: string; }
interface ItemRow { id: number; inspection_id: number; room_area: string; r2_key: string; created_at: string; }
interface CandidateRow { id: number; status: string; created_at: string; property_address: string; landlord_account_id: number; type: string | null; }

/** The gate state the dashboard renders (and the override/ack routes return). */
export interface AuditGateState {
  status: string;
  property_audit: AiPropertyAudit | null;
  validation_errors: ValidationError[];
  coverage_warnings: CoverageWarning[];
  move_out_comparison: MoveOutComparisonEntry[];
  priority_repairs: PriorityRepair[];
  room_by_room_report: RoomReportEntry[];
  disclaimer: string;
  override: OverrideRecord | null;
  audit_warnings_ack: WarningAck | null;
  audit_run_at: string | null;
  audit_photo_set_hash: string | null;
}

interface AuditPhoto extends PhotoManifestEntry { media_type: string; data_base64: string; url?: string; }

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5"; // house Sonnet (tello-hub.ts default); override via INSPECT_AUDIT_MODEL or HUB_MODEL
const TYPE_LABELS: Record<string, string> = { move_in: "Move-In", move_out: "Move-Out", routine: "Routine", annual: "Routine" };

function json(data: unknown, status = 200): Response { return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }); }
function parseJsonCol<T>(v: string | null | undefined): T | null { if (!v) return null; try { return JSON.parse(v) as T; } catch { return null; } }

/** Same ownership rule as ownedInspection() in inspections.ts, plus the audit + property columns. */
async function loadInspectionRow(env: InspectionAuditEnv, userId: number, id: number): Promise<InspectionAuditRow | null> {
  return env.DB.prepare(
    "SELECT i.*, p.address AS property_address, p.city AS property_city, p.state AS property_state, p.zip AS property_zip, p.user_id AS property_user_id, p.square_footage AS property_square_footage, p.bedrooms AS property_bedrooms, p.bathrooms AS property_bathrooms, p.property_type AS property_property_type FROM inspections i JOIN properties p ON i.property_id = p.id WHERE i.id = ? AND p.user_id = ?"
  ).bind(id, userId).first<InspectionAuditRow>();
}

async function loadDetails(env: InspectionAuditEnv, inspectionId: number): Promise<DetailsRow | null> {
  return env.DB.prepare("SELECT * FROM inspection_details WHERE inspection_id = ?").bind(inspectionId).first<DetailsRow>();
}

/** Property metadata from the landlord's property record — never from the photo uploader. */
function propertyMeta(row: InspectionAuditRow, details: DetailsRow | null): PropertyMeta {
  let selected: string[] = [];
  const parsed = parseJsonCol<unknown>(row.selected_rooms);
  if (Array.isArray(parsed)) selected = parsed.map((r) => String(r));
  const address = [row.property_address, row.property_city, row.property_state, row.property_zip].filter(Boolean).join(", ");
  return {
    address,
    square_footage: Number(row.property_square_footage) || 0,
    bedroom_count: Number(row.property_bedrooms) || 0,
    bathroom_count: Number(row.property_bathrooms) || 0,
    property_type: row.property_property_type || "",
    inspection_type: TYPE_LABELS[details?.type || "routine"] || "Routine",
    selected_rooms: selected,
  };
}

/** Manifest only (no R2 reads) — all the photo-set hash needs. */
async function loadPhotoManifest(env: InspectionAuditEnv, inspectionId: number): Promise<PhotoManifestEntry[]> {
  // Shot labels live in the inspection_item_shots side table (migration
  // 0001 §3), written by the dashboard upload route from its shot picker
  // (Eli's decision, Nov 14: label shots at upload). Items without a row
  // there are unlabeled and earn no angle credit.
  const rows = (await env.DB.prepare("SELECT i.*, s.shot AS shot FROM inspection_items i LEFT JOIN inspection_item_shots s ON s.item_id = i.id WHERE i.inspection_id = ? ORDER BY i.room_area, i.id").bind(inspectionId).all<ItemRow & { shot?: string }>()).results;
  return rows.map((r) => ({ photo_id: r.id, room: r.room_area, angle: r.shot || "" }));
}

/** Manifest + photo bytes from the private R2 bucket, as base64 for the Claude call. */
async function loadPhotos(env: InspectionAuditEnv, inspectionId: number): Promise<AuditPhoto[]> {
  const rows = (await env.DB.prepare("SELECT i.*, s.shot AS shot FROM inspection_items i LEFT JOIN inspection_item_shots s ON s.item_id = i.id WHERE i.inspection_id = ? ORDER BY i.room_area, i.id").bind(inspectionId).all<ItemRow & { shot?: string }>()).results;
  const photos: AuditPhoto[] = [];
  for (const r of rows) {
    let media_type = "image/jpeg";
    let data_base64 = "";
    if (env.PHOTOS) {
      const obj = await env.PHOTOS.get(r.r2_key);
      if (obj) {
        media_type = obj.httpMetadata?.contentType || media_type;
        data_base64 = arrayBufferToBase64(await obj.arrayBuffer());
      }
    }
    photos.push({ photo_id: r.id, room: r.room_area, angle: r.shot || "", media_type, data_base64 });
  }
  return photos;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

/** The landlord's inspections in baselineCandidates() shape (created_at stands in for completed_at — inspections has no completed-at column). */
async function listInspectionCandidates(env: InspectionAuditEnv, userId: number): Promise<BaselineCandidateRecord[]> {
  const rows = (await env.DB.prepare(
    "SELECT i.id, i.status, i.created_at, p.address AS property_address, p.user_id AS landlord_account_id, d.type FROM inspections i JOIN properties p ON i.property_id = p.id LEFT JOIN inspection_details d ON d.inspection_id = i.id WHERE p.user_id = ?"
  ).bind(userId).all<CandidateRow>()).results;
  return rows.map((r) => ({
    id: r.id,
    landlord_account_id: r.landlord_account_id,
    property_address: r.property_address,
    inspection_type: TYPE_LABELS[r.type || "routine"] || "Routine",
    status: r.status,
    completed_at: r.created_at,
  }));
}

function stateFromRow(row: InspectionAuditRow): AuditGateState {
  const report = parseJsonCol<{ property_audit?: AiPropertyAudit | null; move_out_comparison?: MoveOutComparisonEntry[]; priority_repairs?: PriorityRepair[]; room_by_room_report?: RoomReportEntry[]; disclaimer?: string }>(row.audit_report);
  return {
    status: row.audit_status || "NOT_RUN",
    property_audit: report?.property_audit ?? null,
    validation_errors: parseJsonCol<ValidationError[]>(row.audit_errors) || [],
    coverage_warnings: parseJsonCol<CoverageWarning[]>(row.audit_warnings) || [],
    move_out_comparison: report?.move_out_comparison || [],
    priority_repairs: report?.priority_repairs || [],
    room_by_room_report: report?.room_by_room_report || [],
    disclaimer: report?.disclaimer || DISCLAIMER,
    override: parseJsonCol<OverrideRecord>(row.audit_override),
    audit_warnings_ack: parseJsonCol<WarningAck>(row.audit_warnings_ack),
    audit_run_at: row.audit_run_at,
    audit_photo_set_hash: row.audit_photo_set_hash,
  };
}

function storedForGate(row: InspectionAuditRow): StoredAuditState {
  return {
    audit_status: row.audit_status,
    audit_photo_set_hash: row.audit_photo_set_hash,
    override: parseJsonCol<OverrideRecord>(row.audit_override),
    coverage_warnings: parseJsonCol<CoverageWarning[]>(row.audit_warnings) || [],
    audit_warnings_ack: parseJsonCol<WarningAck>(row.audit_warnings_ack),
  };
}

async function saveAudit(env: InspectionAuditEnv, inspectionId: number, state: AuditGateState): Promise<void> {
  const report = {
    property_audit: state.property_audit,
    move_out_comparison: state.move_out_comparison,
    priority_repairs: state.priority_repairs,
    room_by_room_report: state.room_by_room_report,
    disclaimer: state.disclaimer,
  };
  await env.DB.prepare(
    "UPDATE inspections SET audit_status = ?, audit_errors = ?, audit_warnings = ?, audit_warnings_ack = ?, audit_report = ?, audit_run_at = ?, audit_photo_set_hash = ?, audit_override = ? WHERE id = ?"
  ).bind(
    state.status,
    JSON.stringify(state.validation_errors),
    JSON.stringify(state.coverage_warnings),
    state.audit_warnings_ack ? JSON.stringify(state.audit_warnings_ack) : null,
    JSON.stringify(report),
    state.audit_run_at,
    state.audit_photo_set_hash,
    state.override ? JSON.stringify(state.override) : null,
    inspectionId
  ).run();
}

/**
 * The Claude vision call. Sends the audit prompt as the system prompt and every photo as an
 * image block, current set first, baseline second, in manifest order. Returns the parsed JSON
 * object, or null when the call or the parse fails (mergeAudit fails closed). No Workers AI
 * fallback, by design.
 */
async function callClaudeVision(env: InspectionAuditEnv, prompt: string, photos: AuditPhoto[]): Promise<AiAuditResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
  const imageBlock = (p: AuditPhoto) => p.data_base64
    ? { type: "image", source: { type: "base64", media_type: p.media_type || "image/jpeg", data: p.data_base64 } }
    : { type: "image", source: { type: "url", url: p.url } };
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.INSPECT_AUDIT_MODEL || env.HUB_MODEL || DEFAULT_MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: prompt,
      messages: [{
        role: "user",
        content: [
          ...photos.filter((p) => p.data_base64 || p.url).map(imageBlock),
          { type: "text", text: "Run the full audit on the photos above, in manifest order (CURRENT photos first, then BASELINE). Return ONLY the JSON object in the required schema." },
        ],
      }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { content?: { type: string; text?: string }[] };
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text || "").join("");
  const jsonText = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(jsonText) as AiAuditResult; } catch { return null; }
}

/** Run the full audit for one inspection and persist the gate state. */
async function runAudit(env: InspectionAuditEnv, insp: InspectionAuditRow, details: DetailsRow | null): Promise<AuditGateState> {
  const meta = propertyMeta(insp, details);
  const manifest = await loadPhotos(env, insp.id);

  // Baseline: only the landlord's own selection (inspection_details.compare_to), re-validated
  // here — a baseline id that fails isValidBaseline is treated as no baseline (and, for a
  // Move-Out, the comparison simply does not run).
  let baselineManifest: AuditPhoto[] = [];
  let baselineProvided = false;
  const baselineId = details?.compare_to ?? null;
  if (meta.inspection_type === "Move-Out" && baselineId) {
    const candidates = await listInspectionCandidates(env, insp.property_user_id);
    // Both sides compare on properties.address alone (the candidates' property_address is
    // p.address too) — meta.address has city/state/zip appended for the prompt and would
    // never normalize-match.
    const moveOut = { id: insp.id, landlord_account_id: insp.property_user_id, property_address: insp.property_address };
    if (isValidBaseline(candidates, moveOut, baselineId)) {
      baselineProvided = true;
      baselineManifest = await loadPhotos(env, baselineId);
    }
  }

  const coverage = deriveCoverage(meta);
  const { errors: codeErrors, warnings: codeWarnings } = codePreCheck(manifest, coverage);

  let aiResult: AiAuditResult | null = null;
  if (manifest.length > 0) {
    const prompt = buildAuditPrompt(meta, coverage, manifest, baselineManifest);
    try {
      aiResult = await callClaudeVision(env, prompt, [...manifest, ...baselineManifest]);
    } catch {
      aiResult = null; // mergeAudit turns this into AI_RESPONSE_INVALID
    }
  }

  const merged = await mergeAudit({ meta, codeErrors, codeWarnings, aiResult, manifest, baselineManifest, baselineProvided });

  const state: AuditGateState = {
    status: merged.status,
    property_audit: merged.property_audit,
    validation_errors: merged.validation_errors,
    coverage_warnings: merged.coverage_warnings,
    move_out_comparison: merged.move_out_comparison,
    priority_repairs: merged.priority_repairs,
    room_by_room_report: merged.room_by_room_report,
    disclaimer: merged.disclaimer,
    override: null,           // a re-audit clears any old override
    audit_warnings_ack: null, // and any old warning acknowledgment
    audit_run_at: merged.audited_at,
    audit_photo_set_hash: merged.photo_set_hash,
  };
  await saveAudit(env, insp.id, state);
  return state;
}

/**
 * The server-side lock for the finalize/sign endpoint. Throws an error with
 * statusCode 409 unless the stored audit allows signing this exact photo set.
 */
export async function assertFinalizable(env: InspectionAuditEnv, userId: number, inspectionId: number): Promise<FinalizeVerdict> {
  const insp = await loadInspectionRow(env, userId, inspectionId);
  if (!insp) {
    const err = new Error("Report cannot be finalized: NOT_FOUND") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }
  const details = await loadDetails(env, inspectionId);
  const manifest = await loadPhotoManifest(env, inspectionId);
  const baselineManifest = details?.compare_to ? await loadPhotoManifest(env, details.compare_to) : [];
  const currentHash = await photoSetHash(manifest, baselineManifest);
  const verdict = canFinalize(storedForGate(insp), currentHash);
  if (!verdict.allowed) {
    const err = new Error(`Report cannot be finalized: ${verdict.reason}`) as Error & { statusCode?: number };
    err.statusCode = 409;
    throw err;
  }
  return verdict;
}

export async function handleInspectionAuditRoutes(request: Request, env: InspectionAuditEnv, url: URL, user: InspectionAuditUser): Promise<Response | null> {
  const m = url.pathname.match(/^\/api\/inspections\/(\d+)\/(audit|audit-override|audit-ack)$/);
  if (!m) return null;
  if (request.method !== "POST") return null;
  const insp = await loadInspectionRow(env, user.id, parseInt(m[1]));
  if (!insp) return json({ error: "Not found" }, 404);
  const details = await loadDetails(env, insp.id);
  const action = m[2];

  if (action === "audit") {
    const state = await runAudit(env, insp, details);
    return json(state);
  }

  // Reaching this handler at all means a signed-in landlord session (index.ts refuses
  // anonymous and tenant-role calls to /api/inspections); the role check is belt-and-braces.
  const landlordSession = !!user && user.role !== "tenant";
  const by = user.name || user.email || "";

  if (action === "audit-ack") {
    if (!landlordSession) return json({ error: "Coverage warnings can only be acknowledged from a landlord session." }, 403);
    const state = stateFromRow(insp);
    if (!Array.isArray(state.coverage_warnings) || state.coverage_warnings.length === 0) {
      return json({ error: "No coverage warnings to acknowledge." }, 400);
    }
    try {
      state.audit_warnings_ack = makeWarningAck({ by, warnings: state.coverage_warnings });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "The warnings could not be acknowledged." }, 400);
    }
    await saveAudit(env, insp.id, state);
    return json(state);
  }

  // audit-override — OVERRIDE ACCESS RULE (strict): BOTH the acting session is a landlord
  // session AND the inspection itself was landlord-initiated (inspections.initiated_by =
  // 'landlord'). Tenant-submitted inspections live in remote_inspections and never reach
  // this handler; there is no override path for them at all.
  if (!landlordSession || (insp.initiated_by || "landlord") !== "landlord") {
    return json({ error: "Landlord Override is not available on tenant-submitted inspection links." }, 403);
  }
  const state = stateFromRow(insp);
  if (!Array.isArray(state.validation_errors) || state.validation_errors.length === 0) {
    return json({ error: "Nothing to override: this inspection is not in a blocked audit state." }, 400);
  }
  const b = await request.json() as Record<string, unknown>;
  const note = typeof b.note === "string" ? b.note : "";
  try {
    state.override = makeOverride({ by, note, errors: state.validation_errors });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "The override could not be recorded." }, 400);
  }
  state.status = "PASSED_WITH_OVERRIDE";
  await saveAudit(env, insp.id, state);
  return json(state);
}
