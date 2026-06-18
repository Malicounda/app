import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`ALTER TABLE hunting_campaigns ADD COLUMN inactive_notes TEXT;`);
    console.log("Success");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

run();
