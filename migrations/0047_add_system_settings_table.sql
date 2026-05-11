-- Migration: Ajouter une table pour les paramètres système
-- Date: 2025-01-13
-- Description: Table pour stocker les paramètres de configuration du système

-- Créer la table system_settings si elle n'existe pas
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insérer le paramètre de filtrage régional des zones protégées
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description)
VALUES (
  'regional_filter_protected_zones',
  'false',
  'Active le filtrage régional pour les zones protégées : les agents régionaux et secteurs ne voient que les zones de leur région'
);

-- Index pour améliorer les performances de recherche
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);
