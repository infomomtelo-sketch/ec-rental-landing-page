/**
 * inspection-audit.ts — Tello Inspect audit: pure logic (no I/O, no Node
 * modules). TypeScript port of the pack's required-rooms.js, baseline.js
 * and validate-audit.js — same shapes, same fail-closed rules:
 *
 *  - HARD errors (validation_errors) come only from: listed bedrooms /
 *    bathrooms and start-form selected rooms (code + AI), angle /
 *    coverage / quality findings on photographed rooms (AI, with code
 *    angle counts). Hard errors block finalization.
 *  - Square-footage-inferred spaces produce coverage_warnings, never
 *    hard errors. Warnings do not change the status, but finalization
 *    requires them to be acknowledged (by the landlord) — or removed by
 *    uploading the photos and re-running the audit.
 *  - An unusable AI response is itself a blocker (AI_RESPONSE_INVALID,
 *    internal only — never a model output type).
 *  - Final status is recomputed from the merged hard-error list; the AI's
 *    own status never decides. The disclaimer is FORCED to the exact
 *    required string. All language is neutral and factual: coverage gaps
 *    are described, never intent; fault stays with the landlord.
 *
 * photoSetHash is async: WebCrypto (crypto.subtle) instead of Node crypto.
 */

// ---------------------------------------------------------------- types

export interface PropertyMeta {
  address?: string;
  square_footage: number;
  bedroom_count: number;
  bathroom_count: number;
  property_type: string;
  /** "Move-In" | "Move-Out" | "Routine" (annual maps to "Routine"). */
  inspection_type: string;
  selected_rooms?: string[];
}

export interface CoverageRules {
  diningRoomMinSqft: number;
  diningRoomMinBedrooms: number;
  laundryMinSqft: number;
  balconyMinSqft: number;
  hallwayMinBedrooms: number;
  largeHomeSqft: number;
  yardTypes: string[];
  laundryTypes: string[];
  garageTypes: string[];
  balconyTypes: string[];
}

export interface CoverageEntry {
  room: string;
  reason: string;
  requiredShots: string[];
}

export interface Coverage {
  hard: CoverageEntry[];
  inferred: CoverageEntry[];
}

export interface PhotoManifestEntry {
  photo_id: string | number;
  room: string;
  angle?: string;
  set?: string;
  /** Shot-list category (e.g. "cabinets", "floor") when the upload flow supplies one. */
  category?: string;
}

export interface ValidationError {
  error_type: string;
  room: string;
  description: string;
  required_action: string;
  photo_id?: string | number | null;
  severity?: string;
}

export interface CoverageWarning {
  warning_type: string;
  space: string;
  description: string;
}

export interface PerRoomCoverage {
  uploaded: number;
  shotsPresent: string[];
  required: "hard" | "inferred";
}

export interface CodePreCheckResult {
  errors: ValidationError[];
  warnings: CoverageWarning[];
  perRoom: Record<string, PerRoomCoverage>;
}

export interface BaselineCandidateRecord {
  id: string | number;
  landlord_account_id: string | number;
  property_address: string;
  inspection_type: string;
  status: string;
  completed_at?: string | null;
}

export interface MoveOutRef {
  id: string | number;
  landlord_account_id: string | number;
  property_address: string;
}

export interface AiPropertyAudit {
  expected_bedrooms: number;
  detected_bedrooms: number;
  expected_bathrooms: number;
  detected_bathrooms: number;
  square_footage_coverage_assessment: string;
}

export interface AiValidationError {
  error_type: string;
  room: string;
  description: string;
  required_action: string;
}

export interface MoveOutComparisonEntry {
  room: string;
  /** Shot-list category when the comparison was made per category. */
  category?: string;
  item_or_surface: string;
  move_in_state: string;
  move_out_state: string;
  is_new_since_move_in: boolean;
  classification: string;
}

export interface PriorityRepair {
  room: string;
  issue: string;
  severity: string;
  is_new_since_move_in: boolean;
}

