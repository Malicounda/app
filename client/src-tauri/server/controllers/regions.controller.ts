import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

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

    const query = `
      SELECT ${selects.join(', ')}${regionNomSelect}
      FROM departements d
      ${joinRegionName}
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
