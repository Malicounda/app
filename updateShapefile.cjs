const fs = require('fs');
const path = 'server/controllers/shapefile.controller.ts';
let content = fs.readFileSync(path, 'utf8');

const target1 = `        if (destTable === 'regions') {
          // Schéma actuel (Prisma baseline): regions(name, status, surface_km2, perimetre_km, zone_geo, geom, center)
          await db.execute(sql\`
            INSERT INTO regions (name, geom, center)
            VALUES (
              \${layerName},
              ST_GeomFromText(\${wkt}, 32628),
              ST_SetSRID(ST_MakePoint(\${centroid.lon}, \${centroid.lat}), 4326)
            )
          \`);
        } else if (destTable === 'departements') {
          // Schéma actuel (Prisma baseline): departements(name, status, surface_km2, perimetre_km, zone_geo, geom, center)
          await db.execute(sql\`
            INSERT INTO departements (name, geom, center)
            VALUES (
              \${layerName || properties.nom || properties.name || properties.NAME || \`Département \${insertedCount + 1}\`},
              ST_GeomFromText(\${wkt}, 32628),
              ST_SetSRID(ST_MakePoint(\${centroid.lon}, \${centroid.lat}), 4326)
            )
          \`);
        }`;

const replacement1 = `        if (destTable === 'regions') {
          await db.execute(sql\`
            INSERT INTO regions (nom, geom, centre_geometrique)
            VALUES (
              \${layerName},
              ST_GeomFromText(\${wkt}, 32628),
              ST_Transform(ST_SetSRID(ST_MakePoint(\${centroid.lon}, \${centroid.lat}), 4326), 32628)
            )
          \`);
        } else if (destTable === 'departements') {
          await db.execute(sql\`
            INSERT INTO departements (nom, geom, centre_geometrique)
            VALUES (
              \${layerName || properties.nom || properties.name || properties.NAME || \`Département \${insertedCount + 1}\`},
              ST_GeomFromText(\${wkt}, 32628),
              ST_Transform(ST_SetSRID(ST_MakePoint(\${centroid.lon}, \${centroid.lat}), 4326), 32628)
            )
          \`);
        }`;

const target2 = `    res.json({
      ok: true,
      count: insertedCount,
      message: \`\${insertedCount} entités importées avec succès dans \${destTable}\`
    });`;

const replacement2 = `    if (insertedCount === 0) {
      return res.status(400).json({
        ok: false,
        error: "Aucune entité n'a pu être insérée. Veuillez vérifier la validité et le format des géométries."
      });
    }

    res.json({
      ok: true,
      count: insertedCount,
      message: \`\${insertedCount} entités importées avec succès dans \${destTable}\`
    });`;

let changed = false;
if (content.includes(target1)) {
    content = content.replace(target1, replacement1);
    changed = true;
} else {
    console.error("Target 1 not found!");
}

if (content.includes(target2)) {
    content = content.replace(target2, replacement2);
    changed = true;
} else {
    console.error("Target 2 not found!");
}

if (changed) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully updated shapefile.controller.ts");
}
