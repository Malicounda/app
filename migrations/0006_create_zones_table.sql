-- Ensure PostGIS is available
CREATE EXTENSION IF NOT EXISTS postgis;

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migration pour corriger le format des colonnes responsible_photo et attachments
-- dans la table zones existante

-- Étape 1: Sauvegarder les données existantes
CREATE TEMP TABLE zones_backup AS SELECT * FROM zones;

-- Étape 2: Supprimer et recréer la table avec le bon format
DROP TABLE zones;

-- Recréer la table avec le bon format
CREATE TABLE zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('zic', 'amodiee', 'parc_visite', 'regulation')),
  status TEXT DEFAULT 'active',
  color TEXT,
  responsible_name TEXT,
  responsible_phone TEXT,
  responsible_email TEXT,
  responsible_photo TEXT,
  attachments JSONB,
  notes TEXT,
  guides_count INTEGER,
  trackers_count INTEGER,
  geometry geometry(POLYGON, 4326) NOT NULL,
  region TEXT,
  departement TEXT,
  commune TEXT,
  arrondissement TEXT,
  centroid_lat DOUBLE PRECISION,
  centroid_lon DOUBLE PRECISION,
  area_sq_km DOUBLE PRECISION,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Étape 3: Restaurer les données avec conversion des formats
INSERT INTO zones (
  id, name, type, status, color, responsible_name, responsible_phone, responsible_email,
  responsible_photo, attachments, notes, guides_count, trackers_count, geometry,
  region, departement, commune, arrondissement, centroid_lat, centroid_lon, area_sq_km,
  created_by, created_at, updated_at
)
SELECT
  id, name, type, status, color, responsible_name, responsible_phone, responsible_email,
  responsible_photo::TEXT, -- Conversion BYTEA vers TEXT
  CASE
    WHEN attachments IS NULL THEN NULL
    ELSE attachments::TEXT::JSONB -- Conversion BYTEA[] vers JSONB
  END,
  notes, guides_count, trackers_count, geometry,
  region, departement, commune, arrondissement, centroid_lat, centroid_lon, area_sq_km,
  created_by, created_at, updated_at
FROM zones_backup;

-- Étape 4: Nettoyer
DROP TABLE zones_backup;

-- Étape 5: Recréer les index
CREATE INDEX IF NOT EXISTS idx_zones_type ON zones(type);
CREATE INDEX IF NOT EXISTS idx_zones_status ON zones(status);
CREATE INDEX IF NOT EXISTS idx_zones_region ON zones(region);
CREATE INDEX IF NOT EXISTS idx_zones_departement ON zones(departement);
CREATE INDEX IF NOT EXISTS idx_zones_geom_gist ON zones USING GIST (geometry);

-- Étape 6: Recréer le trigger
DROP TRIGGER IF EXISTS trg_zones_updated_at ON zones;
CREATE TRIGGER trg_zones_updated_at
BEFORE UPDATE ON zones
FOR EACH ROW
EXECUTE FUNCTION set_zones_updated_at();
