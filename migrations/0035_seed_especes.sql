-- 0035_seed_especes.sql
-- Seed des espèces dans la table especes (PostgreSQL)
-- Colonnes utilisées: nom, nom_scientifique, cites_annexe, statut_protection, chassable, taxable, groupe
-- Valeurs par défaut: quota/photo_* NULL, dates = NOW()

BEGIN;

-- Table temporaire pour préparer les données fournies
CREATE TEMP TABLE tmp_especes_seed (
  nom                TEXT NOT NULL,
  nom_scientifique   TEXT,
  cites_annexe       TEXT,
  statut_protection  TEXT,
  chassable          BOOLEAN,
  taxable            BOOLEAN
) ON COMMIT DROP;

INSERT INTO tmp_especes_seed (nom, nom_scientifique, cites_annexe, statut_protection, chassable, taxable) VALUES
('Phacochère (1)',        'Phacochoerus africanus',     'Non',  'Aucun',     TRUE,  TRUE),
('Céphalophe',            'Cephalophus rufilatus',      'Non',  'Aucun',     TRUE,  TRUE),
('Phacochère (2)',        'Phacochoerus africanus',     'Non',  'Aucun',     TRUE,  TRUE),
('Phacochère (3)',        'Phacochoerus africanus',     'Non',  'Aucun',     TRUE,  TRUE),
('Gazelle à front roux',  'Eudorcas rufifrons',         'III',  'Intégral',  FALSE, TRUE),
('Buffle d’Afrique',      'Syncerus caffer',            'Non',  'Intégral',  FALSE, TRUE),
('Cobe de Buffon',        'Kobus kob kob',              'Non',  'Partiel',   TRUE,  TRUE),
('Ourébi',                'Ourebia ourebi',             'Non',  'Partiel',   TRUE,  TRUE),
('Guib harnaché',         'Tragelaphus scriptus',       'Non',  'Partiel',   TRUE,  TRUE),
('Hippotrague rouan',     'Hippotragus equinus',        'Non',  'Intégral',  FALSE, TRUE),
('Bubale (major)',        'Alcelaphus buselaphus major','Non',  'Intégral',  FALSE, TRUE);

-- Insertion dans especes avec normalisation CITES et groupe par défaut 'autre'
INSERT INTO especes (
  nom, nom_scientifique, cites_annexe, statut_protection,
  chassable, taxable, groupe, quota, photo_url, photo_data, photo_mime, photo_name,
  created_at, updated_at
)
SELECT
  s.nom,
  s.nom_scientifique,
  CASE WHEN s.cites_annexe ILIKE 'Non' THEN 'Non CITES' ELSE s.cites_annexe END AS cites_annexe,
  s.statut_protection,
  s.chassable,
  s.taxable,
  'autre'::text AS groupe,
  NULL::integer AS quota,
  NULL::text    AS photo_url,
  NULL::text    AS photo_data,
  NULL::text    AS photo_mime,
  NULL::text    AS photo_name,
  NOW()         AS created_at,
  NOW()         AS updated_at
FROM tmp_especes_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM especes e WHERE e.nom = s.nom
);

COMMIT;
