import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const res = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    console.log('All tables in database:');
    res.forEach(row => {
      console.log(`- ${row.table_name}`);
    });
  } catch (err: any) {
    console.error('Error fetching tables:', err.message);
  }

  await sql.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
});
