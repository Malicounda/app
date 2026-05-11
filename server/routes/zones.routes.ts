import { sql } from 'drizzle-orm';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createZone, deleteZone, getZones, getZonesCounts, importZones, updateZone } from '../controllers/zones.controller.js';
import { db } from '../db.js';
import { resolveAdministrativeAreas } from '../lib/resolveAdminAreas.js';
// import { isAuthenticated } from '../middleware/auth.middleware';

const router = express.Router();

// Multer: stockage temporaire sur disque pour gros CSV
const tmpDir = path.resolve(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(tmpDir)) {
  try { fs.mkdirSync(tmpDir, { recursive: true }); } catch {}
}
const upload = multer({ dest: tmpDir, limits: { fileSize: 20 * 1024 * 1024 } });

// Multer: stockage permanent pour photos et pièces jointes des zones (conserver l'extension)
const docsDir = path.resolve(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(docsDir)) {
  try { fs.mkdirSync(docsDir, { recursive: true }); } catch {}
}

const sanitize = (name: string) => name.replace(/[^A-Za-z0-9_.-]+/g, '_');
const storageDocs = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docsDir),
  filename: (_req, file, cb) => {
    const original = file.originalname || 'file';
    const ext = path.extname(original) || '';
    const base = path.basename(original, ext);
    const safeBase = sanitize(base).slice(0, 100) || 'file';
    const unique = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    cb(null, `${unique}-${safeBase}${ext}`);
  }
});
const uploadDocs = multer({ storage: storageDocs, limits: { fileSize: 20 * 1024 * 1024 } });

// Liste des zones (FeatureCollection). Filtrage optionnel par type: ?type=zic|amodiee
router.get('/', getZones);

// Compteurs légers par type
router.get('/counts', getZonesCounts);

// Création d'une zone (V1: GeoJSON obligatoire)
// Le frontend envoie un FormData (multipart/form-data) sans fichiers.
// On utilise upload.none() pour que Multer parse correctement les champs textuels.
router.post('/', upload.none(), createZone);

// Mise à jour d'une zone (avec upload de photo/attachments)
router.put('/:id', uploadDocs.any(), updateZone);

// Import CSV pour créer une zone polygonale
router.post('/import', upload.single('file'), importZones);

