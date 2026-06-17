import { db } from './server/db.js';
import { permitRequests, hunters, users } from './shared/schema.js';
import { eq, sql } from 'drizzle-orm';

async function check() {
  const result = await db
    .select({
      id: permitRequests.id,
      status: permitRequests.status,
      region: permitRequests.region,
      createdAt: permitRequests.createdAt,
      hunterName: sql<string>`CONCAT(${hunters.firstName}, ' ', ${hunters.lastName})`,
      hunterPhone: hunters.phone,
    })
    .from(permitRequests)
    .leftJoin(hunters, eq(permitRequests.hunterId, hunters.id))
    .where(eq(permitRequests.id, 17));

  console.log('ID 17 Details:', result);
  process.exit(0);
}

check();
