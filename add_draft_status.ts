import { sql } from 'drizzle-orm';
import { db } from './server/db.js';

async function migrate() {
  console.log("Running migration to add 'draft' to permit_request_status...");
  try {
    await db.execute(sql`ALTER TYPE permit_request_status ADD VALUE IF NOT EXISTS 'draft';`);
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
  process.exit(0);
}

migrate();
