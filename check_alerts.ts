import 'dotenv/config';
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    const rows = await db.execute(sql`
      SELECT *
      FROM roles_metier
      WHERE id = 7
    `);
    
    console.log("roles_metier info for 7:", JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error("Error querying db:", e);
  } finally {
    process.exit(0);
  }
}
main();
