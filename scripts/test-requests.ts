import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const res = await db.execute(sql`SELECT id, status, user_id, hunter_id, domain_id FROM permit_requests ORDER BY id DESC LIMIT 5`);
    console.log(res);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
test();
