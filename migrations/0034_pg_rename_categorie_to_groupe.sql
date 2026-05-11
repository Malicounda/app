-- 0034_pg_rename_categorie_to_groupe.sql
-- Objectif: renommer la colonne categorie -> groupe dans especes (PostgreSQL)
-- et réaligner les index

BEGIN;

-- Renommer la colonne si elle existe et si 'groupe' n'existe pas encore
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'especes' AND column_name = 'categorie'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'especes' AND column_name = 'groupe'
  ) THEN
    ALTER TABLE especes RENAME COLUMN categorie TO groupe;
  END IF;
END$$;

-- Recréer les index: supprimer les anciens s'ils existent, créer les nouveaux
DROP INDEX IF EXISTS idx_especes_categorie;
CREATE INDEX IF NOT EXISTS idx_especes_groupe ON especes(groupe);

COMMIT;
