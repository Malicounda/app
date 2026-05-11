import { sql } from 'drizzle-orm';
import { Router } from 'express';
import { db } from '../db.js';
import { storage } from '../storage.js';
import { isAuthenticated } from './middlewares/auth.middleware.js';

const router = Router();

// ============ ESPÈCES ET TAXES D'ABATTAGE ============

// Route pour récupérer toutes les espèces
router.get('/species', isAuthenticated, async (req, res) => {
  try {
    const species = await db.execute(sql`
      SELECT
        id, nom, nom_scientifique,
        groupe, statut_protection, chassable,
        COALESCE(taxable, chassable) AS taxable,
        quota, cites_annexe,
        photo_url, photo_data, photo_mime, photo_name,
        (chassable OR taxable) AS is_active,
        created_at, updated_at
      FROM especes
      ORDER BY nom ASC
    `);

    const rows = Array.isArray(species) ? species : (species && Array.isArray((species as any).rows) ? (species as any).rows : []);
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error fetching species:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des espèces' });
  }
});

// Route pour créer une nouvelle espèce
router.post('/species', isAuthenticated, async (req, res) => {
  try {
    let { nom, nom_scientifique, groupe, statut_protection, chassable, taxable, quota, cites_annexe, photo_url, photo_data, photo_mime, photo_name } = req.body as any;

    // Backward compatibility: accept 'categorie' if 'groupe' is missing
    if (!groupe && req.body && typeof req.body.categorie === 'string') {
      groupe = req.body.categorie;
    }
    // Default fallback to avoid 400 if UI forgot to send it
    if (!groupe || String(groupe).trim() === '') {
      groupe = 'autre';
    }

    if (!nom || String(nom).trim() === '') {
      return res.status(400).json({ ok: false, error: "Le champ 'nom' est requis" });
    }

    const result = await db.execute(sql`
      INSERT INTO especes (nom, nom_scientifique, groupe, statut_protection, chassable, taxable, quota, cites_annexe, photo_url, photo_data, photo_mime, photo_name)
      VALUES (${nom}, ${nom_scientifique || null}, ${groupe},
              ${statut_protection || 'Aucun'}, ${chassable !== false}, ${taxable !== false}, ${quota ?? null}, ${cites_annexe || null}, ${photo_url || null},
              ${photo_data || null}, ${photo_mime || null}, ${photo_name || null})
      RETURNING id
    `);

    const newId = result[0]?.id;

    // Auto-sync taxe_especes selon 'taxable'
    try {
      const isTaxable = taxable !== false;
      if (isTaxable && newId) {
        // upsert: garder prix_xof existant si déjà présent
        const existingTax = await db.execute(sql`SELECT id FROM taxe_especes WHERE espece_id = ${newId} LIMIT 1`);
        if (Array.isArray(existingTax) && existingTax.length > 0) {
          await db.execute(sql`
            UPDATE taxe_especes SET taxable = true, updated_at = CURRENT_TIMESTAMP WHERE espece_id = ${newId}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO taxe_especes (espece_id, prix_xof, taxable) VALUES (${newId}, NULL, true)
          `);
        }
      } else if (!isTaxable && newId) {
        await db.execute(sql`
          UPDATE taxe_especes SET taxable = false, updated_at = CURRENT_TIMESTAMP WHERE espece_id = ${newId}
        `);
      }
    } catch (syncErr) {
      console.warn('[species->taxes sync] create failed', syncErr);
    }

    res.json({ ok: true, data: { id: newId } });
  } catch (error) {
    console.error('Error creating species:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la création de l\'espèce' });
  }
});

