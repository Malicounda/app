import { db } from '../db.js';
import { sql } from 'drizzle-orm';

const tables = process.argv.slice(2);
if (tables.length === 0) {
  console.error('Usage: node scripts/introspect-table.js <table1> [table2 ...]');
  process.exit(1);
}

async function main() {
  try {
    for (const t of tables) {
      console.log(`\n=== Columns for table: ${t} ===`);
      const rows = await db.execute(sql`
        SELECT
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable,
          c.column_default
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = ${t}
        ORDER BY c.ordinal_position;
      `);
      for (const r of rows) {
        console.log(`${String(r.ordinal_position).padStart(2, ' ')} | ${r.column_name} | ${r.data_type} (${r.udt_name}) | nullable=${r.is_nullable} | default=${r.column_default}`);
      }
    }
  } catch (e) {
    console.error('Introspection error:', e);
  } finally {
    process.exit(0);
  }
}

main();
