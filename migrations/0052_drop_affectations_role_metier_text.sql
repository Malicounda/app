-- Suppression de la colonne legacy role_metier (TEXT) dans affectations
-- Le rôle métier est désormais géré via affectations.role_metier_id (FK vers roles_metier)

BEGIN;

ALTER TABLE IF EXISTS affectations
  DROP COLUMN IF EXISTS role_metier;

COMMIT;
