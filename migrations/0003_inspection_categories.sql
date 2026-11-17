-- 0003 — Tello Inspect shot-list rebuild (Ziprent-style, Nov 2026).
--
-- Per-category records for the remote (public) inspection flow: every room
-- is a dropdown of categories, each category carries its floor type (floor
-- only), its yes/no answers, and the photographer's typed comment (a
-- free-text box — it only needs one word: cleaning, damage, repair or
-- replace). Photos link to their category via remote_inspection_items.category.
--
-- Apply before the matching code deploys (the code degrades without it —
-- categories read as empty and photo uploads fall back to the old shape —
-- but the shot list cannot save until this runs):
--   npx wrangler d1 execute ec-rental-db --remote --file migrations/0003_inspection_categories.sql

CREATE TABLE IF NOT EXISTS remote_inspection_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_id INTEGER NOT NULL,
  room TEXT NOT NULL,
  category TEXT NOT NULL,
  floor_type TEXT DEFAULT '',
  answers TEXT DEFAULT '{}',
  comment TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (inspection_id, room, category),
  FOREIGN KEY (inspection_id) REFERENCES remote_inspections(id)
);
CREATE INDEX IF NOT EXISTS idx_remote_inspection_categories ON remote_inspection_categories(inspection_id);

ALTER TABLE remote_inspection_items ADD COLUMN category TEXT DEFAULT '';

-- Property auto-fill (Nov 2026): the address field auto-searches any US
-- address (OpenStreetMap Nominatim) and Tello stores the match's city,
-- state, ZIP and map-pin coordinates. All optional — old rows and old
-- payloads work without them, and the create handler falls back to the
-- old insert shape until this runs.
ALTER TABLE remote_inspections ADD COLUMN city TEXT DEFAULT '';
ALTER TABLE remote_inspections ADD COLUMN state TEXT DEFAULT '';
ALTER TABLE remote_inspections ADD COLUMN postcode TEXT DEFAULT '';
ALTER TABLE remote_inspections ADD COLUMN latitude REAL;
ALTER TABLE remote_inspections ADD COLUMN longitude REAL;
