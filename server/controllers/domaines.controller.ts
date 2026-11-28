import { and, asc, count, eq, ne, or, sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { affectations, domaines, userDomains } from '../../shared/schema.js';
import { db } from '../db.js';

let visibilityColumnPromise: Promise<void> | null = null;

/** Assure de façon idempotente la présence des colonnes `is_visible` et `allow_self_registration` sur `domaines`. */
export async function ensureDomaineVisibilityColumn(): Promise<void> {
  if (!visibilityColumnPromise) {
    visibilityColumnPromise = (async () => {
      await db.execute(sql`
        ALTER TABLE domaines
        ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS allow_self_registration BOOLEAN NOT NULL DEFAULT true
      `);
    })().catch((err) => {
      visibilityColumnPromise = null;
      throw err;
    });
  }
  return visibilityColumnPromise;
}

// Mapping des types de données statistiques par domaine
const resetDataTypes: Record<string, { value: string; label: string; tables: { tableName: string; display: string }[] }> = {
  CHASSE: {
    value: 'CHASSE',
    label: 'Chasse',
    tables: [
      { tableName: 'permits', display: 'Permis de chasse' },
      { tableName: 'taxes', display: "Taxes d'abattage" },
      { tableName: 'hunters', display: 'Chasseurs enregistrés' },
      { tableName: 'hunting_reports', display: "Déclarations d'abattage" },
      { tableName: 'hunted_species', display: 'Prélèvements' },
      { tableName: 'permit_requests', display: 'Demandes de permis' },
      { tableName: 'guide_hunter_associations', display: 'Associations guide-chasseur' },
      { tableName: 'history', display: 'Historique des opérations' },
    ],
  },
  PRODUITS_FORESTIERS: {
    value: 'PRODUITS_FORESTIERS',
    label: 'Produits Forestiers',
    tables: [
      { tableName: 'permits', display: 'Permis' },
      { tableName: 'taxes', display: 'Taxes' },
      { tableName: 'history', display: 'Historique des opérations' },
    ],
  },
  REBOISEMENT: {
    value: 'REBOISEMENT',
    label: 'Reboisement',
    tables: [
      { tableName: 'reforestation_reports', display: 'Rapports de reboisement' },
      { tableName: 'reforestation_production_data', display: 'Données de production' },
      { tableName: 'reforestation_plants_data', display: 'Données des plants' },
      { tableName: 'reforestation_species_data', display: 'Données des espèces' },
      { tableName: 'reforestation_field_data', display: 'Données de terrain' },
      { tableName: 'history', display: 'Historique des opérations' },
    ],
  },
  ALERTE: {
    value: 'ALERTE',
    label: 'Alerte',
    tables: [
      { tableName: 'alerts', display: 'Alertes' },
      { tableName: 'notifications', display: 'Notifications' },
      { tableName: 'history', display: 'Historique des opérations' },
    ],
  },
};

const createSchema = z.object({
  nomDomaine: z.string().min(1),
  codeSlug: z.string().min(1),
  description: z.string().optional().nullable(),
  couleurTheme: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  allowSelfRegistration: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  id: z.number().int().positive(),
});

const normalizeSlug = (value: string) => {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_');
  if (!base) return base;
  return base.charAt(0).toUpperCase() + base.slice(1);
};

export const listDomaines = async (_req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const rows = await db.select().from(domaines).orderBy(asc(domaines.nomDomaine));
    return res.json(rows);
  } catch (err) {
    console.error('[domaines.list] failed', err);
    return res.status(500).json({ message: 'Erreur lors du chargement des domaines' });
  }
};

export const listActiveDomainesPublic = async (_req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const rows = await db
      .select()
      .from(domaines)
      .where(eq(domaines.isActive, true))
      .orderBy(asc(domaines.nomDomaine));
    return res.json(rows);
  } catch (err) {
    console.error('[domaines.listPublic] failed', err);
    return res.status(500).json({ message: 'Erreur lors du chargement des domaines' });
  }
};

