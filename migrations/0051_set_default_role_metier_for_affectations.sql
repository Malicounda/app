-- Définir le rôle métier par défaut (CHEF_DIVISION) pour les affectations existantes
-- Et nettoyer l'ancien champ texte role_metier qui contenait des valeurs techniques (agent/sub-agent)

BEGIN;

-- 1) S'assurer que CHEF_DIVISION existe
INSERT INTO roles_metier (code, label_fr, is_active)
VALUES ('CHEF_DIVISION', 'Chef de division', TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2) Mettre role_metier_id sur CHEF_DIVISION pour toutes les affectations existantes
UPDATE affectations a
SET role_metier_id = rm.id
FROM roles_metier rm
WHERE rm.code = 'CHEF_DIVISION'
  AND a.role_metier_id IS NULL;

COMMIT;
