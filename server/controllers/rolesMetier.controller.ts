import { and, eq, ilike } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { rolesMetier } from '../../shared/schema.js';
import { db } from '../db.js';

const createSchema = z.object({
  code: z.string().min(1),
  labelFr: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  labelFr: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
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

export async function listRolesMetier(req: Request, res: Response) {
  try {
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
    const parsed = createSchema.parse(req.body);

    const [created] = await db.insert(rolesMetier).values({
      code: parsed.code.trim().toUpperCase(),
      labelFr: parsed.labelFr.trim(),
      description: parsed.description ?? null,
      isActive: parsed.isActive ?? true,
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

    // Empêcher la modification du rôle par défaut
    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (existing?.isDefault) {
      return res.status(403).json({ message: 'Impossible de modifier le rôle métier par défaut. Retirez-le d\'abord de la liste par défaut.' });
    }

    const parsed = updateSchema.parse(req.body);
    const updateData: any = {};

    if (parsed.code !== undefined) updateData.code = parsed.code.trim().toUpperCase();
    if (parsed.labelFr !== undefined) updateData.labelFr = parsed.labelFr.trim();
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.isActive !== undefined) updateData.isActive = parsed.isActive;

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

    if (parsed.isDefault) {
      // Empêcher de définir un rôle superviseur comme rôle par défaut
      const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
      if (existing?.isSupervisor) {
        return res.status(403).json({ message: 'Un rôle superviseur ne peut pas être défini comme rôle par défaut.' });
      }
      // Multiple default roles allowed — no longer unset others
    }

    const [updated] = await db.update(rolesMetier)
      .set({ isDefault: parsed.isDefault } as any)
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

    // Empêcher de mettre superviseur sur le rôle par défaut
    const [existing] = await db.select().from(rolesMetier).where(eq(rolesMetier.id, id)).limit(1);
    if (existing?.isDefault) {
      return res.status(403).json({ message: 'Le rôle par défaut ne peut pas être superviseur.' });
    }

    const parsed = setSupervisorSchema.parse(req.body);

    const [updated] = await db.update(rolesMetier)
      .set({ isSupervisor: parsed.isSupervisor } as any)
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
