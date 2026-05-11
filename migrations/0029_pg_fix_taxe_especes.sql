-- 0029_pg_fix_taxe_especes.sql
-- Objectif: rendre la table taxe_especes compatible avec le backend (espece_id/prix_xof)
-- et migrer les anciennes colonnes provenant du script d'init (species_id/name/price)
-- PostgreSQL ONLY

BEGIN;

-- Ajouter les nouvelles colonnes si absentes
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS espece_id INTEGER;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS prix_xof INTEGER;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE taxe_especes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Rétro-remplissage depuis l'ancien schéma (species_id / price)
-- On mappe species_id -> especes.code pour récupérer l'id de l'espèce
UPDATE taxe_especes te
SET espece_id = e.id
FROM especes e
WHERE te.espece_id IS NULL
  AND te.species_id IS NOT NULL
  AND e.code = te.species_id;

-- Copier l'ancien price vers prix_xof si vide
UPDATE taxe_especes
SET prix_xof = price
WHERE prix_xof IS NULL AND price IS NOT NULL;

-- En cas d'entrées sans correspondance (espece_id NULL), tenter un mapping par nom (moins fiable)
-- ATTENTION: cela suppose que taxe_especes.name ~ especes.nom
UPDATE taxe_especes te
SET espece_id = e.id
FROM especes e
WHERE te.espece_id IS NULL
  AND te.name IS NOT NULL
  AND e.nom = te.name;

-- Facultatif: imposer la contrainte de clé étrangère après remplissage
-- Supprimer d'abord la contrainte si elle existe déjà (renommer selon votre base)
-- ALTER TABLE taxe_especes DROP CONSTRAINT IF EXISTS fk_taxe_especes_espece;
-- Ajouter la FK
-- ALTER TABLE taxe_especes
--   ADD CONSTRAINT fk_taxe_especes_espece
--   FOREIGN KEY (espece_id) REFERENCES especes(id) ON DELETE CASCADE;

-- Rendre NOT NULL si toutes les lignes sont désormais remplies
DO $$
DECLARE v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_missing FROM taxe_especes WHERE espece_id IS NULL;
  IF v_missing = 0 THEN
    BEGIN
      ALTER TABLE taxe_especes ALTER COLUMN espece_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      -- ignorer si déjà NOT NULL
    END;
  END IF;
END $$;

DO $$
DECLARE v_missing int;
BEGIN
  SELECT COUNT(*) INTO v_missing FROM taxe_especes WHERE prix_xof IS NULL;
  IF v_missing = 0 THEN
    BEGIN
      ALTER TABLE taxe_especes ALTER COLUMN prix_xof SET NOT NULL;
    EXCEPTION WHEN others THEN
    END;
  END IF;
END $$;

-- Supprimer les anciennes colonnes si elles existent
ALTER TABLE taxe_especes DROP COLUMN IF EXISTS species_id;
ALTER TABLE taxe_especes DROP COLUMN IF EXISTS name;
ALTER TABLE taxe_especes DROP COLUMN IF EXISTS price;

-- Index utiles
CREATE INDEX IF NOT EXISTS idx_taxe_especes_active ON taxe_especes(is_active);
CREATE INDEX IF NOT EXISTS idx_taxe_especes_espece ON taxe_especes(espece_id);

COMMIT;
