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
    const domains = await sql`SELECT * FROM user_domains WHERE user_id = 231`;
    console.log('Current domains for 231:', domains);

    if (domains.length === 0) {
      console.log('Inserting CHASSE domain for user 231...');
      const insertRes = await sql`
        INSERT INTO user_domains (user_id, domain, domaine_id, role, active, created_at)
        VALUES (231, 'CHASSE', 1, 'agent', true, NOW())
        RETURNING *
      `;
      console.log('Insert result:', insertRes);
    } else {
      console.log('Updating existing domain status...');
      const updateRes = await sql`
        UPDATE user_domains
        SET active = true, domain = 'CHASSE'
        WHERE user_id = 231
        RETURNING *
      `;
      console.log('Update result:', updateRes);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }

  await sql.end();
}

main().catch(console.error);
