-- Tello Inspect photo audit: the layout facts the AI checks photo coverage against.
-- Run ONCE on the live database BEFORE deploying (D1 has no "ADD COLUMN IF NOT EXISTS"):
--   npx wrangler d1 execute ec-rental-db --remote --file=migrations/2026-11-14_property_specs.sql
-- Then run `npm run db:init` for the new audit tables (those use CREATE TABLE IF NOT EXISTS).
ALTER TABLE properties ADD COLUMN square_footage INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN bedrooms INTEGER DEFAULT 0;
ALTER TABLE properties ADD COLUMN bathrooms REAL DEFAULT 0;
ALTER TABLE properties ADD COLUMN property_type TEXT DEFAULT '';
