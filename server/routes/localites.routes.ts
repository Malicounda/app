import { Router } from 'express';
import multer from 'multer';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { isAuthenticated, isAdmin } from './middlewares/auth.middleware.js';
import shapefile from 'shapefile';

const router = Router();
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

// ================= HELPERS POUR L'IMPORTATION =================

// Parser de CSV simple et robuste
function parseCSV(content: string): Array<{ nom: string; lat: number; lon: number }> {
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Lecture des en-têtes
  const headers = lines[0].split(/[;,]/).map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const nameIdx = headers.findIndex(h => h.includes('nom') || h.includes('name') || h.includes('toponyme'));
  const latIdx = headers.findIndex(h => h.includes('lat') || h.includes('y'));
  const lonIdx = headers.findIndex(h => h.includes('lon') || h.includes('lng') || h.includes('x'));

  if (nameIdx === -1 || latIdx === -1 || lonIdx === -1) {
    throw new Error("Format CSV invalide. Le fichier doit inclure les colonnes 'nom', 'latitude' et 'longitude'.");
  }

  const results: Array<{ nom: string; lat: number; lon: number }> = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(/[;,]/).map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length <= Math.max(nameIdx, latIdx, lonIdx)) continue;

    const nom = values[nameIdx];
    const lat = parseFloat(values[latIdx]);
    const lon = parseFloat(values[lonIdx]);

    if (nom && !isNaN(lat) && !isNaN(lon)) {
      results.push({ nom, lat, lon });
    }
  }
  return results;
}

// Deviner la projection WGS84 ou UTM28N à partir des coordonnées
function guessSourceProj(geometry: any): 'EPSG:4326' | 'EPSG:32628' {
  try {
    const collectOne = (g: any): number[] | null => {
      if (!g) return null;
      if (g.type === 'Point') return g.coordinates as number[];
      if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates[0]?.[0]) return g.coordinates[0][0];
      if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates[0]?.[0]?.[0]) return g.coordinates[0][0][0];
      return null;
    };
    const c = collectOne(geometry);
    if (!c || !Array.isArray(c) || c.length < 2) return 'EPSG:4326';
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 'EPSG:4326';
    if (x > 100000 && y > 100000) {
      return 'EPSG:32628';
    }
    return 'EPSG:4326';
  } catch {
    return 'EPSG:4326';
  }
}

function detectProjFromPrj(prjBuffer: Buffer): 'EPSG:4326' | 'EPSG:32628' | null {
  try {
    const prjText = prjBuffer.toString('utf8');
    if (/UTM/i.test(prjText) && /zone\s*28/i.test(prjText)) {
      return 'EPSG:32628';
    } else if (/WGS[_\s]?84/i.test(prjText)) {
      return 'EPSG:4326';
    }
  } catch {}
  return null;
}

// ================= ENDPOINTS DE FILTRES ET CRUD =================

// Récupérer distincts pour les filtres
router.get('/filters', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const regions = await db.execute(sql`SELECT DISTINCT region FROM localites WHERE region IS NOT NULL AND region != '' ORDER BY region ASC`);
    const departements = await db.execute(sql`SELECT DISTINCT departement FROM localites WHERE departement IS NOT NULL AND departement != '' ORDER BY departement ASC`);
    const communes = await db.execute(sql`SELECT DISTINCT commune FROM localites WHERE commune IS NOT NULL AND commune != '' ORDER BY commune ASC`);
    const arrondissements = await db.execute(sql`SELECT DISTINCT arrondissement FROM localites WHERE arrondissement IS NOT NULL AND arrondissement != '' ORDER BY arrondissement ASC`);

    res.json({
      ok: true,
      data: {
        regions: regions.map((r: any) => r.region),
        departements: departements.map((d: any) => d.departement),
        communes: communes.map((c: any) => c.commune),
        arrondissements: arrondissements.map((a: any) => a.arrondissement),
      }
    });
  } catch (error) {
    console.error('Error fetching filters:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la récupération des filtres' });
  }
});

