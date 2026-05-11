import { sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import proj4 from 'proj4';
import shapefile from 'shapefile';
import { db } from '../db.js';

// Définir les projections
proj4.defs('EPSG:32628', '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');

interface ShapefileFiles {
  shp?: Express.Multer.File[];
  shx?: Express.Multer.File[];
  dbf?: Express.Multer.File[];
  prj?: Express.Multer.File[];
}

// Fonction pour calculer le centroïde d'une géométrie
function calculateCentroid(geometry: any): { lat: number; lon: number } {
  if (geometry.type === 'Point') {
    return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
  }

  if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates[0];
    let sumLat = 0, sumLon = 0;
    coords.forEach((coord: number[]) => {
      sumLon += coord[0];
      sumLat += coord[1];
    });
    return {
      lon: sumLon / coords.length,
      lat: sumLat / coords.length
    };
  }

  if (geometry.type === 'MultiPolygon') {
    const allCoords: number[][] = [];
    geometry.coordinates.forEach((polygon: number[][][]) => {
      polygon[0].forEach((coord: number[]) => allCoords.push(coord));
    });
    let sumLat = 0, sumLon = 0;
    allCoords.forEach(coord => {
      sumLon += coord[0];
      sumLat += coord[1];
    });
    return {
      lon: sumLon / allCoords.length,
      lat: sumLat / allCoords.length
    };
  }

  return { lat: 0, lon: 0 };
}

// Fonction pour convertir une géométrie en WKT (Well-Known Text)
function geometryToWKT(geometry: any): string {
  if (geometry.type === 'Point') {
    return `POINT(${geometry.coordinates[0]} ${geometry.coordinates[1]})`;
  }

  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates.map((ring: number[][]) => {
      const coords = ring.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ');
      return `(${coords})`;
    }).join(', ');
    return `POLYGON(${rings})`;
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates.map((polygon: number[][][]) => {
      const rings = polygon.map((ring: number[][]) => {
        const coords = ring.map((coord: number[]) => `${coord[0]} ${coord[1]}`).join(', ');
        return `(${coords})`;
      }).join(', ');
      return `(${rings})`;
    }).join(', ');
    return `MULTIPOLYGON(${polygons})`;
  }

  throw new Error(`Type de géométrie non supporté: ${geometry.type}`);
}

// Fonction pour reprojeter une géométrie
function reprojectGeometry(geometry: any, fromProj: string, toProj: string): any {
  const reprojectCoord = (coord: number[]) => {
    const [x, y] = proj4(fromProj, toProj, [coord[0], coord[1]]);
    return [x, y];
  };

  if (geometry.type === 'Point') {
    return {
      type: 'Point',
      coordinates: reprojectCoord(geometry.coordinates)
    };
  }

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map((ring: number[][]) =>
        ring.map(reprojectCoord)
      )
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon: number[][][]) =>
        polygon.map((ring: number[][]) => ring.map(reprojectCoord))
      )
    };
  }

  return geometry;
}

// Heuristique: deviner la projection source (4326 vs 32628) à partir des coordonnées
function guessSourceProjFromGeometry(geometry: any): 'EPSG:4326' | 'EPSG:32628' | null {
  try {
    const collectOne = (g: any): number[] | null => {
      if (!g) return null;
      if (g.type === 'Point') return g.coordinates as number[];
      if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates[0]?.[0]) return g.coordinates[0][0];
      if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates[0]?.[0]?.[0]) return g.coordinates[0][0][0];
      return null;
    };
    const c = collectOne(geometry);
    if (!c || !Array.isArray(c) || c.length < 2) return null;
    const x = Number(c[0]);
    const y = Number(c[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Si valeurs typiques UTM 28N (mètres): x ~ [200000..800000], y ~ [1500000..2000000]
    if (x > 100000 && y > 100000) {
      return 'EPSG:32628';
    }
    // Si valeurs typiques degrés: x in [-180..180], y in [-90..90]
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
      return 'EPSG:4326';
    }
    return null;
  } catch {
    return null;
  }
}

