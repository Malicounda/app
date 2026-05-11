-- Migration 0020: add validity_days to permits
ALTER TABLE IF EXISTS permits
  ADD COLUMN IF NOT EXISTS validity_days integer;

-- Optional: backfill idea (commented)
-- UPDATE permits SET validity_days = 365 WHERE validity_days IS NULL;
