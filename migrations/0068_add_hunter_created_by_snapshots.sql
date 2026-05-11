ALTER TABLE "hunters"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" integer NULL,
  ADD COLUMN IF NOT EXISTS "created_by_role_snapshot" text NULL,
  ADD COLUMN IF NOT EXISTS "created_by_region_snapshot" text NULL,
  ADD COLUMN IF NOT EXISTS "created_by_departement_snapshot" text NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.conname = 'hunters_created_by_user_id_fkey'
      AND t.relname = 'hunters'
  ) THEN
    ALTER TABLE "hunters"
      ADD CONSTRAINT "hunters_created_by_user_id_fkey"
      FOREIGN KEY ("created_by_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_hunters_created_by_user_id" ON "hunters" ("created_by_user_id");
--> statement-breakpoint

WITH latest_create AS (
  SELECT DISTINCT ON (hi.entity_id)
    hi.entity_id AS hunter_id,
    hi.user_id   AS creator_user_id
  FROM history hi
  WHERE hi.entity_type = 'hunter'
    AND hi.operation = 'create_hunter'
    AND hi.user_id IS NOT NULL
  ORDER BY hi.entity_id, hi.created_at DESC
)
UPDATE hunters h
SET
  created_by_user_id = u.id,
  created_by_role_snapshot = u.role,
  created_by_region_snapshot = u.region,
  created_by_departement_snapshot = u.departement
FROM latest_create lc
LEFT JOIN users u ON u.id = lc.creator_user_id
WHERE h.id = lc.hunter_id
  AND h.created_by_user_id IS NULL;
