-- Add arrondissement and commune to alerts
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS arrondissement varchar(150),
  ADD COLUMN IF NOT EXISTS commune varchar(150);

-- Optional indexes to speed up filtering by locality
CREATE INDEX IF NOT EXISTS idx_alerts_arrondissement ON public.alerts (arrondissement);
CREATE INDEX IF NOT EXISTS idx_alerts_commune ON public.alerts (commune);

-- Backfill arrondissement from polygons and commune from nearest point within same departement when possible
-- 1) Arrondissement: pick the polygon containing the alert point (lat/lon stored in WGS84 here)
UPDATE public.alerts a
SET arrondissement = sub.arrondissement
FROM (
  SELECT a2.id,
         ar.nom AS arrondissement
  FROM public.alerts a2
  JOIN public.arrondissements ar
    ON ar.geom IS NOT NULL
   AND a2.lat IS NOT NULL AND a2.lon IS NOT NULL
   AND ST_Contains(
         ar.geom,
         ST_Transform(ST_SetSRID(ST_MakePoint(a2.lon::double precision, a2.lat::double precision), 4326), ST_SRID(ar.geom))
       )
) AS sub
WHERE a.id = sub.id
  AND (a.arrondissement IS NULL OR a.arrondissement = '');

-- 2) Commune: choose nearest commune point, prioritizing same departement when possible
-- Attempt with departement constraint first
WITH nearest_commune AS (
  SELECT a2.id,
         c.nom AS commune,
         ROW_NUMBER() OVER (PARTITION BY a2.id ORDER BY ST_Distance(c.geom, ST_Transform(ST_SetSRID(ST_MakePoint(a2.lon::double precision, a2.lat::double precision), 4326), ST_SRID(c.geom))) ASC) AS rn
  FROM public.alerts a2
  JOIN public.communes c ON c.geom IS NOT NULL
  LEFT JOIN public.departements d ON d.id = c.departement_id
  WHERE a2.lat IS NOT NULL AND a2.lon IS NOT NULL
    AND (
      -- Prefer same departement if alerts.departement matches department name
      (a2.departement IS NOT NULL AND d.nom ILIKE a2.departement)
      OR a2.departement IS NULL
    )
)
UPDATE public.alerts a
SET commune = nc.commune
FROM nearest_commune nc
WHERE a.id = nc.id AND nc.rn = 1 AND (a.commune IS NULL OR a.commune = '');
