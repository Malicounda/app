-- Migration des données depuis les tables temporaires vers les tables finales
-- Après l'import via ogr2ogr ou le script Python

-- ============================================
-- 1. MIGRATION DES ARRONDISSEMENTS
-- ============================================

\echo '📍 Migration des arrondissements...'

-- Insérer ou mettre à jour les arrondissements depuis la table temporaire
INSERT INTO arrondissements (
    code,
    nom,
    region,
    departement,
    geom
)
SELECT
    COALESCE(
        NULLIF(TRIM(code), ''),
        NULLIF(TRIM(id::text), ''),
        'ARR_' || ogc_fid::text
    ) as code,
    COALESCE(
        NULLIF(TRIM(nom), ''),
        NULLIF(TRIM(name), ''),
        'Arrondissement ' || ogc_fid::text
    ) as nom,
    NULLIF(TRIM(region), '') as region,
    COALESCE(
        NULLIF(TRIM(departemen), ''),
        NULLIF(TRIM(departement), ''),
        NULLIF(TRIM(dept), '')
    ) as departement,
    geom
FROM arrondissements_temp
WHERE geom IS NOT NULL
ON CONFLICT (code) DO UPDATE
SET
    nom = EXCLUDED.nom,
    region = EXCLUDED.region,
    departement = EXCLUDED.departement,
    geom = EXCLUDED.geom,
    updated_at = NOW();

-- Afficher le résultat
SELECT
    'Arrondissements' as table_name,
    COUNT(*) as total_importes
FROM arrondissements;

-- ============================================
-- 2. MIGRATION DES COMMUNES
-- ============================================

\echo ''
\echo '🏘️  Migration des communes...'

-- Insérer ou mettre à jour les communes depuis la table temporaire
INSERT INTO communes (
    code,
    nom,
    region,
    departement,
    arrondissement,
    geom
)
SELECT
    COALESCE(
        NULLIF(TRIM(code), ''),
        NULLIF(TRIM(id::text), ''),
        'COM_' || ogc_fid::text
    ) as code,
    COALESCE(
        NULLIF(TRIM(nom), ''),
        NULLIF(TRIM(name), ''),
        'Commune ' || ogc_fid::text
    ) as nom,
    NULLIF(TRIM(region), '') as region,
    COALESCE(
        NULLIF(TRIM(departemen), ''),
        NULLIF(TRIM(departement), ''),
        NULLIF(TRIM(dept), '')
    ) as departement,
    COALESCE(
        NULLIF(TRIM(arrondisse), ''),
        NULLIF(TRIM(arrondissement), ''),
        NULLIF(TRIM(arr), '')
    ) as arrondissement,
    geom
FROM communes_temp
WHERE geom IS NOT NULL
ON CONFLICT (code) DO UPDATE
SET
    nom = EXCLUDED.nom,
    region = EXCLUDED.region,
    departement = EXCLUDED.departement,
    arrondissement = EXCLUDED.arrondissement,
    geom = EXCLUDED.geom,
    updated_at = NOW();

-- Afficher le résultat
SELECT
    'Communes' as table_name,
    COUNT(*) as total_importees
FROM communes;

-- ============================================
-- 3. VÉRIFICATION DES DONNÉES IMPORTÉES
-- ============================================

\echo ''
\echo '🔍 Vérification des données...'

-- Statistiques des arrondissements
SELECT
    '📊 Arrondissements' as info,
    COUNT(*) as total,
    COUNT(geom) as avec_geometrie,
    COUNT(centre_geometrique) as avec_centre,
    COUNT(DISTINCT region) as nb_regions,
    ROUND(AVG(area_sq_km)::numeric, 2) as superficie_moy_km2,
    ROUND(MIN(area_sq_km)::numeric, 2) as superficie_min_km2,
    ROUND(MAX(area_sq_km)::numeric, 2) as superficie_max_km2
FROM arrondissements;

-- Statistiques des communes
SELECT
    '📊 Communes' as info,
    COUNT(*) as total,
    COUNT(geom) as avec_geometrie,
    COUNT(centre_geometrique) as avec_centre,
    COUNT(DISTINCT region) as nb_regions,
    ROUND(AVG(area_sq_km)::numeric, 2) as superficie_moy_km2,
    ROUND(MIN(area_sq_km)::numeric, 2) as superficie_min_km2,
    ROUND(MAX(area_sq_km)::numeric, 2) as superficie_max_km2
FROM communes;

-- Répartition par région
\echo ''
\echo '📍 Répartition par région:'

SELECT
    COALESCE(region, 'Non spécifié') as region,
    COUNT(CASE WHEN table_name = 'arrondissements' THEN 1 END) as nb_arrondissements,
    COUNT(CASE WHEN table_name = 'communes' THEN 1 END) as nb_communes
FROM (
    SELECT 'arrondissements' as table_name, region FROM arrondissements
    UNION ALL
    SELECT 'communes' as table_name, region FROM communes
) combined
GROUP BY region
ORDER BY region;

-- ============================================
-- 4. NETTOYAGE DES TABLES TEMPORAIRES
-- ============================================

\echo ''
\echo '🧹 Nettoyage des tables temporaires...'

DROP TABLE IF EXISTS arrondissements_temp CASCADE;
DROP TABLE IF EXISTS communes_temp CASCADE;

\echo ''
\echo '✅ Migration terminée avec succès!'
