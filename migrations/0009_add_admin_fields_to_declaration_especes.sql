-- Ajout de colonnes administratives deduites des coordonnees GPS
-- Table: declaration_especes

ALTER TABLE IF EXISTS public.declaration_especes
  ADD COLUMN IF NOT EXISTS arrondissement text,
  ADD COLUMN IF NOT EXISTS commune text,
  ADD COLUMN IF NOT EXISTS departement text,
  ADD COLUMN IF NOT EXISTS region text;

-- Index utiles pour filtres/statistiques
CREATE INDEX IF NOT EXISTS idx_declaration_especes_region ON public.declaration_especes(region);
CREATE INDEX IF NOT EXISTS idx_declaration_especes_departement ON public.declaration_especes(departement);
CREATE INDEX IF NOT EXISTS idx_declaration_especes_commune ON public.declaration_especes(commune);
CREATE INDEX IF NOT EXISTS idx_declaration_especes_arrondissement ON public.declaration_especes(arrondissement);
