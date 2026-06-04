import shapefile from "shapefile";
import postgres from "postgres";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config();

const rootPath = "c:\\Users\\HP\\Desktop\\Scodi";
const rootDirs = fs.readdirSync(rootPath);
const localiteDirName = rootDirs.find(d => d.toLowerCase().startsWith("localit"));
if (!localiteDirName) {
  throw new Error("Could not find Localités folder inside Scodi");
}
const shpPath = path.join(rootPath, localiteDirName, "Localites_Senegal.shp");
const dbfPath = path.join(rootPath, localiteDirName, "Localites_Senegal.dbf");

async function main() {
  const url = process.env.DATABASE_URL || "postgres://admin:password@localhost:5432/scodipp_db";
  const sql = postgres(url);
  console.log("🚀 Starting shapefile import...");

  try {
    const source = await shapefile.open(shpPath, dbfPath);
    let count = 0;
    let skipped = 0;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const nom = feature.properties.TOPONYME01;
      const x = feature.properties.XCoord;
      const y = feature.properties.yCoord;

      if (!nom || x === undefined || y === undefined) {
        skipped++;
        continue;
      }

      try {
        // Proximity guard: only check if same name exists at the exact same location (within 1 meter)
        const existing = await sql`
          SELECT id FROM localites 
          WHERE nom = ${nom} 
            AND ST_DWithin(geom, ST_Transform(ST_SetSRID(ST_MakePoint(${x}, ${y}), 32628), 4326), 0.00001) 
          LIMIT 1
        `;

        if (existing.length > 0) {
          skipped++;
          continue;
        }

        // Insert and let the trigger resolve administrative areas
        await sql`
          INSERT INTO localites (nom, geom) 
          VALUES (${nom}, ST_Transform(ST_SetSRID(ST_MakePoint(${x}, ${y}), 32628), 4326))
        `;
        count++;

        if (count % 200 === 0) {
          console.log(`Imported ${count} localities...`);
        }
      } catch (insertErr) {
        console.error(`⚠️ Error inserting locality "${nom}":`, insertErr.message);
        skipped++;
      }
    }

    console.log(`✅ Ingestion completed! Total imported: ${count}, Skipped (duplicates or invalid): ${skipped}`);

    console.log("📊 Running ANALYZE on localites table...");
    await sql`ANALYZE localites`;
    console.log("✅ ANALYZE complete!");

  } catch (err) {
    console.error("❌ Shapefile import failed:", err);
  } finally {
    await sql.end();
  }
}

main();
