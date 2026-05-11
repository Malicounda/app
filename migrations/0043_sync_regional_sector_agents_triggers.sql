-- Synchroniser automatiquement agents_regionaux / agents_secteurs à partir de users

-- Fonction de synchronisation
CREATE OR REPLACE FUNCTION public.sync_agent_shadow_tables()
RETURNS trigger AS $$
BEGIN
  -- Si les tables n'existent pas dans cette base, ne rien faire
  IF to_regclass('public.agents_regionaux') IS NULL AND to_regclass('public.agents_secteurs') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sur suppression, nettoyer les tables dépendantes
  IF TG_OP = 'DELETE' THEN
    IF to_regclass('public.agents_regionaux') IS NOT NULL THEN
      DELETE FROM public.agents_regionaux WHERE user_id = OLD.id;
    END IF;
    IF to_regclass('public.agents_secteurs') IS NOT NULL THEN
      DELETE FROM public.agents_secteurs WHERE user_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- Insertion / mise à jour
  IF NEW.role = 'agent' THEN
    -- Agent régional
    IF to_regclass('public.agents_regionaux') IS NOT NULL AND NEW.region IS NOT NULL THEN
      INSERT INTO public.agents_regionaux (user_id, region, is_active)
      VALUES (NEW.id, NEW.region, COALESCE(NEW.is_active, true))
      ON CONFLICT (user_id) DO UPDATE
        SET region = EXCLUDED.region,
            is_active = EXCLUDED.is_active,
            updated_at = now();
    END IF;

    -- S'assurer qu'il n'est pas dans sector_agents
    IF to_regclass('public.agents_secteurs') IS NOT NULL THEN
      DELETE FROM public.agents_secteurs WHERE user_id = NEW.id;
    END IF;

  ELSIF NEW.role = 'sub-agent' THEN
    -- Agent secteur
    IF to_regclass('public.agents_secteurs') IS NOT NULL AND NEW.region IS NOT NULL AND NEW.departement IS NOT NULL THEN
      INSERT INTO public.agents_secteurs (user_id, region, secteur, is_active)
      VALUES (NEW.id, NEW.region, NEW.departement, COALESCE(NEW.is_active, true))
      ON CONFLICT (user_id) DO UPDATE
        SET region = EXCLUDED.region,
            secteur = EXCLUDED.secteur,
            is_active = EXCLUDED.is_active,
            updated_at = now();
    END IF;

    -- S'assurer qu'il n'est pas dans regional_agents
    IF to_regclass('public.agents_regionaux') IS NOT NULL THEN
      DELETE FROM public.agents_regionaux WHERE user_id = NEW.id;
    END IF;

  ELSE
    -- Tout autre rôle: retirer des tables shadow
    IF to_regclass('public.agents_regionaux') IS NOT NULL THEN
      DELETE FROM public.agents_regionaux WHERE user_id = NEW.id;
    END IF;
    IF to_regclass('public.agents_secteurs') IS NOT NULL THEN
      DELETE FROM public.agents_secteurs WHERE user_id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers: drop puis recreate pour idempotence
DROP TRIGGER IF EXISTS trg_sync_agent_shadow_tables_aiu ON public.users;
DROP TRIGGER IF EXISTS trg_sync_agent_shadow_tables_ad ON public.users;

CREATE TRIGGER trg_sync_agent_shadow_tables_aiu
AFTER INSERT OR UPDATE OF role, region, departement, is_active
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_shadow_tables();

CREATE TRIGGER trg_sync_agent_shadow_tables_ad
AFTER DELETE
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_shadow_tables();
