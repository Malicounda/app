-- Backfill existing NULL updated_at values
UPDATE users
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

-- Ensure a default at the database level for future inserts
ALTER TABLE users
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- Create a trigger to always refresh updated_at on UPDATE
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
