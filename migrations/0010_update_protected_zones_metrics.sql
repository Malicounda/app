-- Auto-calc surface_ha (hectares) and perimetre_m (meters) for protected_zones
-- SRID source: 32628 (UTM 28N, meters)

-- 1) Ensure columns exist
ALTER TABLE IF EXISTS protected_zones
  ADD COLUMN IF NOT EXISTS surface_ha DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS perimetre_m DOUBLE PRECISION;

-- 2) Create or replace function to compute metrics from geom
CREATE OR REPLACE FUNCTION protected_zones_update_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.geom IS NULL THEN
    NEW.surface_ha := NULL;
    NEW.perimetre_m := NULL;
  ELSE
    -- Force 2D just in case and compute in native meters
    NEW.surface_ha := ST_Area(ST_Force2D(NEW.geom)) / 10000.0; -- m^2 to ha
    NEW.perimetre_m := ST_Perimeter(ST_Force2D(NEW.geom));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Triggers for INSERT/UPDATE of geom
DROP TRIGGER IF EXISTS trg_protected_zones_update_metrics_ins ON protected_zones;
CREATE TRIGGER trg_protected_zones_update_metrics_ins
BEFORE INSERT ON protected_zones
FOR EACH ROW
EXECUTE FUNCTION protected_zones_update_metrics();

DROP TRIGGER IF EXISTS trg_protected_zones_update_metrics_upd ON protected_zones;
CREATE TRIGGER trg_protected_zones_update_metrics_upd
BEFORE UPDATE OF geom ON protected_zones
FOR EACH ROW
EXECUTE FUNCTION protected_zones_update_metrics();

-- 4) Backfill existing rows once
UPDATE protected_zones
SET
  surface_ha = CASE WHEN geom IS NULL THEN NULL ELSE ST_Area(ST_Force2D(geom))/10000.0 END,
  perimetre_m = CASE WHEN geom IS NULL THEN NULL ELSE ST_Perimeter(ST_Force2D(geom)) END;
