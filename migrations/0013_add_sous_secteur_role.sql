DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sous-secteur';
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END $$;
