ALTER TABLE signups ADD COLUMN assigned_to TEXT DEFAULT '';
ALTER TABLE signups ADD COLUMN last_contacted_at TEXT;