// Route pour mettre à jour une espèce
router.put('/species/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, nom_scientifique, groupe, statut_protection, chassable, taxable, quota, cites_annexe, photo_url, photo_data, photo_mime, photo_name } = req.body;

    await db.execute(sql`
      UPDATE especes
      SET nom = ${nom}, nom_scientifique = ${nom_scientifique || null},
          groupe = ${groupe}, statut_protection = ${statut_protection || 'Aucun'},
          chassable = ${chassable !== false}, taxable = ${taxable !== false}, quota = ${quota ?? null}, cites_annexe = ${cites_annexe || null},
          photo_url = ${photo_url || null}, photo_data = ${photo_data || null}, photo_mime = ${photo_mime || null}, photo_name = ${photo_name || null},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);

    // Auto-sync taxe_especes
    try {
      const isTaxable = taxable !== false;
      if (isTaxable) {
        const existingTax = await db.execute(sql`SELECT id FROM taxe_especes WHERE espece_id = ${id} LIMIT 1`);
        if (Array.isArray(existingTax) && existingTax.length > 0) {
          await db.execute(sql`UPDATE taxe_especes SET taxable = true, updated_at = CURRENT_TIMESTAMP WHERE espece_id = ${id}`);
        } else {
          await db.execute(sql`INSERT INTO taxe_especes (espece_id, prix_xof, taxable) VALUES (${id}, NULL, true)`);
        }
      } else {
        await db.execute(sql`UPDATE taxe_especes SET taxable = false, updated_at = CURRENT_TIMESTAMP WHERE espece_id = ${id}`);
      }
    } catch (syncErr) {
      console.warn('[species->taxes sync] update failed', syncErr);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating species:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour de l\'espèce' });
  }
});

// Route pour supprimer une espèce
router.delete('/species/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const idNum = Number(id);

    console.log('[DELETE /species/:id] Request received for ID:', id, '-> parsed:', idNum);

    if (!id || isNaN(idNum)) {
      console.log('[DELETE /species/:id] Invalid ID');
      return res.status(400).json({ ok: false, error: "ID invalide" });
    }

    // Vérifier si l'espèce existe
    const existingSpecies = await db.execute(sql`
      SELECT id FROM especes WHERE id = ${idNum}
    `);
    console.log('[DELETE /species/:id] Existing species check:', existingSpecies);

    if (!existingSpecies || existingSpecies.length === 0) {
      console.log('[DELETE /species/:id] Species not found');
      return res.status(404).json({ ok: false, error: "Espèce introuvable" });
    }

    // Vérifier si l'espèce est utilisée dans des taxes d'abattage
    const usageRows: any[] = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM taxe_especes
      WHERE espece_id = ${idNum} AND taxable = true
    `);

    const usageCount = Number(usageRows?.[0]?.count ?? 0);
    console.log('[DELETE /species/:id] Usage count in taxe_especes:', usageCount);

    if (usageCount > 0) {
      const force = (() => {
        const q: any = (req as any)?.query || {};
        const v = q.force;
        if (v === undefined) return false;
        if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
        return !!v;
      })();

      if (!force) {
        console.log('[DELETE /species/:id] Species is in use and no force flag provided -> blocking deletion');
        return res.status(400).json({
          ok: false,
          error: "Impossible de supprimer cette espèce car elle est utilisée dans les taxes d'abattage",
        });
      }

      // force=true -> nettoyer les références dans taxe_especes puis poursuivre
      console.log('[DELETE /species/:id] Force delete enabled -> cleaning taxe_especes references before deletion');
      await db.execute(sql`
        DELETE FROM taxe_especes WHERE espece_id = ${idNum}
      `);
    }

    // Suppression définitive
    console.log('[DELETE /species/:id] Proceeding with deletion');
    await db.execute(sql`
      DELETE FROM especes WHERE id = ${idNum}
    `);

    console.log('[DELETE /species/:id] Species deleted successfully');
    res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /species/:id] Error:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression de l\'espèce' });
  }
});

// Route pour récupérer les taxes d'abattage
router.get('/hunting-taxes', isAuthenticated, async (req, res) => {
  try {
    // Lister toutes les espèces marquées taxable = true, même sans ligne dans taxe_especes.
    // Prix par défaut = 0 si aucune ligne. Inclure l'id de la taxe si elle existe pour permettre l'édition.
    const rows = await db.execute(sql`
      SELECT
        te.id                               AS id,
        e.id                                AS espece_id,
        e.nom                               AS espece_nom,
        e.groupe                            AS groupe,
        COALESCE(te.prix_xof, 0)            AS prix_xof,
        COALESCE(te.taxable, true)          AS taxable
      FROM especes e
      LEFT JOIN taxe_especes te
        ON e.id = (CASE WHEN (te.espece_id::text ~ '^[0-9]+$') THEN te.espece_id::int ELSE NULL END)
        AND (te.taxable IS DISTINCT FROM FALSE)
      WHERE e.taxable = true
      ORDER BY e.nom ASC
    `);
    const data = Array.isArray(rows) ? rows : (rows && Array.isArray((rows as any).rows) ? (rows as any).rows : []);
    res.json({ ok: true, data });
  } catch (error) {
    console.error('Error fetching hunting taxes:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des taxes d\'abattage' });
  }
});

