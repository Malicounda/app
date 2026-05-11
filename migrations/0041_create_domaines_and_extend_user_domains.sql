-- Create domaines table + extend user_domains for multi-domain + geo scoped authorization

-- 1) Domaines reference table
CREATE TABLE IF NOT EXISTS domaines (
  id SERIAL PRIMARY KEY,
  nom_domaine TEXT NOT NULL,
  code_slug TEXT NOT NULL,
  description TEXT,
  couleur_theme TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT domaines_code_slug_unique UNIQUE(code_slug),
  CONSTRAINT domaines_nom_domaine_unique UNIQUE(nom_domaine)
);

-- 2) Extend user_domains (keep existing columns for backward compatibility)
ALTER TABLE IF EXISTS user_domains
  ADD COLUMN IF NOT EXISTS domaine_id INTEGER NULL REFERENCES domaines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS niveau_acces TEXT NULL,
  ADD COLUMN IF NOT EXISTS zone_geographique TEXT NULL;

-- 3) Helpful indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_user_domains_domaine_id'
  ) THEN
    CREATE INDEX idx_user_domains_domaine_id ON user_domains(domaine_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_user_domains_access_zone'
  ) THEN
    CREATE INDEX idx_user_domains_access_zone ON user_domains(niveau_acces, zone_geographique);
  END IF;
END $$;

-- 4) Backfill domaines from existing user_domains.domain values
INSERT INTO domaines (nom_domaine, code_slug, is_active)
SELECT DISTINCT
  ud.domain AS nom_domaine,
  lower(regexp_replace(ud.domain, '[^a-zA-Z0-9]+', '_', 'g')) AS code_slug,
  TRUE AS is_active
FROM user_domains ud
WHERE ud.domain IS NOT NULL
ON CONFLICT (nom_domaine) DO NOTHING;

-- 5) Backfill user_domains.domaine_id
UPDATE user_domains ud
SET domaine_id = d.id
FROM domaines d
WHERE ud.domaine_id IS NULL
  AND ud.domain IS NOT NULL
  AND d.nom_domaine = ud.domain;

-- 6) Optional: infer access scope for agents based on existing specialized tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'regional_agents') THEN
    UPDATE user_domains ud
    SET niveau_acces = COALESCE(ud.niveau_acces, 'Regional'),
        zone_geographique = COALESCE(ud.zone_geographique, ra.region)
    FROM regional_agents ra
    WHERE ra.user_id = ud.user_id
      AND (ud.niveau_acces IS NULL OR ud.zone_geographique IS NULL);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sector_agents') THEN
    UPDATE user_domains ud
    SET niveau_acces = COALESCE(ud.niveau_acces, 'Secteur'),
        zone_geographique = COALESCE(ud.zone_geographique, sa.secteur)
    FROM sector_agents sa
    WHERE sa.user_id = ud.user_id
      AND (ud.niveau_acces IS NULL OR ud.zone_geographique IS NULL);
  END IF;
END $$;
