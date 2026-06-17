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
    const res = await sql`
      UPDATE users 
      SET first_name = 'LocalTest'
      WHERE id = 231
      RETURNING id, username, first_name
    `;
    console.log('Update result in local DB:', res);
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
