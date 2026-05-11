-- Safe, idempotent rename: only perform if old column exists and new one doesn't
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hunters' AND column_name = 'zone'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'hunters' AND column_name = 'departement'
  ) THEN
    ALTER TABLE hunters RENAME COLUMN zone TO departement;
  END IF;
END $$;

