import { Router } from 'express';
import { isAuthenticated } from './middlewares/auth.middleware.js';
import postgres from 'postgres';
import { getDatabaseUrl } from '../config.js';

const connectionString = getDatabaseUrl();
const sql = postgres(connectionString, { max: 1 });

const router = Router();

// GET /api/permit-categories?activeOnly=true&season=2025-2026
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const activeOnly = String(req.query.activeOnly || 'false').toLowerCase() === 'true';
    const season = typeof req.query.season === 'string' ? req.query.season : undefined;

    const categories = await sql<{
      id: number;
      key: string;
      label_fr: string;
      groupe: string;
      genre: string;
      sous_categorie: string | null;
      default_validity_days: number | null;
      max_renewals: number;
      is_active: boolean;
      display_order: number | null;
      price: string | null;
    }[]>`
      SELECT 
        pc.id,
        pc.key,
        pc.label_fr,
        pc.groupe,
        pc.genre,
        pc.sous_categorie,
        pc.default_validity_days,
        pc.max_renewals,
        pc.is_active,
        pc.display_order,
        (
          SELECT pcp.tarif_xof::text
          FROM permit_category_prices pcp
          WHERE pcp.category_id = pc.id
            ${season ? sql`AND pcp.season_year = ${season}` : sql``}
            AND pcp.is_active = true
          ORDER BY pcp.updated_at DESC
          LIMIT 1
        ) AS price
      FROM permit_categories pc
      ${activeOnly ? sql`WHERE pc.is_active = true` : sql``}
      ORDER BY pc.groupe, pc.genre, COALESCE(pc.display_order, 9999), pc.label_fr
    `;

    return res.json(categories.map(c => ({
      id: c.id,
      key: c.key,
      labelFr: c.label_fr,
      groupe: c.groupe,
      genre: c.genre,
      sousCategorie: c.sous_categorie,
      defaultValidityDays: c.default_validity_days,
      maxRenewals: c.max_renewals,
      isActive: c.is_active,
      displayOrder: c.display_order,
      priceXof: c.price,
    })));
  } catch (err) {
    console.error('[GET /api/permit-categories] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// POST /api/permit-categories
router.post('/', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });

    const { key, labelFr, groupe, genre, sousCategorie, defaultValidityDays, maxRenewals, isActive, displayOrder } = req.body || {};
    if (!key || !labelFr || !groupe || !genre) {
      return res.status(400).json({ message: 'Champs requis: key, labelFr, groupe, genre' });
    }

    await sql`
      INSERT INTO permit_categories (
        key, label_fr, groupe, genre, sous_categorie, default_validity_days, max_renewals, is_active, display_order
      ) VALUES (
        ${String(key)}, ${String(labelFr)}, ${String(groupe)}, ${String(genre)}, ${sousCategorie ?? null},
        ${defaultValidityDays ?? null}, ${Number(maxRenewals ?? 0)}, ${Boolean(isActive ?? true)}, ${displayOrder ?? null}
      )
      ON CONFLICT (key) DO NOTHING
    `;

    return res.status(201).json({ message: 'Catégorie créée' });
  } catch (err) {
    console.error('[POST /api/permit-categories] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// PUT /api/permit-categories/:id
router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Paramètre id invalide' });

    const { labelFr, groupe, genre, sousCategorie, defaultValidityDays, maxRenewals, isActive, displayOrder } = req.body || {};

    // Construire dynamiquement la requête UPDATE
    const sets: string[] = [];
    const params: any[] = [];

    function addSet(column: string, value: any) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }

    if (labelFr !== undefined) addSet('label_fr', String(labelFr));
    if (groupe !== undefined) addSet('groupe', String(groupe));
    if (genre !== undefined) addSet('genre', String(genre));
    if (sousCategorie !== undefined) addSet('sous_categorie', sousCategorie === null ? null : String(sousCategorie));
    if (defaultValidityDays !== undefined) addSet('default_validity_days', defaultValidityDays === null ? null : Number(defaultValidityDays));
    if (maxRenewals !== undefined) addSet('max_renewals', Number(maxRenewals));
    if (isActive !== undefined) addSet('is_active', Boolean(isActive));
    if (displayOrder !== undefined) addSet('display_order', displayOrder === null ? null : Number(displayOrder));
    // Always update timestamp
    addSet('updated_at', new Date());

    if (sets.length === 1) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    params.push(id);
    await sql.unsafe(`UPDATE permit_categories SET ${sets.join(', ')} WHERE id = $${params.length}`, params);

    return res.json({ message: 'Catégorie mise à jour' });
  } catch (err) {
    console.error('[PUT /api/permit-categories/:id] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// DELETE /api/permit-categories/:id (soft: is_active = false)
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Paramètre id invalide' });

    await sql`UPDATE permit_categories SET is_active = false, updated_at = ${new Date()} WHERE id = ${id}`;
    return res.json({ message: 'Catégorie désactivée' });
  } catch (err) {
    console.error('[DELETE /api/permit-categories/:id] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// ----- Prices endpoints -----
// GET /api/permit-category-prices?season=2025-2026
router.get('/prices', isAuthenticated, async (req, res) => {
  try {
    const season = typeof req.query.season === 'string' ? req.query.season : undefined;
    const rows = await sql`
      SELECT 
        pcp.id,
        pcp.category_id AS "categoryId",
        pcp.season_year AS "seasonYear",
        pcp.tarif_xof::text AS "tarifXof",
        pcp.is_active AS "isActive",
        pcp.created_at AS "createdAt",
        pcp.updated_at AS "updatedAt"
      FROM permit_category_prices pcp
      ${season ? sql`WHERE pcp.season_year = ${season}` : sql``}
      ORDER BY pcp.season_year DESC, pcp.updated_at DESC
    `;
    return res.json(rows);
  } catch (err) {
    console.error('[GET /api/permit-category-prices] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// POST /api/permit-category-prices (upsert par (category_id, season_year))
router.post('/prices', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') return res.status(403).json({ message: 'Accès refusé' });
    const { categoryId, seasonYear, tarifXof, isActive } = req.body || {};
    if (!categoryId || !seasonYear) {
      return res.status(400).json({ message: 'Champs requis: categoryId, seasonYear' });
    }

    await sql`
      INSERT INTO permit_category_prices (category_id, season_year, tarif_xof, is_active)
      VALUES (${Number(categoryId)}, ${String(seasonYear)}, ${Number(tarifXof ?? 0)}, ${Boolean(isActive ?? true)})
      ON CONFLICT (category_id, season_year)
      DO UPDATE SET tarif_xof = EXCLUDED.tarif_xof, is_active = EXCLUDED.is_active, updated_at = NOW()
    `;

    return res.status(201).json({ message: 'Tarif enregistré' });
  } catch (err) {
    console.error('[POST /api/permit-category-prices] error:', err);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

export default router;
