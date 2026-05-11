-- Seed complémentaires pour couvrir Resident/Coutumier/Scientifique/Commercial/Oisellerie
-- et les variantes Résident par groupe (petite-chasse, grande-chasse, gibier-eau)

-- Coutumier (affichage: "Coutumier"), groupe petite-chasse, genre coutumier
INSERT INTO permit_categories (key, label_fr, groupe, genre, sous_categorie, default_validity_days, max_renewals, is_active)
VALUES ('coutumier-petite', 'Coutumier', 'petite-chasse', 'coutumier', NULL, NULL, 1, TRUE)
ON CONFLICT (key) DO NOTHING;

-- Résident par groupe (validité bornée par la campagne => laisser default_validity_days NULL)
INSERT INTO permit_categories (key, label_fr, groupe, genre, default_validity_days, max_renewals, is_active)
VALUES
  ('resident-petite', 'Résident – Petite chasse', 'petite-chasse', 'resident', NULL, 0, TRUE),
  ('resident-grande', 'Résident – Grande chasse', 'grande-chasse', 'resident', NULL, 0, TRUE),
  ('resident-gibier-eau', 'Résident – Gibier d''eau', 'gibier-eau', 'resident', NULL, 2, TRUE)
ON CONFLICT (key) DO NOTHING;

-- Scientifique / Capture commerciale / Oisellerie (genre dédié, groupé sous "autre")
-- Laisser default_validity_days NULL: l'admin peut définir des années de validité dans l'onglet et on convertira côté backend si besoin
INSERT INTO permit_categories (key, label_fr, groupe, genre, default_validity_days, max_renewals, is_active)
VALUES
  ('scientifique', 'Scientifique', 'autre', 'scientifique', NULL, 0, TRUE),
  ('commerciale-capture', 'Capture commerciale', 'autre', 'commercial', NULL, 0, TRUE),
  ('oisellerie', 'Oisellerie (Fauconnerie)', 'autre', 'oisellerie', NULL, 0, TRUE)
ON CONFLICT (key) DO NOTHING;

-- Optionnel: tarifs de base (0) pour la saison 2025-2026 afin d'initialiser les lignes
INSERT INTO permit_category_prices (category_id, season_year, tarif_xof, is_active)
SELECT id, '2025-2026', 0, TRUE
FROM permit_categories
WHERE key IN (
  'coutumier-petite',
  'resident-petite','resident-grande','resident-gibier-eau',
  'scientifique','commerciale-capture','oisellerie'
)
ON CONFLICT (category_id, season_year) DO NOTHING;
