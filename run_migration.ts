import { sql } from 'drizzle-orm';
import { db } from './server/db.js';

async function migrate() {
  console.log("Running migration...");
  try {
    await db.execute(sql`
      ALTER TABLE "alerts" 
      ADD COLUMN IF NOT EXISTS "audio_path" text,
      ADD COLUMN IF NOT EXISTS "audio_name" text,
      ADD COLUMN IF NOT EXISTS "audio_mime" text,
      ADD COLUMN IF NOT EXISTS "audio_size" integer,
      ADD COLUMN IF NOT EXISTS "image_path" text,
      ADD COLUMN IF NOT EXISTS "image_name" text,
      ADD COLUMN IF NOT EXISTS "image_mime" text,
      ADD COLUMN IF NOT EXISTS "image_size" integer;
    `);
    console.log("Migration successful!");
  } catch (error) {
    console.error("Migration failed:", error);
  }
  process.exit(0);
}

migrate();
