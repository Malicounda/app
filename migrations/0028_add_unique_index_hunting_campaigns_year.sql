-- 0028_add_unique_index_hunting_campaigns_year.sql
-- Ensure a unique or exclusion constraint exists on hunting_campaigns(year)
-- Required by settings.routes.ts which uses: ON CONFLICT (year)

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_hc_unique_year'
  ) THEN
    CREATE UNIQUE INDEX idx_hc_unique_year ON hunting_campaigns(year);
  END IF;
END$$;

COMMIT;
