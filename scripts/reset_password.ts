import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const databaseUrl = 'postgresql://postgres.botmsymjatdnizqtneoi:jesuisN0ir%4014@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';

async function main() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl, { prepare: false });

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('rpassword22', salt);
    console.log('Generated hash:', hash);

    const res = await sql`
      UPDATE users 
      SET password = ${hash} 
      WHERE username = '666376/D'
      RETURNING id, username
    `;
    console.log('Password reset response:', JSON.stringify(res, null, 2));
  } catch (err: any) {
    console.error('Error resetting password:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
