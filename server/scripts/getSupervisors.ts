import { db } from '../db.js';
import { users, agents, rolesMetier } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const allUsers = await db
    .select({
      id: users.id,
      username: users.username,
      matricule: users.matricule,
      role: users.role,
      matriculeSol: agents.matriculeSol,
      isSupervisor: (rolesMetier as any).isSupervisor,
      isDefault: (rolesMetier as any).isDefault,
    })
    .from(users)
    .innerJoin(agents, eq(agents.userId as any, users.id as any))
    .innerJoin(rolesMetier, eq(rolesMetier.id as any, agents.roleMetierId as any));

  console.log('ALL_METIER_USERS:', JSON.stringify(allUsers, null, 2));
  process.exit(0);
}

main().catch(console.error);
