-- 0036_seed_especes_min.sql
-- Insertion minimale: uniquement nom et nom_scientifique
-- Laisse les autres colonnes à leurs valeurs par défaut (statut_protection='Aucun', chassable=true, taxable=true, etc.)

BEGIN;

WITH src(nom, nom_scientifique) AS (
  VALUES
  ('Phacochère (1)',        'Phacochoerus africanus'),
  ('Céphalophe',            'Cephalophus rufilatus'),
  ('Phacochère (2)',        'Phacochoerus africanus'),
  ('Phacochère (3)',        'Phacochoerus africanus'),
  ('Gazelle à front roux',  'Eudorcas rufifrons'),
  ('Buffle d’Afrique',      'Syncerus caffer'),
  ('Cobe de Buffon',        'Kobus kob kob'),
  ('Ourébi',                'Ourebia ourebi'),
  ('Guib harnaché',         'Tragelaphus scriptus'),
  ('Hippotrague rouan',     'Hippotragus equinus'),
  ('Bubale (major)',        'Alcelaphus buselaphus major')
)
INSERT INTO especes (nom, nom_scientifique, groupe)
SELECT s.nom, s.nom_scientifique, 'grande_chasse'
FROM src s
WHERE NOT EXISTS (
  SELECT 1 FROM especes e WHERE e.nom = s.nom
);

COMMIT;
