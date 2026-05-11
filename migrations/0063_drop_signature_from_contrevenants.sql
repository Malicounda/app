-- Remove obsolete signature column from contrevenants table
ALTER TABLE IF EXISTS contrevenants
  DROP COLUMN IF EXISTS signature;
