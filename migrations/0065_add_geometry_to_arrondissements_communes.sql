-- Migration pour ajouter les colonnes de géométrie aux tables arrondissements et communes
-- Pour qu'elles soient cohérentes avec la table regions

-- Assurer que PostGIS est disponible
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- 1. AJOUT DES COLONNES DE GÉOMÉTRIE À LA TABLE ARRONDISSEMENTS
-- ============================================

-- Ajouter la colonne geometry (polygone principal)
ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS geom GEOMETRY(GEOMETRY, 4326);

-- Ajouter la colonne centre_geometrique (point central)
ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS centre_geometrique GEOMETRY(POINT, 4326);

-- Ajouter les colonnes de coordonnées du centroïde
ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS centroid_lat DOUBLE PRECISION;

ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS centroid_lon DOUBLE PRECISION;

-- Ajouter la colonne de superficie
ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS area_sq_km DOUBLE PRECISION;

-- Créer un index spatial GIST pour la colonne geom
CREATE INDEX IF NOT EXISTS idx_arrondissements_geom_gist
ON arrondissements USING GIST (geom);

-- Créer un index spatial GIST pour la colonne centre_geometrique
CREATE INDEX IF NOT EXISTS idx_arrondissements_centre_geom_gist
ON arrondissements USING GIST (centre_geometrique);

-- ============================================
-- 2. AJOUT DES COLONNES DE GÉOMÉTRIE À LA TABLE COMMUNES
-- ============================================

-- Ajouter la colonne geometry (polygone principal)
ALTER TABLE communes
ADD COLUMN IF NOT EXISTS geom GEOMETRY(GEOMETRY, 4326);

-- Ajouter la colonne centre_geometrique (point central)
ALTER TABLE communes
ADD COLUMN IF NOT EXISTS centre_geometrique GEOMETRY(POINT, 4326);

-- Ajouter les colonnes de coordonnées du centroïde
ALTER TABLE communes
ADD COLUMN IF NOT EXISTS centroid_lat DOUBLE PRECISION;

ALTER TABLE communes
ADD COLUMN IF NOT EXISTS centroid_lon DOUBLE PRECISION;

-- Ajouter la colonne de superficie
ALTER TABLE communes
ADD COLUMN IF NOT EXISTS area_sq_km DOUBLE PRECISION;

-- Créer un index spatial GIST pour la colonne geom
CREATE INDEX IF NOT EXISTS idx_communes_geom_gist
ON communes USING GIST (geom);

-- Créer un index spatial GIST pour la colonne centre_geometrique
CREATE INDEX IF NOT EXISTS idx_communes_centre_geom_gist
ON communes USING GIST (centre_geometrique);

-- ============================================
-- 3. FONCTION POUR CALCULER AUTOMATIQUEMENT LES CENTROÏDES ET SUPERFICIES
-- ============================================

-- Fonction pour mettre à jour automatiquement les centroïdes et superficies pour arrondissements
CREATE OR REPLACE FUNCTION update_arrondissements_geometry_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la géométrie principale est définie
  IF NEW.geom IS NOT NULL THEN
    -- Calculer le centre géométrique (centroïde)
    NEW.centre_geometrique := ST_Centroid(NEW.geom);

    -- Extraire les coordonnées du centroïde
    NEW.centroid_lat := ST_Y(ST_Centroid(NEW.geom));
    NEW.centroid_lon := ST_X(ST_Centroid(NEW.geom));

    -- Calculer la superficie en km²
    -- ST_Area retourne en m² pour SRID 4326, donc on divise par 1000000
    NEW.area_sq_km := ST_Area(ST_Transform(NEW.geom, 3857)) / 1000000.0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour automatiquement les centroïdes et superficies pour communes
CREATE OR REPLACE FUNCTION update_communes_geometry_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la géométrie principale est définie
  IF NEW.geom IS NOT NULL THEN
    -- Calculer le centre géométrique (centroïde)
    NEW.centre_geometrique := ST_Centroid(NEW.geom);

    -- Extraire les coordonnées du centroïde
    NEW.centroid_lat := ST_Y(ST_Centroid(NEW.geom));
    NEW.centroid_lon := ST_X(ST_Centroid(NEW.geom));

    -- Calculer la superficie en km²
    -- ST_Area retourne en m² pour SRID 4326, donc on divise par 1000000
    NEW.area_sq_km := ST_Area(ST_Transform(NEW.geom, 3857)) / 1000000.0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. CRÉATION DES TRIGGERS
-- ============================================

-- Trigger pour arrondissements
DROP TRIGGER IF EXISTS trg_arrondissements_geometry ON arrondissements;
CREATE TRIGGER trg_arrondissements_geometry
BEFORE INSERT OR UPDATE OF geom ON arrondissements
FOR EACH ROW
EXECUTE FUNCTION update_arrondissements_geometry_fields();

-- Trigger pour communes
DROP TRIGGER IF EXISTS trg_communes_geometry ON communes;
CREATE TRIGGER trg_communes_geometry
BEFORE INSERT OR UPDATE OF geom ON communes
FOR EACH ROW
EXECUTE FUNCTION update_communes_geometry_fields();

-- ============================================
-- 5. COMMENTAIRES SUR LES COLONNES
-- ============================================

-- Arrondissements
COMMENT ON COLUMN arrondissements.geom IS 'Géométrie principale (polygone) de l''arrondissement en SRID 4326';
COMMENT ON COLUMN arrondissements.centre_geometrique IS 'Point central (centroïde) de l''arrondissement';
COMMENT ON COLUMN arrondissements.centroid_lat IS 'Latitude du centroïde';
COMMENT ON COLUMN arrondissements.centroid_lon IS 'Longitude du centroïde';
COMMENT ON COLUMN arrondissements.area_sq_km IS 'Superficie en kilomètres carrés';

-- Communes
COMMENT ON COLUMN communes.geom IS 'Géométrie principale (polygone) de la commune en SRID 4326';
COMMENT ON COLUMN communes.centre_geometrique IS 'Point central (centroïde) de la commune';
COMMENT ON COLUMN communes.centroid_lat IS 'Latitude du centroïde';
COMMENT ON COLUMN communes.centroid_lon IS 'Longitude du centroïde';
COMMENT ON COLUMN communes.area_sq_km IS 'Superficie en kilomètres carrés';

-- ============================================
-- 6. VÉRIFICATION
-- ============================================

-- Vérifier les colonnes ajoutées pour arrondissements
SELECT
    'arrondissements' as table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'arrondissements'
AND column_name IN ('geom', 'centre_geometrique', 'centroid_lat', 'centroid_lon', 'area_sq_km')
ORDER BY column_name;

-- Vérifier les colonnes ajoutées pour communes
SELECT
    'communes' as table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE table_name = 'communes'
AND column_name IN ('geom', 'centre_geometrique', 'centroid_lat', 'centroid_lon', 'area_sq_km')
ORDER BY column_name;

-- Vérifier les index spatiaux
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('arrondissements', 'communes')
AND indexdef LIKE '%GIST%'
ORDER BY tablename, indexname;
