-- 0033_pg_create_especes.sql
-- Objectif: créer la table especes en PostgreSQL (si absente) avec les colonnes demandées

BEGIN;

-- Créer la table si elle n'existe pas déjà
CREATE TABLE IF NOT EXISTS especes (
  id SERIAL PRIMARY KEY,
  -- Nom de l'espèce (obligatoire)
  nom TEXT NOT NULL,
  -- Nom scientifique (optionnel)
  nom_scientifique TEXT,
  -- Statut de protection: 'Aucun', 'Partiel', 'Intégral'
  statut_protection TEXT NOT NULL DEFAULT 'Aucun' CHECK (statut_protection IN ('Aucun','Partiel','Intégral')),
  -- Annexes CITES: 'I','II','III','Non CITES' (optionnel)
  cites_annexe TEXT CHECK (cites_annexe IN ('I','II','III','Non CITES')),
  -- Catégorie (groupe libre: petite_chasse, grande_chasse, gibier_eau, protege, autre, ...)
  categorie TEXT NOT NULL,
  -- Quota optionnel: si NULL => aucun quota
  quota INTEGER,
  -- Chassable: oui/non
  chassable BOOLEAN NOT NULL DEFAULT TRUE,
  -- Taxable: si TRUE l'espèce apparaît dans l'onglet taxes d'abattage
  taxable BOOLEAN NOT NULL DEFAULT TRUE,
  -- Photo: on stocke soit une URL, soit un base64 en data
  photo_url TEXT,
  photo_data TEXT,
  photo_mime TEXT,
  photo_name TEXT,
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_especes_categorie ON especes(categorie);
CREATE INDEX IF NOT EXISTS idx_especes_chassable ON especes(chassable);
CREATE INDEX IF NOT EXISTS idx_especes_taxable ON especes(taxable);
CREATE INDEX IF NOT EXISTS idx_especes_nom ON especes(nom);

COMMIT;
