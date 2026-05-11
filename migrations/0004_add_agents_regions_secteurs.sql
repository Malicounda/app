-- Création de la table pour les Agents régions (Agents des Eaux et Forêts)
CREATE TABLE "public"."regional_agents" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "region" text NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "regional_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "regional_agents_user_id_unique" UNIQUE("user_id")
);

-- Création de la table pour les Agents secteurs
CREATE TABLE "public"."sector_agents" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "region" text NOT NULL,
    "secteur" text NOT NULL,
    "regional_agent_id" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "sector_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE,
    CONSTRAINT "sector_agents_regional_agent_id_fkey" FOREIGN KEY ("regional_agent_id") REFERENCES "public"."regional_agents"("id") ON DELETE SET NULL,
    CONSTRAINT "sector_agents_user_id_unique" UNIQUE("user_id")
);

-- Ajout d'un champ dans la table users pour identifier les types d'agents
ALTER TABLE "public"."users" ADD COLUMN "agent_type" text CHECK ("agent_type" IN ('region', 'secteur', NULL));

-- Vue pour faciliter la récupération des informations des Agents régions (Agents des Eaux et Forêts)
CREATE OR REPLACE VIEW "public"."view_regional_agents" AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.phone,
    u.matricule,
    'IREF' AS service_location,
    ra.region,
    u.role,
    ra.is_active,
    ra.id AS regional_agent_id,
    u.created_at
FROM 
    "public"."users" u
JOIN 
    "public"."regional_agents" ra ON u.id = ra.user_id
WHERE 
    u.role = 'agent' AND u.agent_type = 'region';

-- Vue pour faciliter la récupération des informations des Agents secteurs
CREATE OR REPLACE VIEW "public"."view_sector_agents" AS
SELECT 
    u.id AS user_id,
    u.username,
    u.email,
    u.first_name,
    u.last_name,
    u.phone,
    u.matricule,
    sa.secteur AS service_location,
    sa.region,
    sa.secteur,
    u.role,
    sa.is_active,
    sa.id AS sector_agent_id,
    sa.regional_agent_id,
    u.created_at
FROM 
    "public"."users" u
JOIN 
    "public"."sector_agents" sa ON u.id = sa.user_id
WHERE 
    u.role = 'sub-agent' AND u.agent_type = 'secteur';

-- Procédure pour créer un Agent des Eaux et Forêts (régional)
CREATE OR REPLACE FUNCTION create_regional_agent(
    p_username text,
    p_password text,
    p_email text,
    p_first_name text,
    p_last_name text,
    p_phone text,
    p_matricule text,
    p_region text
) RETURNS integer AS $$
DECLARE
    v_user_id integer;
BEGIN
    -- Insérer dans la table users d'abord
    INSERT INTO "public"."users" (
        username, password, email, first_name, last_name, 
        phone, matricule, service_location, region, role, agent_type
    ) VALUES (
        p_username, p_password, p_email, p_first_name, p_last_name,
        p_phone, p_matricule, 'IREF', p_region, 'agent', 'region'
    ) RETURNING id INTO v_user_id;
    
    -- Puis insérer dans la table regional_agents
    INSERT INTO "public"."regional_agents" (
        user_id, region
    ) VALUES (
        v_user_id, p_region
    );
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- Procédure pour créer un Agent secteur
CREATE OR REPLACE FUNCTION create_sector_agent(
    p_username text,
    p_password text,
    p_email text,
    p_first_name text,
    p_last_name text,
    p_phone text,
    p_matricule text,
    p_region text,
    p_secteur text,
    p_regional_agent_id integer
) RETURNS integer AS $$
DECLARE
    v_user_id integer;
BEGIN
    -- Insérer dans la table users d'abord
    INSERT INTO "public"."users" (
        username, password, email, first_name, last_name, 
        phone, matricule, service_location, region, role, agent_type
    ) VALUES (
        p_username, p_password, p_email, p_first_name, p_last_name,
        p_phone, p_matricule, p_secteur, p_region, 'sub-agent', 'secteur'
    ) RETURNING id INTO v_user_id;
    
    -- Puis insérer dans la table sector_agents
    INSERT INTO "public"."sector_agents" (
        user_id, region, secteur, regional_agent_id
    ) VALUES (
        v_user_id, p_region, p_secteur, p_regional_agent_id
    );
    
    RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;
