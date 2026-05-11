-- Synchroniser automatiquement la table agents (registre national)
-- Règle: créer/mettre à jour une ligne agents UNIQUEMENT si users.matricule est renseigné.

CREATE OR REPLACE FUNCTION public.sync_agents_registry()
RETURNS trigger AS $$
DECLARE
  v_matricule text;
BEGIN
  -- Si la table n'existe pas dans cette base, ne rien faire
  IF to_regclass('public.agents') IS NULL THEN
    RETURN NEW;
  END IF;

  -- Sur suppression, nettoyer
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.agents WHERE user_id = OLD.id;
    RETURN OLD;
  END IF;

  v_matricule := nullif(trim(coalesce(NEW.matricule, '')), '');

  -- Si pas de matricule => s'assurer qu'il n'y a pas de ligne dans agents
  IF v_matricule IS NULL THEN
    DELETE FROM public.agents WHERE user_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Si le matricule existe, upsert
  INSERT INTO public.agents (user_id, matricule_sol, nom, prenom, contact)
  VALUES (
    NEW.id,
    upper(v_matricule),
    nullif(trim(coalesce(NEW.last_name, '')), ''),
    nullif(trim(coalesce(NEW.first_name, '')), ''),
    jsonb_build_object(
      'telephone', nullif(trim(coalesce(NEW.phone, '')), ''),
      'email', nullif(trim(coalesce(NEW.email, '')), '')
    )
  )
  ON CONFLICT (user_id) DO UPDATE
    SET matricule_sol = EXCLUDED.matricule_sol,
        nom = EXCLUDED.nom,
        prenom = EXCLUDED.prenom,
        contact = EXCLUDED.contact;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_agents_registry_aiu ON public.users;
DROP TRIGGER IF EXISTS trg_sync_agents_registry_ad ON public.users;

CREATE TRIGGER trg_sync_agents_registry_aiu
AFTER INSERT OR UPDATE OF matricule, first_name, last_name, phone, email
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_agents_registry();

CREATE TRIGGER trg_sync_agents_registry_ad
AFTER DELETE
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_agents_registry();
