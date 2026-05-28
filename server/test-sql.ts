import { db } from './db.js';
import { sql } from 'drizzle-orm';
async function test() {
  try {
    const region = '';
    const rows = await db.execute(
      sql`SELECT
            pc.groupe,
            pc.genre,
            pc.sous_categorie,
            pc.key AS category_key,
            pc.label_fr,
            pc.display_order,
            COALESCE(COUNT(DISTINCT p.hunter_id), 0) AS hunters_count,
            COALESCE(COUNT(p.id), 0) AS permits_count,
            COALESCE(SUM((p.price)::numeric), 0) AS total_amount
          FROM permit_categories pc
          LEFT JOIN permits p ON p.category_id = pc.key
          LEFT JOIN users u ON u.id = p.created_by
          GROUP BY pc.groupe, pc.genre, pc.sous_categorie, pc.key, pc.label_fr, pc.display_order
          ORDER BY pc.groupe, pc.genre, COALESCE(pc.display_order, 9999), pc.label_fr`
    );
    console.log("IS ARRAY?", Array.isArray(rows));
    console.log("rows.map is function?", typeof (rows as any).map === 'function');
  } catch(e) {
    console.error("ERROR 1:", e.message);
  }
  process.exit(0);
}
test();
