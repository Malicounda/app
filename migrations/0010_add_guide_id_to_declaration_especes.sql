-- Migration: Add guide_id column to declaration_especes table
-- Date: 2025-09-17
-- Purpose: Track which guide made the declaration on behalf of the hunter

-- Add guide_id column to declaration_especes table
ALTER TABLE declaration_especes
ADD COLUMN guide_id INTEGER;

-- Add foreign key constraint to reference users table (guides)
ALTER TABLE declaration_especes
ADD CONSTRAINT fk_declaration_especes_guide_id
FOREIGN KEY (guide_id) REFERENCES users(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_declaration_especes_guide_id ON declaration_especes(guide_id);

-- Create composite index for efficient queries by hunter and guide
CREATE INDEX idx_declaration_especes_hunter_guide ON declaration_especes(hunter_id, guide_id);

-- Add comment to document the purpose
COMMENT ON COLUMN declaration_especes.guide_id IS 'ID of the guide who made this declaration on behalf of the hunter (NULL if made by hunter directly)';
