-- Tello Inspect audit — migration 0001 (Nov 14, 2026)
-- Run against the EC Rental D1 database (ec-rental-db, SQLite dialect —
-- verified against the repo's schema.sql Nov 14: properties has NO
-- metadata columns yet; inspections/inspection_details already carry
-- type and compare_to, so NO baseline column is added here — the
-- baseline id lives in inspection_details.compare_to as it does today).
-- Run once; if a column already exists in your schema, skip that line.

-- 1) Property metadata: the audit's source of truth. Entered/kept on the
--    landlord's property record, shown (prefilled) on the inspection
--    start form — never typed by a tenant on a remote inspection link.
ALTER TABLE properties ADD COLUMN square_footage INTEGER;
ALTER TABLE properties ADD COLUMN bedrooms INTEGER;
ALTER TABLE properties ADD COLUMN bathrooms INTEGER;
ALTER TABLE properties ADD COLUMN property_type TEXT; -- Single Family | Apartment | Condo | Townhouse | Duplex | Multi-Family

-- 2) Inspection fields the audit needs.
ALTER TABLE inspections ADD COLUMN selected_rooms TEXT;        -- JSON array of room names chosen on the start form
-- (baseline: reuse inspection_details.compare_to — no new column)
ALTER TABLE inspections ADD COLUMN initiated_by TEXT DEFAULT 'landlord'; -- dashboard inspections are landlord-initiated; tenant-link inspections live in remote_inspections and never get an override path
ALTER TABLE inspections ADD COLUMN audit_status TEXT DEFAULT 'NOT_RUN';    -- NOT_RUN | PASSED | ERROR_INCOMPLETE_OR_SKIPPED | PASSED_WITH_OVERRIDE
ALTER TABLE inspections ADD COLUMN audit_errors TEXT;          -- JSON: merged validation_errors
ALTER TABLE inspections ADD COLUMN audit_warnings TEXT;        -- JSON: merged coverage_warnings
ALTER TABLE inspections ADD COLUMN audit_warnings_ack TEXT;    -- JSON: { by, at } or NULL
ALTER TABLE inspections ADD COLUMN audit_report TEXT;          -- JSON: property_audit, coverage/move_out/priority/room report, disclaimer
ALTER TABLE inspections ADD COLUMN audit_run_at TEXT;
ALTER TABLE inspections ADD COLUMN audit_photo_set_hash TEXT;
ALTER TABLE inspections ADD COLUMN audit_override TEXT;        -- JSON: { by, at, note, errors_overridden } or NULL

-- 3) Shot labels for dashboard photos (Eli's decision, Nov 14: label
--    shots at upload in the dashboard). Side table, mirroring the
--    tenant flow's remote_inspection_shots, so inspection_items needs
--    no ALTER. shot is one of: wall_a | wall_b | wall_c | wall_d |
--    floor | wide_a | wide_b | counters_closeup | under_sink_closeup |
--    appliances_closeup | fixtures_closeup — '' / no row = unlabeled
--    (earns no angle credit in the audit).
CREATE TABLE IF NOT EXISTS inspection_item_shots (
  item_id INTEGER PRIMARY KEY,
  shot TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (item_id) REFERENCES inspection_items(id)
);
