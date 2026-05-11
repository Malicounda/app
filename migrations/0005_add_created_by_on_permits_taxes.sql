-- Add created_by columns to permits and taxes to track issuer
-- Safe to run multiple times thanks to IF NOT EXISTS guards

-- Permits
ALTER TABLE IF EXISTS permits
  ADD COLUMN IF NOT EXISTS created_by integer;

-- Taxes
ALTER TABLE IF EXISTS taxes
  ADD COLUMN IF NOT EXISTS created_by integer;

-- Indexes to speed up filtering by issuer
CREATE INDEX IF NOT EXISTS idx_permits_created_by ON permits(created_by);
CREATE INDEX IF NOT EXISTS idx_taxes_created_by ON taxes(created_by);

-- Optional FKs (set null on user deletion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_permits_created_by_users'
  ) THEN
    ALTER TABLE permits
      ADD CONSTRAINT fk_permits_created_by_users
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_taxes_created_by_users'
  ) THEN
    ALTER TABLE taxes
      ADD CONSTRAINT fk_taxes_created_by_users
      FOREIGN KEY (created_by) REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END$$;
