-- Renommage de la colonne observations -> quantity et conversion en entier NOT NULL
BEGIN;

-- 1) Renommer la colonne
ALTER TABLE declaration_especes RENAME COLUMN observations TO quantity;

-- 2) Convertir le type text -> integer (en nettoyant les valeurs éventuelles)
ALTER TABLE declaration_especes
  ALTER COLUMN quantity TYPE integer USING NULLIF(TRIM(quantity), '')::integer;

-- 3) Normaliser les valeurs non valides ou nulles à 1
UPDATE declaration_especes
SET quantity = 1
WHERE quantity IS NULL OR quantity <= 0;

-- 4) Rendre la colonne obligatoire
ALTER TABLE declaration_especes
  ALTER COLUMN quantity SET NOT NULL;

COMMIT;
