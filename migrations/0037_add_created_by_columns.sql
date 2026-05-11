-- 0037_add_created_by_columns.sql
-- Ajoute la colonne created_by et les index nécessaires pour le filtrage par créateur

BEGIN;

-- infractions
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='infractions' AND column_name='created_by'
  ) THEN
    ALTER TABLE infractions ADD COLUMN created_by INTEGER NULL;
    ALTER TABLE infractions
      ADD CONSTRAINT infractions_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_infractions_created_by ON infractions(created_by);
  END IF;
END $$;

-- contrevenants
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='contrevenants' AND column_name='created_by'
  ) THEN
    ALTER TABLE contrevenants ADD COLUMN created_by INTEGER NULL;
    ALTER TABLE contrevenants
      ADD CONSTRAINT contrevenants_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_contrevenants_created_by ON contrevenants(created_by);
  END IF;
END $$;

-- agents_verbalisateurs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='agents_verbalisateurs' AND column_name='created_by'
  ) THEN
    ALTER TABLE agents_verbalisateurs ADD COLUMN created_by INTEGER NULL;
    ALTER TABLE agents_verbalisateurs
      ADD CONSTRAINT agents_verbalisateurs_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_agents_verbalisateurs_created_by ON agents_verbalisateurs(created_by);
  END IF;
END $$;

COMMIT;
