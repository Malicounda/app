import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Load local db config
const configPath = path.join(process.cwd(), 'db-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const encodedPassword = encodeURIComponent(config.password);
const connectionString = `postgresql://${config.user}:${encodedPassword}@${config.host}:${config.port}/${config.database}`;

async function main() {
  console.log('Connecting to local Postgres:', connectionString.replace(encodedPassword, '****'));
  const sql = postgres(connectionString, { prepare: false });

  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('rpassword22', salt);
    
    const res = await sql`
      UPDATE users 
      SET password = ${hash} 
      WHERE email = 'thy@gmail.com' OR username = 'thy@gmail.com'
      RETURNING id, username, email
    `;
    console.log('Update result:', res);
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
