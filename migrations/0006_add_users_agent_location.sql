-- Add agent_lat/agent_lon to users for agent positioning
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS agent_lat double precision,
  ADD COLUMN IF NOT EXISTS agent_lon double precision;

CREATE INDEX IF NOT EXISTS idx_users_agent_lat ON users (agent_lat);
CREATE INDEX IF NOT EXISTS idx_users_agent_lon ON users (agent_lon);
