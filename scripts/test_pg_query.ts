import { pg } from '../server/db.js';

async function main() {
  console.log('Testing pg.query from server/db.ts...');
  try {
    const res = await pg.query('SELECT * FROM code_infractions ORDER BY code ASC');
    console.log('✅ Success! Rows retrieved:', res.rows.length);
  } catch (err: any) {
    console.error('❌ pg.query failed:', err);
  }
}

main().catch(console.error);
