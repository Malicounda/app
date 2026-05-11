-- 0032_pg_add_taxable_to_especes.sql
-- Objectif: ajouter la colonne 'taxable' aux espèces (PostgreSQL)
-- - taxable BOOLEAN NOT NULL DEFAULT TRUE
-- - Backfill depuis chassable si 'taxable' était absente
-- - Index utile

BEGIN;

-- 1) Ajouter la colonne si absente
ALTER TABLE especes ADD COLUMN IF NOT EXISTS taxable BOOLEAN;

-- 2) Backfill: si taxable est NULL, on reprend la valeur de chassable (ou TRUE par défaut)
UPDATE especes SET taxable = COALESCE(taxable, chassable, TRUE) WHERE taxable IS NULL;

-- 3) NOT NULL + DEFAULT
ALTER TABLE especes ALTER COLUMN taxable SET DEFAULT TRUE;
ALTER TABLE especes ALTER COLUMN taxable SET NOT NULL;

-- 4) Index optionnel pour filtrages
CREATE INDEX IF NOT EXISTS idx_especes_taxable ON especes(taxable);

COMMIT;
