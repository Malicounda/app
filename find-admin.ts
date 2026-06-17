import { db } from './server/db.js';
import { users } from './shared/schema.js';

async function check() {
  const allUsers = await db.select().from(users);
  for (const u of allUsers) {
    if (u.role === 'admin' || u.role === 'receveur' || u.role === 'agent') {
      console.log(`Role: ${u.role}, Email: ${u.email}, Name: ${u.firstName} ${u.lastName}`);
    }
  }
  process.exit(0);
}

check();
