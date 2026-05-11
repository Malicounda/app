-- 0026_create_hunting_campaign_periods.sql
-- Create table to store specific hunting periods (e.g., big game, waterfowl) per campaign
-- This table allows enabling/disabling and derogation (allowing dates outside campaign interval)

BEGIN;

CREATE TABLE IF NOT EXISTS hunting_campaign_periods (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES hunting_campaigns(id) ON DELETE CASCADE,
  code TEXT NOT NULL,                    -- e.g., 'big_game', 'waterfowl', 'other'
  name TEXT NOT NULL,                    -- e.g., 'Grande chasse', 'Gibier d'eau'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  derogation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure only one period per code per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_hcp_unique_campaign_code ON hunting_campaign_periods(campaign_id, code);
CREATE INDEX IF NOT EXISTS idx_hcp_campaign ON hunting_campaign_periods(campaign_id);

-- Optional backfill: if old columns exist on hunting_campaigns, migrate them into periods
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'big_game_start_date'
  ) THEN
    INSERT INTO hunting_campaign_periods (campaign_id, code, name, start_date, end_date, enabled, derogation_enabled)
    SELECT id, 'big_game', 'Grande chasse', big_game_start_date, big_game_end_date, TRUE, FALSE
    FROM hunting_campaigns
    WHERE big_game_start_date IS NOT NULL AND big_game_end_date IS NOT NULL
    ON CONFLICT (campaign_id, code) DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'water_game_start_date'
  ) THEN
    INSERT INTO hunting_campaign_periods (campaign_id, code, name, start_date, end_date, enabled, derogation_enabled)
    SELECT id, 'waterfowl', 'Gibier d''eau', water_game_start_date, water_game_end_date, TRUE, FALSE
    FROM hunting_campaigns
    WHERE water_game_start_date IS NOT NULL AND water_game_end_date IS NOT NULL
    ON CONFLICT (campaign_id, code) DO NOTHING;
  END IF;
END$$;

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_hcp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hcp_updated_at ON hunting_campaign_periods;
CREATE TRIGGER trg_hcp_updated_at
BEFORE UPDATE ON hunting_campaign_periods
FOR EACH ROW EXECUTE FUNCTION set_hcp_updated_at();

COMMIT;
