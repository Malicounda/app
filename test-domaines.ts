import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    const dRows: any[] = await db.execute(sql`SELECT * FROM domaines`);
    console.log("All domaines:", dRows);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}
main();
