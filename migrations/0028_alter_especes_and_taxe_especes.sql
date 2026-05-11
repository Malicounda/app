-- 0028_alter_especes_and_taxe_especes.sql
-- Objectif: remplacer la table especes par la nouvelle structure et retirer la colonne 'code' de taxe_especes
-- Compatible SQLite (pattern: rename -> recreate -> copy -> drop)

BEGIN TRANSACTION;

-- 1) Remplacer la table 'especes' existante par la nouvelle structure
-- Renommer l'ancienne si elle existe
DROP TABLE IF EXISTS especes_new;
CREATE TABLE IF NOT EXISTS especes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  nom_scientifique TEXT,
  nom_anglais TEXT,
  code TEXT,
  categorie TEXT NOT NULL,
  statut_protection TEXT NOT NULL DEFAULT 'Aucun' CHECK (statut_protection IN ('Aucun','Partiel','Intégral')),
  chassable BOOLEAN NOT NULL DEFAULT 1,
  quota INTEGER,
  cites_annexe TEXT CHECK (cites_annexe IN ('I','II','III','Non CITES')),
  photo_url TEXT,
  photo_data TEXT,
  photo_mime TEXT,
  photo_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Si l'ancienne table existe, copier les données (mapping des colonnes)
-- Tentative de copie en gérant les colonnes manquantes/anciennes
INSERT INTO especes_new (id, nom, nom_scientifique, nom_anglais, code, categorie, statut_protection, chassable, quota, cites_annexe, photo_url, photo_data, photo_mime, photo_name, is_active, created_at, updated_at)
SELECT 
  id,
  nom,
  COALESCE(nom_scientifique, NULL),
  COALESCE(nom_anglais, NULL),
  COALESCE(code, NULL),
  categorie,
  -- Mapping d'anciens statuts si présents
  CASE LOWER(COALESCE(statut_protection, 'Aucun'))
    WHEN 'non_protege' THEN 'Aucun'
    WHEN 'non_protégé' THEN 'Aucun'
    WHEN 'protege_partiel' THEN 'Partiel'
    WHEN 'protégé_partiel' THEN 'Partiel'
    WHEN 'protege_integral' THEN 'Intégral'
    WHEN 'protégé_intégral' THEN 'Intégral'
    ELSE statut_protection
  END,
  COALESCE(chassable, 1),
  NULL AS quota,
  NULL AS cites_annexe,
  COALESCE(photo_url, NULL),
  COALESCE(photo_data, NULL),
  COALESCE(photo_mime, NULL),
  COALESCE(photo_name, NULL),
  COALESCE(is_active, 1),
  COALESCE(created_at, CURRENT_TIMESTAMP),
  COALESCE(updated_at, CURRENT_TIMESTAMP)
FROM especes
ON CONFLICT DO NOTHING;

-- Remplacer la table
DROP TABLE IF EXISTS especes_backup;
ALTER TABLE especes RENAME TO especes_backup;
ALTER TABLE especes_new RENAME TO especes;
DROP TABLE IF EXISTS especes_backup;

-- Index
CREATE INDEX IF NOT EXISTS idx_especes_categorie ON especes(categorie);
CREATE INDEX IF NOT EXISTS idx_especes_chassable ON especes(chassable);
CREATE INDEX IF NOT EXISTS idx_especes_active ON especes(is_active);
CREATE INDEX IF NOT EXISTS idx_especes_nom ON especes(nom);

-- 2) Retirer la colonne 'code' de taxe_especes
DROP TABLE IF EXISTS taxe_especes_new;
CREATE TABLE IF NOT EXISTS taxe_especes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  espece_id INTEGER NOT NULL,
  prix_xof INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Copier les données (ignorer 'code')
INSERT INTO taxe_especes_new (id, espece_id, prix_xof, is_active, created_at, updated_at)
SELECT id, espece_id, prix_xof, COALESCE(is_active,1), COALESCE(created_at,CURRENT_TIMESTAMP), COALESCE(updated_at,CURRENT_TIMESTAMP)
FROM taxe_especes;

-- Remplacer la table
DROP TABLE IF EXISTS taxe_especes_backup;
ALTER TABLE taxe_especes RENAME TO taxe_especes_backup;
ALTER TABLE taxe_especes_new RENAME TO taxe_especes;
DROP TABLE IF EXISTS taxe_especes_backup;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_taxe_especes_active ON taxe_especes(is_active);
CREATE INDEX IF NOT EXISTS idx_taxe_especes_espece ON taxe_especes(espece_id);

COMMIT;
