import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function check() {
  try {
    const res = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('--- ALL TABLES IN DATABASE ---');
    for (const row of res) {
      const table = row.table_name;
      const countRes = await db.execute(sql.raw(`SELECT COUNT(*) FROM "${table}"`));
      console.log(`Table: ${table}, Count:`, countRes[0]?.count);
    }
  } catch (e: any) {
    console.error('Error listing tables:', e);
  }
  process.exit(0);
}

check();
