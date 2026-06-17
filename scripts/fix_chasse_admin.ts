import { db } from './server/db.js';
import { userDomains, domaines } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const dRes = await db.select().from(domaines).where(eq(domaines.nomDomaine, 'CHASSE' as any));
  if (dRes.length === 0) {
     console.log("Domain CHASSE not found!");
     process.exit(1);
  }
  const domaineId = dRes[0].id;
  
  await db.insert(userDomains).values({
    userId: 1, // chasse_admin
    domain: 'CHASSE',
    domaineId: domaineId,
    role: 'admin',
    active: true
  } as any).onConflictDoNothing();
  
  console.log("Successfully linked chasse_admin to CHASSE domain.");
  process.exit(0);
}
main().catch(console.error);
