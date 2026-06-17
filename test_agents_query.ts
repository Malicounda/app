import { db } from './server/db.js';
import { users as usersTableSchema, agents } from './shared/schema.js';
import { or, eq, ilike, and } from 'drizzle-orm';

async function main() {
  const conditions = [];
  conditions.push(or(eq(usersTableSchema.role, 'agent'), eq(usersTableSchema.role, 'sub-agent')));
  
  const res = await db
      .select({
        id: usersTableSchema.id,
        username: usersTableSchema.username,
        firstName: usersTableSchema.firstName,
        lastName: usersTableSchema.lastName,
        role: usersTableSchema.role,
        matricule: usersTableSchema.matricule,
      })
      .from(usersTableSchema)
      .leftJoin(agents, eq(agents.userId as any, usersTableSchema.id as any))
      .where(and(...conditions as any));
      
  console.log("Returned users count:", res.length);
  const reforest = res.find(u => u.username === 'reforest_admin');
  console.log("Is reforest_admin returned?", reforest);
  process.exit(0);
}
main().catch(console.error);
