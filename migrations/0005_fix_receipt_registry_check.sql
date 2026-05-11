-- 0005_fix_receipt_registry_check.sql
-- Ensure receipt_registry allows 'infraction' in source check constraint, idempotently.

BEGIN;

-- Drop and recreate the check constraint to include 'infraction'.
-- This is safe/idempotent because DROP CONSTRAINT IF EXISTS is used.
ALTER TABLE receipt_registry
  DROP CONSTRAINT IF EXISTS receipt_registry_source_check;

ALTER TABLE receipt_registry
  ADD CONSTRAINT receipt_registry_source_check
  CHECK (source IN ('permit','tax','infraction'));

COMMIT;
