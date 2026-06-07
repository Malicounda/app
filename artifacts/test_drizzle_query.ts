import { db } from '../server/db.js';
import { sql, and, eq } from 'drizzle-orm';
import { notifications } from '../shared/schema.js';

async function run() {
  try {
    console.log("Running Drizzle count query...");
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, 1),
          eq(notifications.isRead, false)
        )
      );
    console.log("Drizzle count query success! Result:", result);
  } catch (err) {
    console.error("Drizzle count query failed:", err);
  }
  process.exit(0);
}

run();
