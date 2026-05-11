-- 0037_drop_holde_tarifs_permis.sql
-- Objet: supprimer la table orpheline holde_tarifs_permis (non utilisée)

BEGIN;

DROP TABLE IF EXISTS public."holde_tarifs_permis" CASCADE;

COMMIT;