// Route pour créer/mettre à jour une taxe d'abattage
router.post('/hunting-taxes', isAuthenticated, async (req, res) => {
  try {
    const { espece_id, prix_xof } = req.body;

    if (!espece_id || prix_xof === undefined) {
      return res.status(400).json({ ok: false, error: 'ID espèce et prix sont requis' });
    }

    // Vérifier si la taxe existe déjà
    const existing = await db.execute(sql`
      SELECT id FROM taxe_especes WHERE espece_id = ${espece_id}
    `);

    if (existing.length > 0) {
      // Mettre à jour
      await db.execute(sql`
        UPDATE taxe_especes
        SET prix_xof = ${prix_xof}, taxable = true, updated_at = CURRENT_TIMESTAMP
        WHERE espece_id = ${espece_id}
      `);
    } else {
      // Créer
      await db.execute(sql`
        INSERT INTO taxe_especes (espece_id, prix_xof, taxable)
        VALUES (${espece_id}, ${prix_xof}, true)
      `);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error saving hunting tax:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la sauvegarde de la taxe' });
  }
});

// Route pour supprimer (désactiver) une taxe d'abattage
router.delete('/hunting-taxes/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    // Récupérer l'espece_id pour synchroniser la table especes
    const rows: any[] = await db.execute(sql`SELECT espece_id FROM taxe_especes WHERE id = ${id} LIMIT 1`);
    const especeId = rows?.[0]?.espece_id;

    await db.execute(sql`
      UPDATE taxe_especes
      SET taxable = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);

    if (especeId != null) {
      // Mettre aussi l'espèce en non taxable pour cohérence
      await db.execute(sql`
        UPDATE especes SET taxable = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${especeId}
      `);
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting hunting tax:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression de la taxe' });
  }
});

// Route pour récupérer les espèces chassables (pour HuntingActivities)
router.get('/species/huntable', isAuthenticated, async (req, res) => {
  try {
    const species = await db.execute(sql`
      SELECT
        e.id,
        e.nom,
        e.nom_scientifique,
        e.groupe,
        e.chassable,
        e.taxable,
        e.photo_url,
        e.photo_data,
        e.photo_mime,
        e.photo_name,
        COALESCE(te.prix_xof, 0) as taxe_prix
      FROM especes e
      LEFT JOIN taxe_especes te ON e.id = (CASE WHEN (te.espece_id::text ~ '^[0-9]+$') THEN te.espece_id::int ELSE NULL END) AND (te.taxable IS DISTINCT FROM FALSE)
      WHERE e.chassable = true
      ORDER BY e.groupe, e.nom ASC
    `);
    const huntable = Array.isArray(species) ? species : (species && Array.isArray((species as any).rows) ? (species as any).rows : []);
    res.json({ ok: true, data: huntable });
  } catch (error) {
    console.error('Error fetching huntable species:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des espèces chassables' });
  }
});


// Route pour récupérer les paramètres de campagne
router.get('/campaign', isAuthenticated, async (req, res) => {
  try {
    // 1) Tenter via DB (table hunting_campaigns) si disponible
    let campaignRow: any | null = null;
    try {
      const rows: any[] = await db.execute(sql`
        SELECT id, start_date, end_date, year, is_active
        FROM hunting_campaigns
        ORDER BY (CASE WHEN is_active THEN 0 ELSE 1 END), updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `);
      if (rows && rows.length > 0) {
        campaignRow = rows[0];
      }
    } catch {
      // table peut ne pas exister encore, fallback storage
    }

    // 2) Fallback storage si DB vide/non dispo
    if (!campaignRow) {
      const legacy = await storage.getHuntingCampaignSettings?.();
      if (!legacy) {
        return res.json({
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          year: `${new Date().getFullYear()}-${new Date().getFullYear()}`,
          isActive: true,
          periods: [],
        });
      }
      return res.json({ ...legacy, periods: [] });
    }

    // 3) Charger les périodes spécifiques liées à la campagne
    let periodsRows: any[] = [];
    try {
      periodsRows = await db.execute(sql`
        SELECT code, name, groupe, genre, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaignRow.id}
        ORDER BY code ASC
      `);
    } catch {
      periodsRows = await db.execute(sql`
        SELECT code, name, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaignRow.id}
        ORDER BY code ASC
      `);
    }
    const periods = (periodsRows || []).map((p: any) => ({
      code: String(p.code),
      name: String(p.name),
      groupe: (p as any).groupe !== undefined && (p as any).groupe !== null ? String((p as any).groupe) : undefined,
      genre: (p as any).genre !== undefined && (p as any).genre !== null ? String((p as any).genre) : undefined,
      startDate: p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : String(p.start_date),
      endDate: p.end_date instanceof Date ? p.end_date.toISOString().split('T')[0] : String(p.end_date),
      enabled: !!p.enabled,
      derogationEnabled: !!p.derogation_enabled,
    }));

    // 4) Charger les périodes spécifiques par catégorie (Option B) si la table existe
    let categoryPeriods: any[] = [];
    try {
      const catRows: any[] = await db.execute(sql`
        SELECT category_key, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_category_periods
        WHERE campaign_id = ${campaignRow.id}
        ORDER BY category_key ASC
      `);
      categoryPeriods = (catRows || []).map((p: any) => ({
        categoryKey: String(p.category_key),
        startDate: p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : String(p.start_date),
        endDate: p.end_date instanceof Date ? p.end_date.toISOString().split('T')[0] : String(p.end_date),
        enabled: !!p.enabled,
        derogationEnabled: !!p.derogation_enabled,
      }));
    } catch {
      categoryPeriods = [];
    }

    return res.json({
      id: Number(campaignRow.id),
      startDate: campaignRow.start_date instanceof Date ? campaignRow.start_date.toISOString().split('T')[0] : String(campaignRow.start_date),
      endDate: campaignRow.end_date instanceof Date ? campaignRow.end_date.toISOString().split('T')[0] : String(campaignRow.end_date),
      year: String(campaignRow.year),
      isActive: !!campaignRow.is_active,
      periods,
      categoryPeriods,
    });
  } catch (error) {
    console.error('Erreur lors de la récupération des paramètres de campagne:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route dédiée pour récupérer uniquement les périodes de campagne actives
router.get('/campaign-periods', isAuthenticated, async (req, res) => {
  try {
    // Tenter d'identifier la campagne active ou la plus récente
    let campaignRow: any | null = null;
    try {
      const rows: any[] = await db.execute(sql`
        SELECT id, start_date, end_date, year, is_active
        FROM hunting_campaigns
        ORDER BY (CASE WHEN is_active THEN 0 ELSE 1 END), updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      `);
      if (rows && rows.length > 0) {
        campaignRow = rows[0];
      }
    } catch {
      // table absente ou vide -> retourner liste vide
    }

    if (!campaignRow) {
      return res.json({ ok: true, data: [] });
    }

    let periodsRows: any[] = [];
    try {
      periodsRows = await db.execute(sql`
        SELECT code, name, groupe, genre, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaignRow.id}
        ORDER BY code ASC
      `);
    } catch {
      periodsRows = await db.execute(sql`
        SELECT code, name, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaignRow.id}
        ORDER BY code ASC
      `);
    }

    const data = (periodsRows || []).map((p: any) => ({
      code: String(p.code),
      name: String(p.name),
      groupe: (p as any).groupe !== undefined && (p as any).groupe !== null ? String((p as any).groupe) : undefined,
      genre: (p as any).genre !== undefined && (p as any).genre !== null ? String((p as any).genre) : undefined,
      startDate: p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : String(p.start_date),
      endDate: p.end_date instanceof Date ? p.end_date.toISOString().split('T')[0] : String(p.end_date),
      enabled: !!p.enabled,
      derogationEnabled: !!p.derogation_enabled,
    }));

    return res.json({ ok: true, data });
  } catch (error) {
    console.error('Erreur lors de la récupération des périodes de campagne:', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// Route pour sauvegarder les paramètres de campagne
router.post('/campaign', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé: réservé aux administrateurs" });
    }

    const { startDate, endDate, year, isActive, periods, categoryPeriods } = req.body || {} as {
      startDate?: string; endDate?: string; year?: string; isActive?: boolean;
      periods?: Array<{ code: string; name?: string; groupe?: string; genre?: string; startDate: string; endDate: string; enabled?: boolean; derogationEnabled?: boolean }>
      categoryPeriods?: Array<{ categoryKey: string; startDate: string; endDate: string; enabled?: boolean; derogationEnabled?: boolean }>
    };

    if (!startDate || !endDate || !year) {
      return res.status(400).json({ message: "Les champs startDate, endDate et year sont requis." });
    }

    // Validation: la date de fermeture ne peut pas être antérieure à la date d'ouverture
    const campStart = new Date(startDate);
    const campEnd = new Date(endDate);
    if (isNaN(campStart.getTime()) || isNaN(campEnd.getTime())) {
      return res.status(400).json({ message: "Dates de campagne invalides." });
    }
    if (campEnd < campStart) {
      return res.status(400).json({ message: "La date de fermeture de la Campagne Cynégétique de Chasse ne peut pas être antérieure à la date d'ouverture." });
    }

    // Upsert campagne dans hunting_campaigns (conflit sur year)
    const upsertCampaignRows: any[] = await db.execute(sql`
      INSERT INTO hunting_campaigns (start_date, end_date, year, is_active)
      VALUES (${startDate}, ${endDate}, ${year}, ${!!isActive})
      ON CONFLICT (year) DO UPDATE
        SET start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            is_active = EXCLUDED.is_active,
            updated_at = CURRENT_TIMESTAMP
      RETURNING id, start_date, end_date, year, is_active
    `);
    const campaign = upsertCampaignRows?.[0];

    // Gérer les périodes spécifiques si fournies
    if (Array.isArray(periods)) {
      // campStart/campEnd déjà calculés et vérifiés

      for (const p of periods) {
        if (!p || !p.code || !p.startDate || !p.endDate) continue;
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        const derog = !!p.derogationEnabled;

        // Validation: chaque période doit avoir une fin >= début
        if (pEnd < pStart) {
          return res.status(400).json({
            message: `La date de fermeture de la période '${p.code}' ne peut pas être antérieure à sa date d'ouverture.`,
            code: p.code,
          });
        }
        if (!derog) {
          if (pStart < campStart || pEnd > campEnd) {
            return res.status(400).json({
              message: `La période '${p.code}' doit être comprise entre la date d'ouverture et de fermeture de la campagne, sauf dérogation.`,
              code: p.code,
            });
          }
        }
        const name = p.name || (p.code === 'big_game' ? 'Grande chasse' : p.code === 'waterfowl' ? "Gibier d'Eau" : p.code);
        try {
          await db.execute(sql`
            INSERT INTO hunting_campaign_periods (campaign_id, code, name, groupe, genre, start_date, end_date, enabled, derogation_enabled)
            VALUES (${campaign.id}, ${p.code}, ${name}, ${(p as any).groupe ?? null}, ${(p as any).genre ?? null}, ${p.startDate}, ${p.endDate}, ${p.enabled ?? true}, ${derog})
            ON CONFLICT (campaign_id, code) DO UPDATE SET
              name = EXCLUDED.name,
              groupe = EXCLUDED.groupe,
              genre = EXCLUDED.genre,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date,
              enabled = EXCLUDED.enabled,
              derogation_enabled = EXCLUDED.derogation_enabled,
              updated_at = CURRENT_TIMESTAMP
          `);
        } catch {
          await db.execute(sql`
            INSERT INTO hunting_campaign_periods (campaign_id, code, name, start_date, end_date, enabled, derogation_enabled)
            VALUES (${campaign.id}, ${p.code}, ${name}, ${p.startDate}, ${p.endDate}, ${p.enabled ?? true}, ${derog})
            ON CONFLICT (campaign_id, code) DO UPDATE SET
              name = EXCLUDED.name,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date,
              enabled = EXCLUDED.enabled,
              derogation_enabled = EXCLUDED.derogation_enabled,
              updated_at = CURRENT_TIMESTAMP
          `);
        }
      }
    }

    // Gérer les périodes spécifiques par catégorie (Option B) si fournies
    if (Array.isArray(categoryPeriods)) {
      for (const p of categoryPeriods) {
        if (!p || !p.categoryKey || !p.startDate || !p.endDate) continue;
        const pStart = new Date(p.startDate);
        const pEnd = new Date(p.endDate);
        const derog = !!p.derogationEnabled;
        if (pEnd < pStart) {
          return res.status(400).json({
            message: `La date de fermeture de la période de catégorie '${p.categoryKey}' ne peut pas être antérieure à sa date d'ouverture.`,
            categoryKey: p.categoryKey,
          });
        }
        if (!derog) {
          if (pStart < campStart || pEnd > campEnd) {
            return res.status(400).json({
              message: `La période de catégorie '${p.categoryKey}' doit être comprise entre la date d'ouverture et de fermeture de la campagne, sauf dérogation.`,
              categoryKey: p.categoryKey,
            });
          }
        }
        try {
          await db.execute(sql`
            INSERT INTO hunting_campaign_category_periods (campaign_id, category_key, start_date, end_date, enabled, derogation_enabled)
            VALUES (${campaign.id}, ${p.categoryKey}, ${p.startDate}, ${p.endDate}, ${p.enabled ?? true}, ${derog})
            ON CONFLICT (campaign_id, category_key) DO UPDATE SET
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date,
              enabled = EXCLUDED.enabled,
              derogation_enabled = EXCLUDED.derogation_enabled,
              updated_at = CURRENT_TIMESTAMP
          `);
        } catch {
          // table absente -> ignorer
        }
      }
    }

    // Réponse enrichie avec periods
    let periodsRows: any[] = [];
    try {
      periodsRows = await db.execute(sql`
        SELECT code, name, groupe, genre, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaign.id}
        ORDER BY code ASC
      `);
    } catch {
      periodsRows = await db.execute(sql`
        SELECT code, name, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_periods
        WHERE campaign_id = ${campaign.id}
        ORDER BY code ASC
      `);
    }
    const result = {
      id: Number(campaign.id),
      startDate: campaign.start_date instanceof Date ? campaign.start_date.toISOString().split('T')[0] : String(campaign.start_date),
      endDate: campaign.end_date instanceof Date ? campaign.end_date.toISOString().split('T')[0] : String(campaign.end_date),
      year: String(campaign.year),
      isActive: !!campaign.is_active,
      periods: (periodsRows || []).map((p: any) => ({
        code: String(p.code),
        name: String(p.name),
        groupe: (p as any).groupe !== undefined && (p as any).groupe !== null ? String((p as any).groupe) : undefined,
        genre: (p as any).genre !== undefined && (p as any).genre !== null ? String((p as any).genre) : undefined,
        startDate: p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : String(p.start_date),
        endDate: p.end_date instanceof Date ? p.end_date.toISOString().split('T')[0] : String(p.end_date),
        enabled: !!p.enabled,
        derogationEnabled: !!p.derogation_enabled,
      })),
    };

    try {
      const catRows: any[] = await db.execute(sql`
        SELECT category_key, start_date, end_date, enabled, derogation_enabled
        FROM hunting_campaign_category_periods
        WHERE campaign_id = ${campaign.id}
        ORDER BY category_key ASC
      `);
      (result as any).categoryPeriods = (catRows || []).map((p: any) => ({
        categoryKey: String(p.category_key),
        startDate: p.start_date instanceof Date ? p.start_date.toISOString().split('T')[0] : String(p.start_date),
        endDate: p.end_date instanceof Date ? p.end_date.toISOString().split('T')[0] : String(p.end_date),
        enabled: !!p.enabled,
        derogationEnabled: !!p.derogation_enabled,
      }));
    } catch {
      (result as any).categoryPeriods = [];
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Erreur lors de la sauvegarde des paramètres de campagne:', error);
    res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// get all weapon types
router.get('/weapon-types', isAuthenticated, async (req, res) => {
  try {
    const weaponTypes = await storage.getWeaponTypes();
    res.json(weaponTypes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch weapon types' });
  }
});

// get all weapon brands
router.get('/weapon-brands', isAuthenticated, async (req, res) => {
  try {
    const weaponBrands = await storage.getWeaponBrands();
    res.json(weaponBrands);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch weapon brands' });
  }
});

// get all weapon calibers
router.get('/weapon-calibers', isAuthenticated, async (req, res) => {
  try {
    const weaponCalibers = await storage.getWeaponCalibers();
    res.json(weaponCalibers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch weapon calibers' });
  }
});

// ============ PARAMÈTRES ZONES DE CHASSE ============

// Route pour récupérer tous les types de zones
router.get('/zone-types', isAuthenticated, async (req, res) => {
  try {
    const zoneTypes = await db.execute(sql`
      SELECT id, key, label, color, (is_active IS TRUE) AS is_active, created_at, updated_at
      FROM zone_types
      ORDER BY label ASC
    `);

    const rows = Array.isArray(zoneTypes) ? zoneTypes : (zoneTypes && Array.isArray((zoneTypes as any).rows) ? (zoneTypes as any).rows : []);
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error fetching zone types:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des types de zones' });
  }
});

// Route pour créer un nouveau type de zone
router.post('/zone-types', isAuthenticated, async (req, res) => {
  try {
    const { key, label, color, isActive } = req.body;

    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà
    const existing = await db.execute(sql`
      SELECT id FROM zone_types WHERE key = ${key}
    `);

    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    const result = await db.execute(sql`
      INSERT INTO zone_types (key, label, color, is_active)
      VALUES (${key}, ${label}, ${color || '#0ea5e9'}, ${isActive !== false})
      RETURNING id
    `);

    const newId = result[0]?.id;
    res.json({ ok: true, data: { id: newId } });
  } catch (error) {
    console.error('Error creating zone type:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la création du type de zone' });
  }
});

// Route pour mettre à jour un type de zone
router.put('/zone-types/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { key, label, color, isActive } = req.body;

    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà pour un autre enregistrement
    const existing = await db.execute(sql`
      SELECT id FROM zone_types WHERE key = ${key} AND id != ${id}
    `);

    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    // Récupérer l'ancienne clé pour propager la modification si besoin
    const oldRows: any[] = await db.execute(sql`SELECT key FROM zone_types WHERE id = ${id} LIMIT 1`);
    const oldKey = oldRows?.[0]?.key as string | undefined;

    // Mettre à jour le type
    await db.execute(sql`
      UPDATE zone_types
      SET key = ${key}, label = ${label}, color = ${color || '#0ea5e9'},
          is_active = ${isActive !== false}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);

    // Si la clé a changé, propager vers les zones
    if (oldKey && oldKey !== key) {
      await db.execute(sql`
        UPDATE zones
        SET type = ${key}
        WHERE type = ${oldKey}
      `);
    }

    // Propager la couleur du type vers les zones de ce type
    await db.execute(sql`
      UPDATE zones
      SET color = ${color || '#0ea5e9'}
      WHERE type = ${key}
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating zone type:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour du type de zone' });
  }
});

// Route pour supprimer un type de zone
router.delete('/zone-types/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier si le type est utilisé dans des zones existantes
    const usageCount = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM zones WHERE type = (SELECT key FROM zone_types WHERE id = ${id})
    `);

    if (Number(usageCount[0]?.count || 0) > 0) {
      return res.status(400).json({
        ok: false,
        error: "Impossible de supprimer ce type car il est utilisé par des zones existantes"
      });
    }

    // Suppression logique (désactivation)
    await db.execute(sql`
      UPDATE zone_types SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting zone type:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression du type de zone' });
  }
});

