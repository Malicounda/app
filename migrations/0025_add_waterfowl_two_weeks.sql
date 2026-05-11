-- Ajouter 'Gibier d'eau – Touriste (2 semaines)' et s'assurer que 'Résident – Gibier d'eau' est présent

-- 1) Insérer/garantir la catégorie touriste 2 semaines (gibier d'eau)
INSERT INTO permit_categories (
  key, label_fr, groupe, genre, sous_categorie, default_validity_days, max_renewals, is_active
) VALUES (
  'touriste-2-semaines-gibier-eau',
  'Touriste (2 semaines) – Gibier d''eau',
  'gibier-eau',
  'touriste',
  '2-semaines',
  14,
  2,
  TRUE
)
ON CONFLICT (key) DO NOTHING;

-- 2) S'assurer de l'existence de 'Résident – Gibier d''eau'
INSERT INTO permit_categories (
  key, label_fr, groupe, genre, default_validity_days, max_renewals, is_active
) VALUES (
  'resident-gibier-eau',
  'Résident – Gibier d''eau',
  'gibier-eau',
  'resident',
  NULL,
  2,
  TRUE
)
ON CONFLICT (key) DO NOTHING;

-- 3) Tarifs par saison (exemple: 2025-2026). Ajustez les montants dans l'onglet "Tarifs des Permis" ensuite.
INSERT INTO permit_category_prices (category_id, season_year, tarif_xof, is_active)
SELECT pc.id, '2025-2026', 25000, TRUE
FROM permit_categories pc
WHERE pc.key = 'touriste-2-semaines-gibier-eau'
ON CONFLICT (category_id, season_year) DO NOTHING;

INSERT INTO permit_category_prices (category_id, season_year, tarif_xof, is_active)
SELECT pc.id, '2025-2026', 0, TRUE
FROM permit_categories pc
WHERE pc.key = 'resident-gibier-eau'
ON CONFLICT (category_id, season_year) DO NOTHING;
