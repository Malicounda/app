CREATE TABLE IF NOT EXISTS client_mutations (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result JSONB NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS client_mutations_device_mutation_uidx
  ON client_mutations(device_id, mutation_id);
