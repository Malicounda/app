-- Création de la table countries si elle n'existe pas
CREATE TABLE IF NOT EXISTS countries (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    geom GEOMETRY(GEOMETRY, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Création d'un index spatial pour les performances
CREATE INDEX IF NOT EXISTS idx_countries_geom ON countries USING GIST(geom);

-- Insertion des données pour le Sénégal (coordonnées approximatives du polygone du Sénégal)
-- Note: Dans un environnement de production, vous devriez utiliser des données géographiques précises
INSERT INTO countries (name, geom)
SELECT 'Sénégal', ST_MakePolygon(
    ST_GeomFromText(
        'LINESTRING(
            -17.625043 14.890614,  -- Nord-Ouest
            -17.185116 14.839232,  -- Ouest
            -16.700706 13.595039,  -- Sud-Ouest
            -16.463098 13.497471,  -- Sud-Ouest
            -16.120690 13.889980,  -- Sud-Ouest
            -16.463098 16.597824,  -- Nord-Ouest
            -17.625043 14.890614   -- Retour au point de départ
        )',
        4326
    )
)
WHERE NOT EXISTS (SELECT 1 FROM countries WHERE name = 'Sénégal');

-- Mise à jour des timestamps
UPDATE countries 
SET updated_at = CURRENT_TIMESTAMP 
WHERE name = 'Sénégal' 
AND (updated_at IS NULL OR updated_at < CURRENT_TIMESTAMP - INTERVAL '1 day');
