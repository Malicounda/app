-- ============================================================================
-- SCRIPT D'OPTIMISATION POSTGIS POUR LES TUILES VECTORIELLES
-- ============================================================================
-- Ce script optimise les tables zones et protected_zones pour améliorer
-- les performances de génération des tuiles vectorielles (MVT).
--
-- À exécuter dans pgAdmin ou psql
-- ============================================================================

-- 1) Colonne géométrie 4326 pré-calculée pour protected_zones
-- ----------------------------------------------------------------------------
ALTER TABLE protected_zones
  ADD COLUMN IF NOT EXISTS geom_4326 geometry(MultiPolygon, 4326);

-- Remplir la colonne geom_4326 avec les géométries transformées
UPDATE protected_zones
SET geom_4326 = ST_Transform(ST_Force2D(geom), 4326)
WHERE geom IS NOT NULL
  AND (geom_4326 IS NULL OR NOT ST_Equals(geom_4326, ST_Transform(ST_Force2D(geom), 4326)));

-- 2) BBOX pré-calculé pour requêtes rapides (optionnel mais utile)
-- ----------------------------------------------------------------------------
ALTER TABLE protected_zones
  ADD COLUMN IF NOT EXISTS bbox_4326 geometry(Polygon, 4326);

UPDATE protected_zones
SET bbox_4326 = ST_Envelope(geom_4326)
WHERE geom_4326 IS NOT NULL
  AND (bbox_4326 IS NULL OR NOT ST_Equals(bbox_4326, ST_Envelope(geom_4326)));

-- 3) Index spatiaux sur protected_zones
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_protected_zones_geom_4326
  ON protected_zones USING GIST (geom_4326);

CREATE INDEX IF NOT EXISTS idx_protected_zones_bbox_4326
  ON protected_zones USING GIST (bbox_4326);

-- 4) Index sémantiques utiles sur protected_zones
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_protected_zones_type
  ON protected_zones (type);

CREATE INDEX IF NOT EXISTS idx_protected_zones_name
  ON protected_zones (name);

-- 5) Garantir index sur zones.geometry (doit être SRID 4326)
-- ----------------------------------------------------------------------------
-- Si votre schéma a bien geometry en 4326:
DO $$
BEGIN
  IF NOT EXISTS (
     SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_zones_geometry'
  ) THEN
    EXECUTE 'CREATE INDEX idx_zones_geometry ON zones USING GIST (geometry);';
  END IF;
END $$;

-- 6) Index sémantiques sur zones
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_zones_type
  ON zones (type);

CREATE INDEX IF NOT EXISTS idx_zones_name
  ON zones (name);

CREATE INDEX IF NOT EXISTS idx_zones_region
  ON zones (region);

CREATE INDEX IF NOT EXISTS idx_zones_departement
  ON zones (departement);

-- 7) (Optionnel) Vue matérialisée simplifiée pour les zones
-- ----------------------------------------------------------------------------
-- Ceci crée une version simplifiée des géométries pour améliorer les performances
-- à faible zoom. Décommentez si vous avez des géométries très complexes.

/*
DROP MATERIALIZED VIEW IF EXISTS zones_simplified;
CREATE MATERIALIZED VIEW zones_simplified AS
SELECT
  id,
  name,
  type,
  region,
  departement,
  ST_SimplifyPreserveTopology(geometry, 0.0005) AS geometry -- ~50m à l'équateur
FROM zones
WHERE geometry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_zones_simplified_geom
  ON zones_simplified USING GIST (geometry);

CREATE INDEX IF NOT EXISTS idx_zones_simplified_type
  ON zones_simplified (type);
*/

-- 8) (Optionnel) Vue matérialisée simplifiée pour les zones protégées
-- ----------------------------------------------------------------------------
/*
DROP MATERIALIZED VIEW IF EXISTS protected_zones_simplified;
CREATE MATERIALIZED VIEW protected_zones_simplified AS
SELECT
  id,
  name,
  type,
  ST_SimplifyPreserveTopology(geom_4326, 0.0005) AS geometry
FROM protected_zones
WHERE geom_4326 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_protected_zones_simplified_geom
  ON protected_zones_simplified USING GIST (geometry);

CREATE INDEX IF NOT EXISTS idx_protected_zones_simplified_type
  ON protected_zones_simplified (type);
*/

-- 9) Maintenance et statistiques
-- ----------------------------------------------------------------------------
-- Analyser les tables pour mettre à jour les statistiques du planificateur
ANALYZE protected_zones;
ANALYZE zones;

-- Nettoyer et analyser (optionnel, peut prendre du temps sur de grandes tables)
VACUUM (ANALYZE) protected_zones;
VACUUM (ANALYZE) zones;

-- 10) Vérification des résultats
-- ----------------------------------------------------------------------------
-- Afficher les informations sur les index créés
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('zones', 'protected_zones')
ORDER BY tablename, indexname;

-- Afficher les statistiques des tables
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) AS indexes_size
FROM pg_tables
WHERE tablename IN ('zones', 'protected_zones')
ORDER BY tablename;

-- ============================================================================
-- FIN DU SCRIPT
-- ============================================================================
-- Résumé des optimisations appliquées:
-- ✓ Colonne geom_4326 pré-calculée pour protected_zones
-- ✓ BBOX pré-calculé pour requêtes rapides
-- ✓ Index spatiaux GIST sur toutes les géométries
-- ✓ Index sémantiques sur type, name, region, departement
-- ✓ Statistiques mises à jour
-- ✓ Tables nettoyées (VACUUM)
--
-- Les tuiles vectorielles devraient maintenant se générer beaucoup plus rapidement !
-- ============================================================================