// Route pour récupérer tous les statuts de zones
router.get('/zone-statuses', isAuthenticated, async (req, res) => {
  try {
    const zoneStatuses = await db.execute(sql`
      SELECT id, key, label, (is_active IS TRUE) AS is_active, created_at, updated_at
      FROM zone_statuses
      ORDER BY label ASC
    `);

    const rows = Array.isArray(zoneStatuses) ? zoneStatuses : (zoneStatuses && Array.isArray((zoneStatuses as any).rows) ? (zoneStatuses as any).rows : []);
    res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('Error fetching zone statuses:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des statuts de zones' });
  }
});

// Route pour créer un nouveau statut de zone
router.post('/zone-statuses', isAuthenticated, async (req, res) => {
  try {
    const { key, label, isActive } = req.body;

    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà
    const existing = await db.execute(sql`
      SELECT id FROM zone_statuses WHERE key = ${key}
    `);

    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    const result = await db.execute(sql`
      INSERT INTO zone_statuses (key, label, is_active)
      VALUES (${key}, ${label}, ${isActive !== false})
      RETURNING id
    `);

    const newId = result[0]?.id;
    res.json({ ok: true, data: { id: newId } });
  } catch (error) {
    console.error('Error creating zone status:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la création du statut de zone' });
  }
});

