import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';

async function main() {
  console.log('Connecting to database directly on port 5432...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    console.log('Testing simple SELECT 1...');
    const res = await sql`SELECT 1 as test`;
    console.log('✅ SELECT 1 succeeded:', res);

    console.log('Testing table: users...');
    const users = await sql`SELECT id, username, role FROM users LIMIT 5`;
    console.log('✅ Query users succeeded:', users);
  } catch (err: any) {
    console.error('❌ Database error:', err.message);
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
});
