import { Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage.js';

const upsertSchema = z.object({
  userId: z.number().int().positive(),
  domain: z.string().min(1),
  roleMetierId: z.number().int().optional().nullable(),
  active: z.boolean().optional().default(true),
});

// POST /api/affectations/by-user-domain
// Crée ou met à jour l'accès (via user_domains) pour déclencher la synchronisation automatique vers affectations
export async function upsertAffectationByUserDomain(req: Request, res: Response) {
  try {
    const parsed = upsertSchema.parse(req.body);
    const userId = parsed.userId;
    const domain = parsed.domain.trim().toUpperCase();

    const existing = await storage.getUserDomainsByUserId(userId);
    const found = Array.isArray(existing) ? (existing as any[]).find((d) => String(d?.domain || '').toUpperCase() === domain) : undefined;

    if (found) {
      const updated = await storage.updateUserDomain(Number((found as any).id), {
        active: parsed.active,
        roleMetierId: parsed.roleMetierId ?? null,
      } as any);
      return res.json({ message: 'Affectation mise à jour', userDomain: updated });
    }

    const created = await storage.createUserDomain({
      userId,
      domain,
      active: parsed.active,
      role: null,
      roleMetierId: parsed.roleMetierId ?? null,
    } as any);
    return res.status(201).json({ message: 'Affectation créée', userDomain: created });
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    }
    console.error('Erreur upsertAffectationByUserDomain:', e);
    return res.status(500).json({ message: e?.message || 'Erreur interne' });
  }
}

// PATCH /api/affectations/by-user-domain/:userId/:domain/active/:active
export async function setAffectationActiveByUserDomain(req: Request, res: Response) {
  try {
    const userId = Number(req.params.userId);
    const domain = String(req.params.domain || '').trim().toUpperCase();
    const active = String(req.params.active || '').toLowerCase() === 'true';

    if (!userId || !Number.isFinite(userId)) return res.status(400).json({ message: 'userId invalide' });
    if (!domain) return res.status(400).json({ message: 'domain requis' });

    const existing = await storage.getUserDomainsByUserId(userId);
    const found = Array.isArray(existing) ? (existing as any[]).find((d) => String(d?.domain || '').toUpperCase() === domain) : undefined;
    if (!found) return res.status(404).json({ message: 'Affectation non trouvée (user_domains)' });

    const updated = await storage.updateUserDomain(Number((found as any).id), { active } as any);
    return res.json({ message: 'Statut mis à jour', userDomain: updated });
  } catch (e: any) {
    console.error('Erreur setAffectationActiveByUserDomain:', e);
    return res.status(500).json({ message: e?.message || 'Erreur interne' });
  }
}
