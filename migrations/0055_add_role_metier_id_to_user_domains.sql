ALTER TABLE user_domains
ADD COLUMN IF NOT EXISTS role_metier_id INTEGER REFERENCES roles_metier(id);

CREATE INDEX IF NOT EXISTS idx_user_domains_role_metier_id ON user_domains(role_metier_id);