export async function uploadShapefile(req: Request, res: Response) {
  try {
    const files = req.files as ShapefileFiles;
    const { destTable, layerName, projection, protectedZoneType } = req.body;
    const safeLayerName = typeof layerName === 'string' ? layerName.trim() : '';

    console.log('📁 Upload shapefile - Table:', destTable, 'Couche:', layerName, 'Projection:', projection);

    // Validation des fichiers requis
    if (!files?.shp?.[0] || !files?.shx?.[0] || !files?.dbf?.[0]) {
      return res.status(400).json({
        ok: false,
        error: 'Fichiers manquants. Requis: .shp, .shx, .dbf'
      });
    }

    // Validation de la table de destination (alignée avec le schéma actuel)
    // Note: communes/arrondissements ne sont pas présents dans le schéma Prisma actuel
    const validTables = ['regions', 'departements', 'protected_zones'];
    if (!validTables.includes(destTable)) {
      return res.status(400).json({
        ok: false,
        error: 'Table de destination invalide'
      });
    }

    // Lire le shapefile
    const shpBuffer = files.shp[0].buffer;
    const dbfBuffer = files.dbf[0].buffer;

    const source = await shapefile.open(shpBuffer, dbfBuffer);
    const features: any[] = [];

    let result = await source.read();
    while (!result.done) {
      features.push(result.value);
      result = await source.read();
    }

    console.log(`📊 ${features.length} entités lues depuis le shapefile`);

    // Déterminer la projection source (auto)
    // Par défaut on considère 4326, mais on peut deviner depuis .prj, param, ou heuristique sur coords
    let sourceProj: string = 'EPSG:4326';
    try {
      const prjBuf = files.prj?.[0]?.buffer;
      if (prjBuf && prjBuf.length > 0) {
        const prjText = prjBuf.toString('utf8');
        // Détections simples
        if (/UTM/i.test(prjText) && /zone\s*28/i.test(prjText)) {
          sourceProj = 'EPSG:32628';
        } else if (/WGS[_\s]?84/i.test(prjText)) {
          sourceProj = 'EPSG:4326';
        }
      } else if (typeof projection === 'string' && projection.trim().length > 0) {
        // Si le client a tout de même envoyé une projection, l'utiliser en dernier recours
        sourceProj = projection.trim();
      }
    } catch (e) {
      // garder la valeur par défaut
      console.warn('[shapefile] Impossible de lire le .prj, fallback 4326');
    }

    // Si le .prj est absent/indéfini, utiliser une heuristique sur la 1ère entité pour éviter une mauvaise reprojection
    try {
      if (sourceProj === 'EPSG:4326' && features.length > 0) {
        const guess = guessSourceProjFromGeometry(features[0]?.geometry);
        if (guess && guess !== sourceProj) {
          console.log(`[shapefile] Heuristique CRS: détection ${guess} (au lieu de ${sourceProj})`);
          sourceProj = guess;
        }
      }
    } catch {}

    // Projection cible: UTM 28N (SRID 32628)
    const targetProj = 'EPSG:32628';

    // Traiter chaque entité
    let insertedCount = 0;

    for (const feature of features) {
      try {
        // Reprojeter la géométrie vers UTM 28N seulement si nécessaire
        let geometry = feature.geometry;
        if (sourceProj !== targetProj) {
          geometry = reprojectGeometry(geometry, sourceProj, targetProj);
        }

        // Calculer le centroïde (en WGS84 pour l'affichage)
        const geometryWGS84 = reprojectGeometry(geometry, targetProj, 'EPSG:4326');
        const centroid = calculateCentroid(geometryWGS84);

        // Convertir la géométrie en WKT
        const wkt = geometryToWKT(geometry);

        // Préparer les données selon la table
        const properties = feature.properties || {};

        if (destTable === 'regions') {
          // Schéma actuel (Prisma baseline): regions(name, status, surface_km2, perimetre_km, zone_geo, geom, center)
          await db.execute(sql`
            INSERT INTO regions (name, geom, center)
            VALUES (
              ${layerName},
              ST_GeomFromText(${wkt}, 32628),
              ST_SetSRID(ST_MakePoint(${centroid.lon}, ${centroid.lat}), 4326)
            )
          `);
        } else if (destTable === 'departements') {
          // Schéma actuel (Prisma baseline): departements(name, status, surface_km2, perimetre_km, zone_geo, geom, center)
          await db.execute(sql`
            INSERT INTO departements (name, geom, center)
            VALUES (
              ${layerName || properties.nom || properties.name || properties.NAME || `Département ${insertedCount + 1}`},
              ST_GeomFromText(${wkt}, 32628),
              ST_SetSRID(ST_MakePoint(${centroid.lon}, ${centroid.lat}), 4326)
            )
          `);
        } else if (destTable === 'protected_zones') {
          if (!safeLayerName) {
            return res.status(400).json({ ok: false, error: 'Le champ "Nom de la couche" est requis pour zones protégées' });
          }
          if (!protectedZoneType || (typeof protectedZoneType === 'string' && protectedZoneType.trim().length === 0)) {
            return res.status(400).json({ ok: false, error: 'Le champ "Type de zone protégée" est requis' });
          }
          // Note: protected_zones utilise "geom" pas "geometry" et n'a pas centroid_lat/lon
          // Coercition douce des champs numériques s'ils arrivent en string (ex: "123,45" ou "123.45")
          const toNumberOrNull = (v: any) => {
            if (v === undefined || v === null || v === '') return null;
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
              // Remplacer les virgules décimales par des points
              const normalized = v.replace(/,/g, '.');
              const n = Number(normalized);
              return Number.isFinite(n) ? n : null;
            }
            return null;
          };
          const surfaceHa = toNumberOrNull(properties.surface_ha ?? properties.SURFACE_HA);
          const perimetreM = toNumberOrNull(properties.perimetre_m ?? properties.PERIMETER_M ?? properties.PERIMETRE_M);
          await db.execute(sql`
            INSERT INTO protected_zones (name, "type", geom, surface_ha, perimetre_m, centre_geometrique, created_at, updated_at)
            VALUES (
              ${safeLayerName},
              ${protectedZoneType},
              ST_Force3D(ST_GeomFromText(${wkt}, 32628)),
              ${surfaceHa},
              ${perimetreM},
              ST_Transform(ST_SetSRID(ST_MakePoint(${centroid.lon}, ${centroid.lat}), 4326), 32628),
              NOW(),
              NOW()
            )
          `);
        }

        insertedCount++;
      } catch (error) {
        const wktPreview = (() => {
          try {
            const w = geometryToWKT(feature?.geometry ?? {});
            return (typeof w === 'string' ? w.substring(0, 200) : String(w)).replace(/\s+/g, ' ');
          } catch {
            return 'WKT non disponible';
          }
        })();
        const safeCentroid = (() => {
          try {
            const geom = feature?.geometry;
            if (!geom) return null;
            // Reprojeter la géométrie vers WGS84 pour calculer un centroïde lisible
            const geomWGS84 = reprojectGeometry(
              reprojectGeometry(geom, sourceProj, targetProj),
              targetProj,
              'EPSG:4326'
            );
            return calculateCentroid(geomWGS84);
          } catch {
            return null;
          }
        })();
        console.error('[shapefile] Détails échec insertion:', {
          destTable,
          safeLayerName,
          protectedZoneType,
          sourceProj,
          centroid: safeCentroid,
          wktPreview
        });
        console.error('❌ Erreur insertion entité:', error);
        // Continuer avec les autres entités
      }
    }

    console.log(`✅ ${insertedCount} entités insérées dans ${destTable}`);

    res.json({
      ok: true,
      count: insertedCount,
      message: `${insertedCount} entités importées avec succès dans ${destTable}`
    });

  } catch (error: any) {
    console.error('❌ Erreur upload shapefile:', error);
    res.status(500).json({
      ok: false,
      error: error.message || 'Erreur lors du traitement du shapefile'
    });
  }
}
