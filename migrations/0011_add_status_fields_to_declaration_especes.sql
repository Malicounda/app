-- Migration: Add status and review fields to declaration_especes table
-- Date: 2025-09-17

BEGIN;

-- Ajouter les colonnes de statut et de révision
ALTER TABLE declaration_especes 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Mettre à jour les déclarations existantes
UPDATE declaration_especes 
SET status = 'pending' 
WHERE status IS NULL;

-- Créer un index sur le statut pour les requêtes
CREATE INDEX IF NOT EXISTS idx_declaration_especes_status ON declaration_especes(status);
CREATE INDEX IF NOT EXISTS idx_declaration_especes_created_at ON declaration_especes(created_at);

COMMIT;
