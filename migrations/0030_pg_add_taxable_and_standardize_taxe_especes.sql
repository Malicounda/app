-- 0030_pg_add_taxable_and_standardize_taxe_especes.sql
-- Objectif: standardiser le schéma taxe_especes pour PostgreSQL
-- - S'assurer du nom de colonne 'espece_id' (et pas species_id / especes_id)
-- - Ajouter la colonne 'taxable' (BOOLEAN) pour marquer si l'espèce est taxable côté taxe_especes
-- - Assurer la présence de 'prix_xof'

BEGIN;

-- 1) Renommer species_id -> espece_id si present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'taxe_especes' AND column_name = 'species_id'
  ) THEN
    EXECUTE 'ALTER TABLE taxe_especes RENAME COLUMN species_id TO espece_id';
  END IF;
END $$;

-- 2) Renommer especes_id -> espece_id si present (au cas où)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'taxe_especes' AND column_name = 'especes_id'
  ) THEN
    EXECUTE 'ALTER TABLE taxe_especes RENAME COLUMN especes_id TO espece_id';
  END IF;
END $$;

-- 3) Ajouter la colonne prix_xof si absente et migrer depuis price
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS prix_xof INTEGER;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'taxe_especes' AND column_name = 'price'
  ) THEN
    EXECUTE 'UPDATE taxe_especes SET prix_xof = price WHERE prix_xof IS NULL';
  END IF;
END $$;

-- 4) Ajouter la colonne taxable si absente
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS taxable BOOLEAN DEFAULT TRUE;

-- 5) Ajout des colonnes de métadonnées si absentes
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 6) Contraintes NOT NULL si possible
DO $$
DECLARE v_missing INT;
BEGIN
  SELECT COUNT(*) INTO v_missing FROM taxe_especes WHERE espece_id IS NULL;
  IF v_missing = 0 AND EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_name='taxe_especes' AND column_name='espece_id'
  ) THEN
    BEGIN
      ALTER TABLE taxe_especes ALTER COLUMN espece_id SET NOT NULL;
    EXCEPTION WHEN others THEN
    END;
  END IF;
END $$;

DO $$
DECLARE v_missing INT;
BEGIN
  SELECT COUNT(*) INTO v_missing FROM taxe_especes WHERE prix_xof IS NULL;
  IF v_missing = 0 AND EXISTS(
    SELECT 1 FROM information_schema.columns WHERE table_name='taxe_especes' AND column_name='prix_xof'
  ) THEN
    BEGIN
      ALTER TABLE taxe_especes ALTER COLUMN prix_xof SET NOT NULL;
    EXCEPTION WHEN others THEN
    END;
  END IF;
END $$;

-- 7) Index
CREATE INDEX IF NOT EXISTS idx_taxe_especes_active ON taxe_especes(is_active);
CREATE INDEX IF NOT EXISTS idx_taxe_especes_espece ON taxe_especes(espece_id);

COMMIT;
