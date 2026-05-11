-- Création de la table taxes si elle n'existe pas
CREATE TABLE IF NOT EXISTS taxes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_number TEXT NOT NULL UNIQUE,
  hunter_id INTEGER NOT NULL,
  permit_id INTEGER,
  amount TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  animal_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  receipt_number TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  external_hunter_name TEXT,
  external_hunter_region TEXT
);

-- Création d'un index sur tax_number pour la recherche rapide
CREATE INDEX IF NOT EXISTS idx_taxes_tax_number ON taxes(tax_number);

-- Création d'un index sur hunter_id pour les recherches par chasseur
CREATE INDEX IF NOT EXISTS idx_taxes_hunter_id ON taxes(hunter_id);

-- Création d'un index sur permit_id pour les recherches par permis
CREATE INDEX IF NOT EXISTS idx_taxes_permit_id ON taxes(permit_id);

-- Création d'un index sur created_at pour le tri chronologique
CREATE INDEX IF NOT EXISTS idx_taxes_created_at ON taxes(created_at);
