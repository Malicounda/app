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
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .toUpperCase();

const normalizeLabel = (value: string) => normalizeCode(value).replace(/_/g, ' ');

const createSchema = z.object({
  code: z.string().min(1),
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
    const label = parsed.label ? normalizeLabel(parsed.label) : normalizeLabel(code);

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