export interface RoomReportEntry {
  room_name: string;
  /** Shot-list category when the report was written per category. */
  category?: string;
  /** The photographer's own comment for this room/category. */
  human_comment?: string;
  overall_condition: string;
  walls_and_paint: string;
  flooring: string;
  ceiling_and_fixtures: string;
  move_in_comparison_notes: string;
}

/** One box of the report: a room + category with its findings, the human comment, and its photos. */
export interface CategoryReportEntry {
  room: string;
  category: string;
  overall_condition: string;
  human_comment: string;
  findings: string[];
  photo_ids: (string | number)[];
}

export interface AiAuditResult {
  status: string;
  property_audit: AiPropertyAudit;
  validation_errors: AiValidationError[];
  coverage_warnings: CoverageWarning[];
  move_out_comparison: MoveOutComparisonEntry[];
  priority_repairs: PriorityRepair[];
  room_by_room_report: RoomReportEntry[];
  disclaimer?: string;
}

export interface MergedAudit {
  status: "PASSED" | "ERROR_INCOMPLETE_OR_SKIPPED";
  property_audit: AiPropertyAudit | null;
  validation_errors: ValidationError[];
  coverage_warnings: CoverageWarning[];
  move_out_comparison: MoveOutComparisonEntry[];
  priority_repairs: PriorityRepair[];
  room_by_room_report: RoomReportEntry[];
  /** The same report grouped into one box per room + category. */
  category_report: CategoryReportEntry[];
  disclaimer: string;
  photo_set_hash: string;
  audited_at: string;
}

export interface MergeAuditArgs {
  meta: PropertyMeta;
  codeErrors?: ValidationError[];
  codeWarnings?: CoverageWarning[];
  aiResult: AiAuditResult | null;
  manifest: PhotoManifestEntry[];
  baselineManifest?: PhotoManifestEntry[];
  baselineProvided?: boolean;
}

export interface OverrideRecord {
  by: string;
  at: string;
  note: string;
  errors_overridden: ValidationError[];
}

export interface WarningAck {
  by: string;
  at: string;
  warnings_acknowledged: CoverageWarning[];
}

export interface StoredAuditState {
  audit_status?: string | null;
  audit_photo_set_hash?: string | null;
  override?: OverrideRecord | null;
  coverage_warnings?: CoverageWarning[];
  audit_warnings_ack?: WarningAck | null;
}

export interface FinalizeVerdict {
  allowed: boolean;
  reason: string;
}

// ------------------------------------------------------- coverage rules

export const DEFAULT_RULES: CoverageRules = {
  diningRoomMinSqft: 1000,
  diningRoomMinBedrooms: 3,
  laundryMinSqft: 900,
  balconyMinSqft: 750,
  hallwayMinBedrooms: 2,
  largeHomeSqft: 1800, // Step 1: large-home inferred spaces
  yardTypes: ["Single Family", "Townhouse", "Duplex"],
  laundryTypes: ["Single Family", "Townhouse", "Duplex"],
  garageTypes: ["Single Family", "Townhouse", "Duplex"],
  balconyTypes: ["Apartment", "Condo"],
};

const WALL_SHOTS = ["wall_a", "wall_b", "wall_c", "wall_d"];

/** Required shots for a room name, wherever the room comes from. */
export function shotsFor(room: string): string[] {
  if (/^Bathroom/.test(room)) return ["wide_a", "wide_b", "floor", "fixtures_closeup", "under_sink_closeup"];
  if (room === "Kitchen") return [...WALL_SHOTS, "floor", "counters_closeup", "under_sink_closeup", "appliances_closeup"];
  if (room === "Exterior Front" || room === "Backyard / Patio" || room === "Balcony / Patio") return ["wide_a", "wide_b"];
  return [...WALL_SHOTS, "floor"];
}

function entry(room: string, reason: string): CoverageEntry {
  return { room, reason, requiredShots: shotsFor(room) };
}

/**
 * All spaces this property could have, split by source. HARD requirements
 * come only from the property's listed layout and the landlord's own
 * choices: every bedroom and bathroom in the metadata, plus every room in
 * meta.selected_rooms. Everything derived from square footage / property
 * type is INFERRED (warnings, never hard errors).
 */
