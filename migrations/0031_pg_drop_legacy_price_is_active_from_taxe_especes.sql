-- 0031_pg_drop_legacy_price_is_active_from_taxe_especes.sql
-- Objectif: supprimer les anciennes colonnes 'price' et 'is_active' de la table taxe_especes
-- Préserve les données en s'assurant que 'prix_xof' et 'taxable' existent et sont remplis
-- PostgreSQL ONLY

BEGIN;

-- 0) S'assurer que les colonnes cibles existent
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS prix_xof INTEGER;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS taxable BOOLEAN DEFAULT TRUE;

-- 1) Copier l'ancien prix s'il existe encore
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'taxe_especes' AND column_name = 'price'
  ) THEN
    EXECUTE 'UPDATE taxe_especes SET prix_xof = price WHERE prix_xof IS NULL';
  END IF;
END $$;

-- 2) Supprimer l'index legacy s'il existe (au besoin)
DROP INDEX IF EXISTS idx_taxe_especes_active;

-- 3) Supprimer les colonnes legacy en toute sécurité
ALTER TABLE taxe_especes DROP COLUMN IF EXISTS price;
ALTER TABLE taxe_especes DROP COLUMN IF EXISTS is_active;

COMMIT;
