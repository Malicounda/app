-- Table AFFECTATIONS : Le Moteur de Droits
-- Cette table ventile l'agent dans ses différentes missions tout en verrouillant son rang hiérarchique.

BEGIN;

-- 1) Création de la table affectations
CREATE TABLE IF NOT EXISTS affectations (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id_agent) ON DELETE CASCADE,
  domaine_id INTEGER NOT NULL REFERENCES domaines(id) ON DELETE RESTRICT,
  niveau_hierarchique TEXT NOT NULL CHECK (niveau_hierarchique IN ('NATIONAL', 'REGIONAL', 'SECTEUR')),
  role_metier TEXT,
  code_zone TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  date_affectation TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- 2) Index pour performances
CREATE INDEX IF NOT EXISTS idx_affectations_agent_id ON affectations(agent_id);
CREATE INDEX IF NOT EXISTS idx_affectations_domaine_id ON affectations(domaine_id);
CREATE INDEX IF NOT EXISTS idx_affectations_active ON affectations(active);
CREATE INDEX IF NOT EXISTS idx_affectations_niveau ON affectations(niveau_hierarchique);

-- 3) Contrainte d'unicité : un agent ne peut avoir qu'une seule affectation par domaine
CREATE UNIQUE INDEX IF NOT EXISTS idx_affectations_agent_domaine_unique 
  ON affectations(agent_id, domaine_id);

-- 4) Fonction trigger pour la Règle du "Rang Unique"
-- Un agent ne peut pas avoir deux niveaux hiérarchiques différents
CREATE OR REPLACE FUNCTION check_rang_unique()
RETURNS TRIGGER AS $$
DECLARE
  existing_niveau TEXT;
BEGIN
  -- Vérifier si l'agent a déjà des affectations avec un niveau différent
  SELECT niveau_hierarchique INTO existing_niveau
  FROM affectations
  WHERE agent_id = NEW.agent_id
    AND id != NEW.id  -- Exclure la ligne en cours de modification
  LIMIT 1;

  IF existing_niveau IS NOT NULL AND existing_niveau != NEW.niveau_hierarchique THEN
    RAISE EXCEPTION 'Règle de Rang Unique violée: L''agent % a déjà le niveau %, impossible d''attribuer le niveau %',
      NEW.agent_id, existing_niveau, NEW.niveau_hierarchique;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5) Trigger pour appliquer la règle
DROP TRIGGER IF EXISTS trg_check_rang_unique ON affectations;
CREATE TRIGGER trg_check_rang_unique
  BEFORE INSERT OR UPDATE OF niveau_hierarchique ON affectations
  FOR EACH ROW
  EXECUTE FUNCTION check_rang_unique();

-- 6) Trigger pour mettre à jour updated_at
CREATE OR REPLACE FUNCTION update_affectations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_affectations_updated_at ON affectations;
CREATE TRIGGER trg_affectations_updated_at
  BEFORE UPDATE ON affectations
  FOR EACH ROW
  EXECUTE FUNCTION update_affectations_updated_at();

COMMIT;
