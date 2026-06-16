import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    const keysToDelete = ['amodiee', 'zic', 'parc_visite', 'regulation'];
    console.log('Force cleaning up hunting types from protected_zone_types...');
    
    for (const key of keysToDelete) {
      await db.execute(sql`DELETE FROM protected_zone_types WHERE key = ${key}`);
      console.log(`Deleted ${key} from protected_zone_types.`);
    }
    console.log('Cleanup complete.');
  } catch (error) {
    console.error('Error:', error);
  } process.exit(0);
}

main();
