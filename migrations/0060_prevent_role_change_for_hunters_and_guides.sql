BEGIN;

CREATE OR REPLACE FUNCTION prevent_role_change_for_hunters_and_guides()
RETURNS TRIGGER AS $$
BEGIN
  -- Interdire tout changement de rôle pour les chasseurs et guides de chasse
  IF OLD.role IN ('hunter', 'hunting-guide') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Mise à jour interdite: changement de rôle interdit pour les chasseurs et guides de chasse';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_role_change_for_hunters_and_guides ON users;
CREATE TRIGGER trg_prevent_role_change_for_hunters_and_guides
BEFORE UPDATE OF role ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_role_change_for_hunters_and_guides();

COMMIT;
