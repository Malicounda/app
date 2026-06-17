import { db } from './server/db.js';
import { userDomains, users } from './shared/schema.js';
import { inArray, eq } from 'drizzle-orm';

async function main() {
  const res = await db.select({
    username: users.username,
    domain: userDomains.domain,
    role: userDomains.role
  }).from(userDomains)
  .leftJoin(users, eq(users.id as any, userDomains.userId as any))
  .where(inArray(users.username, ['reforest_admin', 'chasse_admin']));
  console.log(res);
  process.exit(0);
}
main().catch(console.error);
