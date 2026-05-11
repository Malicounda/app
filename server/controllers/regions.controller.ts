import { sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { db } from '../db.js';

export const getRegions = async (req: Request, res: Response) => {
  try {
    // Inspecter les colonnes disponibles
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'regions'
    `) as unknown as { column_name: string }[];
    const has = (c: string) => cols.some(k => k.column_name === c);

    // Colonnes possibles pour les métadonnées
    const idCol = has('id') ? 'id' : null;
    const codeCol = has('code') ? 'code' : (has('region_code') ? 'region_code' : null);
    const nomCol = has('nom') ? 'nom' : (has('name') ? 'name' : (has('region_name') ? 'region_name' : null));
    const paysCol = has('pays') ? 'pays' : null;
    const surfaceCol = has('surface_ha') ? 'surface_ha' : (has('surface_km2') ? 'surface_km2' : null);
    const perimetreCol = has('perimetre_m') ? 'perimetre_m' : (has('perimetre_km') ? 'perimetre_km' : null);
    const statutCol = has('statut_chasse') ? 'statut_chasse' : (has('statuts_chasse') ? 'statuts_chasse' : (has('status') ? 'status' : null));
    const colorCol = has('color') ? 'color' : (has('couleur') ? 'couleur' : null);

    // Colonnes géométriques possibles
    const geomCol = has('geom') ? 'geom'
      : has('geometry') ? 'geometry'
      : has('zone_geo') ? 'zone_geo'
      : null;
    const centerCol = has('centre_geometrique') ? 'centre_geometrique' : (has('center') ? 'center' : null);

    // Construire dynamiquement la SELECT
    const selects: string[] = [];
    if (idCol) selects.push(`"${idCol}" as id`);
    if (codeCol) selects.push(`"${codeCol}" as code`);
    if (nomCol) selects.push(`"${nomCol}" as nom`);
    if (paysCol) selects.push(`"${paysCol}" as pays`);
    if (surfaceCol) selects.push(`"${surfaceCol}" as surface`);
    if (perimetreCol) selects.push(`"${perimetreCol}" as perimetre`);
    if (statutCol) selects.push(`"${statutCol}" as statut`);
    if (colorCol) selects.push(`"${colorCol}" as color`);
    if (centerCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(${centerCol}), 4326)) as centre`);
    if (geomCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(${geomCol}), 4326)) as geometry`);

    if (selects.length === 0 || !geomCol) {
      // Fallback: utiliser region_coordinates (déjà implémenté aussi dans statuses.controller)
      const fallback = await db.execute(sql`
        SELECT region_code, coordinates, status, color FROM region_coordinates
      ` as any);
      const items = Array.isArray(fallback) ? fallback as any : (fallback as any);
      const features = items.map((r: any) => {
        let feature: any = null;
        try { feature = typeof r.coordinates === 'string' ? JSON.parse(r.coordinates) : r.coordinates; } catch { feature = null; }
        const geometry = feature?.geometry ? feature.geometry : feature;
        return geometry ? {
          type: 'Feature',
          geometry,
          properties: {
            code: r.region_code,
            nom: r.region_code, // au minimum, renseigner nom avec code si nom absent
            status: r.status,
            color: r.color,
          }
        } : null;
      }).filter(Boolean);
      return res.json({ type: 'FeatureCollection', features });
    }

    const query = `SELECT ${selects.join(', ')} FROM regions`;
    const rows = await db.execute(sql.raw(query)) as any[];
    const regions = Array.isArray(rows) ? rows : (rows as any);
    const features = regions.map((region: any) => {
      const { geometry, centre, ...properties } = region;
      const nom = properties.nom ?? properties.name ?? null;
      const restProperties = { ...properties };
      return {
        type: 'Feature',
        geometry: geometry ? JSON.parse(geometry) : null,
        properties: {
          ...restProperties,
          nom,
          NOM_REGION: nom,
          centre: centre ? JSON.parse(centre) : null
        }
      };
    }).filter((f: any) => !!f.geometry);

    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error fetching regions:', error);
    res.status(500).json({ error: 'Failed to fetch regions' });
  }
};

export const getDepartements = async (req: Request, res: Response) => {
  try {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'departements'
    `) as unknown as { column_name: string }[];
    const has = (c: string) => cols.some(k => k.column_name === c);

    const idCol = has('id') ? 'id' : null;
    const codeCol = has('code') ? 'code' : (has('code_dep') ? 'code_dep' : null);
    const nomCol = has('nom') ? 'nom' : (has('nom_dep') ? 'nom_dep' : (has('name') ? 'name' : null));
    const regionIdCol = has('region_id') ? 'region_id' : null;
    const codeRegionCol = has('code_region') ? 'code_region' : null;
    const paysCol = has('pays') ? 'pays' : null;
    const surfaceCol = has('surface_ha') ? 'surface_ha' : (has('surface_km2') ? 'surface_km2' : null);
    const perimetreCol = has('perimetre_m') ? 'perimetre_m' : (has('perimetre_km') ? 'perimetre_km' : null);
    const statutCol = has('statut_chasse') ? 'statut_chasse' : (has('statuts_chasse') ? 'statuts_chasse' : (has('status') ? 'status' : null));
    const colorCol = has('color') ? 'color' : (has('couleur') ? 'couleur' : null);

    const geomCol = has('geom') ? 'geom' : (has('geometry') ? 'geometry' : (has('zone_geo') ? 'zone_geo' : null));
    const centerCol = has('centre_geometrique') ? 'centre_geometrique' : (has('center') ? 'center' : null);

    const selects: string[] = [];
    if (idCol) selects.push(`d."${idCol}" as id`);
    if (codeCol) selects.push(`d."${codeCol}" as code`);
    if (nomCol) selects.push(`d."${nomCol}" as nom`);
    if (codeRegionCol) selects.push(`d."${codeRegionCol}" as code_region`);
    if (paysCol) selects.push(`d."${paysCol}" as pays`);
    if (surfaceCol) selects.push(`d."${surfaceCol}" as surface`);
    if (perimetreCol) selects.push(`d."${perimetreCol}" as perimetre`);
    if (statutCol) selects.push(`d."${statutCol}" as statut`);
    if (colorCol) selects.push(`d."${colorCol}" as color`);
    if (regionIdCol) selects.push(`d."${regionIdCol}" as region_id`);
    if (centerCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(d.${centerCol}), 4326)) as centre`);
    if (geomCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(d.${geomCol}), 4326)) as geometry`);

    if (!geomCol) {
      return res.json({ type: 'FeatureCollection', features: [] });
    }

    const joinRegionName = has('region_id') ? 'LEFT JOIN regions r ON r.id = d.region_id' : '';
    const regionNomSelect = joinRegionName ? (has('nom') ? `, r.nom AS region_nom` : (has('name') ? `, r.name AS region_nom` : '')) : '';

    const regionParam = req.query.region as string | undefined;

    const query = `
      SELECT ${selects.join(', ')}${regionNomSelect}
      FROM departements d
      ${joinRegionName}
      ${regionParam && joinRegionName ? `WHERE UPPER(r.nom) = UPPER('${regionParam}')` : ''}
    `;

    const rows = await db.execute(sql.raw(query)) as any[];
    const departements = Array.isArray(rows) ? rows : (rows as any);
    const features = departements.map((dept: any) => {
      const { geometry, centre, ...properties } = dept;
      const nom = properties.nom ?? properties.name ?? properties.nom_dep ?? null;
      return {
        type: 'Feature',
        geometry: geometry ? JSON.parse(geometry) : null,
        properties: {
          ...properties,
          nom,
          centre: centre ? JSON.parse(centre) : null
        }
      };
    }).filter((f: any) => !!f.geometry);

    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error fetching departements:', error);
    res.status(500).json({ error: 'Failed to fetch departements' });
  }
};

