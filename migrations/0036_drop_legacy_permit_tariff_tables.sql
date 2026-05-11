-- 0036_drop_legacy_permit_tariff_tables.sql
-- Objet: supprimer les anciennes tables liées aux catégories et tarifs de permis
-- Tables visées: categories_tarifs_permis, categories_utilisateur, tarifs_permis, types_permis
-- Stratégie: supprimer d'abord les contraintes de clés étrangères connues, puis DROP TABLE IF EXISTS ... CASCADE

BEGIN;

-- 1) Supprimer les contraintes FK si elles existent (sécurisé avec IF EXISTS)
-- Table: tarifs_permis
ALTER TABLE IF EXISTS public."tarifs_permis" DROP CONSTRAINT IF EXISTS tarifs_permis_categorie_utilisateur_id_fkey1;
ALTER TABLE IF EXISTS public."tarifs_permis" DROP CONSTRAINT IF EXISTS tarifs_permis_type_permis_id_fkey1;

-- 2) Supprimer les tables de liaison (tarifs) en premier
DROP TABLE IF EXISTS public."tarifs_permis" CASCADE;

-- 3) Supprimer la table potentielle mal nommée si elle a existé dans un ancien script
DROP TABLE IF EXISTS public."categories_tarifs_permis" CASCADE;

-- 4) Supprimer les tables référencées (catégories et types)
DROP TABLE IF EXISTS public."categories_utilisateur" CASCADE;
DROP TABLE IF EXISTS public."types_permis" CASCADE;

COMMIT;
