import { sql } from 'drizzle-orm';
import { db } from './server/db.js';

async function migrate() {
  console.log("Running migration...");
  try {
    await db.execute(sql`ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "localite" text;`);
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
  process.exit(0);
}

migrate();