// GET Paginé
router.get('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const region = req.query.region as string;
    const departement = req.query.departement as string;
    const commune = req.query.commune as string;
    const arrondissement = req.query.arrondissement as string;

    let whereClause = sql`WHERE 1=1`;
    if (search) {
      whereClause = sql`${whereClause} AND nom ILIKE ${'%' + search + '%'}`;
    }
    if (region) {
      whereClause = sql`${whereClause} AND region = ${region}`;
    }
    if (departement) {
      whereClause = sql`${whereClause} AND departement = ${departement}`;
    }
    if (commune) {
      whereClause = sql`${whereClause} AND commune = ${commune}`;
    }
    if (arrondissement) {
      whereClause = sql`${whereClause} AND arrondissement = ${arrondissement}`;
    }

    const countQuery = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM localites ${whereClause}
    `);
    const total = countQuery[0]?.count || 0;

    const dataQuery = await db.execute(sql`
      SELECT 
        id, nom, region, departement, commune, arrondissement, 
        latitude::text as latitude, longitude::text as longitude,
        created_at
      FROM localites
      ${whereClause}
      ORDER BY nom ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({ ok: true, data: dataQuery, total, page, limit });
  } catch (error) {
    console.error('Error fetching localites:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors du chargement des localités' });
  }
});

// POST Création
router.post('/', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { nom, latitude, longitude } = req.body;
    if (!nom) {
      return res.status(400).json({ ok: false, error: "Le nom est obligatoire" });
    }
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return res.status(400).json({ ok: false, error: "Les coordonnées latitude et longitude sont obligatoires" });
    }

    const result = await db.execute(sql`
      INSERT INTO localites (nom, latitude, longitude)
      VALUES (${nom}, ${latitude}, ${longitude})
      RETURNING id, nom, region, departement, commune, arrondissement, latitude::text, longitude::text
    `);

    res.json({ ok: true, data: result[0] });
  } catch (error: any) {
    console.error('Error creating localite:', error);
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, error: 'Cette localité existe déjà dans cette commune/arrondissement' });
    }
    res.status(500).json({ ok: false, error: 'Erreur lors de la création de la localité' });
  }
});

// PUT Modification
router.put('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, latitude, longitude } = req.body;

    if (!nom) {
      return res.status(400).json({ ok: false, error: "Le nom est obligatoire" });
    }
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) {
      return res.status(400).json({ ok: false, error: "Les coordonnées latitude et longitude sont obligatoires" });
    }

    const result = await db.execute(sql`
      UPDATE localites
      SET nom = ${nom}, latitude = ${latitude}, longitude = ${longitude},
          geom = ST_SetSRID(ST_MakePoint(${longitude}::double precision, ${latitude}::double precision), 4326),
          created_at = CURRENT_TIMESTAMP -- Force execution of the trigger
      WHERE id = ${id}
      RETURNING id, nom, region, departement, commune, arrondissement, latitude::text, longitude::text
    `);

    if (result.length === 0) {
      return res.status(404).json({ ok: false, error: 'Localité introuvable' });
    }

    res.json({ ok: true, data: result[0] });
  } catch (error: any) {
    console.error('Error updating localite:', error);
    if (error.code === '23505') {
      return res.status(400).json({ ok: false, error: 'Cette localité existe déjà dans cette commune/arrondissement' });
    }
    res.status(500).json({ ok: false, error: 'Erreur lors de la mise à jour de la localité' });
  }
});

// DELETE Suppression
router.delete('/:id', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.execute(sql`
      DELETE FROM localites WHERE id = ${id} RETURNING id
    `);

    if (result.length === 0) {
      return res.status(404).json({ ok: false, error: 'Localité introuvable' });
    }

    res.json({ ok: true, message: 'Localité supprimée avec succès' });
  } catch (error) {
    console.error('Error deleting localite:', error);
    res.status(500).json({ ok: false, error: 'Erreur lors de la suppression de la localité' });
  }
});

// ================= ENDPOINT D'IMPORTATION MASSIVE =================

