import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const rows = await db.execute(sql`SELECT id, username, matricule FROM users WHERE matricule IS NOT NULL LIMIT 20`);
console.log('=== MATRICULES IN DB ===');
for (const row of rows as any[]) {
  console.log(`id=${row.id} username=${row.username} matricule=[${row.matricule}]`);
}
process.exit(0);
