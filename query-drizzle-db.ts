import { db } from './server/db.js';
import { permitRequests } from './shared/schema.js';

async function main() {
  console.log('Querying via server/db...');
  try {
    const res = await db.select().from(permitRequests);
    console.log('DRIZZLE SELECTION:', res);
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main().catch(console.error);
