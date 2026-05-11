-- Référentiel des rôles métier + liaison avec affectations

BEGIN;

-- 1) Table roles_metier
CREATE TABLE IF NOT EXISTS roles_metier (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT roles_metier_code_unique UNIQUE(code)
);

-- 2) Seed minimal
INSERT INTO roles_metier (code, label_fr, is_active)
VALUES ('CHEF_DIVISION', 'Chef de division', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 3) Ajouter role_metier_id dans affectations (sans casser role_metier existant)
ALTER TABLE IF EXISTS affectations
  ADD COLUMN IF NOT EXISTS role_metier_id INTEGER NULL REFERENCES roles_metier(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_affectations_role_metier_id ON affectations(role_metier_id);

-- 4) Trigger updated_at pour roles_metier
CREATE OR REPLACE FUNCTION update_roles_metier_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roles_metier_updated_at ON roles_metier;
CREATE TRIGGER trg_roles_metier_updated_at
  BEFORE UPDATE ON roles_metier
  FOR EACH ROW
  EXECUTE FUNCTION update_roles_metier_updated_at();

COMMIT;