export const createDomaine = async (req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation invalide', errors: parsed.error.issues });
    }

    const nomDomaine = parsed.data.nomDomaine.trim().toUpperCase();
    const codeSlug = normalizeSlug(parsed.data.codeSlug);

    const existing = await db
      .select()
      .from(domaines)
      .where(or(eq(domaines.nomDomaine, nomDomaine), eq(domaines.codeSlug, codeSlug)))
      .limit(1);

    if (existing[0]) {
      return res.status(409).json({
        message: 'Conflit: un domaine avec le même nom ou le même slug existe déjà. Utilisez "Modifier".',
        existingId: existing[0].id,
      });
    }

    const isActive = parsed.data.isActive ?? true;
    const isVisible = isActive ? (parsed.data.isVisible ?? true) : false;
    const allowSelfRegistration = isActive ? (parsed.data.allowSelfRegistration ?? true) : false;
    const values: any = {
      nomDomaine,
      codeSlug,
      description: parsed.data.description ?? null,
      couleurTheme: parsed.data.couleurTheme ?? null,
      isActive,
      isVisible,
      allowSelfRegistration,
    };

    const created = await db.insert(domaines).values(values).returning();
    return res.status(201).json(created[0]);
  } catch (err) {
    console.error('[domaines.create] failed', err);
    return res.status(500).json({ message: 'Erreur lors de la création du domaine' });
  }
};

export const updateDomaine = async (req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const id = Number(req.params.id);
    const parsed = updateSchema.safeParse({ ...req.body, id });
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation invalide', errors: parsed.error.issues });
    }

    const patch: any = {};
    if (parsed.data.nomDomaine !== undefined) patch.nomDomaine = parsed.data.nomDomaine.trim().toUpperCase();
    if (parsed.data.codeSlug !== undefined) patch.codeSlug = normalizeSlug(parsed.data.codeSlug);
    if (parsed.data.description !== undefined) patch.description = parsed.data.description ?? null;
    if (parsed.data.couleurTheme !== undefined) patch.couleurTheme = parsed.data.couleurTheme ?? null;
    if (parsed.data.isActive !== undefined) {
      patch.isActive = parsed.data.isActive;
      if (!parsed.data.isActive) patch.isVisible = false;
    }
    if (parsed.data.isVisible !== undefined) patch.isVisible = parsed.data.isVisible;
    if (parsed.data.allowSelfRegistration !== undefined) patch.allowSelfRegistration = parsed.data.allowSelfRegistration;

    if (patch.nomDomaine !== undefined || patch.codeSlug !== undefined) {
      const orParts: any[] = [];
      if (patch.nomDomaine !== undefined) orParts.push(eq(domaines.nomDomaine, patch.nomDomaine));
      if (patch.codeSlug !== undefined) orParts.push(eq(domaines.codeSlug, patch.codeSlug));

      if (orParts.length > 0) {
        const conflict = await db
          .select()
          .from(domaines)
          .where(and(ne(domaines.id, id), or(...orParts)))
          .limit(1);

        if (conflict[0]) {
          return res.status(409).json({
            message: 'Conflit: un autre domaine avec le même nom ou le même slug existe déjà.',
            existingId: conflict[0].id,
          });
        }
      }
    }

    const updated = await db.update(domaines).set(patch).where(eq(domaines.id, id)).returning();
    if (!updated[0]) return res.status(404).json({ message: 'Domaine introuvable' });
    return res.json(updated[0]);
  } catch (err) {
    console.error('[domaines.update] failed', err);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du domaine' });
  }
};

export const setDomaineActive = async (req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID de domaine invalide' });
    }
    const activeParam = String(req.params.active);
    const isActive = activeParam === 'true' || activeParam === '1';

    const patch: { isActive: boolean; isVisible?: boolean } = { isActive };
    if (!isActive) {
      patch.isVisible = false;
    }

    const updated = await db.update(domaines).set(patch as any).where(eq(domaines.id, id)).returning();
    if (!updated[0]) return res.status(404).json({ message: 'Domaine introuvable' });
    return res.json(updated[0]);
  } catch (err) {
    console.error('[domaines.setActive] failed', err);
    return res.status(500).json({ message: 'Erreur lors de la mise à jour du statut' });
  }
};

export const setDomaineVisible = async (req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID de domaine invalide' });
    }
    const visibleParam = String(req.params.visible);
    const isVisible = visibleParam === 'true' || visibleParam === '1';

    const [existing] = await db.select().from(domaines).where(eq(domaines.id, id)).limit(1);
    if (!existing) return res.status(404).json({ message: 'Domaine introuvable' });

    if (isVisible && !existing.isActive) {
      return res.status(400).json({
        message: "Un domaine inactif ne peut pas être affiché à la connexion. Activez d'abord son statut.",
      });
    }

    const updated = await db
      .update(domaines)
      .set({ isVisible } as any)
      .where(eq(domaines.id, id))
      .returning();
    return res.json(updated[0]);
  } catch (err) {
    console.error('[domaines.setVisible] failed', err);
    return res.status(500).json({ message: "Erreur lors de la mise à jour de l'affichage" });
  }
};

