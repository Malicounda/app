-- Backfill role_metier_id from legacy niveau_acces (best-effort)
-- Strategy:
-- 1) If niveau_acces is numeric => treat as roles_metier.id
-- 2) Else try to match roles_metier.code (case-insensitive)
-- 3) Else try to match roles_metier.label_fr (case-insensitive)

UPDATE user_domains ud
SET role_metier_id = CAST(ud.niveau_acces AS INTEGER)
WHERE ud.role_metier_id IS NULL
  AND ud.niveau_acces ~ '^[0-9]+$'
  AND EXISTS (SELECT 1 FROM roles_metier rm WHERE rm.id = CAST(ud.niveau_acces AS INTEGER));

UPDATE user_domains ud
SET role_metier_id = rm.id
FROM roles_metier rm
WHERE ud.role_metier_id IS NULL
  AND ud.niveau_acces IS NOT NULL
  AND ud.niveau_acces !~ '^[0-9]+$'
  AND upper(trim(rm.code)) = upper(trim(ud.niveau_acces));

UPDATE user_domains ud
SET role_metier_id = rm.id
FROM roles_metier rm
WHERE ud.role_metier_id IS NULL
  AND ud.niveau_acces IS NOT NULL
  AND ud.niveau_acces !~ '^[0-9]+$'
  AND upper(trim(rm.label_fr)) = upper(trim(ud.niveau_acces));

ALTER TABLE user_domains
DROP COLUMN IF EXISTS niveau_acces;
