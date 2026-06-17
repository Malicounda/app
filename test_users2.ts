import { db } from './server/db.js';
import { users } from './shared/schema.js';
import { inArray, or, eq } from 'drizzle-orm';

async function main() {
  const res = await db.select({
    id: users.id,
    username: users.username,
    matricule: users.matricule,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role
  }).from(users).where(
    or(
      inArray(users.username, ['reforest_admin', 'chasse_admin']),
      inArray(users.matricule, ['reforest_admin', 'chasse_admin'])
    )
  );
  console.log(res);
  process.exit(0);
}
main().catch(console.error);