export function deriveCoverage(meta: PropertyMeta, rules: CoverageRules = DEFAULT_RULES): Coverage {
  const sqft = Number(meta.square_footage) || 0;
  const beds = Math.max(0, Math.floor(Number(meta.bedroom_count) || 0));
  const baths = Math.max(0, Math.floor(Number(meta.bathroom_count) || 0));
  const type = String(meta.property_type || "");
  const selected = Array.isArray(meta.selected_rooms) ? meta.selected_rooms : [];
  const large = sqft >= rules.largeHomeSqft;

  const hard: CoverageEntry[] = [];
  const hardNames = new Set<string>();
  const addHard = (room: string, reason: string) => {
    if (!hardNames.has(room)) { hardNames.add(room); hard.push(entry(room, reason)); }
  };
  for (let i = 1; i <= beds; i++) addHard(`Bedroom ${i}`, `bedroom ${i} of ${beds} in property metadata`);
  for (let i = 1; i <= baths; i++) addHard(`Bathroom ${i}`, `bathroom ${i} of ${baths} in property metadata`);
  for (const room of selected) addHard(String(room), "selected on the inspection start form");

  const inferred: CoverageEntry[] = [];
  const addInferred = (room: string, reason: string) => {
    if (!hardNames.has(room) && !inferred.some((r) => r.room === room)) {
      inferred.push(entry(room, reason));
    }
  };
  addInferred("Exterior Front", "standard space");
  addInferred("Entry", "standard space");
  addInferred("Living Room", "standard common area");
  addInferred("Kitchen", "standard common area");
  if (sqft >= rules.diningRoomMinSqft || beds >= rules.diningRoomMinBedrooms) {
    addInferred("Dining Room", "square footage / bedroom count");
  }
  if (beds >= rules.hallwayMinBedrooms) addInferred("Hallway", "bedroom count");
  if (rules.laundryTypes.includes(type) || sqft >= rules.laundryMinSqft || large) {
    addInferred("Laundry", large ? "large home (>= 1800 sq ft)" : "property type / square footage");
  }
  if (rules.garageTypes.includes(type)) addInferred("Garage", large ? "large home (>= 1800 sq ft)" : "property type");
  if (rules.yardTypes.includes(type)) {
    addInferred("Backyard / Patio", "property type");
  } else if (rules.balconyTypes.includes(type) && sqft >= rules.balconyMinSqft) {
    addInferred("Balcony / Patio", "property type / square footage");
  }
  return { hard, inferred };
}

/** Back-compat: the hard-required rooms only. */
export function requiredRooms(meta: PropertyMeta, rules?: CoverageRules): CoverageEntry[] {
  return deriveCoverage(meta, rules).hard;
}

/**
 * Count uploaded photos against the coverage split. Angle completeness is
 * held hard for any room that HAS photos (hard or inferred): a photo only
 * earns angle credit if the manifest labels it with that angle.
 */
/**
 * The dashboard's room names differ from the audit's canonical names
 * (public/js/inspections-dashboard.js ROOMS). Manifest room labels are
 * normalized through this map before any counting, so a photo filed
 * under "Primary bedroom" counts toward Bedroom 1, and so on.
 */
export const ROOM_ALIASES: Record<string, string> = {
  "primary bedroom": "Bedroom 1",
  "primary bathroom": "Bathroom 1",
  "exterior front": "Exterior Front",
  "exterior back": "Backyard / Patio",
  "yard": "Backyard / Patio",
};

export function normalizeRoomName(name: string): string {
  const raw = String(name || "").trim();
  return ROOM_ALIASES[raw.toLowerCase()] || raw;
}

