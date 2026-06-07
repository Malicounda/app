import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const res = await sql`
      UPDATE users 
      SET is_active = true, active = true, region = 'THIES'
      WHERE username = '666376/D'
      RETURNING id, username, is_active, active, region, departement
    `;
    console.log('Updated user:', JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error('Error updating user:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
