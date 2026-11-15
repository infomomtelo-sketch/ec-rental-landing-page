-- Tello Inspect usage gate + white-label partners — migration 0002 (Nov 14, 2026)
-- Run against the EC Rental D1 database (ec-rental-db, SQLite dialect)
-- AFTER migrations/0001_property_metadata_and_audit.sql. 0001 added the
-- property metadata columns, inspections.selected_rooms / audit_* columns
-- and the inspection_item_shots table; nothing here repeats those.
-- Run once; if a column already exists in your schema, skip that line.
-- No foreign keys (repo style: schema.sql declares them, but the live
-- tables were built without enforcement — plain columns + indexes only).

-- 1) Usage tracking on the billing profile (users). plan_tier is the
--    audit gate's source of truth going forward; the older users.plan
--    column stays for the rest of the app. Tiers:
--    'free' | 'solo' | 'manager' | 'portfolio' | 'partner'.
--    Free tier: 3 audits (30 photos max each). Paid tiers and credit
--    audits: 100 photos max. See decideUsage() in src/inspection-audit.ts.
ALTER TABLE users ADD COLUMN free_inspections_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN inspection_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'free';

-- OPTIONAL one-time backfill (review before running): existing accounts
-- carry plan = 'solo' from the old schema default, including accounts
-- that never paid. Do NOT blanket-copy plan into plan_tier. Instead set
-- plan_tier only for users with a live subscription, e.g.:
--   UPDATE users SET plan_tier = 'solo'
--    WHERE id IN (SELECT user_id FROM billing WHERE status = 'active');
-- Until an account's plan_tier is set, it is treated as 'free' by the
-- gate (3 free audits, then UPGRADE_REQUIRED) — nobody is charged, but a
-- paying landlord who is not backfilled will hit the upgrade modal.

-- 2) White-label partner organizations. One user owns an organization;
--    slug is the public URL piece (/inspect/<slug> and
--    GET /api/inspections/org/<slug>). auto_email_recipients is a
--    JSON-encoded TEXT array (SQLite has no text[] type), e.g.
--    '["ops@example.com","owner@example.com"]' — stored for the partner
--    delivery step; nothing reads it yet.
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_user_id INTEGER NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  brand_name TEXT,
  brand_logo_url TEXT,
  primary_color TEXT,
  support_email TEXT,
  webhook_url TEXT,
  auto_email_recipients TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 3) Inspection snapshot + partner link. The metadata columns snapshot
--    the property's listed layout AT CREATE TIME (properties stays the
--    editable source of truth; the audit reads the property record
--    today, the snapshot is what the inspection was started with).
--    baseline_inspection_id mirrors inspection_details.compare_to at
--    create time for reporting/partner payloads; compare_to remains
--    the value the audit itself validates and uses.
--    report_json stores the full merged audit report in the finalized
--    schema shape (status, property_audit, validation_errors,
--    coverage_warnings, move_out_comparison, priority_repairs,
--    room_by_room_report, disclaimer) — the same object the partner
--    webhook posts. audit_report (0001) keeps its narrower shape.
ALTER TABLE inspections ADD COLUMN organization_id INTEGER;
ALTER TABLE inspections ADD COLUMN property_sqft INTEGER;
ALTER TABLE inspections ADD COLUMN bedrooms INTEGER;
ALTER TABLE inspections ADD COLUMN bathrooms REAL;
ALTER TABLE inspections ADD COLUMN property_type TEXT;
ALTER TABLE inspections ADD COLUMN baseline_inspection_id INTEGER;
ALTER TABLE inspections ADD COLUMN report_json TEXT;

-- 4) Runner-link passthrough: a remote (token-link) inspection can
--    belong to a partner organization, so the runner page can render
--    the partner's branding. Set by the landlord create-link endpoint
--    (validated against organizations.owner_user_id) or resolved from
--    the org slug on the public create endpoint.
ALTER TABLE remote_inspections ADD COLUMN organization_id INTEGER;
