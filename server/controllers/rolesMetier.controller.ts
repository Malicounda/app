import { and, eq, ilike, sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { rolesMetier } from '../../shared/schema.js';
import { db } from '../db.js';

let pilotageColumnsEnsured = false;
export async function ensureRolesMetierPilotageColumns() {
  if (pilotageColumnsEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE roles_metier
      ADD COLUMN IF NOT EXISTS territorial_scope TEXT,
      ADD COLUMN IF NOT EXISTS pilotage_domains JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    pilotageColumnsEnsured = true;
  } catch (err) {
    console.error('[rolesMetier] Failed to ensure pilotage columns:', err);
  }
}

const VALID_SCOPES = ['national', 'regional', 'departemental', 'arrondissement'] as const;

const normalizeDomainsList = (list?: string[]): string[] => {
  if (!Array.isArray(list)) return [];
  const cleaned = Array.from(
    new Set(
      list
        .map((d) => String(d || '').trim().toUpperCase())
        .filter(Boolean)
    )
  );
  return cleaned.includes('ALL') ? ['ALL'] : cleaned;
};

const createSchema = z.object({
  code: z.string().min(1),
  labelFr: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  territorialScope: z.enum(VALID_SCOPES).nullable().optional(),
  pilotageDomains: z.array(z.string().min(1).max(64)).optional(),
});

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  labelFr: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  territorialScope: z.enum(VALID_SCOPES).nullable().optional(),
  pilotageDomains: z.array(z.string().min(1).max(64)).optional(),
});

const setPilotageSchema = z.object({
  territorialScope: z.enum(VALID_SCOPES).nullable(),
  pilotageDomains: z.array(z.string().min(1).max(64)).optional(),
});

const setActiveSchema = z.object({
  isActive: z.boolean(),
});

const setDefaultSchema = z.object({
  isDefault: z.boolean(),
});

const setSupervisorSchema = z.object({
  isSupervisor: z.boolean(),
});

const normalizeLabelFr = (value: string) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