router.post('/import', isAuthenticated, isAdmin, upload.fields([
  { name: 'shp', maxCount: 1 },
  { name: 'shx', maxCount: 1 },
  { name: 'dbf', maxCount: 1 },
  { name: 'prj', maxCount: 1 },
  { name: 'file', maxCount: 1 }
]), async (req: any, res) => {
  try {
    const files = req.files || {};
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;

    // 1. IMPORT CSV / GEOJSON (via le champ 'file')
    if (files.file?.[0]) {
      const file = files.file[0];
      const filename = file.originalname.toLowerCase();

      if (filename.endsWith('.csv')) {
        const content = file.buffer.toString('utf-8');
        const csvRows = parseCSV(content);

        for (const row of csvRows) {
          try {
            // Proximity check before insert (within 1m)
            const duplicateCheck = await db.execute(sql`
              SELECT id FROM localites 
              WHERE nom = ${row.nom} 
                AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint(${row.lon}::double precision, ${row.lat}::double precision), 4326), 0.00001)
              LIMIT 1
            `);

            if (duplicateCheck.length > 0) {
              duplicates++;
              continue;
            }

            await db.execute(sql`
              INSERT INTO localites (nom, latitude, longitude)
              VALUES (${row.nom}, ${row.lat}, ${row.lon})
            `);
            inserted++;
          } catch (err) {
            errors++;
          }
        }
      } else if (filename.endsWith('.geojson') || filename.endsWith('.json')) {
        const geojson = JSON.parse(file.buffer.toString('utf-8'));
        const features = geojson.features || (geojson.type === 'Feature' ? [geojson] : []);

        for (const f of features) {
          try {
            const nom = f.properties?.TOPONYME01 || f.properties?.nom || f.properties?.name || f.properties?.toponyme || 'Localité sans nom';
            const geomJson = JSON.stringify(f.geometry);

            // Proximity check on geom center (within 1m)
            const duplicateCheck = await db.execute(sql`
              SELECT id FROM localites 
              WHERE nom = ${nom} 
                AND ST_DWithin(geom, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326), 0.00001)
              LIMIT 1
            `);

            if (duplicateCheck.length > 0) {
              duplicates++;
              continue;
            }

            await db.execute(sql`
              INSERT INTO localites (nom, geom)
              VALUES (${nom}, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))
            `);
            inserted++;
          } catch (err) {
            errors++;
          }
        }
      } else {
        return res.status(400).json({ ok: false, error: 'Format de fichier non pris en charge. Requis : .csv, .geojson, .shp/.dbf' });
      }
    }
    // 2. IMPORT SHAPEFILE (via shp, dbf)
    else if (files.shp?.[0] && files.dbf?.[0]) {
      const shpBuffer = files.shp[0].buffer;
      const dbfBuffer = files.dbf[0].buffer;
      const prjBuffer = files.prj?.[0]?.buffer;

      const prjProj = prjBuffer ? detectProjFromPrj(prjBuffer) : null;
      const source = await shapefile.open(shpBuffer, dbfBuffer);

      let result = await source.read();
      while (!result.done) {
        const f = result.value;
        const nom = f.properties?.TOPONYME01 || f.properties?.nom || f.properties?.name || 'Localité sans nom';
        const geomJson = JSON.stringify(f.geometry);
        const crs = prjProj || guessSourceProj(f.geometry);

        try {
          if (crs === 'EPSG:32628') {
            const duplicateCheck = await db.execute(sql`
              SELECT id FROM localites 
              WHERE nom = ${nom} 
                AND ST_DWithin(geom, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 32628), 4326), 0.00001)
              LIMIT 1
            `);

            if (duplicateCheck.length > 0) {
              duplicates++;
            } else {
              await db.execute(sql`
                INSERT INTO localites (nom, geom)
                VALUES (${nom}, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 32628), 4326))
              `);
              inserted++;
            }
          } else {
            const duplicateCheck = await db.execute(sql`
              SELECT id FROM localites 
              WHERE nom = ${nom} 
                AND ST_DWithin(geom, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326), 0.00001)
              LIMIT 1
            `);

            if (duplicateCheck.length > 0) {
              duplicates++;
            } else {
              await db.execute(sql`
                INSERT INTO localites (nom, geom)
                VALUES (${nom}, ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326))
              `);
              inserted++;
            }
          }
        } catch (err) {
          errors++;
        }
        result = await source.read();
      }
    } else {
      return res.status(400).json({ ok: false, error: 'Fichiers requis manquants pour l\'importation.' });
    }

    // Run ANALYZE for query optimization
    await db.execute(sql`ANALYZE localites;`);

    res.json({
      ok: true,
      message: 'Importation terminée',
      stats: { inserted, duplicates, errors }
    });

  } catch (error: any) {
    console.error('Error during import:', error);
    res.status(500).json({ ok: false, error: error.message || 'Erreur lors de l\'importation des localités' });
  }
});

export default router;
