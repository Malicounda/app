-- Add sous_categorie and display_order to permit_categories, plus helpful index

ALTER TABLE permit_categories
  ADD COLUMN IF NOT EXISTS sous_categorie TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Composite index to speed up filtering/grouping in UI and API
CREATE INDEX IF NOT EXISTS idx_permit_categories_group_genre_sous
  ON permit_categories (groupe, genre, sous_categorie);

-- Optional: backfill display_order for existing seeds (touriste) to enforce UI order
-- Petite chasse touriste: 1-semaine (1), 2-semaines (2), 1-mois (3)
UPDATE permit_categories
SET sous_categorie = '1-semaine', display_order = 1
WHERE key IN ('touriste-1-semaine-petite');

UPDATE permit_categories
SET sous_categorie = '2-semaines', display_order = 2
WHERE key IN ('touriste-2-semaines-petite');

UPDATE permit_categories
SET sous_categorie = '1-mois', display_order = 3
WHERE key IN ('touriste-1-mois-petite');

-- Grande chasse touriste: 1-semaine (1), 2-semaines (2), 1-mois (3)
UPDATE permit_categories
SET sous_categorie = '1-semaine', display_order = 1
WHERE key IN ('touriste-1-semaine-grande');

UPDATE permit_categories
SET sous_categorie = '2-semaines', display_order = 2
WHERE key IN ('touriste-2-semaines-grande');

UPDATE permit_categories
SET sous_categorie = '1-mois', display_order = 3
WHERE key IN ('touriste-1-mois-grande');

-- Gibier d'eau touriste (seeds actuels: 1-semaine, 1-mois)
UPDATE permit_categories
SET sous_categorie = '1-semaine', display_order = 1
WHERE key IN ('touriste-1-semaine-gibier-eau');

UPDATE permit_categories
SET sous_categorie = '1-mois', display_order = 3
WHERE key IN ('touriste-1-mois-gibier-eau');
