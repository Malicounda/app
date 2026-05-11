-- Migration pour ajouter les colonnes administratives manquantes
-- Nécessaire pour l'import des données géographiques

-- ============================================
-- 1. AJOUT DES COLONNES À LA TABLE ARRONDISSEMENTS
-- ============================================

ALTER TABLE arrondissements
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS departement TEXT;

-- ============================================
-- 2. AJOUT DES COLONNES À LA TABLE COMMUNES
-- ============================================

ALTER TABLE communes
ADD COLUMN IF NOT EXISTS region TEXT,
ADD COLUMN IF NOT EXISTS departement TEXT,
ADD COLUMN IF NOT EXISTS arrondissement TEXT;

-- ============================================
-- 3. VÉRIFICATION
-- ============================================

SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_name IN ('arrondissements', 'communes')
AND column_name IN ('region', 'departement', 'arrondissement')
ORDER BY table_name, column_name;
