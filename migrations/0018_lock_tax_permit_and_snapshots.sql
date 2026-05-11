-- Migration 0018: lock taxes.permit_id after insert and add snapshot columns
-- 1) Add snapshot columns on taxes
ALTER TABLE IF EXISTS taxes
  ADD COLUMN IF NOT EXISTS permit_number_snapshot text,
  ADD COLUMN IF NOT EXISTS permit_category_snapshot text,
  ADD COLUMN IF NOT EXISTS hunter_name_snapshot text,
  ADD COLUMN IF NOT EXISTS issuer_service_snapshot text,
  ADD COLUMN IF NOT EXISTS permit_deleted_at timestamp;

-- 2) Trigger to prevent changing permit_id after insert
CREATE OR REPLACE FUNCTION prevent_tax_permit_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.permit_id IS DISTINCT FROM OLD.permit_id THEN
      RAISE EXCEPTION 'Modification de permit_id interdite pour une taxe existante';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE event_object_table = 'taxes' AND trigger_name = 'trg_prevent_tax_permit_change'
  ) THEN
    CREATE TRIGGER trg_prevent_tax_permit_change
    BEFORE UPDATE ON taxes
    FOR EACH ROW
    EXECUTE FUNCTION prevent_tax_permit_change();
  END IF;
END$$;

-- 3) Trigger on permits delete to mark related taxes as deleted reference date
CREATE OR REPLACE FUNCTION mark_tax_permit_deleted_at()
RETURNS trigger AS $$
BEGIN
  UPDATE taxes
    SET permit_deleted_at = NOW()
  WHERE permit_id = OLD.id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE event_object_table = 'permits' AND trigger_name = 'trg_mark_tax_permit_deleted_at'
  ) THEN
    CREATE TRIGGER trg_mark_tax_permit_deleted_at
    AFTER DELETE ON permits
    FOR EACH ROW
    EXECUTE FUNCTION mark_tax_permit_deleted_at();
  END IF;
END$$;
