-- Crée la table des déclarations d'espèces (prélèvements)
CREATE TABLE IF NOT EXISTS declaration_especes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  hunter_id integer,
  permit_id integer,
  permit_number text NOT NULL,
  category text,
  espece_id text NOT NULL,
  nom_espece text,
  nom_scientifique text,
  sexe text NOT NULL,
  observations text,
  lat numeric,
  lon numeric,
  location text,
  photo_data bytea,
  photo_mime text,
  photo_name text,
  photo_checksum text,
  created_at timestamp DEFAULT now() NOT NULL
);

-- Index utiles pour les filtrages/tri
CREATE INDEX IF NOT EXISTS idx_declaration_especes_user_id ON declaration_especes(user_id);
CREATE INDEX IF NOT EXISTS idx_declaration_especes_created_at ON declaration_especes(created_at DESC);