export async function listRolesMetier(req: Request, res: Response) {
  try {
    await ensureRolesMetierPilotageColumns();
    const activeOnly = String(req.query.activeOnly || 'false').toLowerCase() === 'true';
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

    const conditions: any[] = [];
    if (activeOnly) conditions.push(eq(rolesMetier.isActive, true));
    if (search) {
      conditions.push(
        ilike(rolesMetier.code, `%${search}%`) as any
      );
    }

    const rows = conditions.length
      ? await db.select().from(rolesMetier).where(and(...conditions))
      : await db.select().from(rolesMetier);

    return res.json(rows);
  } catch (e: any) {
    console.error('Erreur listRolesMetier:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

export async function getRoleMetierById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const [row] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id));
    if (!row) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(row);
  } catch (e: any) {
    console.error('Erreur getRoleMetierById:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

export async function createRoleMetier(req: Request, res: Response) {
  try {
    await ensureRolesMetierPilotageColumns();
    const parsed = createSchema.parse(req.body);

    const scope = parsed.territorialScope ?? null;
    const normalizedDomains = normalizeDomainsList(parsed.pilotageDomains);
    const domains = scope
      ? (normalizedDomains.length > 0 ? normalizedDomains : ['ALL'])
      : [];

    const [created] = await db.insert(rolesMetier).values({
      code: parsed.code.trim().toUpperCase(),
      labelFr: normalizeLabelFr(parsed.labelFr),
      description: parsed.description ?? null,
      isActive: parsed.isActive ?? true,
      territorialScope: scope,
      pilotageDomains: domains,
    } as any).returning();

    return res.status(201).json(created);
  } catch (e: any) {
    console.error('Erreur createRoleMetier:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Conflit: code déjà existant.' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la création' });
  }
}

export async function updateRoleMetier(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (!existing) return res.status(404).json({ message: 'Non trouvé' });

    const parsed = updateSchema.parse(req.body);
    const updateData: any = {};

    if (parsed.code !== undefined) updateData.code = parsed.code.trim().toUpperCase();
    if (parsed.labelFr !== undefined) updateData.labelFr = normalizeLabelFr(parsed.labelFr);
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.isActive !== undefined && !existing.isDefault) updateData.isActive = parsed.isActive;
    if (parsed.territorialScope !== undefined) {
      updateData.territorialScope = parsed.territorialScope;
      if (!parsed.territorialScope) {
        updateData.pilotageDomains = [];
      } else if (parsed.pilotageDomains === undefined && (!Array.isArray((existing as any).pilotageDomains) || (existing as any).pilotageDomains.length === 0)) {
        updateData.pilotageDomains = ['ALL'];
      }
    }
    if (parsed.pilotageDomains !== undefined) {
      updateData.pilotageDomains = normalizeDomainsList(parsed.pilotageDomains);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const [updated] = await db.update(rolesMetier)
      .set(updateData)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur updateRoleMetier:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Conflit: code déjà existant.' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

export async function setRoleMetierActive(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const parsed = setActiveSchema.parse(req.body);

    // Empêcher la désactivation du rôle par défaut
    if (!parsed.isActive) {
      const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
      if (existing?.isDefault) {
        return res.status(403).json({ message: 'Impossible de désactiver le rôle métier par défaut. Retirez-le d\'abord de la liste par défaut.' });
      }
    }

    const [updated] = await db.update(rolesMetier)
      .set({ isActive: parsed.isActive } as any)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur setRoleMetierActive:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    return res.status(500).json({ message: e?.message || "Erreur lors de la mise à jour de l'activation" });
  }
}

export async function setRoleMetierDefault(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const parsed = setDefaultSchema.parse(req.body);

    // Bascule atomique : un rôle défini "Par défaut" n'est plus Superviseur
    const updatePayload: any = { isDefault: parsed.isDefault };
    if (parsed.isDefault) {
      updatePayload.isSupervisor = false;
    }

    const [updated] = await db.update(rolesMetier)
      .set(updatePayload)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur setRoleMetierDefault:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

export async function setRoleMetierSupervisor(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const parsed = setSupervisorSchema.parse(req.body);

    // Bascule atomique : un rôle défini "Superviseur" n'est plus Par défaut
    const updatePayload: any = { isSupervisor: parsed.isSupervisor };
    if (parsed.isSupervisor) {
      updatePayload.isDefault = false;
    }

    const [updated] = await db.update(rolesMetier)
      .set(updatePayload)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur setRoleMetierSupervisor:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

export async function setRoleMetierPilotage(req: Request, res: Response) {
  try {
    await ensureRolesMetierPilotageColumns();
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (!existing) return res.status(404).json({ message: 'Non trouvé' });

    const parsed = setPilotageSchema.parse(req.body);
    const scope = parsed.territorialScope;
    const existingDomains = normalizeDomainsList(
      Array.isArray((existing as any).pilotageDomains) ? (existing as any).pilotageDomains : []
    );
    const parsedDomains = parsed.pilotageDomains !== undefined ? normalizeDomainsList(parsed.pilotageDomains) : undefined;
    const nextDomains = !scope
      ? []
      : parsedDomains !== undefined
        ? parsedDomains
        : (existingDomains.length > 0 ? existingDomains : ['ALL']);

    const [updated] = await db.update(rolesMetier)
      .set({
        territorialScope: scope,
        pilotageDomains: nextDomains,
      } as any)
      .where(eq(rolesMetier.id, id))
      .returning();

    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur setRoleMetierPilotage:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour du pilotage' });
  }
}

export async function getDefaultRoleMetier(req: Request, res: Response) {
  try {
    const rows = await db.select().from(rolesMetier).where(eq(rolesMetier.isDefault, true));
    return res.json(rows);
  } catch (e: any) {
    console.error('Erreur getDefaultRoleMetier:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

// Soft delete: is_active=false
export async function deactivateRoleMetier(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    // Empêcher la désactivation du rôle par défaut
    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (existing?.isDefault) {
      return res.status(403).json({ message: 'Impossible de désactiver le rôle métier par défaut. Retirez-le d\'abord de la liste par défaut.' });
    }

    const [updated] = await db.update(rolesMetier)
      .set({ isActive: false } as any)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur deactivateRoleMetier:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la désactivation' });
  }
}

export async function deleteRoleMetier(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    // Empêcher la suppression du rôle par défaut
    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (existing?.isDefault) {
      return res.status(403).json({ message: 'Impossible de supprimer le rôle métier par défaut. Retirez-le d\'abord de la liste par défaut.' });
    }

    const [deleted] = await db
      .delete(rolesMetier)
      .where(eq(rolesMetier.id, id))
      .returning();

    if (!deleted) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(deleted);
  } catch (e: any) {
    console.error('Erreur deleteRoleMetier:', e);
    if (String(e?.message || '').toLowerCase().includes('foreign') || e?.code === '23503') {
      return res.status(409).json({ message: "Suppression impossible: rôle métier utilisé ailleurs." });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}
