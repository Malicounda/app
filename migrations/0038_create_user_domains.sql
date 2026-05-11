-- Create user_domains table
CREATE TABLE IF NOT EXISTS user_domains (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  role TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Ensure uniqueness of (user_id, domain)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_user_domains_user_domain_unique'
  ) THEN
    CREATE UNIQUE INDEX idx_user_domains_user_domain_unique ON user_domains(user_id, domain);
  END IF;
END $$;

-- Helpful index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'idx_user_domains_user_id'
  ) THEN
    CREATE INDEX idx_user_domains_user_id ON user_domains(user_id);
  END IF;
END $$;
