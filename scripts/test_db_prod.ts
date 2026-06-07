import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  const tables = [
    'code_infractions',
    'code_infraction_items',
    'agents_verbalisateurs',
    'contrevenants',
    'lieux',
    'infractions',
    'proces_verbaux',
    'saisie_groups',
    'saisie_items',
    'notifications',
    'units',
    'code_item_units_config'
  ];

  for (const table of tables) {
    try {
      console.log(`\n--- Testing table: ${table} ---`);
      const columns = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = ${table}
      `;
      if (columns.length === 0) {
        console.log(`❌ Table ${table} does NOT exist!`);
      } else {
        console.log(`✅ Table ${table} exists! Columns:`);
        columns.forEach(col => {
          console.log(`  - ${col.column_name}: ${col.data_type}`);
        });
        
        // Let's try to query 1 row
        const row = await sql.unsafe(`SELECT * FROM ${table} LIMIT 1`);
        console.log(`Query limit 1 successful, returned ${row.length} rows.`);
      }
    } catch (err: any) {
      console.error(`❌ Error querying table ${table}:`, err.message);
    }
  }

  await sql.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
});
