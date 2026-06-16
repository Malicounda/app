import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const types = await db.execute(sql`SELECT * FROM protected_zone_types`);
  console.log("Protected Zone Types in DB:", types);
  process.exit(0);
}

main();
