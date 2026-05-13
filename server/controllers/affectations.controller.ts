import { and, eq, ilike } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { affectations, agents, domaines } from '../../shared/schema.js';
import { db } from '../db.js';

// Schéma de validation pour la création
const createAffectationSchema = z.object({
  agentId: z.number().int().positive(),
  domaineId: z.number().int().positive(),
  niveauHierarchique: z.enum(['NATIONAL', 'REGIONAL', 'SECTEUR']),
  roleMetierId: z.number().int().positive().optional().nullable(),
  codeZone: z.string().min(1),
  active: z.boolean().optional().default(true),
  dateAffectation: z.string().optional(), // ISO date string
});

// Schéma de validation pour la mise à jour
const updateAffectationSchema = z.object({
  niveauHierarchique: z.enum(['NATIONAL', 'REGIONAL', 'SECTEUR']).optional(),
  roleMetierId: z.number().int().positive().optional().nullable(),
  codeZone: z.string().min(1).optional(),
  active: z.boolean().optional(),
  dateAffectation: z.string().optional().nullable(),
});

// Lister toutes les affectations ou filtrer par agent/domaine
export async function listAffectations(req: Request, res: Response) {
  try {
    const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
    const domaineId = req.query.domaineId ? Number(req.query.domaineId) : undefined;
    const active = req.query.active === 'true' ? true : req.query.active === 'false' ? false : undefined;
    const searchMatricule = typeof req.query.searchMatricule === 'string' ? req.query.searchMatricule.trim() : '';

    const conditions: any[] = [];
    if (agentId) conditions.push(eq(affectations.agentId, agentId));
    if (domaineId) conditions.push(eq(affectations.domaineId, domaineId));
    if (active !== undefined) conditions.push(eq(affectations.active, active));
    if (searchMatricule) conditions.push(ilike(agents.matriculeSol as any, `%${searchMatricule}%`) as any);

    const query = db
      .select({
        id: affectations.id,
        agentId: affectations.agentId,
        domaineId: affectations.domaineId,
        niveauHierarchique: affectations.niveauHierarchique,
        roleMetierId: affectations.roleMetierId,
        codeZone: affectations.codeZone,
        active: affectations.active,
        dateAffectation: affectations.dateAffectation,
        agentMatricule: agents.matriculeSol,
        domaineNom: domaines.nomDomaine,
      })
      .from(affectations)
      .leftJoin(agents, eq(affectations.agentId, agents.idAgent))
      .leftJoin(domaines, eq(affectations.domaineId, domaines.id));

    const list = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    return res.json(list);
  } catch (e: any) {
    console.error('Erreur listAffectations:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

// Récupérer une affectation par ID
export async function getAffectationById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [item] = await db.select().from(affectations).where(eq(affectations.id, id));
    if (!item) return res.status(404).json({ message: 'Affectation non trouvée' });
    return res.json(item);
  } catch (e: any) {
    console.error('Erreur getAffectationById:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

// Récupérer toutes les affectations d'un agent
export async function getAffectationsByAgent(req: Request, res: Response) {
  try {
    const agentId = Number(req.params.agentId);
    if (!agentId || !Number.isFinite(agentId)) {
      return res.status(400).json({ message: 'agentId invalide' });
    }

    const list = await db.select().from(affectations).where(eq(affectations.agentId, agentId));
    return res.json(list);
  } catch (e: any) {
    console.error('Erreur getAffectationsByAgent:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

// Créer une nouvelle affectation
export async function createAffectation(req: Request, res: Response) {
  try {
    const parsed = createAffectationSchema.parse(req.body);

    // Vérifier si une affectation existe déjà pour cet agent + domaine
    const [existing] = await db.select().from(affectations)
      .where(and(
        eq(affectations.agentId, parsed.agentId),
        eq(affectations.domaineId, parsed.domaineId)
      ));

    if (existing) {
      return res.status(409).json({
        message: 'Une affectation existe déjà pour cet agent sur ce domaine',
        existingId: existing.id
      });
    }

    const [created] = await db.insert(affectations).values({
      agentId: parsed.agentId,
      domaineId: parsed.domaineId,
      niveauHierarchique: parsed.niveauHierarchique as any,
      roleMetierId: parsed.roleMetierId ?? null,
      codeZone: parsed.codeZone,
      active: parsed.active ?? true,
      dateAffectation: parsed.dateAffectation ? new Date(parsed.dateAffectation) : new Date(),
    } as any).returning();

    return res.status(201).json(created);
  } catch (e: any) {
    console.error('Erreur createAffectation:', e);

    // Erreur de validation Zod
    if (e?.name === 'ZodError') {
      return res.status(400).json({ message: 'Données invalides', errors: e.errors });
    }

    // Erreur de contrainte "Rang Unique" (trigger PostgreSQL)
    if (e?.message?.includes('Règle de Rang Unique')) {
      return res.status(409).json({ message: e.message });
    }

    // Autre erreur de contrainte
    if (e?.code === '23505' || e?.message?.includes('unique')) {
      return res.status(409).json({ message: 'Conflit: affectation déjà existante' });
    }

    return res.status(500).json({ message: e?.message || 'Erreur lors de la création' });
  }
}

// Mettre à jour une affectation
export async function updateAffectation(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const parsed = updateAffectationSchema.parse(req.body);

    const updateData: any = {};
    if (parsed.niveauHierarchique) updateData.niveauHierarchique = parsed.niveauHierarchique;
    if (parsed.roleMetierId !== undefined) updateData.roleMetierId = parsed.roleMetierId;
    if (parsed.codeZone) updateData.codeZone = parsed.codeZone;
    if (parsed.active !== undefined) updateData.active = parsed.active;
    if (parsed.dateAffectation !== undefined) {
      updateData.dateAffectation = parsed.dateAffectation ? new Date(parsed.dateAffectation) : null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const [updated] = await db.update(affectations)
      .set(updateData)
      .where(eq(affectations.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Affectation non trouvée' });
    }

    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur updateAffectation:', e);

    if (e?.name === 'ZodError') {
      return res.status(400).json({ message: 'Données invalides', errors: e.errors });
    }

    // Erreur de contrainte "Rang Unique"
    if (e?.message?.includes('Règle de Rang Unique')) {
      return res.status(409).json({ message: e.message });
    }

    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

// Supprimer une affectation
export async function deleteAffectation(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [deleted] = await db.delete(affectations)
      .where(eq(affectations.id, id))
      .returning();

    if (!deleted) {
      return res.status(404).json({ message: 'Affectation non trouvée' });
    }

    return res.json({ success: true, deleted });
  } catch (e: any) {
    console.error('Erreur deleteAffectation:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}

// Activer/Désactiver une affectation
export async function setAffectationActive(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const active = req.params.active === 'true';

    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    const [updated] = await db.update(affectations)
      .set({ active } as any)
      .where(eq(affectations.id, id))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Affectation non trouvée' });
    }

    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur setAffectationActive:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

// Récupérer le niveau hiérarchique d'un agent (pour vérifier la cohérence)
export async function getAgentNiveauHierarchique(req: Request, res: Response) {
  try {
    const agentId = Number(req.params.agentId);
    if (!agentId || !Number.isFinite(agentId)) {
      return res.status(400).json({ message: 'agentId invalide' });
    }

    const [affectation] = await db.select({ niveau: affectations.niveauHierarchique })
      .from(affectations)
      .where(eq(affectations.agentId, agentId))
      .limit(1);

    if (!affectation) {
      return res.json({ niveau: null, message: 'Aucune affectation trouvée pour cet agent' });
    }

    return res.json({ niveau: affectation.niveau });
  } catch (e: any) {
    console.error('Erreur getAgentNiveauHierarchique:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}
