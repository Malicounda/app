-- =============================================================
-- SCRIPT DE SYNCHRONISATION SCHEMA DRIZZLE <-> BASE DE DONNÉES
-- Exécuté une seule fois pour aligner la DB sur schema.ts
-- =============================================================

-- ========================
-- TABLE: users
-- ========================
-- created_by_user_id déjà ajouté précédemment, mais on s'assure
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_user_id integer;

-- ========================
-- TABLE: roles_metier
-- ========================
-- Colonnes manquantes: is_default, is_supervisor
ALTER TABLE roles_metier ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE roles_metier ADD COLUMN IF NOT EXISTS is_supervisor boolean NOT NULL DEFAULT false;

-- ========================
-- TABLE: pepinieres
-- ========================
-- Colonne manquante: created_by
ALTER TABLE pepinieres ADD COLUMN IF NOT EXISTS created_by integer;

-- ========================
-- TABLE: hunting_guides
-- ========================
-- Colonne manquante: zone_id
ALTER TABLE hunting_guides ADD COLUMN IF NOT EXISTS zone_id integer;

-- ========================
-- TABLE: taxe_especes
-- ========================
-- La DB a: id, created_at, updated_at, prix_xof, taxable, espece_id
-- Le schéma attend: id, species_id, name, price, code, is_active, created_at, updated_at
-- On ajoute les colonnes manquantes du schéma sans casser les existantes
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS species_id text;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS price integer;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS code text;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ========================
-- TABLE: guardians (peut ne pas exister)
-- ========================
CREATE TABLE IF NOT EXISTS guardians (
  id serial PRIMARY KEY,
  last_name text NOT NULL,
  first_name text NOT NULL,
  id_number text NOT NULL UNIQUE,
  relationship text NOT NULL,
  phone text,
  address text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ========================
-- TABLE: hunted_species (peut ne pas exister)
-- ========================
CREATE TABLE IF NOT EXISTS hunted_species (
  id serial PRIMARY KEY,
  report_id integer NOT NULL,
  species_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  created_at timestamp NOT NULL DEFAULT now()
);

-- ========================
-- TABLE: hunting_reports (peut ne pas exister)
-- ========================
CREATE TABLE IF NOT EXISTS hunting_reports (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  hunter_id integer NOT NULL,
  permit_id integer NOT NULL,
  report_date date NOT NULL,
  location text NOT NULL,
  latitude numeric,
  longitude numeric,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

-- ========================
-- ENUM: niveau_hierarchique (si manquant)
-- ========================
DO $$ BEGIN
  CREATE TYPE niveau_hierarchique AS ENUM ('NATIONAL', 'REGIONAL', 'SECTEUR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ========================
-- Vérification finale
-- ========================
SELECT 'Synchronisation terminée avec succès' AS status;
