-- Vue pour harmoniser l'affichage des rôles agents (libellés métier)
-- Sans modifier les valeurs réelles en base (enum user_role)

CREATE OR REPLACE VIEW public.users_agents_labels AS
SELECT
  u.id,
  u.username,
  u.email,
  u.first_name,
  u.last_name,
  u.phone,
  u.matricule,
  u.service_location,
  u.region,
  u.departement,
  u.role,
  CASE
    WHEN u.role = 'agent' THEN 'AGENT_REGIONAL'
    WHEN u.role = 'sub-agent' THEN 'AGENT_SECTEUR'
    ELSE upper(u.role::text)
  END AS role_metier_code,
  CASE
    WHEN u.role = 'agent' THEN 'Agent régional'
    WHEN u.role = 'sub-agent' THEN 'Agent secteur'
    WHEN u.role = 'admin' THEN 'Administrateur'
    WHEN u.role = 'hunter' THEN 'Chasseur'
    WHEN u.role = 'hunting-guide' THEN 'Guide de chasse'
    ELSE u.role::text
  END AS role_metier_label,
  u.is_active,
  u.active,
  u.is_suspended,
  u.created_at,
  u.last_login,
  u.updated_at,
  u.hunter_id,
  u.agent_lat,
  u.agent_lon
FROM public.users u;

-- Commentaire pour documentation
COMMENT ON VIEW public.users_agents_labels IS 'Vue exposant les libellés harmonisés des rôles agents (AGENT_REGIONAL, AGENT_SECTEUR) sans modifier les valeurs techniques du enum user_role.';
