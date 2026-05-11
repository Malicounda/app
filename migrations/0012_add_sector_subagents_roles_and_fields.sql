DO $$
BEGIN
  -- Extend enum user_role if it exists
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'brigade';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'triage';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;

    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'poste-control';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END $$;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS commune text,
  ADD COLUMN IF NOT EXISTS arrondissement text,
  ADD COLUMN IF NOT EXISTS sous_service text,
  ADD COLUMN IF NOT EXISTS created_by_user_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_created_by_user_id_fkey'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_created_by_user_id_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id);
  END IF;
END $$;
