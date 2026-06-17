import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const res = await db.execute(sql`SELECT * FROM domaines`);
    console.log(res);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
test();
