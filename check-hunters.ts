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
    const res = await sql`SELECT id, first_name, last_name, is_active FROM hunters`;
    console.log('hunters in DB:', res);
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
