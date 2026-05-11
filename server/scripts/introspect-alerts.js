import { db } from '../db.js';
import { sql } from 'drizzle-orm';

async function introspect() {
  try {
    const tables = ['alerts', 'notifications', 'users'];
    for (const t of tables) {
      console.log(`\n=== Columns for table: ${t} ===`);
      const rows = await db.execute(sql`
        SELECT
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = ${t}
        ORDER BY c.ordinal_position;
      `);
      for (const r of rows) {
        console.log(`${String(r.ordinal_position).padStart(2, ' ')} | ${r.column_name} | ${r.data_type} | nullable=${r.is_nullable} | default=${r.column_default}`);
      }
    }

    // Show enums present
    console.log(`\n=== Enums in pg_type/pg_enum (names) ===`);
    const enums = await db.execute(sql`
      SELECT n.nspname as enum_schema, t.typname as enum_name
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      GROUP BY enum_schema, enum_name
      ORDER BY enum_schema, enum_name;
    `);
    for (const e of enums) {
      console.log(`${e.enum_schema}.${e.enum_name}`);
    }
  } catch (e) {
    console.error('Introspection error:', e);
  } finally {
    // drizzle with postgres-js closes on process exit
    process.exit(0);
  }
}

introspect();
