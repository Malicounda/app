-- Ajouter role_metier_id au registre national des agents

BEGIN;

-- 1) Ajouter la colonne (FK) sur agents
ALTER TABLE IF EXISTS agents
  ADD COLUMN IF NOT EXISTS role_metier_id INTEGER NULL REFERENCES roles_metier(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agents_role_metier_id ON agents(role_metier_id);

-- 2) Backfill: si une affectation porte role_metier_id, l'utiliser comme référence nationale
UPDATE agents a
SET role_metier_id = sub.role_metier_id
FROM (
  SELECT agent_id, max(role_metier_id) AS role_metier_id
  FROM affectations
  WHERE role_metier_id IS NOT NULL
  GROUP BY agent_id
) sub
WHERE a.id_agent = sub.agent_id
  AND a.role_metier_id IS NULL;

-- 3) Optionnel: si toujours NULL, mettre CHEF_DIVISION (si existe)
UPDATE agents a
SET role_metier_id = rm.id
FROM roles_metier rm
WHERE a.role_metier_id IS NULL
  AND rm.code = 'CHEF_DIVISION';

COMMIT;