/** Compte le nombre de domaines actuellement actifs et visibles à la connexion. */
export async function countVisibleActiveDomaines(): Promise<number> {
  await ensureDomaineVisibilityColumn();
  const [{ value }] = await db
    .select({ value: count() })
    .from(domaines)
    .where(and(eq(domaines.isActive, true), eq(domaines.isVisible, true)));
  return Number(value || 0);
}

const canonicalDomainFamily = (name?: string | null, slug?: string | null): string => {
  const text = `${String(name || '')} ${String(slug || '')}`.toLowerCase();
  if (text.includes('chasse') || text.includes('faune')) return 'CHASSE';
  if (text.includes('produit') || text.includes('forestier')) return 'PRODUITS_FORESTIERS';
  if (text.includes('reboisement') || text.includes('pepini')) return 'REBOISEMENT';
  if (text.includes('alerte')) return 'ALERTE';
  return String(name || slug || '').trim().toUpperCase().replace(/\s+/g, '_');
};

/** Vérifie en base si l'auto-inscription publique est autorisée pour un domaine donné. */
export async function isDomainSelfRegistrationAllowed(
  domainIdentifier?: string | null
): Promise<{ allowed: boolean; reason?: 'DOMAIN_INACTIVE' | 'SELF_REGISTRATION_DISABLED'; domaineName?: string }> {
  await ensureDomaineVisibilityColumn();
  const rows = await db.select().from(domaines);
  if (!rows || rows.length === 0) {
    return { allowed: true };
  }

  const targetRaw = String(domainIdentifier || 'CHASSE').trim();
  const targetNorm = targetRaw.toLowerCase().replace(/[\s-]+/g, '_');
  const targetFamily = canonicalDomainFamily(targetRaw, targetRaw);

  const matched =
    rows.find(
      (r) =>
        r.nomDomaine.trim().toLowerCase() === targetRaw.toLowerCase() ||
        r.codeSlug.trim().toLowerCase().replace(/[\s-]+/g, '_') === targetNorm
    ) ||
    rows.find((r) => canonicalDomainFamily(r.nomDomaine, r.codeSlug) === targetFamily) ||
    // Sécurité: si une valeur de domaine arbitraire est fournie, appliquer la politique du domaine CHASSE (domaine attribué par défaut à /register)
    rows.find((r) => canonicalDomainFamily(r.nomDomaine, r.codeSlug) === 'CHASSE');

  if (!matched) {
    return { allowed: true };
  }

  if (!matched.isActive) {
    return { allowed: false, reason: 'DOMAIN_INACTIVE', domaineName: matched.nomDomaine };
  }

  if (matched.allowSelfRegistration === false) {
    return { allowed: false, reason: 'SELF_REGISTRATION_DISABLED', domaineName: matched.nomDomaine };
  }

  return { allowed: true, domaineName: matched.nomDomaine };
}

export const setDomaineSelfRegistration = async (req: Request, res: Response) => {
  try {
    await ensureDomaineVisibilityColumn();
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'ID de domaine invalide' });
    }
    const enabledParam = String(req.params.enabled);
    const allowSelfRegistration = enabledParam === 'true' || enabledParam === '1';

    const [existing] = await db.select().from(domaines).where(eq(domaines.id, id)).limit(1);
    if (!existing) return res.status(404).json({ message: 'Domaine introuvable' });

    if (allowSelfRegistration && !existing.isActive) {
      return res.status(400).json({
        message: "Un domaine inactif ne peut pas autoriser l'auto-inscription. Activez d'abord son statut.",
      });
    }

    const updated = await db
      .update(domaines)
      .set({ allowSelfRegistration } as any)
      .where(eq(domaines.id, id))
      .returning();
    return res.json(updated[0]);
  } catch (err) {
    console.error('[domaines.setSelfRegistration] failed', err);
    return res.status(500).json({ message: "Erreur lors de la mise à jour de l'auto-inscription" });
  }
};

