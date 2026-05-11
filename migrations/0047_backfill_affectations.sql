-- Backfill de la table affectations depuis les données existantes
-- Source: agents + user_domains + users

BEGIN;

-- 0) Vérifier que les tables nécessaires existent
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agents') THEN
    RAISE EXCEPTION 'La table agents n''existe pas. Exécutez d''abord la migration 0042.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_domains') THEN
    RAISE EXCEPTION 'La table user_domains n''existe pas.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'affectations') THEN
    RAISE EXCEPTION 'La table affectations n''existe pas. Exécutez d''abord la migration 0046.';
  END IF;
END $$;

-- 1) Créer une table temporaire pour mapper user_id -> agent_id
CREATE TEMP TABLE user_agent_map AS
SELECT u.id AS user_id, a.id_agent AS agent_id, u.role, u.region, u.departement
FROM users u
JOIN agents a ON a.user_id = u.id
WHERE u.role IN ('agent', 'sub-agent');

-- 2) Insérer les affectations depuis user_domains
-- Logique:
--   - agent (régional) -> niveau_hierarchique = 'REGIONAL', code_zone = region
--   - sub-agent (secteur) -> niveau_hierarchique = 'SECTEUR', code_zone = departement
--   - Si user_domains.niveau_acces est renseigné, l'utiliser en priorité

INSERT INTO affectations (agent_id, domaine_id, niveau_hierarchique, code_zone, active, date_affectation)
SELECT DISTINCT
  m.agent_id,
  d.id AS domaine_id,
  COALESCE(
    CASE
      WHEN ud.niveau_acces ILIKE '%national%' THEN 'NATIONAL'
      WHEN ud.niveau_acces ILIKE '%regional%' THEN 'REGIONAL'
      WHEN ud.niveau_acces ILIKE '%secteur%' THEN 'SECTEUR'
      ELSE NULL
    END,
    CASE
      WHEN m.role = 'agent' THEN 'REGIONAL'
      WHEN m.role = 'sub-agent' THEN 'SECTEUR'
      ELSE 'SECTEUR'
    END
  ) AS niveau_hierarchique,
  COALESCE(
    ud.zone_geographique,
    CASE
      WHEN m.role = 'agent' THEN m.region
      WHEN m.role = 'sub-agent' THEN m.departement
      ELSE m.region
    END
  ) AS code_zone,
  COALESCE(ud.active, true) AS active,
  COALESCE(ud.created_at, NOW()) AS date_affectation
FROM user_domains ud
JOIN user_agent_map m ON m.user_id = ud.user_id
JOIN domaines d ON (d.id = ud.domaine_id OR d.nom_domaine ILIKE ud.domain OR d.code_slug ILIKE ud.domain)
WHERE ud.domain IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM affectations a
    WHERE a.agent_id = m.agent_id AND a.domaine_id = d.id
  )
ON CONFLICT (agent_id, domaine_id) DO NOTHING;

-- 3) Pour les agents sans user_domains, créer une affectation par défaut sur le premier domaine disponible
INSERT INTO affectations (agent_id, domaine_id, niveau_hierarchique, code_zone, active, date_affectation)
SELECT
  m.agent_id,
  d.id AS domaine_id,
  CASE
    WHEN m.role = 'agent' THEN 'REGIONAL'
    WHEN m.role = 'sub-agent' THEN 'SECTEUR'
    ELSE 'SECTEUR'
  END AS niveau_hierarchique,
  CASE
    WHEN m.role = 'agent' THEN m.region
    WHEN m.role = 'sub-agent' THEN m.departement
    ELSE m.region
  END AS code_zone,
  true AS active,
  NOW() AS date_affectation
FROM user_agent_map m
CROSS JOIN (SELECT id FROM domaines WHERE is_active = true ORDER BY id LIMIT 1) d
WHERE NOT EXISTS (
  SELECT 1 FROM affectations a WHERE a.agent_id = m.agent_id
)
ON CONFLICT (agent_id, domaine_id) DO NOTHING;

-- 4) Nettoyer la table temporaire
DROP TABLE user_agent_map;

-- 5) Afficher le résultat
SELECT
  (SELECT count(*) FROM agents) AS total_agents,
  (SELECT count(*) FROM affectations) AS total_affectations,
  (SELECT count(DISTINCT agent_id) FROM affectations) AS agents_avec_affectation;

COMMIT;
