import { db } from './server/db.js';
import { permitRequests } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function check() {
  const resultUpper = await db.select().from(permitRequests).where(eq(permitRequests.region, 'THIES'));
  const resultLower = await db.select().from(permitRequests).where(eq(permitRequests.region, 'thies'));
  console.log('Upper THIES count:', resultUpper.length);
  console.log('Lower thies count:', resultLower.length);
  process.exit(0);
}

check();