export const deleteDomaine = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const [{ value: affectationsCount }] = await db
      .select({ value: count() })
      .from(affectations)
      .where(eq(affectations.domaineId, id));

    const [{ value: userDomainsCount }] = await db
      .select({ value: count() })
      .from(userDomains)
      .where(eq(userDomains.domaineId, id));

    const totalRefs = Number(affectationsCount || 0) + Number(userDomainsCount || 0);
    if (totalRefs > 0) {
      return res.status(409).json({
        message: 'Suppression impossible: domaine utilisé ailleurs.',
        references: {
          affectations: Number(affectationsCount || 0),
          userDomains: Number(userDomainsCount || 0),
        },
      });
    }

    const deleted = await db.delete(domaines).where(eq(domaines.id, id)).returning();
    if (!deleted?.[0]) return res.status(404).json({ message: 'Domaine introuvable' });
    return res.json(deleted[0]);
  } catch (err: any) {
    console.error('[domaines.delete] failed', err);
    if (String(err?.message || '').toLowerCase().includes('foreign') || err?.code === '23503') {
      return res.status(409).json({ message: 'Suppression impossible: domaine utilisé ailleurs.' });
    }
    return res.status(500).json({ message: 'Erreur lors de la suppression du domaine' });
  }
};

// GET /api/domaines/reset-data-types - Liste les types de données réinitialisables par domaine
export const getResetDataTypes = async (_req: Request, res: Response) => {
  try {
    const result = Object.values(resetDataTypes).map((d) => ({
      value: d.value,
      label: d.label,
      tables: d.tables,
    }));
    return res.json(result);
  } catch (err) {
    console.error('[domaines.resetDataTypes] failed', err);
    return res.status(500).json({ message: 'Erreur lors du chargement des types de données' });
  }
};

// POST /api/domaines/reset-stats - Réinitialise les données statistiques d'un domaine
export const resetDomaineStats = async (req: Request, res: Response) => {
  try {
    const { domaine, tableName } = req.body || {};

    if (!domaine || !tableName) {
      return res.status(400).json({ message: 'domaine et tableName sont requis' });
    }

    const domaineConfig = resetDataTypes[String(domaine).toUpperCase()];
    if (!domaineConfig) {
      return res.status(400).json({ message: `Domaine "${domaine}" non reconnu` });
    }

    const tableConfig = domaineConfig.tables.find((t) => t.tableName === tableName);
    if (!tableConfig) {
      return res.status(400).json({ message: `Table "${tableName}" non valide pour le domaine "${domaine}"` });
    }

    // Ordre de suppression pour respecter les contraintes de clés étrangères
    const deleteOrder: Record<string, string[]> = {
      permits: ['hunted_species', 'hunting_reports', 'permit_requests', 'taxes', 'permits'],
      taxes: ['taxes'],
      hunters: ['hunted_species', 'hunting_reports', 'guide_hunter_associations', 'permit_requests', 'taxes', 'permits', 'hunters'],
      hunting_reports: ['hunted_species', 'hunting_reports'],
      hunted_species: ['hunted_species'],
      permit_requests: ['permit_requests'],
      guide_hunter_associations: ['guide_hunter_associations'],
      history: ['history'],
      reforestation_reports: ['reforestation_production_data', 'reforestation_plants_data', 'reforestation_species_data', 'reforestation_field_data', 'reforestation_reports'],
      reforestation_production_data: ['reforestation_production_data'],
      reforestation_plants_data: ['reforestation_plants_data'],
      reforestation_species_data: ['reforestation_species_data'],
      reforestation_field_data: ['reforestation_field_data'],
      alerts: ['notifications', 'alerts'],
      notifications: ['notifications'],
    };

    const tablesToDelete = deleteOrder[tableName] || [tableName];
    const deletedCounts: Record<string, number> = {};

    for (const tbl of tablesToDelete) {
      try {
        const countResult: any = await db.execute(sql`SELECT COUNT(*)::int as cnt FROM ${sql.identifier(tbl)}`);
        const row = Array.isArray(countResult) ? countResult[0] : (countResult?.rows?.[0] ?? countResult?.[0]);
        const cnt = row?.cnt ?? 0;
        await db.execute(sql`TRUNCATE TABLE ${sql.identifier(tbl)} CASCADE`);
        deletedCounts[tbl] = cnt;
      } catch (tblErr: any) {
        console.warn(`[reset-stats] TRUNCATE ${tbl} failed:`, tblErr?.message);
        deletedCounts[tbl] = -1;
      }
    }

    console.log(`[reset-stats] Domaine=${domaine}, table=${tableName}, deleted=`, deletedCounts);
    return res.json({ ok: true, domaine, tableName, deleted: deletedCounts });
  } catch (err) {
    console.error('[domaines.resetStats] failed', err);
    return res.status(500).json({ message: 'Erreur lors de la réinitialisation des statistiques' });
  }
};
