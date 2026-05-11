import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
// Define types locally to avoid module resolution issues
type RegionStatus = 'open' | 'partial' | 'closed' | 'unknown';

interface RegionStatusInfo {
  status: RegionStatus;
  color: string;
}

type RegionStatusMap = Record<string, RegionStatusInfo>;

// Drizzle is used instead of Prisma to avoid TLS issues

interface RegionStatusFromDB {
  region_name: string | null;
  status: string | null;
  color: string | null;
}

export const getRegionStatuses = async (req: Request, res: Response) => {
  try {
    // Utiliser directement la table regions avec colonnes connues
    const query = sql`SELECT id, nom as region_name, statut_chasse as status FROM regions`;
    const rows = await db.execute(query) as any[];
    const items = Array.isArray(rows) ? rows : (rows as any);
    
    const formattedStatuses = (items as any[]).reduce((acc: RegionStatusMap, item: any) => {
      const key = item.region_name as string | null;
      if (key) {
        const status = (['open', 'partial', 'closed', 'unknown'].includes(item.status || '')
          ? item.status
          : 'unknown') as RegionStatus;
        acc[key] = {
          status,
          color: STATUS_COLOR[status] || STATUS_COLOR.unknown,
        };
      }
      return acc;
    }, {} as RegionStatusMap);

    res.status(200).json(formattedStatuses);
  } catch (error) {
    console.error('Error fetching region statuses:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ message: 'Failed to fetch region statuses', error: errorMessage });
  }
};

// ------------------------------
// Helpers dynamiques (globaux)
// ------------------------------
const hasColumn = async (table: string, column: string) => {
  const rows = await db.execute(sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  ` as any) as any[];
  const cols = Array.isArray(rows) ? rows : (rows as any);
  return cols.some((r: any) => r.column_name === column);
};

const pickNameColumn = async (table: string): Promise<string | null> => {
  const candidates = ['nom', 'name', 'libelle', 'label', 'code'];
  for (const c of candidates) {
    if (await hasColumn(table, c)) return c;
  }
  return null;
};

const pickStatusColumn = async (table: string): Promise<string | null> => {
  const candidates = ['statut_chasse', 'statuts_chasse', 'status'];
  for (const c of candidates) {
    if (await hasColumn(table, c)) return c;
  }
  return null;
};

const pickColorColumn = async (table: string): Promise<string | null> => {
  const candidates = ['color', 'couleur'];
  for (const c of candidates) {
    if (await hasColumn(table, c)) return c;
  }
  return null;
};

// Normalise un nom pour comparaison (supprime accents, casse, espaces multiples)
const normalize = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Palette par défaut
const STATUS_COLOR: Record<string, string> = {
  open: '#10b981',
  closed: '#ff0000',
  partial: '#fbbf24',
  unknown: '#808080',
};

// ------------------------------
// READ listes pour niveaux infra
// ------------------------------
export const getDepartementStatuses = async (req: Request, res: Response) => {
  try {
    const regionIdParam = (req.query.regionId as string | undefined) || undefined;
    const regionNameParam = (req.query.regionName as string | undefined) || undefined;
    
    console.log(`[DEBUG] getDepartementStatuses - regionId: ${regionIdParam}, regionName: ${regionNameParam}`);
    console.log(`[DEBUG] Query parameters:`, req.query);
    
    let rows: any[];
    
    if (regionIdParam) {
      console.log(`[DEBUG] Filtering by regionId: ${regionIdParam}`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM departements WHERE region_id = ${Number(regionIdParam)}`;
      console.log(`[DEBUG] Executing query for regionId ${regionIdParam}`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    } else if (regionNameParam) {
      console.log(`[DEBUG] Filtering by regionName: ${regionNameParam}`);
      const regQuery = sql`SELECT id, nom FROM regions WHERE LOWER(nom) = LOWER(${regionNameParam})`;
      const regRows = await db.execute(regQuery);
      const regions = Array.isArray(regRows) ? regRows : [regRows];
      console.log(`[DEBUG] Found ${regions.length} regions matching '${regionNameParam}'`);
      
      if (regions.length > 0) {
        const regionId = (regions[0] as any).id;
        console.log(`[DEBUG] Using regionId ${regionId} for filtering`);
        const query = sql`SELECT id, nom, statut_chasse, color FROM departements WHERE region_id = ${regionId}`;
        console.log(`[DEBUG] Executing query for regionName ${regionNameParam} (found regionId ${regionId})`);
        rows = await db.execute(query) as any[];
        console.log(`[DEBUG] Query result length: ${rows.length}`);
      } else {
        console.log(`[DEBUG] No regions found for '${regionNameParam}', returning all departements`);
        const query = sql`SELECT id, nom, statut_chasse, color FROM departements`;
        console.log(`[DEBUG] Executing query without filter (region not found)`);
        rows = await db.execute(query) as any[];
        console.log(`[DEBUG] Query result length: ${rows.length}`);
      }
    } else {
      console.log(`[DEBUG] No filters provided, returning all departements`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM departements`;
      console.log(`[DEBUG] Executing query without filter`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    }
    
    const items = Array.isArray(rows) ? rows : [rows];
    console.log(`[DEBUG] Departements raw result (${items.length} items):`, JSON.stringify(items.slice(0, 5), null, 2));
    
    const result = items.map((r: any) => {
      const mapped = {
        id: r.id, 
        name: r.nom, 
        statut: r.statut_chasse ?? 'unknown', 
        color: r.color || STATUS_COLOR[r.statut_chasse] || STATUS_COLOR.unknown 
      };
      console.log(`[DEBUG] Mapping departement: ${r.id} -> '${r.nom}' (${r.statut_chasse})`);
      return mapped;
    });
    
    console.log(`[DEBUG] Final departements result (${result.length} items):`, JSON.stringify(result.slice(0, 5), null, 2));
    return res.status(200).json(result);
  } catch (e: any) {
    console.error('getDepartementStatuses error:', e);
    console.error('Stack trace:', e.stack);
    return res.status(500).json({ message: 'Failed to fetch departements statuses', error: e.message });
  }
};

export const getCommuneStatuses = async (req: Request, res: Response) => {
  try {
    const departementIdParam = (req.query.departementId as string | undefined) || undefined;
    
    console.log(`[DEBUG] getCommuneStatuses - departementId: ${departementIdParam}`);
    console.log(`[DEBUG] Query parameters:`, req.query);
    
    let rows: any[];
    
    if (departementIdParam) {
      console.log(`[DEBUG] Filtering by departementId: ${departementIdParam}`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM communes WHERE departement_id = ${Number(departementIdParam)}`;
      console.log(`[DEBUG] Executing query for departementId ${departementIdParam}`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    } else {
      console.log(`[DEBUG] No departementId provided, returning first 10 communes`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM communes LIMIT 10`;
      console.log(`[DEBUG] Executing query without filter (LIMIT 10)`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    }
    
    const items = Array.isArray(rows) ? rows : [rows];
    console.log(`[DEBUG] Communes raw result (${items.length} items):`, JSON.stringify(items.slice(0, 5), null, 2));
    
    const result = items.map((r: any) => {
      // statut_chasse est boolean dans communes: true=open, false=closed
      let statutStr = 'unknown';
      if (r.statut_chasse === true) statutStr = 'open';
      else if (r.statut_chasse === false) statutStr = 'closed';
      
      const mapped = { 
        id: r.id, 
        name: r.nom, 
        statut: statutStr, 
        color: r.color || STATUS_COLOR[statutStr] || STATUS_COLOR.unknown 
      };
      console.log(`[DEBUG] Mapping commune: ${r.id} -> '${r.nom}' (${r.statut_chasse})`);
      return mapped;
    });
    
    console.log(`[DEBUG] Final communes result (${result.length} items):`, JSON.stringify(result.slice(0, 5), null, 2));
    return res.status(200).json(result);
  } catch (e: any) {
    console.error('getCommuneStatuses error:', e);
    console.error('Stack trace:', e.stack);
    return res.status(500).json({ message: 'Failed to fetch communes statuses', error: e.message });
  }
};

export const getArrondissementStatuses = async (req: Request, res: Response) => {
  try {
    const departementIdParam = (req.query.departementId as string | undefined) || undefined;
    
    console.log(`[DEBUG] getArrondissementStatuses - departementId: ${departementIdParam}`);
    console.log(`[DEBUG] Query parameters:`, req.query);
    
    let rows: any[];
    
    if (departementIdParam) {
      console.log(`[DEBUG] Filtering by departementId: ${departementIdParam}`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM arrondissements WHERE departement_id = ${Number(departementIdParam)}`;
      console.log(`[DEBUG] Executing query for departementId ${departementIdParam}`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    } else {
      console.log(`[DEBUG] No departementId provided, returning first 10 arrondissements`);
      const query = sql`SELECT id, nom, statut_chasse, color FROM arrondissements LIMIT 10`;
      console.log(`[DEBUG] Executing query without filter (LIMIT 10)`);
      rows = await db.execute(query) as any[];
      console.log(`[DEBUG] Query result length: ${rows.length}`);
    }
    
    const items = Array.isArray(rows) ? rows : [rows];
    console.log(`[DEBUG] Arrondissements raw result (${items.length} items):`, JSON.stringify(items.slice(0, 5), null, 2));
    
    const result = items.map((r: any) => {
      const mapped = { 
        id: r.id, 
        name: r.nom, 
        statut: r.statut_chasse ?? 'unknown', 
        color: r.color || STATUS_COLOR[r.statut_chasse] || STATUS_COLOR.unknown 
      };
      console.log(`[DEBUG] Mapping arrondissement: ${r.id} -> '${r.nom}' (${r.statut_chasse})`);
      return mapped;
    });
    
    console.log(`[DEBUG] Final arrondissements result (${result.length} items):`, JSON.stringify(result.slice(0, 5), null, 2));
    return res.status(200).json(result);
  } catch (e: any) {
    console.error('getArrondissementStatuses error:', e);
    console.error('Stack trace:', e.stack);
    return res.status(500).json({ message: 'Failed to fetch arrondissements statuses', error: e.message });
  }
};

// ------------------------------
// UPDATE
// ------------------------------
export const putRegionStatus = async (req: Request, res: Response) => {
  try {
    const { id, name, status, color } = (req.body || {}) as { id?: string | number; name?: string; status?: string; color?: string };
    const targetColor = color || STATUS_COLOR[status || 'unknown'] || STATUS_COLOR.unknown;
    
    // Update par id si numérique, sinon par nom
    if (id && String(id).match(/^\d+$/)) {
      const query = sql`UPDATE regions SET statut_chasse = ${status}, color = ${targetColor} WHERE id = ${Number(id)}`;
      await db.execute(query);
    } else if (name) {
      const query = sql`UPDATE regions SET statut_chasse = ${status}, color = ${targetColor} WHERE LOWER(nom) = LOWER(${name})`;
      await db.execute(query);
    } else {
      return res.status(400).json({ message: 'Provide id (numeric) or name' });
    }
    
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('putRegionStatus error:', e);
    return res.status(500).json({ message: 'Failed to update region status' });
  }
};

export const putRegionStatusByParam = async (req: Request, res: Response) => {
  try {
    const key = req.params.idOrName;
    const { status, color, name } = (req.body || {}) as { status?: string; color?: string; name?: string };
    return putRegionStatus({ ...req, body: { id: key, name, status, color } } as any, res);
  } catch (e: any) {
    console.error('putRegionStatusByParam error:', e);
    return res.status(500).json({ message: 'Failed to update region status' });
  }
};

const updateEntityGeneric = async (table: string, id: string | number, status: string, color?: string) => {
  const statusCol = await pickStatusColumn(table);
  const colorCol = await pickColorColumn(table);
  if (!statusCol) throw new Error(`No status column for ${table}`);
  const targetColor = color || STATUS_COLOR[String(status || 'unknown')] || STATUS_COLOR.unknown;
  const q = sql.raw(`UPDATE ${table} SET "${statusCol}" = $1${colorCol ? `, "${colorCol}" = $2` : ''} WHERE id = $3`);
  return db.execute((q as any).params(status, targetColor, Number(id)));
};

export const putDepartementStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { statut_chasse, status, color } = (req.body || {}) as any;
    const finalStatus = status ?? statut_chasse;
    const targetColor = color || STATUS_COLOR[finalStatus] || STATUS_COLOR.unknown;
    
    const query = sql`UPDATE departements SET statut_chasse = ${finalStatus}, color = ${targetColor} WHERE id = ${Number(id)}`;
    await db.execute(query);
    
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('putDepartementStatus error:', e);
    return res.status(500).json({ message: 'Failed to update departement status' });
  }
};

export const putCommuneStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { statut_chasse, status, color } = (req.body || {}) as any;
    const finalStatus = status ?? statut_chasse;
    
    // Convertir string vers boolean pour communes
    let booleanStatus: boolean;
    if (finalStatus === 'open') booleanStatus = true;
    else if (finalStatus === 'closed') booleanStatus = false;
    else booleanStatus = false; // défaut = fermé
    
    const targetColor = color || STATUS_COLOR[finalStatus] || STATUS_COLOR.unknown;
    
    const query = sql`UPDATE communes SET statut_chasse = ${booleanStatus}, color = ${targetColor} WHERE id = ${Number(id)}`;
    await db.execute(query);
    
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('putCommuneStatus error:', e);
    return res.status(500).json({ message: 'Failed to update commune status', error: e.message });
  }
};

export const putArrondissementStatus = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { statut_chasse, status, color } = (req.body || {}) as any;
    const finalStatus = status ?? statut_chasse;
    const targetColor = color || STATUS_COLOR[finalStatus] || STATUS_COLOR.unknown;
    
    const query = sql`UPDATE arrondissements SET statut_chasse = ${finalStatus}, color = ${targetColor} WHERE id = ${Number(id)}`;
    await db.execute(query);
    
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('putArrondissementStatus error:', e);
    return res.status(500).json({ message: 'Failed to update arrondissement status', error: e.message });
  }
};

