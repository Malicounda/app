-- Création de la table species si elle n'existe pas
CREATE TABLE IF NOT EXISTS species (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  code VARCHAR(50) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertion des espèces de base
INSERT OR IGNORE INTO species (id, name, description, price, code) VALUES
  ('species-1', 'Phacochère (1)', 'Phacochère de première catégorie', 15000, 'PHA1'),
  ('species-2', 'Céphalophe', 'Céphalophe commun', 40000, 'CEPH'),
  ('species-3', 'Phacochère (2)', 'Phacochère de deuxième catégorie', 20000, 'PHA2'),
  ('species-4', 'Phacochère (3)', 'Phacochère de troisième catégorie', 25000, 'PHA3'),
  ('species-5', 'Gazelle front roux', 'Gazelle à front roux', 50000, 'GFR'),
  ('species-6', 'Buffle', 'Buffle d''Afrique', 200000, 'BUF'),
  ('species-7', 'Cobe de Buffon', 'Cobe de Buffon', 100000, 'COB'),
  ('species-8', 'Ourébi', 'Ourébi commun', 40001, 'OUR'),
  ('species-9', 'Guib harnaché', 'Guib harnaché', 60000, 'GUH'),
  ('species-10', 'Hippotrague', 'Hippotrague noir', 200000, 'HIP'),
  ('species-11', 'Bubale', 'Bubale roux', 100000, 'BUB');

-- Mise à jour du timestamp
UPDATE species SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;
