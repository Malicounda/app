-- Create agents table (registre national des agents)

CREATE TABLE IF NOT EXISTS agents (
  id_agent SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matricule_sol TEXT NOT NULL,
  nom TEXT,
  prenom TEXT,
  grade TEXT,
  contact JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT agents_user_id_unique UNIQUE(user_id),
  CONSTRAINT agents_matricule_sol_unique UNIQUE(matricule_sol)
);

-- Optional: backfill from existing users (agents + sub-agents)
INSERT INTO agents (user_id, matricule_sol, nom, prenom, contact)
SELECT u.id,
       COALESCE(u.matricule, 'U' || u.id::text) AS matricule_sol,
       u.last_name AS nom,
       u.first_name AS prenom,
       jsonb_strip_nulls(jsonb_build_object('telephone', u.phone, 'email', u.email)) AS contact
FROM users u
WHERE u.role IN ('agent', 'sub-agent')
  AND NOT EXISTS (SELECT 1 FROM agents a WHERE a.user_id = u.id);
