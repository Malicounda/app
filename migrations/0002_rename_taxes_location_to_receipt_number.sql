-- Rename column location to receipt_number on taxes table
-- Postgres syntax
ALTER TABLE taxes
  RENAME COLUMN location TO receipt_number;
