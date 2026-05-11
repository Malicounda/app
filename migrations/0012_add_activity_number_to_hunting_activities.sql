-- Migration: Add activity_number column to hunting_activities table
-- Date: 2025-09-17

BEGIN;

-- Ajouter la colonne activity_number
ALTER TABLE hunting_activities 
ADD COLUMN IF NOT EXISTS activity_number VARCHAR(50) UNIQUE;

-- Créer un index sur activity_number
CREATE INDEX IF NOT EXISTS idx_hunting_activities_activity_number ON hunting_activities(activity_number);

-- Générer des numéros d'activité pour les enregistrements existants
UPDATE hunting_activities 
SET activity_number = 'H' || hunter_id || '-' || EXTRACT(YEAR FROM created_at) || '-' || 
    LPAD((ROW_NUMBER() OVER (PARTITION BY hunter_id, EXTRACT(YEAR FROM created_at) ORDER BY created_at))::text, 3, '0')
WHERE activity_number IS NULL;

COMMIT;
