import { sql } from 'drizzle-orm';

/** Clé de comparaison : majuscules, sans espaces (740 367/B === 740367B) */
export function normalizeMatriculeKey(m: string): string {
  return String(m || '').trim().toUpperCase().replace(/\s+/g, '');
}

type Tx = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> };

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined;
  const rows = (result as { rows?: unknown[] })?.rows;
  return rows?.[0] as Record<string, unknown> | undefined;
}

export async function findUserByMatriculeKey(
  tx: Tx,
  matricule: string
): Promise<{ id: number; username: string | null; matricule: string | null; email: string | null } | null> {
  const key = normalizeMatriculeKey(matricule);
  if (!key) return null;

  const result = await tx.execute(sql`
    SELECT id, username, matricule, email
    FROM users
    WHERE replace(upper(coalesce(matricule, '')), ' ', '') = ${key}
       OR replace(upper(coalesce(username, '')), ' ', '') = ${key}
    LIMIT 1
  `);
  const row = firstRow(result);
  if (!row?.id) return null;
  return {
    id: Number(row.id),
    username: row.username != null ? String(row.username) : null,
    matricule: row.matricule != null ? String(row.matricule) : null,
    email: row.email != null ? String(row.email) : null,
  };
}

export async function findAgentByMatriculeSolKey(
  tx: Tx,
  matriculeSol: string
): Promise<{ idAgent: number; userId: number; matriculeSol: string } | null> {
  const key = normalizeMatriculeKey(matriculeSol);
  if (!key) return null;

  const result = await tx.execute(sql`
    SELECT id_agent AS "idAgent", user_id AS "userId", matricule_sol AS "matriculeSol"
    FROM agents
    WHERE replace(upper(coalesce(matricule_sol, '')), ' ', '') = ${key}
    LIMIT 1
  `);
  const row = firstRow(result);
  if (!row?.idAgent) return null;
  return {
    idAgent: Number(row.idAgent),
    userId: Number(row.userId),
    matriculeSol: String(row.matriculeSol ?? ''),
  };
}

export async function findUserByEmail(
  tx: Tx,
  email: string
): Promise<{ id: number; email: string | null } | null> {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;

  const result = await tx.execute(sql`
    SELECT id, email FROM users WHERE lower(trim(email)) = ${normalized} LIMIT 1
  `);
  const row = firstRow(result);
  if (!row?.id) return null;
  return { id: Number(row.id), email: row.email != null ? String(row.email) : null };
}
