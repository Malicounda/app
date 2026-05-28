import { pg } from './db.js';
async function test() {
  try {
    const rows = await pg.query('SELECT 1 as val');
    console.log("SUCCESS PG:", rows);
  } catch(e) {
    console.error("ERROR PG:", e.message);
  }
  process.exit(0);
}
test();
