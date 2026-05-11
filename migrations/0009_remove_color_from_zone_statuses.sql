-- Remove color column from zone_statuses table
-- This migration removes the color column as it's not needed for zone statuses

-- Drop the color column from zone_statuses table
ALTER TABLE zone_statuses DROP COLUMN IF EXISTS color;

-- Update the comment to reflect the change
COMMENT ON TABLE zone_statuses IS 'Configuration table for zone statuses (Active, Inactive, etc.) - colors managed at zone level';

-- Remove the comment for the color column since it no longer exists
-- (PostgreSQL automatically removes column comments when column is dropped)
