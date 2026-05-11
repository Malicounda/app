CREATE TABLE IF NOT EXISTS reforestation_localites (
  id SERIAL PRIMARY KEY,
  departement TEXT NOT NULL,
  arrondissement TEXT NULL,
  commune TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP NULL,
  deleted_by INTEGER NULL
);

CREATE INDEX IF NOT EXISTS idx_reforestation_localites_departement
  ON reforestation_localites (departement);

CREATE INDEX IF NOT EXISTS idx_reforestation_localites_departement_arrondissement
  ON reforestation_localites (departement, arrondissement);

CREATE INDEX IF NOT EXISTS idx_reforestation_localites_not_deleted
  ON reforestation_localites (departement)
  WHERE deleted_at IS NULL;
