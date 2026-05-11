-- Add is_default and is_supervisor columns to roles_metier table
ALTER TABLE roles_metier ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE roles_metier ADD COLUMN IF NOT EXISTS is_supervisor BOOLEAN NOT NULL DEFAULT false;

-- Ensure at most one default role
CREATE UNIQUE INDEX IF NOT EXISTS roles_metier_is_default_true ON roles_metier (is_default) WHERE is_default = true;
