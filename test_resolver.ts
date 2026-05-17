import { db } from './server/db.js';
import { users, agents, rolesMetier } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { DomainResolver } from './server/services/messaging.service.js';

async function run() {
  const u = await db.select().from(users).where(eq(users.username, 'Binta')).limit(1);
  if (!u[0]) {
    console.log('User Binta not found');
    process.exit(0);
  }
  const userId = u[0].id;
  console.log('Testing DomainResolver for userId:', userId);
  
  const a = await db.select().from(agents).where(eq(agents.userId, userId)).limit(1);
  console.log('Agent found:', !!a[0]);

  if(a[0]) {
    const r = await db.select().from(rolesMetier).where(eq(rolesMetier.id, a[0].roleMetierId)).limit(1);
    console.log('RoleMetier found:', !!r[0], 'isDefault:', r[0]?.isDefault, 'isSupervisor:', r[0]?.isSupervisor);
  }

  const result = await DomainResolver.resolve(userId);
  console.log('Result:', result);
  process.exit(0);
}
run();