export function codePreCheck(rawManifest: PhotoManifestEntry[], coverage: Coverage): CodePreCheckResult {
  const errors: ValidationError[] = [];
  const warnings: CoverageWarning[] = [];
  const perRoom: Record<string, PerRoomCoverage> = {};
  // Normalize manifest room labels to the coverage's canonical names
  // (aliases first, then case-insensitive match).
  const canonicalByLower = new Map<string, string>();
  for (const r of [...coverage.hard, ...coverage.inferred]) canonicalByLower.set(r.room.toLowerCase(), r.room);
  const manifest: PhotoManifestEntry[] = (rawManifest || []).map((p) => {
    const aliased = normalizeRoomName(p.room);
    const canonical = canonicalByLower.get(aliased.toLowerCase()) || aliased;
    return { ...p, room: canonical };
  });
  const photosOf = (room: string) => manifest.filter((p) => p.room === room);

  function checkAngles(req: CoverageEntry) {
    const photos = photosOf(req.room);
    const present = new Set(photos.map((p) => p.angle).filter((a): a is string => Boolean(a)));
    perRoom[req.room].shotsPresent = [...present];
    for (const shot of req.requiredShots) {
      if (!present.has(shot)) {
        errors.push({
          error_type: "MISSING_ANGLE",
          room: req.room,
          photo_id: null,
          severity: "blocker",
          description: `${req.room}: the "${shot}" view is not visible in the current photos, so part of this room is not documented.`,
          required_action: `Take and upload a clear, straight-on photo labeled ${shot} for ${req.room}.`,
        });
      }
    }
  }

  for (const req of coverage.hard) {
    const photos = photosOf(req.room);
    perRoom[req.room] = { uploaded: photos.length, shotsPresent: [], required: "hard" };
    if (photos.length === 0) {
      errors.push({
        error_type: "MISSING_ROOM",
        room: req.room,
        photo_id: null,
        severity: "blocker",
        description: `${req.room}: no photos uploaded. This room is part of the property's listed layout / selected rooms for this inspection.`,
        required_action: `Photograph the whole ${req.room} and upload the required shots (${req.requiredShots.join(", ")}).`,
      });
      continue;
    }
    checkAngles(req);
  }

  for (const req of coverage.inferred) {
    const photos = photosOf(req.room);
    perRoom[req.room] = { uploaded: photos.length, shotsPresent: [], required: "inferred" };
    if (photos.length === 0) {
      warnings.push({
        warning_type: "INFERRED_SPACE_MISSING",
        space: req.room,
        description: `${req.room} is inferred from the property's square footage / type (${req.reason}) but is not pictured in the current photos. Upload photos of it, or acknowledge this warning to continue without it.`,
      });
      continue;
    }
    checkAngles(req); // photographed rooms are held to Step 2, hard or not
  }

  return { errors, warnings, perRoom };
}

// ------------------------------------------------------------- baseline

