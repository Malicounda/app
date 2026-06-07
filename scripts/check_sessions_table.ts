import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const res = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'session'
    `;
    if (res.length === 0) {
      console.log('❌ session table does NOT exist!');
    } else {
      console.log('✅ session table exists!');
      const cols = await sql`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'session'
      `;
      cols.forEach(c => {
        console.log(`  - ${c.column_name}: ${c.data_type}`);
      });

      const countRes = await sql`SELECT count(*) FROM session`;
      console.log(`Row count: ${countRes[0].count}`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
