-- Migration: Add isActive and dissociatedAt fields to guide_hunter_associations table
-- Date: 2025-08-30

-- Add the new columns to the guide_hunter_associations table
ALTER TABLE guide_hunter_associations 
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN dissociated_at TIMESTAMP;

-- Create an index on isActive for better query performance
CREATE INDEX idx_guide_hunter_associations_is_active ON guide_hunter_associations(is_active);

-- Create a composite index for efficient queries
CREATE INDEX idx_guide_hunter_associations_guide_active ON guide_hunter_associations(guide_id, is_active);
CREATE INDEX idx_guide_hunter_associations_hunter_active ON guide_hunter_associations(hunter_id, is_active);
