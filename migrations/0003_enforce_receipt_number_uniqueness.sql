-- 0003_enforce_receipt_number_uniqueness.sql
-- Enforce per-table and cross-table uniqueness for receipt_number (permits + taxes)
-- Assumes PostgreSQL.

BEGIN;

-- 1) Per-table unique indexes (nulls allowed, uniqueness when not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_permits_receipt_number_unique
  ON permits (receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_receipt_number_unique
  ON taxes (receipt_number)
  WHERE receipt_number IS NOT NULL;

-- 2) Cross-table registry to guarantee global uniqueness
CREATE TABLE IF NOT EXISTS receipt_registry (
  receipt_number text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('permit','tax')),
  source_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Helper function to raise duplicate error
CREATE OR REPLACE FUNCTION raise_receipt_conflict(existing_source text, existing_id integer)
RETURNS void AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'unique_violation',
    MESSAGE = format('N° de quittance déjà utilisé (%s id=%s).', existing_source, existing_id);
END;
$$ LANGUAGE plpgsql;

-- 3) Permits triggers
CREATE OR REPLACE FUNCTION trg_permits_receipt_registry_upsert()
RETURNS trigger AS $$
DECLARE
  _src text := 'permit';
  _existing record;
BEGIN
  IF NEW.receipt_number IS NULL THEN
    RETURN NEW;
  END IF;

  -- Try insert into registry
  INSERT INTO receipt_registry(receipt_number, source, source_id)
  VALUES (NEW.receipt_number, _src, NEW.id)
  ON CONFLICT (receipt_number) DO NOTHING;

  -- Check owner in registry
  SELECT source, source_id INTO _existing FROM receipt_registry WHERE receipt_number = NEW.receipt_number;
  IF _existing.source <> _src OR _existing.source_id <> NEW.id THEN
    PERFORM raise_receipt_conflict(_existing.source, _existing.source_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_permits_receipt_registry_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.receipt_number IS NOT NULL THEN
    DELETE FROM receipt_registry WHERE receipt_number = OLD.receipt_number AND source = 'permit' AND source_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS permits_receipt_registry_aiu ON permits;
CREATE TRIGGER permits_receipt_registry_aiu
AFTER INSERT OR UPDATE OF receipt_number ON permits
FOR EACH ROW EXECUTE FUNCTION trg_permits_receipt_registry_upsert();

DROP TRIGGER IF EXISTS permits_receipt_registry_ad ON permits;
CREATE TRIGGER permits_receipt_registry_ad
AFTER DELETE ON permits
FOR EACH ROW EXECUTE FUNCTION trg_permits_receipt_registry_delete();

-- 4) Taxes triggers
CREATE OR REPLACE FUNCTION trg_taxes_receipt_registry_upsert()
RETURNS trigger AS $$
DECLARE
  _src text := 'tax';
  _existing record;
BEGIN
  IF NEW.receipt_number IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO receipt_registry(receipt_number, source, source_id)
  VALUES (NEW.receipt_number, _src, NEW.id)
  ON CONFLICT (receipt_number) DO NOTHING;

  SELECT source, source_id INTO _existing FROM receipt_registry WHERE receipt_number = NEW.receipt_number;
  IF _existing.source <> _src OR _existing.source_id <> NEW.id THEN
    PERFORM raise_receipt_conflict(_existing.source, _existing.source_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION trg_taxes_receipt_registry_delete()
RETURNS trigger AS $$
BEGIN
  IF OLD.receipt_number IS NOT NULL THEN
    DELETE FROM receipt_registry WHERE receipt_number = OLD.receipt_number AND source = 'tax' AND source_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS taxes_receipt_registry_aiu ON taxes;
CREATE TRIGGER taxes_receipt_registry_aiu
AFTER INSERT OR UPDATE OF receipt_number ON taxes
FOR EACH ROW EXECUTE FUNCTION trg_taxes_receipt_registry_upsert();

DROP TRIGGER IF EXISTS taxes_receipt_registry_ad ON taxes;
CREATE TRIGGER taxes_receipt_registry_ad
AFTER DELETE ON taxes
FOR EACH ROW EXECUTE FUNCTION trg_taxes_receipt_registry_delete();

COMMIT;
