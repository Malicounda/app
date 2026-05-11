-- Mettre à jour le mot de passe du superadmin 00491 avec un hash bcrypt
-- Password: 1991A

UPDATE users
SET password = '$2b$10$BNgIX8pVBeKRhTpW5OuxEOJtfhCZNvbJCTqLzLxmgeXLJYTa9zI2S'
WHERE username = '00491';