// Import Shapefile pour créer une zone polygonale
router.post('/import-shapefile', uploadDocs.fields([
  { name: 'shp', maxCount: 1 },
  { name: 'shx', maxCount: 1 },
  { name: 'dbf', maxCount: 1 },
  { name: 'prj', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('[SHAPEFILE IMPORT] Début du traitement');
    console.log('[SHAPEFILE IMPORT] Files:', req.files);
    console.log('[SHAPEFILE IMPORT] Body:', req.body);

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!files || !files.shp || !files.shx || !files.dbf) {
      return res.status(400).json({
        ok: false,
        message: 'Fichiers manquants. Les fichiers .shp, .shx et .dbf sont requis.'
      });
    }

    const { zoneType, zoneName } = req.body;

    if (!zoneType) {
      return res.status(400).json({
        ok: false,
        message: 'Le type de zone est requis.'
      });
    }

    // Chemins des fichiers uploadés
    const shpPath = files.shp[0].path;
    const dbfPath = files.dbf[0].path;
    const prjPath = files.prj ? files.prj[0].path : null;

    console.log('[SHAPEFILE IMPORT] Lecture du shapefile:', shpPath);

    // Importer proj4 pour la conversion de coordonnées
    const proj4 = (await import('proj4')).default;

    // Définir les projections (comme dans shapefile.controller.ts)
    proj4.defs('EPSG:32628', '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs');
    proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

    // Lire le fichier .prj pour détecter le système de coordonnées
    let sourceProjection = 'EPSG:4326'; // Par défaut WGS84

    if (prjPath) {
      try {
        const prjContent = fs.readFileSync(prjPath, 'utf-8');
        console.log('[SHAPEFILE IMPORT] Contenu .prj:', prjContent.substring(0, 100));

        // Détecter UTM Zone 28N (EPSG:32628) - Système SIRD Sénégal
        if (/UTM/i.test(prjContent) && /zone\s*28/i.test(prjContent)) {
          sourceProjection = 'EPSG:32628';
          console.log('[SHAPEFILE IMPORT] ✅ Système détecté: UTM Zone 28N (EPSG:32628) - SIRD Sénégal');
        } else if (/WGS[_\s]?84/i.test(prjContent)) {
          sourceProjection = 'EPSG:4326';
          console.log('[SHAPEFILE IMPORT] ✅ Système détecté: WGS 84 (EPSG:4326)');
        }
      } catch (error) {
        console.warn('[SHAPEFILE IMPORT] Impossible de lire le fichier .prj:', error);
      }
    }

    // Heuristique: deviner la projection depuis les coordonnées si pas de .prj
    const guessProjection = (coords: number[]): string => {
      if (!coords || coords.length < 2) return sourceProjection;
      const [x, y] = coords;
      // Si valeurs typiques UTM 28N (mètres): x ~ [200000..800000], y ~ [1500000..2000000]
      if (x > 100000 && y > 100000) {
        console.log('[SHAPEFILE IMPORT] 🔍 Heuristique: coordonnées UTM détectées');
        return 'EPSG:32628';
      }
      // Si valeurs typiques degrés: x in [-180..180], y in [-90..90]
      if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
        console.log('[SHAPEFILE IMPORT] 🔍 Heuristique: coordonnées WGS84 détectées');
        return 'EPSG:4326';
      }
      return sourceProjection;
    };

    // Importer dynamiquement la bibliothèque shapefile
    const shapefile = await import('shapefile');

    // Lire le shapefile
    const source = await shapefile.open(shpPath, dbfPath);
    let result = await source.read();
    const coordinates: { latitude: string; longitude: string }[] = [];
    let featureCount = 0;

    // Deviner la projection depuis la première feature si pas de .prj
    let detectedProjection = sourceProjection;
    if (!prjPath && !result.done && result.value?.geometry) {
      const firstGeom = result.value.geometry;
      let firstCoord: number[] | null = null;

      if (firstGeom.type === 'Polygon' && firstGeom.coordinates[0]?.[0]) {
        firstCoord = firstGeom.coordinates[0][0];
      } else if (firstGeom.type === 'MultiPolygon' && firstGeom.coordinates[0]?.[0]?.[0]) {
        firstCoord = firstGeom.coordinates[0][0][0];
      } else if (firstGeom.type === 'Point') {
        firstCoord = firstGeom.coordinates;
      }

      if (firstCoord) {
        detectedProjection = guessProjection(firstCoord);
        console.log(`[SHAPEFILE IMPORT] Projection détectée par heuristique: ${detectedProjection}`);
      }
    }

    console.log('[SHAPEFILE IMPORT] Extraction et conversion des coordonnées...');
    console.log('[SHAPEFILE IMPORT] Projection source finale:', detectedProjection);

    // Fonction pour convertir les coordonnées (utilise detectedProjection)
    const convertCoords = (x: number, y: number): [number, number] => {
      if (detectedProjection === 'EPSG:32628') {
        // Convertir UTM 32628 → WGS84 pour OpenStreetMap
        const [lon, lat] = proj4('EPSG:32628', 'EPSG:4326', [x, y]);
        return [lon, lat];
      }
      // Déjà en WGS84
      return [x, y];
    };

    // IMPORTANT: Pour l'instant, on ne traite que le PREMIER polygone
    // pour éviter de mélanger tous les polygones en une seule zone
    let processedFirstFeature = false;

    while (!result.done && !processedFirstFeature) {
      const feature = result.value;
      featureCount++;

      if (feature && feature.geometry) {
        console.log(`[SHAPEFILE IMPORT] Feature ${featureCount}:`, feature.geometry.type);

        // Traiter selon le type de géométrie
        if (feature.geometry.type === 'Polygon') {
          // Extraire les coordonnées du premier ring (extérieur)
          const coords = feature.geometry.coordinates[0];
          for (const [x, y] of coords) {
            const [lon, lat] = convertCoords(x, y);
            coordinates.push({
              latitude: lat.toFixed(6),
              longitude: lon.toFixed(6)
            });
          }
          processedFirstFeature = true; // Arrêter après le premier polygone
        } else if (feature.geometry.type === 'MultiPolygon') {
          // Pour MultiPolygon, prendre le premier polygone
          const coords = feature.geometry.coordinates[0][0];
          for (const [x, y] of coords) {
            const [lon, lat] = convertCoords(x, y);
            coordinates.push({
              latitude: lat.toFixed(6),
              longitude: lon.toFixed(6)
            });
          }
          processedFirstFeature = true; // Arrêter après le premier polygone
        } else if (feature.geometry.type === 'Point') {
          const [x, y] = feature.geometry.coordinates;
          const [lon, lat] = convertCoords(x, y);
          coordinates.push({
            latitude: lat.toFixed(6),
            longitude: lon.toFixed(6)
          });
          processedFirstFeature = true; // Arrêter après le premier point
        } else if (feature.geometry.type === 'LineString') {
          const coords = feature.geometry.coordinates;
          for (const [x, y] of coords) {
            const [lon, lat] = convertCoords(x, y);
            coordinates.push({
              latitude: lat.toFixed(6),
              longitude: lon.toFixed(6)
            });
          }
          processedFirstFeature = true; // Arrêter après la première ligne
        }
      }

      result = await source.read();
    }

    console.log(`[SHAPEFILE IMPORT] ⚠️ ATTENTION: Seul le premier polygone a été traité (sur ${featureCount} features au total)`);

    console.log(`[SHAPEFILE IMPORT] ${coordinates.length} coordonnées extraites`);

    // Afficher les 3 premières coordonnées pour vérification
    if (coordinates.length > 0) {
      console.log('[SHAPEFILE IMPORT] Échantillon des 3 premières coordonnées:');
      coordinates.slice(0, 3).forEach((coord, i) => {
        console.log(`  [${i}] lat=${coord.latitude}, lon=${coord.longitude}`);
      });
    }

    if (coordinates.length === 0) {
      // Nettoyer les fichiers
      fs.unlinkSync(shpPath);
      fs.unlinkSync(dbfPath);
      if (prjPath) fs.unlinkSync(prjPath);

      return res.status(400).json({
        ok: false,
        message: 'Aucune coordonnée valide trouvée dans le shapefile'
      });
    }

    // Calculer le centroïde pour détecter la région
    const lats = coordinates.map(c => parseFloat(c.latitude));
    const lons = coordinates.map(c => parseFloat(c.longitude));
    const centroidLat = lats.reduce((a, b) => a + b, 0) / lats.length;
    const centroidLon = lons.reduce((a, b) => a + b, 0) / lons.length;

    console.log(`[SHAPEFILE IMPORT] Centroïde calculé: ${centroidLat}, ${centroidLon}`);

    // Détecter région/département/commune/arrondissement à partir du centroïde
    let region: string | null = null;
    let departement: string | null = null;
    let commune: string | null = null;
    let arrondissement: string | null = null;

    try {
      const areas = await resolveAdministrativeAreas(centroidLat, centroidLon);
      region = areas?.region || null;
      departement = areas?.departement || null;
      commune = areas?.commune || null;
      arrondissement = areas?.arrondissement || null;
      console.log('[SHAPEFILE IMPORT] Aires admin détectées:', { region, departement, commune, arrondissement });
    } catch (error) {
      console.warn('[SHAPEFILE IMPORT] Erreur lors de la détection région/département:', error);
    }

    // Enregistrer directement dans la table 'zones' (demande: importer shapefile dans zones)
    console.log('[SHAPEFILE IMPORT] Enregistrement dans zones...');
    console.log('[SHAPEFILE IMPORT] Type de zone (brut):', zoneType);
    console.log('[SHAPEFILE IMPORT] Nom de la zone:', zoneName);

    try {
      // Construire le WKT (Well-Known Text) pour PostGIS (en 4326)
      const coordsWKT = coordinates.map(c => `${c.longitude} ${c.latitude}`).join(', ');
      const wkt = `POLYGON((${coordsWKT}))`;

      console.log('[SHAPEFILE IMPORT] WKT créé avec', coordinates.length, 'points');

      // Normaliser le type pour respecter le CHECK sur zones.type
      const rawType = String(zoneType || '').toLowerCase();
      const normalizedType = rawType
        .replace(/[éèêë]/g, 'e')
        .replace(/\s+/g, '_')
        .replace(/parc[_-]?de[_-]?visite|parc[_-]?visite/g, 'parc_visite');
      const allowedTypes = new Set(['zic', 'amodiee', 'parc_visite', 'regulation']);
      const finalType = allowedTypes.has(normalizedType) ? normalizedType : 'regulation';

      // Insérer dans zones (geometry en 4326, 2D)
      const createdBy = (req as any)?.user?.username || 'system';
      await db.execute(sql`
        INSERT INTO zones (
          name, "type", status, color,
          responsible_name, responsible_phone, responsible_email, responsible_photo,
          attachments, notes, guides_count, trackers_count,
          geometry, region, departement, commune, arrondissement,
          centroid_lat, centroid_lon, area_sq_km, created_by, created_at, updated_at
        ) VALUES (
          ${zoneName},
          ${finalType},
          'active',
          NULL,
          NULL, NULL, NULL, NULL,
          NULL, NULL, NULL, NULL,
          ST_Force2D(ST_SetSRID(ST_GeomFromText(${wkt}, 4326), 4326)),
          ${region},
          ${departement},
          ${commune},
          ${arrondissement},
          ${centroidLat},
          ${centroidLon},
          ST_Area(Geography(ST_Force2D(ST_SetSRID(ST_GeomFromText(${wkt}, 4326), 4326))))/1000000.0,
          ${createdBy},
          NOW(),
          NOW()
        )
      `);

      console.log('[SHAPEFILE IMPORT] ✅ Zone enregistrée dans zones');

      // Nettoyer les fichiers temporaires
      try {
        fs.unlinkSync(shpPath);
        fs.unlinkSync(dbfPath);
        if (prjPath) fs.unlinkSync(prjPath);
        console.log('[SHAPEFILE IMPORT] Fichiers temporaires supprimés');
      } catch (error) {
        console.warn('[SHAPEFILE IMPORT] Erreur lors de la suppression des fichiers:', error);
      }

      // Retourner succès
      res.json({
        ok: true,
        message: `Zone "${zoneName}" créée avec succès dans protected_zones`,
        zoneType,
        region,
        departement,
        coordinatesCount: coordinates.length
      });

    } catch (dbError: any) {
      console.error('[SHAPEFILE IMPORT] Erreur lors de l\'insertion dans protected_zones:', dbError);

      // Nettoyer les fichiers en cas d'erreur
      try {
        fs.unlinkSync(shpPath);
        fs.unlinkSync(dbfPath);
        if (prjPath) fs.unlinkSync(prjPath);
      } catch {}

      throw new Error(`Erreur lors de l'enregistrement dans la base de données: ${dbError.message}`);
    }

  } catch (error: any) {
    console.error('[SHAPEFILE IMPORT] Erreur:', error);

    // Nettoyer les fichiers en cas d'erreur
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files) {
        if (files.shp) fs.unlinkSync(files.shp[0].path);
        if (files.shx) fs.unlinkSync(files.shx[0].path);
        if (files.dbf) fs.unlinkSync(files.dbf[0].path);
        if (files.prj) fs.unlinkSync(files.prj[0].path);
      }
    } catch {}

    res.status(500).json({
      ok: false,
      message: error?.message || 'Erreur lors du traitement du shapefile'
    });
  }
});

// Suppression d'une zone
router.delete('/:id', deleteZone);

export default router;
