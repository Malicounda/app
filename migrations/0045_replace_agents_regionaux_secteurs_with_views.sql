-- Remplacer les tables legacy agents_regionaux / agents_secteurs par des VIEWS basées sur users
-- Objectif: arrêter la synchro via triggers et éviter les incohérences liées au schéma dénormalisé.

BEGIN;

-- 1) Supprimer la synchro par triggers (si elle existe)
DROP TRIGGER IF EXISTS trg_sync_agent_shadow_tables_aiu ON public.users;
DROP TRIGGER IF EXISTS trg_sync_agent_shadow_tables_ad ON public.users;
DROP FUNCTION IF EXISTS public.sync_agent_shadow_tables();

-- 2) Renommer les tables physiques si elles existent (pour libérer les noms pour les vues)
DO $$
BEGIN
  -- agents_regionaux
  IF to_regclass('public.agents_regionaux') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'agents_regionaux' AND c.relkind = 'r'
     )
  THEN
    IF to_regclass('public.agents_regionaux_legacy') IS NULL THEN
      EXECUTE 'ALTER TABLE public.agents_regionaux RENAME TO agents_regionaux_legacy';
    END IF;
  END IF;

  -- agents_secteurs
  IF to_regclass('public.agents_secteurs') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = 'agents_secteurs' AND c.relkind = 'r'
     )
  THEN
    IF to_regclass('public.agents_secteurs_legacy') IS NULL THEN
      EXECUTE 'ALTER TABLE public.agents_secteurs RENAME TO agents_secteurs_legacy';
    END IF;
  END IF;
END
$$;

-- 3) (Re)créer les vues
DROP VIEW IF EXISTS public.agents_regionaux;
DROP VIEW IF EXISTS public.agents_secteurs;

CREATE VIEW public.agents_regionaux AS
SELECT
  u.id AS user_id,
  u.region AS region,
  COALESCE(u.is_active, true) AS is_active,
  u.created_at AS created_at,
  u.updated_at AS updated_at
FROM public.users u
WHERE u.role = 'agent'
  AND u.region IS NOT NULL;

CREATE VIEW public.agents_secteurs AS
SELECT
  u.id AS user_id,
  u.region AS region,
  u.departement AS secteur,
  COALESCE(u.is_active, true) AS is_active,
  u.created_at AS created_at,
  u.updated_at AS updated_at
FROM public.users u
WHERE u.role = 'sub-agent'
  AND u.region IS NOT NULL
  AND u.departement IS NOT NULL;

COMMIT;
