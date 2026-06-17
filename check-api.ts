import { db } from './server/db.js';
import { permitRequests, hunters, users } from './shared/schema.js';
import { eq, desc, sql } from 'drizzle-orm';

async function check() {
  const query = db
      .select({
        id: permitRequests.id,
        userId: permitRequests.userId,
        hunterId: permitRequests.hunterId,
        requestedType: permitRequests.requestedType,
        status: permitRequests.status,
        region: permitRequests.region,
        hunterFirstName: hunters.firstName,
        hunterLastName: hunters.lastName,
        hunterName: sql<string>`CONCAT(${hunters.firstName}, ' ', ${hunters.lastName})`,
      })
      .from(permitRequests)
      .leftJoin(hunters, eq(permitRequests.hunterId, hunters.id))
      .leftJoin(users, eq(permitRequests.userId, users.id))
      .orderBy(desc(permitRequests.createdAt));
      
  const results = await query;
  console.log(`API will return ${results.length} requests:`);
  console.table(results);
  process.exit(0);
}

check();
