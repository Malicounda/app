import { db } from '../server/db.js';
import { sql, eq, desc } from 'drizzle-orm';
import { permitRequests, hunters, users } from '../shared/schema.js';

async function test() {
  try {
    const requests = await db
      .select({
        id: permitRequests.id,
        userId: permitRequests.userId,
        hunterId: permitRequests.hunterId,
        hunterFirstName: hunters.firstName,
        hunterLastName: hunters.lastName,
      })
      .from(permitRequests)
      .leftJoin(hunters, eq(permitRequests.hunterId, hunters.id))
      .orderBy(desc(permitRequests.createdAt))
      .limit(3);
    console.log(requests);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
test();
