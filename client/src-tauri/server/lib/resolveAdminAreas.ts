import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export type AdminAreas = {
  arrondissement: string | null;
  commune: string | null;
  departement: string | null;
  region: string | null;
};

// Déduit les zones administratives depuis lat/lon en s'appuyant d'abord sur l'arrondissement (polygone),
// puis le département et la région via jointures. La commune est choisie comme la plus proche
// (les communes sont stockées comme points dans la BDD importée).
export async function resolveAdministrativeAreas(lat: number, lon: number): Promise<AdminAreas> {
  // Point utilisateur en WGS84. On re-projette dynamiquement vers le SRID des géométries ciblées
  // pour éviter tout mélange de SRID (ex: 31028 vs 32628).
  const point4326 = sql`ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326)` as any;

  // 1) Trouver l'arrondissement contenant le point
  const arrRows: any[] = await db.execute(sql`
    SELECT a.id, a.nom AS arrondissement, a.departement_id
    FROM public.arrondissements a
    WHERE a.geom IS NOT NULL
      AND ST_Contains(a.geom, ST_Transform(${point4326}, ST_SRID(a.geom)))
    ORDER BY ST_Area(a.geom) ASC
    LIMIT 1
  ` as any);

  let arrondissement: string | null = null;
  let departementName: string | null = null;
  let regionName: string | null = null;
  let departementId: number | null = null;

  if (arrRows && arrRows[0]) {
    arrondissement = arrRows[0].arrondissement || null;
    departementId = arrRows[0].departement_id ?? null;
  }

  // 2) Déterminer département et région
  if (departementId != null) {
    const deptRows: any[] = await db.execute(sql`
      SELECT d.id, d.nom AS departement, r.nom AS region
      FROM public.departements d
      LEFT JOIN public.regions r ON r.id = d.region_id
      WHERE d.id = ${departementId}
      LIMIT 1
    ` as any);
    if (deptRows && deptRows[0]) {
      departementName = deptRows[0].departement || null;
      regionName = deptRows[0].region || null;
    }
  } else {
    // Fallback spatial direct sur departements si disponible
    try {
      const deptSpatial: any[] = await db.execute(sql`
        SELECT d.id, d.nom AS departement, r.nom AS region
        FROM public.departements d
        LEFT JOIN public.regions r ON r.id = d.region_id
        WHERE d.geom IS NOT NULL AND ST_Contains(d.geom, ST_Transform(${point4326}, ST_SRID(d.geom)))
        ORDER BY ST_Area(d.geom) ASC
        LIMIT 1
      ` as any);
      if (deptSpatial && deptSpatial[0]) {
        departementId = deptSpatial[0].id ?? null;
        departementName = deptSpatial[0].departement || null;
        regionName = deptSpatial[0].region || null;
      }
    } catch (_) {
      // si la colonne geom n'existe pas dans departements
    }
  }

  // 3) Trouver la commune la plus proche (priorité même departement)
  let commune: string | null = null;
  try {
    if (departementId != null) {
      const comRows: any[] = await db.execute(sql`
        SELECT c.nom AS commune
        FROM public.communes c
        WHERE c.geom IS NOT NULL AND c.departement_id = ${departementId}
        ORDER BY ST_Distance(c.geom, ST_Transform(${point4326}, ST_SRID(c.geom))) ASC
        LIMIT 1
      ` as any);
      if (comRows && comRows[0]) {
        commune = comRows[0].commune || null;
      }
    }
    // Fallback sans filtre departement si rien trouvé
    if (!commune) {
      const comAny: any[] = await db.execute(sql`
        SELECT c.nom AS commune
        FROM public.communes c
        WHERE c.geom IS NOT NULL
        ORDER BY ST_Distance(c.geom, ST_Transform(${point4326}, ST_SRID(c.geom))) ASC
        LIMIT 1
      ` as any);
      if (comAny && comAny[0]) {
        commune = comAny[0].commune || null;
      }
    }
  } catch (_) {
    // communes.geom peut ne pas exister selon l'import
  }

  return {
    arrondissement,
    commune,
    departement: departementName,
    region: regionName,
  };
}

