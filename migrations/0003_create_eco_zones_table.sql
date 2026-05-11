-- Migration pour créer la table des zones écogéographiques
CREATE TABLE IF NOT EXISTS eco_geographie_zones (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  coords JSONB NOT NULL,
  color VARCHAR(20) NOT NULL
);

-- Insérer des données de test si la table est vide
INSERT INTO eco_geographie_zones (name, description, coords, color)
SELECT 'Zone sahélienne', 'Climat aride, végétation steppique', 
  '[[16.0, -16.5], [16.5, -16.0], [16.5, -15.0], [16.0, -15.0]]'::jsonb, '#8B4513'
WHERE NOT EXISTS (SELECT 1 FROM eco_geographie_zones WHERE name = 'Zone sahélienne');

INSERT INTO eco_geographie_zones (name, description, coords, color)
SELECT 'Zone soudanienne', 'Savane arborée', 
  '[[14.5, -15.5], [15.0, -15.0], [15.0, -14.0], [14.5, -14.0]]'::jsonb, '#6B8E23'
WHERE NOT EXISTS (SELECT 1 FROM eco_geographie_zones WHERE name = 'Zone soudanienne');

INSERT INTO eco_geographie_zones (name, description, coords, color)
SELECT 'Zone guinéenne', 'Forêt tropicale humide', 
  '[[12.5, -16.5], [13.0, -16.0], [13.0, -15.0], [12.5, -15.0]]'::jsonb, '#228B22'
WHERE NOT EXISTS (SELECT 1 FROM eco_geographie_zones WHERE name = 'Zone guinéenne');

INSERT INTO eco_geographie_zones (name, description, coords, color)
SELECT 'Zone côtière', 'Écosystème côtier et mangroves', 
  '[[14.0, -17.5], [14.5, -17.0], [14.5, -16.5], [14.0, -16.5]]'::jsonb, '#20B2AA'
WHERE NOT EXISTS (SELECT 1 FROM eco_geographie_zones WHERE name = 'Zone côtière');