// New: Serve regions geometry from region_coordinates as a GeoJSON FeatureCollection
export const getRegionsGeoJSONFromDB = async (req: Request, res: Response) => {
  try {
    const query = sql`SELECT region_code, coordinates, status, color FROM region_coordinates`;
    const rows = await db.execute(query as any);
    const items: Array<{ region_code: string | null; coordinates: any; status: string | null; color: string | null; }> = Array.isArray(rows) ? (rows as any) : (rows as any);

    const features = items
      .filter(r => !!r.coordinates)
      .map((r) => {
        // coordinates column stores a GeoJSON Feature (or geometry). Try to parse.
        let feature: any = null;
        try {
          feature = typeof r.coordinates === 'string' ? JSON.parse(r.coordinates) : r.coordinates;
        } catch {
          feature = null;
        }
        // Normalize to Feature structure
        if (!feature) return null;
        let geometry = feature.geometry ? feature.geometry : feature;
        const properties = feature.properties || {};
        const status = (['open', 'partial', 'closed', 'unknown'] as const).includes((r.status || '') as any) ? r.status : 'unknown';
        return {
          type: 'Feature',
          geometry,
          properties: {
            ...properties,
            code: r.region_code || properties.code || properties.code_region || null,
            status,
            color: r.color || properties.color || null,
          },
        };
      })
      .filter(Boolean);

    res.status(200).json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error building regions GeoJSON from DB:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({ message: 'Failed to build regions GeoJSON from DB', error: errorMessage });
  }
};

