-- Create table: permit_categories
-- Labels stored in French; columns named in snake_case for consistency

CREATE TABLE IF NOT EXISTS permit_categories (
  id                SERIAL PRIMARY KEY,
  key               TEXT NOT NULL UNIQUE,            -- identifiant technique (slug) ex: "touriste-1-semaine"
  label_fr          TEXT NOT NULL,                   -- libellé affiché en français
  groupe            TEXT NOT NULL,                   -- ex: "petite-chasse", "grande-chasse", "gibier-d'eau", "autre"
  genre             TEXT NOT NULL,                   -- ex: "resident", "touriste", "coutumier", "scientifique", "commercial", "oisellerie"
  default_validity_days INTEGER,                     -- si défini, utilisé pour calculer validityDays/expiryDate
  max_renewals      INTEGER NOT NULL DEFAULT 0,      -- nombre max de renouvellements autorisés (ex: 2 pour gibier d'eau)
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  rules_json        JSONB,                           -- règles spécifiques (optionnel)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: index for active lookups
CREATE INDEX IF NOT EXISTS idx_permit_categories_active ON permit_categories (is_active);

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

-- Ensure updated_at auto-updates on change
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_permit_categories_updated_at'
  ) THEN
    CREATE TRIGGER trg_permit_categories_updated_at
    BEFORE UPDATE ON permit_categories
    FOR EACH ROW
    EXECUTE FUNCTION set_timestamp();
  END IF;
END$$;

-- Seed de base (facultatif) pour touriste petites/gibier d'eau/grande chasse avec validités implicites
-- Remarque: adaptez selon vos catégories réelles si besoin
INSERT INTO permit_categories (key, label_fr, groupe, genre, default_validity_days, max_renewals, is_active)
VALUES
  ('touriste-1-semaine-petite', 'Touriste (1 semaine) – Petite chasse', 'petite-chasse', 'touriste', 7, 0, TRUE),
  ('touriste-2-semaines-petite', 'Touriste (2 semaines) – Petite chasse', 'petite-chasse', 'touriste', 14, 0, TRUE),
  ('touriste-1-mois-petite', 'Touriste (1 mois) – Petite chasse', 'petite-chasse', 'touriste', 30, 0, TRUE),
  ('touriste-1-semaine-grande', 'Touriste (1 semaine) – Grande chasse', 'grande-chasse', 'touriste', 7, 0, TRUE),
  ('touriste-2-semaines-grande', 'Touriste (2 semaines) – Grande chasse', 'grande-chasse', 'touriste', 14, 0, TRUE),
  ('touriste-1-mois-grande', 'Touriste (1 mois) – Grande chasse', 'grande-chasse', 'touriste', 30, 0, TRUE),
  ('touriste-1-semaine-gibier-eau', 'Touriste (1 semaine) – Gibier d''eau', 'gibier-eau', 'touriste', 7, 2, TRUE),
  ('touriste-1-mois-gibier-eau', 'Touriste (1 mois) – Gibier d''eau', 'gibier-eau', 'touriste', 30, 2, TRUE)
ON CONFLICT (key) DO NOTHING;
