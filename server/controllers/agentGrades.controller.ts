import { asc, eq, sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { z } from 'zod';
import { agentGrades } from '../../shared/schema.js';
import { db } from '../db.js';

let tableEnsured = false;

export async function ensureAgentGradesTable() {
  if (tableEnsured) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS agent_grades (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  tableEnsured = true;
}

const normalizeCode = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const normalizeLabel = (value: string) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const createSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1).optional(),
});

const updateSchema = z.object({
  code: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

export async function listAgentGrades(req: Request, res: Response) {
  try {
    await ensureAgentGradesTable();
    const rows = await db.select().from(agentGrades).orderBy(asc(agentGrades.label));
    return res.json(rows);
  } catch (e: any) {
    console.error('Erreur listAgentGrades:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la récupération des grades' });
  }
}

export async function createAgentGrade(req: Request, res: Response) {
  try {
    await ensureAgentGradesTable();
    const parsed = createSchema.parse(req.body);
    const code = normalizeCode(parsed.code);
    if (!code) return res.status(400).json({ message: 'Code grade invalide' });
    const label = parsed.label ? normalizeLabel(parsed.label) : code.replace(/_/g, ' ');

    const [created] = await db
      .insert(agentGrades)
      .values({ code, label, isActive: true } as any)
      .returning();

    return res.status(201).json(created);
  } catch (e: any) {
    console.error('Erreur createAgentGrade:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Ce grade existe déjà.' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la création' });
  }
}

export async function updateAgentGrade(req: Request, res: Response) {
  try {
    await ensureAgentGradesTable();
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const parsed = updateSchema.parse(req.body);
    const updateData: any = {};
    if (parsed.code !== undefined) {
      const code = normalizeCode(parsed.code);
      if (!code) return res.status(400).json({ message: 'Code grade invalide' });
      updateData.code = code;
    }
    if (parsed.label !== undefined) {
      const label = normalizeLabel(parsed.label);
      if (!label) return res.status(400).json({ message: 'Libellé grade invalide' });
      updateData.label = label;
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const [updated] = await db
      .update(agentGrades)
      .set(updateData)
      .where(eq(agentGrades.id, id))
      .returning();

    if (!updated) return res.status(404).json({ message: 'Grade introuvable' });
    return res.json(updated);
  } catch (e: any) {
    console.error('Erreur updateAgentGrade:', e);
    if (e?.name === 'ZodError') return res.status(400).json({ message: 'Validation invalide', errors: e.errors });
    if (String(e?.message || '').toLowerCase().includes('unique') || e?.code === '23505') {
      return res.status(409).json({ message: 'Un grade avec ce code existe déjà.' });
    }
    return res.status(500).json({ message: e?.message || 'Erreur lors de la modification' });
  }
}

export async function deleteAgentGrade(req: Request, res: Response) {
  try {
    await ensureAgentGradesTable();
    const id = Number(req.params.id);
    if (!id || !Number.isFinite(id)) return res.status(400).json({ message: 'ID invalide' });

    const deleted = await db.delete(agentGrades).where(eq(agentGrades.id, id)).returning({ id: agentGrades.id });
    if (!deleted.length) return res.status(404).json({ message: 'Non trouvé' });
    return res.status(204).send();
  } catch (e: any) {
    console.error('Erreur deleteAgentGrade:', e);
    return res.status(500).json({ message: e?.message || 'Erreur lors de la suppression' });
  }
}
