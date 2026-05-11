-- Migration: Ajouter la colonne departement à la table users
-- Cette colonne stocke le département (secteur) pour les agents de secteur (sub-agent)

-- Vérifier si la colonne existe déjà, sinon l'ajouter
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'departement'
  ) THEN
    ALTER TABLE users ADD COLUMN departement text;
    
    -- Créer un index pour améliorer les performances de recherche
    CREATE INDEX IF NOT EXISTS idx_users_departement ON users(departement);
    
    RAISE NOTICE 'Colonne departement ajoutée à la table users';
  ELSE
    RAISE NOTICE 'La colonne departement existe déjà dans la table users';
  END IF;
END $$;

-- Optionnel: Copier les valeurs de 'zone' vers 'departement' pour les agents existants
-- (si vous aviez un ancien champ 'zone')
-- UPDATE users 
-- SET departement = zone 
-- WHERE role = 'sub-agent' 
--   AND (departement IS NULL OR departement = '')
--   AND zone IS NOT NULL;
