BEGIN;

-- Bloquer la suppression des comptes protégés (admins + super admins)
CREATE OR REPLACE FUNCTION prevent_delete_protected_users()
RETURNS TRIGGER AS $$
BEGIN
  -- Interdire la suppression si l'utilisateur est super admin (présent dans super_admins)
  IF EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = OLD.id) THEN
    RAISE EXCEPTION 'Suppression interdite: cet utilisateur est un Super Admin';
  END IF;

  -- Interdire la suppression si l'utilisateur est un admin (role=admin)
  IF OLD.role = 'admin' THEN
    RAISE EXCEPTION 'Suppression interdite: cet utilisateur est un Admin';
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_delete_protected_users ON users;
CREATE TRIGGER trg_prevent_delete_protected_users
BEFORE DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_delete_protected_users();

COMMIT;