export function normalizeAddress(address: string | null | undefined): string {
  return String(address || "")
    .toLowerCase()
    .replace(/[.,#]/g, " ")
    .replace(/\b(apt|unit|ste|suite)\b/g, "unit")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Qualifying Move-Out baselines: ANY completed Move-In inspection with
 * the SAME landlord account AND the SAME property address. Newest
 * completed first. Nothing else qualifies.
 */
export function baselineCandidates<T extends BaselineCandidateRecord>(inspections: T[] | null | undefined, moveOut: MoveOutRef): T[] {
  const addr = normalizeAddress(moveOut.property_address);
  return (inspections || [])
    .filter((i) =>
      i.id !== moveOut.id &&
      i.landlord_account_id === moveOut.landlord_account_id &&
      normalizeAddress(i.property_address) === addr &&
      i.inspection_type === "Move-In" &&
      i.status === "completed")
    .sort((a, b) => String(b.completed_at || "").localeCompare(String(a.completed_at || "")));
}

/** True only if `baselineId` is one of the qualifying candidates. */
export function isValidBaseline(inspections: BaselineCandidateRecord[] | null | undefined, moveOut: MoveOutRef, baselineId: string | number | null | undefined): boolean {
  if (!baselineId) return false;
  return baselineCandidates(inspections, moveOut).some((i) => i.id === baselineId);
}

// -------------------------------------------------------- merge + gate

export const DISCLAIMER = "AI photo condition review generated by Tello Inspect. Not a licensed home inspection. All maintenance, fault, and deposit determinations are made solely by the landlord.";
const ALLOWED_STATUS = ["ERROR_INCOMPLETE_OR_SKIPPED", "PASSED"];
const AI_ERROR_TYPES = ["MISSING_ROOM", "MISSING_ANGLE", "COVERAGE_GAP", "POOR_PHOTO_QUALITY"];
const WARNING_TYPES = ["INFERRED_SPACE_MISSING", "OPTIONAL_ANGLE"];
const CLASSIFICATIONS = ["Appears Normal Wear", "Appears Physical Damage / Alteration", "Needs Landlord Review"];
const RATINGS = ["Good", "Fair", "Needs Attention"];

function internalError(description: string, requiredAction?: string): ValidationError {
  return { error_type: "AI_RESPONSE_INVALID", room: "(audit)", photo_id: null,
           severity: "blocker", description,
           required_action: requiredAction || "Re-run the audit. If it keeps failing, retake the photos in daylight and run it again." };
}

function blocker(errorType: string, room: string, description: string, requiredAction: string): ValidationError {
  return { error_type: errorType, room, photo_id: null, severity: "blocker",
           description, required_action: requiredAction };
}

/** Structural check of the AI JSON against the revised strict schema. */
export function checkAiShape(ai: unknown): string[] {
  const problems: string[] = [];
  if (!ai || typeof ai !== "object") return ["AI response was not a JSON object."];
  const a = ai as Record<string, any>;
  if (!ALLOWED_STATUS.includes(a.status)) {
    problems.push(`AI status was ${JSON.stringify(a.status)}, not an allowed value.`);
  }
  const pa = a.property_audit;
  if (!pa || typeof pa !== "object") problems.push("AI property_audit was missing.");
  else {
    for (const k of ["expected_bedrooms", "detected_bedrooms", "expected_bathrooms", "detected_bathrooms"]) {
      if (typeof pa[k] !== "number") problems.push(`property_audit.${k} was not a number.`);
    }
    if (typeof pa.square_footage_coverage_assessment !== "string") {
      problems.push("property_audit.square_footage_coverage_assessment was not a string.");
    }
  }
  if (!Array.isArray(a.validation_errors)) {
    problems.push("AI validation_errors was not an array.");
  } else {
    a.validation_errors.forEach((e: any, i: number) => {
      if (!e || typeof e !== "object") { problems.push(`validation_errors[${i}] was not an object.`); return; }
      if (!AI_ERROR_TYPES.includes(e.error_type)) problems.push(`validation_errors[${i}] had unknown error_type ${JSON.stringify(e.error_type)}.`);
      if (typeof e.room !== "string" || e.room.trim() === "") problems.push(`validation_errors[${i}] had no room.`);
      if (typeof e.description !== "string" || e.description.trim() === "") problems.push(`validation_errors[${i}] had no description.`);
      if (typeof e.required_action !== "string" || e.required_action.trim() === "") problems.push(`validation_errors[${i}] had no required_action.`);
    });
  }
  if (!Array.isArray(a.coverage_warnings)) {
    problems.push("AI coverage_warnings was not an array.");
  } else {
    a.coverage_warnings.forEach((w: any, i: number) => {
      if (!w || typeof w !== "object") { problems.push(`coverage_warnings[${i}] was not an object.`); return; }
      if (!WARNING_TYPES.includes(w.warning_type)) problems.push(`coverage_warnings[${i}] had unknown warning_type ${JSON.stringify(w.warning_type)}.`);
      if (typeof w.space !== "string" || w.space.trim() === "") problems.push(`coverage_warnings[${i}] had no space.`);
      if (typeof w.description !== "string" || w.description.trim() === "") problems.push(`coverage_warnings[${i}] had no description.`);
    });
  }
  if (!Array.isArray(a.move_out_comparison)) {
    problems.push("AI move_out_comparison was not an array.");
  } else {
    a.move_out_comparison.forEach((c: any, i: number) => {
      if (!c || typeof c !== "object") { problems.push(`move_out_comparison[${i}] was not an object.`); return; }
      if (!CLASSIFICATIONS.includes(c.classification)) problems.push(`move_out_comparison[${i}] had unknown classification ${JSON.stringify(c.classification)}.`);
      if (typeof c.is_new_since_move_in !== "boolean") problems.push(`move_out_comparison[${i}].is_new_since_move_in was not a boolean.`);
    });
  }
  if (!Array.isArray(a.priority_repairs)) problems.push("AI priority_repairs was not an array.");
  if (!Array.isArray(a.room_by_room_report)) {
    problems.push("AI room_by_room_report was not an array.");
  } else {
    a.room_by_room_report.forEach((r: any, i: number) => {
      if (r && typeof r === "object" && !RATINGS.includes(r.overall_condition)) {
        problems.push(`room_by_room_report[${i}] had rating ${JSON.stringify(r.overall_condition)}, not Good / Fair / Needs Attention.`);
      }
    });
  }
  return problems;
}

function dedupeBy<T>(keyFn: (item: T) => string, list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    const key = keyFn(item);
    if (!seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
}

/** Hash the photo set a stored audit judged; any change closes the gate. */
export async function photoSetHash(manifest: PhotoManifestEntry[], baselineManifest: PhotoManifestEntry[] = []): Promise<string> {
  const norm = (list: PhotoManifestEntry[]) => list
    .map((p) => [p.set || "CURRENT", p.photo_id, p.room, p.angle || ""].join(":"))
    .sort()
    .join("\n");
  const data = new TextEncoder().encode(norm(manifest) + "\n--baseline--\n" + norm(baselineManifest));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * One box per room + category: group the room-by-room report and the photo
 * manifest by room + category. Dashboard photos carry no category yet, so
 * their boxes group by room (category "") — the shape is ready for
 * per-category data when the upload flow supplies it.
 */
export function groupReportByCategory(roomReport: RoomReportEntry[], manifest: PhotoManifestEntry[]): CategoryReportEntry[] {
  const boxes = new Map<string, CategoryReportEntry>();
  const keyOf = (room: string, category: string) => room + "||" + (category || "");
  for (const r of roomReport || []) {
    const k = keyOf(r.room_name, r.category || "");
    if (!boxes.has(k)) boxes.set(k, { room: r.room_name, category: r.category || "", overall_condition: r.overall_condition || "", human_comment: r.human_comment || "", findings: [], photo_ids: [] });
    const box = boxes.get(k)!;
    for (const f of [r.walls_and_paint, r.flooring, r.ceiling_and_fixtures, r.move_in_comparison_notes]) {
      if (f && f.trim()) box.findings.push(f);
    }
    if (r.human_comment && !box.human_comment) box.human_comment = r.human_comment;
  }
  for (const p of manifest || []) {
    const k = keyOf(p.room, p.category || "");
    if (!boxes.has(k)) boxes.set(k, { room: p.room, category: p.category || "", overall_condition: "", human_comment: "", findings: [], photo_ids: [] });
    boxes.get(k)!.photo_ids.push(p.photo_id);
  }
  return [...boxes.values()];
}

/** Merge code + AI results into the final gate state (the stored audit). */
export async function mergeAudit({ meta, codeErrors, codeWarnings, aiResult, manifest, baselineManifest = [], baselineProvided = false }: MergeAuditArgs): Promise<MergedAudit> {
  const errors: ValidationError[] = [...(codeErrors || [])];
  const warnings: CoverageWarning[] = [...(codeWarnings || [])];
  let propertyAudit: AiPropertyAudit | null = null;
  let roomReport: RoomReportEntry[] = [];
  let priorityRepairs: PriorityRepair[] = [];
  let comparison: MoveOutComparisonEntry[] = [];

  if (!manifest || manifest.length === 0) {
    errors.push(blocker("MISSING_ROOM", "(all rooms)",
      "No photos were uploaded for this inspection.",
      "Photograph every required room and upload the photos before generating the report."));
  }

  // A Move-Out with a baseline SELECTED but no baseline photos loaded is
  // a data problem, not a coverage choice — block it. A Move-Out with no
  // baseline selected is the landlord's choice: comparison stays empty
  // and the report notes it (per the prompt, Step 4).
  if (meta.inspection_type === "Move-Out" && baselineProvided && baselineManifest.length === 0) {
    errors.push(blocker("MISSING_ROOM", "(baseline)",
      "A move-in baseline inspection was selected, but its photos could not be loaded, so no comparison can be made.",
      "Re-select the baseline inspection, or remove the baseline selection and run the audit again."));
  }

  const problems = aiResult ? checkAiShape(aiResult) : ["AI audit did not return a result."];
  if (problems.length > 0) {
    for (const p of problems) errors.push(internalError(`The photo audit could not be completed: ${p}`));
  } else {
    const ai = aiResult as AiAuditResult;
    errors.push(...ai.validation_errors);
    warnings.push(...ai.coverage_warnings);
    propertyAudit = ai.property_audit;
    roomReport = ai.room_by_room_report;
    priorityRepairs = ai.priority_repairs;
    comparison = ai.move_out_comparison;
    if (ai.status === "PASSED" && ai.validation_errors.length > 0) {
      errors.push(internalError("The photo audit contradicted itself (PASSED with errors listed)."));
    }
    if (propertyAudit.expected_bedrooms !== Number(meta.bedroom_count) ||
        propertyAudit.expected_bathrooms !== Number(meta.bathroom_count)) {
      errors.push(internalError("The photo audit's expected bedroom/bathroom counts do not match the property metadata it was given."));
    }
  }

  const mergedErrors = dedupeBy((e) => [e.error_type, e.room, e.description].join("|"), errors);
  const mergedWarnings = dedupeBy((w) => [w.warning_type, w.space].join("|"), warnings);
  const status = mergedErrors.length === 0 ? "PASSED" : "ERROR_INCOMPLETE_OR_SKIPPED";

  return {
    status,
    property_audit: propertyAudit,
    validation_errors: mergedErrors,
    coverage_warnings: mergedWarnings,
    move_out_comparison: meta.inspection_type === "Move-Out" ? comparison : [],
    priority_repairs: priorityRepairs,
    room_by_room_report: roomReport,
    category_report: groupReportByCategory(roomReport, manifest),
    disclaimer: DISCLAIMER,
    photo_set_hash: await photoSetHash(manifest || [], baselineManifest || []),
    audited_at: new Date().toISOString(),
  };
}

/** Timestamped acknowledgment of the coverage warnings (landlord only). */
export function makeWarningAck({ by, warnings }: { by: string; warnings: CoverageWarning[] }): WarningAck {
  const record: WarningAck = { by: String(by || "").trim(), at: new Date().toISOString(),
                   warnings_acknowledged: warnings || [] };
  if (!record.by || !Array.isArray(record.warnings_acknowledged) || record.warnings_acknowledged.length === 0) {
    throw new Error("Warning acknowledgment requires who and the warnings being acknowledged.");
  }
  return record;
}

export function warningsAcknowledged(stored: StoredAuditState | null | undefined): boolean {
  const ack = stored && stored.audit_warnings_ack;
  if (!stored || !Array.isArray(stored.coverage_warnings) || stored.coverage_warnings.length === 0) return true;
  if (!ack || !Array.isArray(ack.warnings_acknowledged)) return false;
  const acked = new Set(ack.warnings_acknowledged.map((w) => [w.warning_type, w.space].join("|")));
  return stored.coverage_warnings.every((w) => acked.has([w.warning_type, w.space].join("|")));
}

/**
 * May this inspection be finalized (reviewed + signed)?
 *  - current PASSED audit for the exact current photo set, AND
 *  - every coverage warning acknowledged (or none), OR
 *  - a recorded Landlord Override (landlord-initiated sessions only —
 *    enforced where the override is recorded, see inspection-audit-routes.ts).
 */
export function canFinalize(stored: StoredAuditState | null | undefined, currentHash: string): FinalizeVerdict {
  if (!stored || stored.audit_photo_set_hash !== currentHash) {
    return { allowed: false, reason: "AUDIT_NOT_RUN_OR_STALE" };
  }
  if (stored.audit_status === "PASSED_WITH_OVERRIDE" && isValidOverride(stored.override)) {
    return { allowed: true, reason: "LANDLORD_OVERRIDE" };
  }
  if (stored.audit_status === "PASSED") {
    if (!warningsAcknowledged(stored)) return { allowed: false, reason: "WARNINGS_UNACKNOWLEDGED" };
    return { allowed: true, reason: "PASSED" };
  }
  return { allowed: false, reason: stored.audit_status || "NOT_RUN" };
}

export function isValidOverride(override: OverrideRecord | null | undefined): boolean {
  return Boolean(
    override &&
    typeof override.by === "string" && override.by.trim() !== "" &&
    typeof override.at === "string" && !Number.isNaN(Date.parse(override.at)) &&
    typeof override.note === "string" && override.note.trim().length >= 3 &&
    Array.isArray(override.errors_overridden) && override.errors_overridden.length > 0
  );
}

/** Build the override record. Server stamps `at` itself. */
export function makeOverride({ by, note, errors }: { by: string; note: string; errors: ValidationError[] }): OverrideRecord {
  const record: OverrideRecord = {
    by: String(by || "").trim(),
    at: new Date().toISOString(),
    note: String(note || "").trim(),
    errors_overridden: errors || [],
  };
  if (!isValidOverride(record)) {
    throw new Error("Override requires who, a note, and the list of errors being overridden.");
  }
  return record;
}

// ---------------------------------------------------------------- usage gate

/**
 * Usage gate for the audit endpoint (migration 0002): protects the Claude
 * API spend behind the audit. Pure — the routes layer loads the user's
 * counters, calls this BEFORE any Claude call, and consumes exactly one
 * unit (a free run or a credit) only after a Claude-backed result has
 * been stored. Paid plan tiers never consume.
 *
 * Order matters: a paid tier wins first (a subscriber never burns free
 * runs or credits), then remaining free runs, then credits.
 */
export const FREE_INSPECTION_LIMIT = 3;
export const FREE_PHOTO_LIMIT = 30;
export const PAID_PHOTO_LIMIT = 100;
export const PAID_PLAN_TIERS = ["solo", "manager", "portfolio", "partner"];

export interface UsageDecisionInput {
  freeUsed: number;
  credits: number;
  planTier: string;
  photoCount: number;
}

export type UsageDecision =
  | { allowed: true; mode: "free" | "paid" | "credit"; photoLimit: number }
  | { allowed: false; error: "UPGRADE_REQUIRED" | "PHOTO_LIMIT"; photoLimit: number };

export function decideUsage(input: UsageDecisionInput): UsageDecision {
  const tier = String(input.planTier || "free").trim().toLowerCase();
  const freeUsed = Math.max(0, Math.floor(Number(input.freeUsed) || 0));
  const credits = Math.max(0, Math.floor(Number(input.credits) || 0));
  const photoCount = Math.max(0, Math.floor(Number(input.photoCount) || 0));

  let mode: "free" | "paid" | "credit";
  let photoLimit: number;
  if (PAID_PLAN_TIERS.includes(tier)) {
    mode = "paid";
    photoLimit = PAID_PHOTO_LIMIT;
  } else if (freeUsed < FREE_INSPECTION_LIMIT) {
    mode = "free";
    photoLimit = FREE_PHOTO_LIMIT;
  } else if (credits > 0) {
    mode = "credit";
    photoLimit = PAID_PHOTO_LIMIT;
  } else {
    // No mode available: photoLimit reports the free-tier cap the user
    // just exhausted (the upgrade modal does not use it, but API
    // consumers can phrase "free inspections allow up to 30 photos").
    return { allowed: false, error: "UPGRADE_REQUIRED", photoLimit: FREE_PHOTO_LIMIT };
  }
  if (photoCount > photoLimit) return { allowed: false, error: "PHOTO_LIMIT", photoLimit };
  return { allowed: true, mode, photoLimit };
}
