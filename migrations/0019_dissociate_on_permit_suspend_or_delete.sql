-- Migration 0019: dissociate guide-hunter on permit suspension or deletion

-- Helper function to deactivate associations for a hunter
CREATE OR REPLACE FUNCTION deactivate_associations_for_hunter(h_id integer)
RETURNS void AS $$
BEGIN
  UPDATE guide_hunter_associations
  SET is_active = false, dissociated_at = NOW()
  WHERE hunter_id = h_id AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Trigger: on permit status update to suspended
CREATE OR REPLACE FUNCTION trg_permit_status_suspended()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'suspended' AND COALESCE(OLD.status, '') <> 'suspended' THEN
      PERFORM deactivate_associations_for_hunter(NEW.hunter_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'permits' AND trigger_name = 'after_permit_update_status_suspended'
  ) THEN
    CREATE TRIGGER after_permit_update_status_suspended
    AFTER UPDATE ON permits
    FOR EACH ROW
    EXECUTE FUNCTION trg_permit_status_suspended();
  END IF;
END$$;

-- Trigger: on permit delete
CREATE OR REPLACE FUNCTION trg_permit_deleted_dissociate()
RETURNS trigger AS $$
BEGIN
  PERFORM deactivate_associations_for_hunter(OLD.hunter_id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'permits' AND trigger_name = 'after_permit_delete_dissociate'
  ) THEN
    CREATE TRIGGER after_permit_delete_dissociate
    AFTER DELETE ON permits
    FOR EACH ROW
    EXECUTE FUNCTION trg_permit_deleted_dissociate();
  END IF;
END$$;
