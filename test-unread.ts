import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const rows = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM notifications
        WHERE user_id = 1
          AND (is_read IS NOT TRUE)
    `);
    console.log("Unread count result:", rows);
  } catch (err) {
    console.error("Unread count error:", err);
  }
  process.exit(0);
}

test();
