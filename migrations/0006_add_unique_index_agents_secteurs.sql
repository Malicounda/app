-- Migration: Add unique index on agents_secteurs.username to support ON CONFLICT (username)
-- Reason: trg_insert_agent() uses ON CONFLICT (username) DO NOTHING, but no unique index existed.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'agents_secteurs_username_key'
  ) THEN
    CREATE UNIQUE INDEX agents_secteurs_username_key ON agents_secteurs (username);
  END IF;
END
$$;

COMMIT;