// New: Detect region from point coordinates using PostGIS
export const detectRegionFromPoint = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;
    
    // Validation des paramètres
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        message: 'Les paramètres latitude et longitude sont requis',
        error: 'Missing parameters'
      });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);

    // Validation des valeurs
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ 
        message: 'Les coordonnées doivent être des nombres valides',
        error: 'Invalid coordinates'
      });
    }

    // Validation des plages (Sénégal approximatif)
    if (lat < 12 || lat > 17 || lon < -18 || lon > -11) {
      console.warn(`Coordonnées hors du Sénégal: lat=${lat}, lon=${lon}`);
    }

    console.log(`[DEBUG] detectRegionFromPoint - lat: ${lat}, lon: ${lon}`);

    // Normalisations communes
    const point4326 = sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
    const regionGeom4326 = sql`(
      CASE
        WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
        ELSE ST_Transform(geom, 4326)
      END
    )`;

    // 1) Tentative stricte: intersection avec un buffer de 50m autour du point
    const qIntersect = sql`
      SELECT id, nom
      FROM regions
      WHERE ST_Intersects(
        ST_MakeValid(${regionGeom4326}::geometry),
        (ST_Buffer((${point4326})::geography, 50)::geometry)
      )
      LIMIT 1
    `;
    const r1 = await db.execute(qIntersect) as any[];
    const A = Array.isArray(r1) ? r1 : [r1];
    if (A.length > 0 && A[0]) {
      const region = A[0] as any;
      console.log(`✅ Région (intersects+buffer 50m): ${region.nom} (ID: ${region.id})`);
      return res.status(200).json({ success: true, region: { id: region.id, nom: region.nom } });
    }

    // 2) Tolérance élargie: ST_DWithin 500m
    const qWithin500 = sql`
      SELECT id, nom
      FROM regions
      WHERE ST_DWithin(
        (${regionGeom4326})::geography,
        (${point4326})::geography,
        500
      )
      LIMIT 1
    `;
    const r2 = await db.execute(qWithin500) as any[];
    const B = Array.isArray(r2) ? r2 : [r2];
    if (B.length > 0 && B[0]) {
      const region = B[0] as any;
      console.log(`✅ Région (dwithin 500m): ${region.nom} (ID: ${region.id})`);
      return res.status(200).json({ success: true, region: { id: region.id, nom: region.nom } });
    }

    // 3) Fallback le plus proche: nearest by distance (limité à 10km pour éviter un mauvais appariement)
    const qNearest = sql`
      SELECT id, nom,
             ST_Distance((${regionGeom4326})::geography, (${point4326})::geography) AS dist_m
      FROM regions
      ORDER BY dist_m ASC
      LIMIT 1
    `;
    const r3 = await db.execute(qNearest) as any[];
    const C = Array.isArray(r3) ? r3 : [r3];
    if (C.length > 0 && C[0]) {
      const region = C[0] as any;
      if (typeof region.dist_m === 'number' && region.dist_m <= 10000) {
        console.log(`✅ Région (nearest ${Math.round(region.dist_m)}m): ${region.nom} (ID: ${region.id})`);
        return res.status(200).json({ success: true, nearest: true, distance_m: Math.round(region.dist_m), region: { id: region.id, nom: region.nom } });
      } else {
        console.warn(`Nearest region trop loin: ~${Math.round(region.dist_m)}m`);
      }
    }

    // Fallback: détecter le département, puis remonter à la région par la FK region_id
    console.log(`[DEBUG] Region not found, trying departement fallback for lat=${lat}, lon=${lon}`);
    const depQuery = sql`
      SELECT d.id, d.nom, d.region_id, r.nom AS region_nom
      FROM departements d
      JOIN regions r ON r.id = d.region_id
      WHERE ST_Intersects(
        ST_MakeValid((CASE WHEN ST_SRID(d.geom) = 0 THEN ST_SetSRID(d.geom, 4326) ELSE ST_Transform(d.geom, 4326) END)::geometry),
        (ST_Buffer((${point4326})::geography, 50)::geometry)
      )
      LIMIT 1
    `;
    const depRows = await db.execute(depQuery) as any[];
    const depItems = Array.isArray(depRows) ? depRows : [depRows];
    if (depItems.length > 0 && depItems[0]) {
      const dep = depItems[0] as any;
      console.log(`✅ Fallback via département: ${dep.nom} (region: ${dep.region_nom})`);
      return res.status(200).json({ success: true, region: { id: dep.region_id, nom: dep.region_nom } });
    }

    console.log(`⚠️ Aucune région trouvée (même via fallback) pour lat=${lat}, lon=${lon}`);
    return res.status(404).json({ success: false, message: 'Aucune région trouvée pour ces coordonnées', region: null });
  } catch (error) {
    console.error('Error detecting region from point:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la détection de la région', 
      error: errorMessage 
    });
  }
};

