-- 0027_create_hunting_campaigns.sql
-- Create main table to store hunting campaigns referenced by settings.routes.ts

BEGIN;

CREATE TABLE IF NOT EXISTS hunting_campaigns (
  id SERIAL PRIMARY KEY,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  year TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure one row per year to support ON CONFLICT (year)
CREATE UNIQUE INDEX IF NOT EXISTS idx_hc_unique_year ON hunting_campaigns(year);

-- Optional legacy columns (nullable) to be compatible with potential older code
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'big_game_start_date'
  ) THEN
    ALTER TABLE hunting_campaigns ADD COLUMN big_game_start_date DATE NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'big_game_end_date'
  ) THEN
    ALTER TABLE hunting_campaigns ADD COLUMN big_game_end_date DATE NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'water_game_start_date'
  ) THEN
    ALTER TABLE hunting_campaigns ADD COLUMN water_game_start_date DATE NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'hunting_campaigns' AND column_name = 'water_game_end_date'
  ) THEN
    ALTER TABLE hunting_campaigns ADD COLUMN water_game_end_date DATE NULL;
  END IF;
END$$;

-- Trigger to keep updated_at in sync
CREATE OR REPLACE FUNCTION set_hc_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_hc_updated_at ON hunting_campaigns;
CREATE TRIGGER trg_hc_updated_at
BEFORE UPDATE ON hunting_campaigns
FOR EACH ROW EXECUTE FUNCTION set_hc_updated_at();

COMMIT;
