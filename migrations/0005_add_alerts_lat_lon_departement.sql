-- Add lat/lon/departement to alerts, keep legacy zone
ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lon double precision,
  ADD COLUMN IF NOT EXISTS departement varchar(100);

CREATE INDEX IF NOT EXISTS idx_alerts_departement ON alerts (departement);
