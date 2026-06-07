import postgres from 'postgres';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const users = await sql`SELECT id, username, role, is_active, active FROM users WHERE is_active = true OR active = true LIMIT 30`;
    console.log('\n--- ACTIVE USERS IN DATABASE ---');
    users.forEach(u => {
      console.log(`ID: ${u.id} | Username: ${u.username} | Role: ${u.role} | Active: ${u.active} | IsActive: ${u.is_active}`);
    });
  } catch (err: any) {
    console.error('Error fetching users:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
