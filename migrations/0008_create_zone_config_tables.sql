-- Create zone_types table for dynamic zone type management
CREATE TABLE IF NOT EXISTS zone_types (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0ea5e9',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create zone_statuses table for dynamic zone status management
CREATE TABLE IF NOT EXISTS zone_statuses (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Insert default zone types based on existing zones table constraint
INSERT INTO zone_types (key, label, color, is_active) VALUES
  ('zic', 'ZIC', '#0ea5e9', true),
  ('amodiee', 'Amodiée', '#8b5cf6', true),
  ('parc_visite', 'Parc de visite', '#f59e0b', true),
  ('regulation', 'Régulation', '#dc2626', true)
ON CONFLICT (key) DO NOTHING;

-- Insert default zone statuses
INSERT INTO zone_statuses (key, label, color, is_active) VALUES
  ('active', 'Actif', '#10b981', true),
  ('inactive', 'Inactif', '#6b7280', true),
  ('suspended', 'Suspendu', '#f59e0b', true),
  ('maintenance', 'En maintenance', '#ef4444', true)
ON CONFLICT (key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_zone_types_key ON zone_types(key);
CREATE INDEX IF NOT EXISTS idx_zone_types_active ON zone_types(is_active);
CREATE INDEX IF NOT EXISTS idx_zone_statuses_key ON zone_statuses(key);
CREATE INDEX IF NOT EXISTS idx_zone_statuses_active ON zone_statuses(is_active);

-- Triggers to keep updated_at in sync for zone_types
CREATE OR REPLACE FUNCTION set_zone_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zone_types_updated_at ON zone_types;
CREATE TRIGGER trg_zone_types_updated_at
BEFORE UPDATE ON zone_types
FOR EACH ROW
EXECUTE FUNCTION set_zone_types_updated_at();

-- Triggers to keep updated_at in sync for zone_statuses
CREATE OR REPLACE FUNCTION set_zone_statuses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_zone_statuses_updated_at ON zone_statuses;
CREATE TRIGGER trg_zone_statuses_updated_at
BEFORE UPDATE ON zone_statuses
FOR EACH ROW
EXECUTE FUNCTION set_zone_statuses_updated_at();

-- Add comments for documentation
COMMENT ON TABLE zone_types IS 'Configuration table for zone types (ZIC, Amodiée, etc.)';
COMMENT ON TABLE zone_statuses IS 'Configuration table for zone statuses (Active, Inactive, etc.)';
COMMENT ON COLUMN zone_types.key IS 'Unique identifier used in zones.type column';
COMMENT ON COLUMN zone_types.label IS 'Human-readable label displayed in UI';
COMMENT ON COLUMN zone_types.color IS 'Default color for this zone type (hex format)';
COMMENT ON COLUMN zone_statuses.key IS 'Unique identifier used in zones.status column';
COMMENT ON COLUMN zone_statuses.label IS 'Human-readable label displayed in UI';
COMMENT ON COLUMN zone_statuses.color IS 'Default color for this zone status (hex format)';
