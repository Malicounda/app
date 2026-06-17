import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function check() {
  const tables = [
    'users', 'hunters', 'permits', 'permit_requests', 'hunting_campaigns',
    'settings', 'alerts', 'messages', 'activities', 'hunting_guides'
  ];

  for (const table of tables) {
    try {
      const countRes = await db.execute(sql.raw(`SELECT COUNT(*) FROM ${table}`));
      console.log(`Table: ${table}, Count:`, countRes[0]?.count);
    } catch (e: any) {
      console.log(`Table: ${table}, Error: ${e.message}`);
    }
  }
  process.exit(0);
}

check();
