import { db } from './server/db.js';
import { users } from './shared/schema.js';

async function check() {
  const allUsers = await db.select().from(users);
  console.log('Total users:', allUsers.length);
  for (const u of allUsers) {
    if (u.role === 'agent' || u.role === 'admin' || u.role === 'receveur') {
      console.log(`User ID: ${u.id}, Name: ${u.firstName} ${u.lastName}, Role: ${u.role}, Region: ${u.region}`);
    }
  }
  process.exit(0);
}

check();