export const getCommunes = async (req: Request, res: Response) => {
  try {
    const departementIdParam = req.query.departementId as string | undefined;
    const withArrondissementParam = req.query.withArrondissement as string | undefined;
    const withArrondissement = withArrondissementParam === '1' || String(withArrondissementParam || '').toLowerCase() === 'true';

    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'communes'
    `) as unknown as { column_name: string }[];
    const has = (c: string) => cols.some(k => k.column_name === c);

    const idCol = has('id') ? 'id' : null;
    const codeCol = has('code') ? 'code'
      : has('code_commune') ? 'code_commune'
      : has('code_com') ? 'code_com'
      : null;
    const nomCol = has('nom') ? 'nom'
      : has('name') ? 'name'
      : has('libelle') ? 'libelle'
      : null;
    const departementIdCol = has('departement_id') ? 'departement_id'
      : has('dept_id') ? 'dept_id'
      : has('departementid') ? 'departementid'
      : null;
    const regionIdCol = has('region_id') ? 'region_id' : null;
    const statutCol = has('statut_chasse') ? 'statut_chasse'
      : has('statuts_chasse') ? 'statuts_chasse'
      : has('status') ? 'status'
      : null;
    const colorCol = has('color') ? 'color'
      : has('couleur') ? 'couleur'
      : null;
    const surfaceCol = has('surface_ha') ? 'surface_ha'
      : has('surface_km2') ? 'surface_km2'
      : null;
    const perimetreCol = has('perimetre_m') ? 'perimetre_m'
      : has('perimetre_km') ? 'perimetre_km'
      : null;

    const geomCol = has('geom') ? 'geom'
      : has('geometry') ? 'geometry'
      : has('zone_geo') ? 'zone_geo'
      : has('shape') ? 'shape'
      : null;
    const centerCol = has('centre_geometrique') ? 'centre_geometrique'
      : has('center') ? 'center'
      : null;

    if (!geomCol) {
      return res.json({ type: 'FeatureCollection', features: [] });
    }

    const selects: string[] = [];
    if (idCol) selects.push(`c."${idCol}" as id`);
    if (codeCol) selects.push(`c."${codeCol}" as code`);
    if (nomCol) selects.push(`c."${nomCol}" as nom`);
    if (departementIdCol) selects.push(`c."${departementIdCol}" as departement_id`);
    if (regionIdCol) selects.push(`c."${regionIdCol}" as region_id`);
    if (statutCol) selects.push(`c."${statutCol}" as statut`);
    if (colorCol) selects.push(`c."${colorCol}" as color`);
    if (surfaceCol) selects.push(`c."${surfaceCol}" as surface`);
    if (perimetreCol) selects.push(`c."${perimetreCol}" as perimetre`);
    if (centerCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(c.${centerCol}), 4326)) as centre`);
    selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(c.${geomCol}), 4326)) as geometry`);

    let query = `SELECT ${selects.join(', ')}`;
    if (withArrondissement) {
      query += `, a.nom AS arrondissement_nom`;
    }
    query += ` FROM communes c`;
    if (withArrondissement) {
      query += ` LEFT JOIN arrondissements a ON a.geom IS NOT NULL`;
      if (departementIdCol) {
        query += ` AND a.departement_id = c."${departementIdCol}"`;
      }
      query += ` AND ST_Intersects(a.geom, ST_Transform(ST_PointOnSurface(c.${geomCol}), ST_SRID(a.geom)))`;
    }
    const filters: string[] = [];

    if (departementIdParam && departementIdCol) {
      const depIdNum = Number(departementIdParam);
      if (!Number.isNaN(depIdNum)) {
        filters.push(`c."${departementIdCol}" = ${depIdNum}`);
      }
    }

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    const rows = await db.execute(sql.raw(query)) as any[];
    const communes = Array.isArray(rows) ? rows : (rows as any);
    const features = communes.map((commune: any) => {
      const { geometry, centre, ...properties } = commune;
      const nom = properties.nom ?? properties.name ?? properties.libelle ?? null;
      return {
        type: 'Feature',
        geometry: geometry ? JSON.parse(geometry) : null,
        properties: {
          ...properties,
          nom,
          centre: centre ? JSON.parse(centre) : null,
        }
      };
    }).filter((f: any) => !!f.geometry);

    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error fetching communes:', error);
    res.status(500).json({ error: 'Failed to fetch communes' });
  }
};

export const getArrondissements = async (req: Request, res: Response) => {
  try {
    const departementIdParam = req.query.departementId as string | undefined;

    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'arrondissements'
    `) as unknown as { column_name: string }[];
    const has = (c: string) => cols.some(k => k.column_name === c);

    const idCol = has('id') ? 'id' : null;
    const codeCol = has('code') ? 'code'
      : has('code_arrondissement') ? 'code_arrondissement'
      : has('code_arr') ? 'code_arr'
      : null;
    const nomCol = has('nom') ? 'nom'
      : has('name') ? 'name'
      : has('libelle') ? 'libelle'
      : null;
    const departementIdCol = has('departement_id') ? 'departement_id'
      : has('dept_id') ? 'dept_id'
      : has('departementid') ? 'departementid'
      : null;
    const statutCol = has('statut_chasse') ? 'statut_chasse'
      : has('statuts_chasse') ? 'statuts_chasse'
      : has('status') ? 'status'
      : null;
    const colorCol = has('color') ? 'color'
      : has('couleur') ? 'couleur'
      : null;
    const surfaceCol = has('surface_ha') ? 'surface_ha'
      : has('surface_km2') ? 'surface_km2'
      : null;
    const perimetreCol = has('perimetre_m') ? 'perimetre_m'
      : has('perimetre_km') ? 'perimetre_km'
      : null;

    const geomCol = has('geom') ? 'geom'
      : has('geometry') ? 'geometry'
      : has('zone_geo') ? 'zone_geo'
      : has('shape') ? 'shape'
      : null;
    const centerCol = has('centre_geometrique') ? 'centre_geometrique'
      : has('center') ? 'center'
      : null;

    if (!geomCol) {
      return res.json({ type: 'FeatureCollection', features: [] });
    }

    const selects: string[] = [];
    if (idCol) selects.push(`a."${idCol}" as id`);
    if (codeCol) selects.push(`a."${codeCol}" as code`);
    if (nomCol) selects.push(`a."${nomCol}" as nom`);
    if (departementIdCol) selects.push(`a."${departementIdCol}" as departement_id`);
    if (statutCol) selects.push(`a."${statutCol}" as statut`);
    if (colorCol) selects.push(`a."${colorCol}" as color`);
    if (surfaceCol) selects.push(`a."${surfaceCol}" as surface`);
    if (perimetreCol) selects.push(`a."${perimetreCol}" as perimetre`);
    if (centerCol) selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(a.${centerCol}), 4326)) as centre`);
    selects.push(`ST_AsGeoJSON(ST_Transform(ST_Force2D(a.${geomCol}), 4326)) as geometry`);

    let query = `SELECT ${selects.join(', ')} FROM arrondissements a`;
    const filters: string[] = [];

    if (departementIdParam && departementIdCol) {
      const depIdNum = Number(departementIdParam);
      if (!Number.isNaN(depIdNum)) {
        filters.push(`a."${departementIdCol}" = ${depIdNum}`);
      }
    }

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    const rows = await db.execute(sql.raw(query)) as any[];
    const arrondissements = Array.isArray(rows) ? rows : (rows as any);
    const features = arrondissements.map((arrond: any) => {
      const { geometry, centre, ...properties } = arrond;
      const nom = properties.nom ?? properties.name ?? properties.libelle ?? null;
      return {
        type: 'Feature',
        geometry: geometry ? JSON.parse(geometry) : null,
        properties: {
          ...properties,
          nom,
          centre: centre ? JSON.parse(centre) : null,
        }
      };
    }).filter((f: any) => !!f.geometry);

    res.json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Error fetching arrondissements:', error);
    res.status(500).json({ error: 'Failed to fetch arrondissements' });
  }
};
