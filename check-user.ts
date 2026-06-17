import { db } from './server/db.js';
import { users } from './shared/schema.js';
import { eq, or } from 'drizzle-orm';

async function check() {
  const u = await db.select().from(users).where(
    or(
      eq(users.username, 'admin'),
      eq(users.email, '00491@scodipp.local')
    )
  );
  console.log('USERS:', u);
  process.exit(0);
}

check();
