BEGIN;

-- Bloquer certaines mises à jour sur les comptes protégés (admins + super admins)
-- Objectif: empêcher la désactivation/suspension et le changement de rôle.
CREATE OR REPLACE FUNCTION prevent_update_protected_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Comptes protégés: super admin (présent dans super_admins) OU role=admin
  IF EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = OLD.id) OR OLD.role = 'admin' THEN

    -- Interdire le changement de rôle
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Mise à jour interdite: changement de rôle interdit pour un compte protégé';
    END IF;

    -- Interdire la désactivation / suspension
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Mise à jour interdite: désactivation interdite pour un compte protégé';
    END IF;

    IF NEW.active IS DISTINCT FROM OLD.active THEN
      RAISE EXCEPTION 'Mise à jour interdite: désactivation (active) interdite pour un compte protégé';
    END IF;

    IF NEW.is_suspended IS DISTINCT FROM OLD.is_suspended THEN
      RAISE EXCEPTION 'Mise à jour interdite: suspension interdite pour un compte protégé';
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_update_protected_users ON users;
CREATE TRIGGER trg_prevent_update_protected_users
BEFORE UPDATE OF role, is_active, active, is_suspended ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_update_protected_users();

COMMIT;
