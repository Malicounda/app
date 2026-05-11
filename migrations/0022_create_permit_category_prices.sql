-- Create table: permit_category_prices (tarifs par catégorie et par saison)

CREATE TABLE IF NOT EXISTS permit_category_prices (
  id             SERIAL PRIMARY KEY,
  category_id    INTEGER NOT NULL REFERENCES permit_categories(id) ON DELETE CASCADE,
  season_year    TEXT NOT NULL,                 -- ex: '2025-2026' ou '2025'
  tarif_xof      NUMERIC(12,2) NOT NULL,       -- montant en FCFA
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_category_season UNIQUE (category_id, season_year)
);

CREATE INDEX IF NOT EXISTS idx_permit_category_prices_active ON permit_category_prices (is_active);
CREATE INDEX IF NOT EXISTS idx_permit_category_prices_season ON permit_category_prices (season_year);

-- Fonction générique pour mettre à jour updated_at si elle n'existe pas déjà
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_timestamp'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION set_timestamp()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END
    $func$;
  END IF;
END$$;

-- Trigger pour mettre à jour updated_at automatiquement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_permit_category_prices_updated_at'
  ) THEN
    CREATE TRIGGER trg_permit_category_prices_updated_at
    BEFORE UPDATE ON permit_category_prices
    FOR EACH ROW
    EXECUTE FUNCTION set_timestamp();
  END IF;
END$$;

-- Seed d'exemple (adapter/compléter selon la saison active)
-- Suppose une saison générique '2025-2026'; remplacez par votre valeur lors du déploiement
INSERT INTO permit_category_prices (category_id, season_year, tarif_xof, is_active)
SELECT id, '2025-2026',
  CASE
    WHEN key LIKE 'touriste-1-semaine-%' THEN 15000
    WHEN key LIKE 'touriste-2-semaines-%' THEN 25000
    WHEN key LIKE 'touriste-1-mois-%' THEN 45000
    ELSE 0
  END,
  TRUE
FROM permit_categories
WHERE key IN (
  'touriste-1-semaine-petite','touriste-2-semaines-petite','touriste-1-mois-petite',
  'touriste-1-semaine-grande','touriste-2-semaines-grande','touriste-1-mois-grande',
  'touriste-1-semaine-gibier-eau','touriste-1-mois-gibier-eau'
)
ON CONFLICT (category_id, season_year) DO NOTHING;
