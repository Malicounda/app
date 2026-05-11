-- Backfill CHASSE domain for all existing users
INSERT INTO user_domains (user_id, domain, role, active)
SELECT u.id, 'CHASSE', u.role, TRUE
FROM users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_domains ud WHERE ud.user_id = u.id AND ud.domain = 'CHASSE'
);
