import { db } from './db.js';
async function test() {
  try {
    const rows = await db.query(`SELECT 1 as val`);
    console.log(rows);
  } catch(e) {
    console.error(e.message);
  }
  process.exit(0);
}
test();
