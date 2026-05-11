-- Migration: Création d'une vue pour les agents régionaux et secteurs
-- Cette vue permet de filtrer les utilisateurs par rôle (agent ou sub-agent)

-- Vue pour les agents régionaux (rôle 'agent')
CREATE OR REPLACE VIEW regional_agents_view AS
SELECT 
    id,
    username,
    email,
    first_name,
    last_name,
    phone,
    matricule,
    service_location,
    region,
    zone,
    role,
    is_active,
    is_suspended,
    created_at
FROM 
    users
WHERE 
    role = 'agent'
ORDER BY
    region, last_name, first_name;

-- Vue pour les agents secteurs (rôle 'sub-agent')
CREATE OR REPLACE VIEW sector_agents_view AS
SELECT 
    id,
    username,
    email,
    first_name,
    last_name,
    phone,
    matricule,
    service_location,
    region,
    zone,
    role,
    is_active,
    is_suspended,
    created_at
FROM 
    users
WHERE 
    role = 'sub-agent'
ORDER BY
    region, zone, last_name, first_name;

-- Vue combinée pour tous les agents (régionaux et secteurs)
CREATE OR REPLACE VIEW all_agents_view AS
SELECT 
    id,
    username,
    email,
    first_name,
    last_name,
    phone,
    matricule,
    service_location,
    region,
    zone,
    role,
    is_active,
    is_suspended,
    created_at,
    CASE 
        WHEN role = 'agent' THEN 'regional'
        WHEN role = 'sub-agent' THEN 'sector'
        ELSE 'unknown'
    END as agent_type
FROM 
    users
WHERE 
    role IN ('agent', 'sub-agent')
ORDER BY
    agent_type, region, zone, last_name, first_name;

-- Commentaires sur les vues
COMMENT ON VIEW regional_agents_view IS 'Vue pour accéder aux agents régionaux (rôle agent)';
COMMENT ON VIEW sector_agents_view IS 'Vue pour accéder aux agents secteurs (rôle sub-agent)';
COMMENT ON VIEW all_agents_view IS 'Vue combinée pour tous les agents (régionaux et secteurs)';
