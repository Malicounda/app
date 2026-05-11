-- Création d'un superadmin sans modifier l'enum users.role
-- Username: 00491
-- Password: 1991A (stocké en clair au seed; sera migré en bcrypt au premier login)

BEGIN;

CREATE TABLE IF NOT EXISTS super_admins (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Créer l'utilisateur s'il n'existe pas déjà
INSERT INTO users (username, email, password, role, is_active, active, is_suspended)
VALUES ('00491', '00491@scodipp.local', '1991A', 'admin', TRUE, TRUE, FALSE)
ON CONFLICT (username) DO NOTHING;

-- Inscrire l'utilisateur en tant que superadmin
INSERT INTO super_admins (user_id)
SELECT id FROM users WHERE username = '00491'
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
