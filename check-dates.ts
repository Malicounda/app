import { db } from './server/db.js';
import { permitRequests } from './shared/schema.js';

async function check() {
  const allReqs = await db.select().from(permitRequests);
  for (const r of allReqs) {
    console.log(`ID: ${r.id}, Status: ${r.status}, Region: ${r.region}, Date: ${r.createdAt}`);
  }
  process.exit(0);
}

check();
