-- Add code_item_id column to infractions table and setup foreign key
ALTER TABLE infractions
  ADD COLUMN IF NOT EXISTS code_item_id INT;

ALTER TABLE infractions
  ADD CONSTRAINT infractions_code_item_id_fkey
  FOREIGN KEY (code_item_id)
  REFERENCES code_infraction_items(id)
  ON DELETE SET NULL;
