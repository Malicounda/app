-- Script pour créer la table settings
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insérer la configuration de la campagne de chasse
INSERT INTO settings (key, value, description) 
VALUES (
  'hunting-campaign', 
  '{"startDate": "2025-01-01", "endDate": "2025-12-31", "isActive": true, "smallGameStartDate": "2025-01-01", "smallGameEndDate": "2025-06-30", "bigGameStartDate": "2025-02-01", "bigGameEndDate": "2025-07-31", "waterfowlStartDate": "2025-03-01", "waterfowlEndDate": "2025-08-31"}',
  'Configuration de la campagne de chasse actuelle'
) ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value, 
    description = EXCLUDED.description,
    updated_at = CURRENT_TIMESTAMP;
