-- Drop the unique constraint that limits is_default=true to a single row
-- Now multiple roles can be marked as default
DROP INDEX IF EXISTS roles_metier_is_default_true;