// Route pour mettre à jour un statut de zone
router.put('/zone-statuses/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { key, label, isActive } = req.body;

    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà pour un autre enregistrement
    const existing = await db.execute(sql`
      SELECT id FROM zone_statuses WHERE key = ${key} AND id != ${id}
    `);

    if (existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    await db.execute(sql`
      UPDATE zone_statuses
      SET key = ${key}, label = ${label}, is_active = ${isActive !== false}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error updating zone status:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour du statut de zone' });
  }
});

// Route pour supprimer un statut de zone
router.delete('/zone-statuses/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;

    // Vérifier si le statut est utilisé dans des zones existantes
    const usageCount = await db.execute(sql`
      SELECT COUNT(*)::int AS count FROM zones WHERE status = (SELECT key FROM zone_statuses WHERE id = ${id})
    `);

    if (Number(usageCount[0]?.count || 0) > 0) {
      return res.status(400).json({
        ok: false,
        error: "Impossible de supprimer ce statut car il est utilisé par des zones existantes"
      });
    }

    // Suppression logique (désactivation)
    await db.execute(sql`
      UPDATE zone_statuses SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}
    `);

    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting zone status:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression du statut de zone' });
  }
});

// --- New endpoints: national override for agents ---
// GET /api/settings/national-override -> { enabled: boolean }
router.get('/national-override', isAuthenticated, async (req, res) => {
  try {
    const rows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'national_agent_override' LIMIT 1`);
    let enabled = false;
    if (rows && rows.length > 0) {
      const raw = rows[0].value as any;
      if (typeof raw === 'string') {
        // value peut être 'true'/'false' ou un JSON { enabled: boolean }
        try {
          if (raw === 'true' || raw === 'false') {
            enabled = raw === 'true';
          } else {
            const parsed = JSON.parse(raw);
            enabled = !!parsed?.enabled;
          }
        } catch {
          enabled = raw === 'true';
        }
      } else if (typeof raw === 'object' && raw !== null) {
        enabled = !!(raw as any).enabled;
      }
    }
    return res.json({ enabled });
  } catch (error) {
    console.error('[GET /api/settings/national-override] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// GET /api/settings/regional-filter-protected-zones -> { enabled: boolean }
router.get('/regional-filter-protected-zones', isAuthenticated, async (_req, res) => {
  try {
    const rows: any[] = await db.execute(sql`
      SELECT setting_value FROM system_settings WHERE setting_key = 'regional_filter_protected_zones' LIMIT 1
    `);
    let enabled = false;
    if (rows && rows.length > 0) {
      const raw = rows[0].setting_value as any;
      if (typeof raw === 'string') enabled = raw === 'true' || raw === '1';
      else enabled = !!raw;
    }
    return res.json({ enabled });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// POST /api/settings/regional-filter-protected-zones -> body: { enabled: boolean }
router.post('/regional-filter-protected-zones', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé: réservé aux administrateurs' });
    }
    const enabled = !!(req.body?.enabled);
    await db.execute(sql`
      INSERT INTO system_settings (setting_key, setting_value, description)
      VALUES ('regional_filter_protected_zones', ${enabled ? 'true' : 'false'}, 'Filtrage régional des zones protégées')
      ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP
    `);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// PUT /api/settings/national-override -> { enabled: boolean }
router.put('/national-override', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé: réservé aux administrateurs" });
    }
    const { enabled } = (req.body || {}) as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "Paramètre 'enabled' (boolean) requis" });
    }
    const value = JSON.stringify({ enabled, updatedAt: new Date().toISOString(), updatedBy: Number((req as any)?.user?.id || 0) });
    await db.execute(sql`
      INSERT INTO settings(key, value, description)
      VALUES ('national_agent_override', ${value}, 'Autoriser agents (région & secteur) à délivrer permis/taxes à tous les chasseurs (national)')
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
    `);
    return res.json({ enabled });
  } catch (error) {
    console.error('[PUT /api/settings/national-override] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// --- New endpoints: agent-permit-access (feature flag for showing permit details button in hunter modal) ---
// GET /api/settings/agent-permit-access -> { enabled: boolean }
router.get('/agent-permit-access', isAuthenticated, async (req, res) => {
  try {
    const rows: any[] = await db.execute(sql`SELECT value FROM settings WHERE key = 'agent_permit_access' LIMIT 1`);
    let enabled = false;
    if (rows && rows.length > 0) {
      const raw = rows[0].value as any;
      if (typeof raw === 'string') {
        try {
          if (raw === 'true' || raw === 'false') {
            enabled = raw === 'true';
          } else {
            const parsed = JSON.parse(raw);
            enabled = !!parsed?.enabled;
          }
        } catch {
          enabled = raw === 'true';
        }
      } else if (typeof raw === 'object' && raw !== null) {
        enabled = !!(raw as any).enabled;
      }
    }
    return res.json({ enabled });
  } catch (error) {
    console.error('[GET /api/settings/agent-permit-access] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// PUT /api/settings/agent-permit-access -> { enabled: boolean }
router.put('/agent-permit-access', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé: réservé aux administrateurs" });
    }
    const { enabled } = (req.body || {}) as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "Paramètre 'enabled' (boolean) requis" });
    }
    const value = JSON.stringify({ enabled, updatedAt: new Date().toISOString(), updatedBy: Number((req as any)?.user?.id || 0) });
    const descriptionText = 'Afficher le bouton d’accès aux détails de permis dans la fiche chasseur pour les agents';
    await db.execute(sql`
      INSERT INTO settings(key, value, description)
      VALUES ('agent_permit_access', ${value}, ${descriptionText})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description, updated_at = CURRENT_TIMESTAMP
    `);
    return res.json({ enabled });
  } catch (error) {
    console.error('[PUT /api/settings/agent-permit-access] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// ============ TYPES DE ZONES PROTÉGÉES ============

// GET /api/settings/protected-zone-types
router.get('/protected-zone-types', isAuthenticated, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT id, key, label, is_active AS "isActive", created_at, updated_at
      FROM protected_zone_types
      ORDER BY label ASC
    `);

    const rows = Array.isArray(result) ? result : [];
    return res.json({ ok: true, data: rows });
  } catch (error) {
    console.error('[GET /api/settings/protected-zone-types] error', error);
    return res.status(500).json({ ok: false, error: 'Erreur lors du chargement des types de zones protégées' });
  }
});

// POST /api/settings/protected-zone-types
router.post('/protected-zone-types', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ ok: false, error: "Accès refusé: réservé aux administrateurs" });
    }

    const { key, label, isActive } = req.body;
    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà
    const existing = await db.execute(sql`
      SELECT id FROM protected_zone_types WHERE key = ${key}
    `);

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    const result = await db.execute(sql`
      INSERT INTO protected_zone_types (key, label, is_active)
      VALUES (${key}, ${label}, ${isActive !== false})
      RETURNING id
    `);

    const newId = Array.isArray(result) && result.length > 0 ? (result[0] as any).id : null;
    return res.json({ ok: true, data: { id: newId } });
  } catch (error) {
    console.error('[POST /api/settings/protected-zone-types] error', error);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la création du type de zone protégée' });
  }
});

// PUT /api/settings/protected-zone-types/:id
router.put('/protected-zone-types/:id', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ ok: false, error: "Accès refusé: réservé aux administrateurs" });
    }

    const { id } = req.params;
    const { key, label, isActive } = req.body;

    if (!key || !label) {
      return res.status(400).json({ ok: false, error: "Les champs 'key' et 'label' sont requis" });
    }

    // Vérifier si la clé existe déjà pour un autre enregistrement
    const existing = await db.execute(sql`
      SELECT id FROM protected_zone_types WHERE key = ${key} AND id != ${Number(id)}
    `);

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(400).json({ ok: false, error: "Cette clé existe déjà" });
    }

    await db.execute(sql`
      UPDATE protected_zone_types
      SET key = ${key}, label = ${label}, is_active = ${isActive !== false}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${Number(id)}
    `);

    return res.json({ ok: true });
  } catch (error) {
    console.error('[PUT /api/settings/protected-zone-types/:id] error', error);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour du type de zone protégée' });
  }
});

// DELETE /api/settings/protected-zone-types/:id
router.delete('/protected-zone-types/:id', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ ok: false, error: "Accès refusé: réservé aux administrateurs" });
    }

    const { id } = req.params;

    // Vérifier si le type est utilisé par des zones protégées
    const usage = await db.execute(sql`
      SELECT COUNT(*) as count FROM protected_zones WHERE type = (
        SELECT key FROM protected_zone_types WHERE id = ${Number(id)}
      )
    `);

    const usageCount = Array.isArray(usage) && usage.length > 0 ? (usage[0] as any).count : 0;
    if (usageCount > 0) {
      return res.status(400).json({
        ok: false,
        error: `Ce type est utilisé par ${usageCount} zone(s) protégée(s). Suppression impossible.`
      });
    }

    await db.execute(sql`
      DELETE FROM protected_zone_types WHERE id = ${Number(id)}
    `);

    return res.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/settings/protected-zone-types/:id] error', error);
    return res.status(500).json({ ok: false, error: 'Erreur lors de la suppression du type de zone protégée' });
  }
});

// ============ FILTRAGE RÉGIONAL DES ZONES PROTÉGÉES ============

// GET /api/settings/regional-filter-protected-zones
router.get('/regional-filter-protected-zones', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin' && role !== 'regional-agent' && role !== 'sector-agent') {
      return res.status(403).json({ message: "Accès refusé" });
    }

    // Récupérer le paramètre depuis system_settings
    const result = await db.execute(sql`
      SELECT setting_value FROM system_settings
      WHERE setting_key = 'regional_filter_protected_zones'
      LIMIT 1
    `);

    let enabled = false;
    if (Array.isArray(result) && result.length > 0) {
      const value = (result[0] as any).setting_value;
      enabled = value === 'true' || value === '1' || value === 1 || value === true;
    }

    return res.json({ enabled });
  } catch (error) {
    console.error('[GET /api/settings/regional-filter-protected-zones] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

// POST /api/settings/regional-filter-protected-zones -> { enabled: boolean }
router.post('/regional-filter-protected-zones', isAuthenticated, async (req, res) => {
  try {
    const role = (req as any)?.user?.role;
    if (role !== 'admin') {
      return res.status(403).json({ message: "Accès refusé: réservé aux administrateurs" });
    }

    const { enabled } = (req.body || {}) as { enabled?: boolean };
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "Paramètre 'enabled' (boolean) requis" });
    }

    const value = enabled ? 'true' : 'false';
    const descriptionText = 'Active le filtrage régional pour les zones protégées : les agents régionaux et secteurs ne voient que les zones de leur région';

    await db.execute(sql`
      INSERT INTO system_settings(setting_key, setting_value, description)
      VALUES ('regional_filter_protected_zones', ${value}, ${descriptionText})
      ON CONFLICT (setting_key) DO UPDATE SET
        setting_value = EXCLUDED.setting_value,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP
    `);

    return res.json({ enabled });
  } catch (error) {
    console.error('[POST /api/settings/regional-filter-protected-zones] error', error);
    return res.status(500).json({ message: 'Erreur interne du serveur.' });
  }
});

export default router;
