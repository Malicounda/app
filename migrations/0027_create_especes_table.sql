-- Migration pour créer la table especes avec support des photos
-- Date: 2025-09-19

CREATE TABLE IF NOT EXISTS especes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    nom_scientifique TEXT,
    nom_anglais TEXT,
    code TEXT,
    -- categorie référencera la clé/label depuis "Tarifs des Permis"; pas de CHECK strict pour rester dynamique
    categorie TEXT NOT NULL,
    -- Statut de protection: 'Aucun', 'Partiel', 'Intégral'
    statut_protection TEXT NOT NULL DEFAULT 'Aucun' CHECK (statut_protection IN ('Aucun', 'Partiel', 'Intégral')),
    chassable BOOLEAN NOT NULL DEFAULT 1,
    -- Quota optionnel: si NULL, aucun quota n'est appliqué
    quota INTEGER,
    -- CITES Annexe: 'I', 'II', 'III', 'Non CITES'
    cites_annexe TEXT CHECK (cites_annexe IN ('I','II','III','Non CITES')),
    photo_url TEXT,
    photo_data TEXT, -- Base64 encoded image data
    photo_mime TEXT, -- MIME type (image/jpeg, image/png, etc.)
    photo_name TEXT, -- Original filename
    is_active BOOLEAN NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances
CREATE INDEX IF NOT EXISTS idx_especes_categorie ON especes(categorie);
CREATE INDEX IF NOT EXISTS idx_especes_chassable ON especes(chassable);
CREATE INDEX IF NOT EXISTS idx_especes_active ON especes(is_active);
CREATE INDEX IF NOT EXISTS idx_especes_nom ON especes(nom);
