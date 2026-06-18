import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log("Adding columns to hunter_documents...");
  try {
    await db.execute(sql`ALTER TABLE hunter_documents ADD COLUMN IF NOT EXISTS file_data bytea;`);
    await db.execute(sql`ALTER TABLE hunter_documents ADD COLUMN IF NOT EXISTS file_mime varchar(100);`);
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
  process.exit(0);
}

migrate();
