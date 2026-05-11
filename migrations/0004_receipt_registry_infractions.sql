-- 0004_receipt_registry_infractions.sql
-- Extend global receipt registry to include infractions
-- and enforce uniqueness for infractions.numero_quittance as well.

BEGIN;

-- 1) Allow 'infraction' in registry source
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.check_constraints cc
    JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'receipt_registry'
      AND cc.check_clause LIKE '%source IN (''permit'',''tax'')%'
  ) THEN
    -- Either already updated or no constraint to change
    NULL;
  ELSE
    ALTER TABLE receipt_registry
      DROP CONSTRAINT IF EXISTS receipt_registry_source_check;
    ALTER TABLE receipt_registry
      ADD CONSTRAINT receipt_registry_source_check
      CHECK (source IN ('permit','tax','infraction'));
  END IF;
END $$;

-- 2) Unique index on infractions.numero_quittance when not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_infractions_numero_quittance_unique
  ON infractions (numero_quittance)
  WHERE numero_quittance IS NOT NULL;

-- 3) Triggers to upsert into receipt_registry for infractions
CREATE OR REPLACE FUNCTION trg_infractions_receipt_registry_upsert()
RETURNS trigger AS $$
DECLARE
  _src text := 'infraction';
  _existing record;
BEGIN
  IF NEW.numero_quittance IS NULL THEN
    RETURN NEW;
  END IF;

  -- insert if absent
  INSERT INTO receipt_registry(receipt_number, source, source_id)
  VALUES (NEW.numero_quittance, _src, NEW.id)
  ON CONFLICT (receipt_number) DO NOTHING;

  -- verify ownership
  SELECT source, source_id INTO _existing FROM receipt_registry WHERE receipt_number = NEW.numero_quittance;
  IF _existing.source <> _src OR _existing.source_id <> NEW.id THEN
    PERFORM raise_receipt_conflict(_existing.source, _existing.source_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_infractions_receipt_registry_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.numero_quittance IS NOT NULL THEN
    DELETE FROM receipt_registry WHERE receipt_number = OLD.numero_quittance AND source = 'infraction' AND source_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS infractions_receipt_registry_aiu ON infractions;
CREATE TRIGGER infractions_receipt_registry_aiu
AFTER INSERT OR UPDATE OF numero_quittance ON infractions
FOR EACH ROW EXECUTE FUNCTION trg_infractions_receipt_registry_upsert();

DROP TRIGGER IF EXISTS infractions_receipt_registry_ad ON infractions;
CREATE TRIGGER infractions_receipt_registry_ad
AFTER DELETE ON infractions
FOR EACH ROW EXECUTE FUNCTION trg_infractions_receipt_registry_delete();

COMMIT;
