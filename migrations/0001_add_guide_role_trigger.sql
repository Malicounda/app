-- Migration: Add triggers for hunting_guides role validation
-- This ensures that users associated with hunting guides have the correct role

-- Fonction de déclenchement qui vérifie le rôle
CREATE OR REPLACE FUNCTION check_guide_role()
RETURNS TRIGGER AS $$
BEGIN
    -- Vérifier si un user_id est fourni
    IF NEW.user_id IS NOT NULL THEN
        -- Vérifier si l'utilisateur a le bon rôle
        IF NOT EXISTS (
            SELECT 1 
            FROM users 
            WHERE id = NEW.user_id AND role = 'hunting-guide'
        ) THEN
            RAISE EXCEPTION 'L''utilisateur associé doit avoir le rôle "hunting-guide"';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Création du trigger
CREATE TRIGGER tr_check_guide_role
BEFORE INSERT OR UPDATE ON hunting_guides
FOR EACH ROW
EXECUTE FUNCTION check_guide_role();

-- Fonction pour mettre à jour le rôle si nécessaire
CREATE OR REPLACE FUNCTION update_user_to_guide()
RETURNS TRIGGER AS $$
BEGIN
    -- Mettre à jour le rôle de l'utilisateur vers 'hunting-guide' si ce n'est pas déjà le cas
    IF NEW.user_id IS NOT NULL THEN
        UPDATE users 
        SET role = 'hunting-guide'
        WHERE id = NEW.user_id 
        AND role != 'hunting-guide';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Création du second trigger pour la mise à jour automatique du rôle
CREATE TRIGGER tr_update_user_to_guide
BEFORE INSERT OR UPDATE ON hunting_guides
FOR EACH ROW
EXECUTE FUNCTION update_user_to_guide();

-- Commentaire explicatif
COMMENT ON TRIGGER tr_check_guide_role ON hunting_guides IS 'Vérifie que l''utilisateur associé a bien le rôle hunting-guide';
COMMENT ON TRIGGER tr_update_user_to_guide ON hunting_guides IS 'Met automatiquement à jour le rôle de l''utilisateur vers hunting-guide si nécessaire';
