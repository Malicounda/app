-- 0029_cleanup_hunting_campaigns_duplicates.sql
-- Remove duplicate rows by year in hunting_campaigns and then ensure unique index on (year)

BEGIN;

-- 1) Delete duplicates: keep the most recently updated (fallback to highest id)
WITH ranked AS (
  SELECT id, year,
         ROW_NUMBER() OVER (
           PARTITION BY year
           ORDER BY updated_at DESC NULLS LAST, id DESC
         ) AS rn
  FROM hunting_campaigns
), to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM hunting_campaigns hc
USING to_delete d
WHERE hc.id = d.id;

-- 2) Create the unique index if it doesn't exist
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
