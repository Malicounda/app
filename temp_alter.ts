import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function run() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS hunting_campaign_periods CASCADE;`);
    console.log("Table dropped successfully");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

run();
