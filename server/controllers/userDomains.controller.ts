import { Request, Response } from 'express';
import { z } from 'zod';
import { storage } from '../storage.js';

const createSchema = z.object({
  userId: z.number(),
  domain: z.string().min(1),
  role: z.string().optional(),
  roleMetierId: z.number().int().optional().nullable(),
  active: z.boolean().optional(),
});

const updateSchema = z.object({
  domain: z.string().min(1).optional(),
  role: z.string().optional(),
  roleMetierId: z.number().int().optional().nullable(),
  active: z.boolean().optional(),
});

export async function listUserDomains(req: Request, res: Response) {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : undefined;
    if (userId) {
      const list = await storage.getUserDomainsByUserId(userId);
      return res.json(list);
    }
    // No global list method; return 400 to avoid large scans
    return res.status(400).json({ message: 'Paramètre userId requis pour la liste.' });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors du listing' });
  }
}

export async function getUserDomainById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const item = await storage.getUserDomainById(id);
    if (!item) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(item);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

export async function getUserDomainsByUser(req: Request, res: Response) {
  try {
    const userId = Number(req.params.userId);
    const list = await storage.getUserDomainsByUserId(userId);
    return res.json(list);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération' });
  }
}

export async function createUserDomain(req: Request, res: Response) {
  try {
    const parsed = createSchema.parse(req.body);
    const created = await storage.createUserDomain(parsed as any);
    return res.status(201).json(created);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('duplicate') || msg.includes('unique')) {
      return res.status(409).json({ message: 'Conflit: domaine déjà présent pour cet utilisateur.' });
    }
    if (e?.name === 'ZodError') {
      return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    }
    return res.status(500).json({ message: msg || 'Erreur lors de la création' });
  }
}

export async function updateUserDomain(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const parsed = updateSchema.parse(req.body);
    const updated = await storage.updateUserDomain(id, parsed as any);
    if (!updated) return res.status(404).json({ message: 'Non trouvé' });
    return res.json(updated);
  } catch (e: any) {
    if (e?.name === 'ZodError') {
      return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

export async function deleteUserDomain(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const ok = await storage.deleteUserDomain(id);
    if (!ok) return res.status(404).json({ message: 'Non trouvé' });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}

export async function setUserDomainActiveByUserAndDomain(req: Request, res: Response) {
  try {
    const userId = Number(req.params.userId);
    const domain = String(req.params.domain || '').trim().toUpperCase();
    const active = String(req.params.active || '').toLowerCase() === 'true';
    if (!userId || !Number.isFinite(userId)) {
      return res.status(400).json({ message: 'userId invalide' });
    }
    if (!domain) {
      return res.status(400).json({ message: 'domain requis' });
    }

    const list = await storage.getUserDomainsByUserId(userId);
    const match = Array.isArray(list) ? (list as any[]).find((d) => String(d?.domain || '').toUpperCase() === domain) : undefined;
    if (!match) return res.status(404).json({ message: 'Affectation non trouvée' });

    const updated = await storage.updateUserDomain(Number((match as any).id), { active } as any);
    if (!updated) return res.status(404).json({ message: 'Affectation non trouvée' });
    return res.json(updated);
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors de la mise à jour' });
  }
}

export async function deleteUserDomainByUserAndDomain(req: Request, res: Response) {
  try {
    const userId = Number(req.params.userId);
    const domain = String(req.params.domain || '').trim().toUpperCase();
    if (!userId || !Number.isFinite(userId)) {
      return res.status(400).json({ message: 'userId invalide' });
    }
    if (!domain) {
      return res.status(400).json({ message: 'domain requis' });
    }

    const list = await storage.getUserDomainsByUserId(userId);
    const match = Array.isArray(list) ? (list as any[]).find((d) => String(d?.domain || '').toUpperCase() === domain) : undefined;
    if (!match) return res.status(404).json({ message: 'Affectation non trouvée' });

    const ok = await storage.deleteUserDomain(Number((match as any).id));
    if (!ok) return res.status(404).json({ message: 'Affectation non trouvée' });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}
