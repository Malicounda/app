import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const types = await db.execute(sql`SELECT DISTINCT type FROM protected_zones`);
  console.log("Distinct types in protected_zones:", types);
  process.exit(0);
}

main();