// New: Detect departement from point coordinates using PostGIS
export const detectDepartementFromPoint = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ 
        message: 'Les paramètres latitude et longitude sont requis',
        error: 'Missing parameters'
      });
    }

    const lat = parseFloat(latitude as string);
    const lon = parseFloat(longitude as string);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ 
        message: 'Les coordonnées doivent être des nombres valides',
        error: 'Invalid coordinates'
      });
    }

    console.log(`[DEBUG] detectDepartementFromPoint - lat: ${lat}, lon: ${lon}`);

    // Requête PostGIS SRID-agnostique + tolérance 100m pour département
    const query = sql`
      SELECT id, nom, region_id
      FROM departements
      WHERE ST_DWithin(
        (
          CASE 
            WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
            ELSE ST_Transform(geom, 4326)
          END
        )::geography,
        ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        100
      )
      LIMIT 1
    `;

    const rows = await db.execute(query) as any[];
    const items = Array.isArray(rows) ? rows : [rows];

    if (items.length > 0 && items[0]) {
      const departement = items[0] as any;
      console.log(`✅ Département trouvé: ${departement.nom} (ID: ${departement.id})`);
      
      return res.status(200).json({
        success: true,
        departement: {
          id: departement.id,
          nom: departement.nom,
          region_id: departement.region_id
        }
      });
    } else {
      console.log(`⚠️ Aucun département trouvé pour le point: lat=${lat}, lon=${lon}`);
      
      return res.status(404).json({
        success: false,
        message: 'Aucun département trouvé pour ces coordonnées',
        departement: null
      });
    }
  } catch (error) {
    console.error('Error detecting departement from point:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la détection du département', 
      error: errorMessage 
    });
  }
};
