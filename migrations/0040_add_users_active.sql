-- Add 'active' boolean column to users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='active'
  ) THEN
    ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;
