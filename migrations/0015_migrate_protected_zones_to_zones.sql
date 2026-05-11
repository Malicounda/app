-- Migration: copy eligible protected_zones into zones
-- Types targeted: zic, amodiee, parc_visite, regulation (normalized)
-- Assumptions:
-- - protected_zones.geom SRID may differ (often 32628). We transform to 4326.
-- - zones.geometry is geometry(POLYGON, 4326). For MultiPolygon, we pick the first polygon via ST_Dump.
-- - region/departement inferred by spatial intersection in 4326.
-- - area_sq_km computed from geography area of final polygon.

s
