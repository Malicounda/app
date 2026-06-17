import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const configPath = path.join(process.cwd(), 'db-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const encodedPassword = encodeURIComponent(config.password);
const connectionString = `postgresql://${config.user}:${encodedPassword}@${config.host}:${config.port}/${config.database}`;

async function main() {
  const sql = postgres(connectionString, { prepare: false });

  try {
    const res = await sql`SELECT * FROM permit_requests`;
    console.log('DIRECT SQL permit_requests:', res);
    
    const countRes = await sql`SELECT COUNT(*) FROM permit_requests`;
    console.log('COUNT:', countRes);
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
