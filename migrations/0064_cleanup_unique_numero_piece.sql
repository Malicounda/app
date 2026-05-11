-- Normalize existing contrevenant identity numbers and enforce uniqueness

-- Trim whitespace to ensure consistent comparison
UPDATE contrevenants
SET
  numero_piece = TRIM(numero_piece),
  type_piece = TRIM(type_piece)
WHERE numero_piece IS NOT NULL OR type_piece IS NOT NULL;

-- Remove duplicates keeping the oldest entry (smallest id)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY LOWER(numero_piece) ORDER BY id) AS rn
  FROM contrevenants
  WHERE numero_piece IS NOT NULL
)
DELETE FROM contrevenants c
USING ranked r
WHERE c.id = r.id AND r.rn > 1;

-- Recreate the unique index on numero_piece only (case-insensitive)
DROP INDEX IF EXISTS uq_contrevenants_numero_piece;
CREATE UNIQUE INDEX uq_contrevenants_numero_piece
  ON public.contrevenants (LOWER(numero_piece))
  WHERE numero_piece IS NOT NULL;
