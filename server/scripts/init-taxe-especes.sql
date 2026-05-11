-- Script d'initialisation de la table taxe_especes
-- Ce script crée la table et l'initialise avec les espèces par défaut

-- Création de la table si elle n'existe pas
CREATE TABLE IF NOT EXISTS taxe_especes (
  id SERIAL PRIMARY KEY,
  species_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(150) NOT NULL,
  price INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- (colonne code supprimée)

-- Création d'un index sur is_active pour filtrer les espèces actives
CREATE INDEX IF NOT EXISTS idx_taxe_especes_active ON taxe_especes(is_active);

-- Insertion des espèces par défaut (seulement si la table est vide)
INSERT INTO taxe_especes (species_id, name, price, is_active, created_at, updated_at)
SELECT * FROM (VALUES
  ('PHA1', 'Phacochère (1)', 15000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CEPH', 'Céphalophe', 40000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PHA2', 'Phacochère (2)', 20000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('PHA3', 'Phacochère (3)', 25000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GFR', 'Gazelle front roux', 50000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BUF', 'Buffle', 200000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('COB', 'Cobe de Buffon', 100000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OUR', 'Ourébi', 40001, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('GUH', 'Guib harnaché', 60000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('HIP', 'Hippotrague', 200000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('BUB', 'Bubale', 100000, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS v(species_id, name, price, is_active, created_at, updated_at)
WHERE NOT EXISTS (SELECT 1 FROM taxe_especes);

-- Affichage du nombre d'espèces insérées
SELECT COUNT(*) as total_especes FROM taxe_especes WHERE is_active = true;
