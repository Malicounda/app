-- Ajout de la colonne code_item_id pour relier une infraction à l'item de code choisi
ALTER TABLE infractions
  ADD COLUMN IF NOT EXISTS code_item_id INT;

-- S'assurer que les valeurs existantes sont cohérentes (optionnel selon l'historique des données)
-- Ici on ne force pas encore de contrainte car certaines lignes peuvent être nulles après migration

-- Ajouter la contrainte de clé étrangère si elle n'existe pas déjà
ALTER TABLE infractions
  ADD CONSTRAINT infractions_code_item_id_fkey
  FOREIGN KEY (code_item_id)
  REFERENCES code_infraction_items(id)
  ON DELETE SET NULL;
