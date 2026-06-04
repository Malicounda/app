import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export type AdminAreas = {
  arrondissement: string | null;
  commune: string | null;
  departement: string | null;
  region: string | null;
  localite: string | null;
};

// Déduit les zones administratives depuis lat/lon en s'appuyant d'abord sur l'arrondissement (polygone),
// puis le département et la région via jointures. La commune est choisie comme la plus proche
// (les communes sont stockées comme points dans la BDD importée).
export async function resolveAdministrativeAreas(lat: number, lon: number): Promise<AdminAreas> {
  // Point utilisateur en WGS84. On re-projette dynamiquement vers le SRID des géométries ciblées
  // pour éviter tout mélange de SRID (ex: 31028 vs 32628).
  const point4326 = sql`ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326)` as any;
  const DEBUG = process.env.DEBUG_RESOLVE === '1';

  let arrondissement: string | null = null;
  let commune: string | null = null;
  let departementName: string | null = null;
  let regionName: string | null = null;
  let localite: string | null = null;
  let departementId: number | null = null;

  // 1) Trouver la localité la plus proche (dans un rayon raisonnable, par ex 5km = ~0.045 degrés, mais on utilise ST_Distance en degrés pour 4326 ou on convertit)
  // ST_Distance sur 4326 renvoie des degrés. 0.05 degré ≈ 5.5 km.
  try {
    if (DEBUG) console.debug(`[resolveAdministrativeAreas] Recherche localite la plus proche pour lat=${lat}, lon=${lon}`);
    const locRows: any[] = await db.execute(sql`
      SELECT l.nom AS localite, l.commune, l.arrondissement, l.departement, l.region
      FROM public.localites l
      WHERE l.geom IS NOT NULL
        AND ST_Distance(l.geom, ${point4326}) < 0.05
      ORDER BY ST_Distance(l.geom, ${point4326}) ASC
      LIMIT 1
    ` as any);
    
    if (locRows && locRows[0]) {
      localite = locRows[0].localite || null;
      commune = locRows[0].commune || null;
      arrondissement = locRows[0].arrondissement || null;
      departementName = locRows[0].departement || null;
      regionName = locRows[0].region || null;
      if (DEBUG) console.debug(`[resolveAdministrativeAreas] Localite trouvée: ${localite} (Commune: ${commune}, Arr: ${arrondissement})`);
    }
  } catch (err) {
    if (DEBUG) console.error('[resolveAdministrativeAreas] Erreur recherche localite:', err);
  }

  // 2) Si l'arrondissement n'est pas trouvé via la localité, chercher par intersection spatiale
  if (!arrondissement) {
    if (DEBUG) console.debug(`[resolveAdministrativeAreas] Recherche arrondissement par geom pour lat=${lat}, lon=${lon}`);
    // Essayer d'abord avec ST_Contains, puis avec une tolérance si aucun résultat
    let arrRows: any[] = await db.execute(sql`
      SELECT a.id, a.nom AS arrondissement, a.departement_id
      FROM public.arrondissements a
      WHERE a.geom IS NOT NULL
        AND ST_Contains(a.geom, ST_Transform(${point4326}, 32628))
      ORDER BY ST_Area(a.geom) ASC
      LIMIT 1
    ` as any);
    
    // Si aucun arrondissement trouvé avec ST_Contains, essayer avec une zone tampon
    if (!arrRows || arrRows.length === 0) {
      if (DEBUG) console.debug(`[resolveAdministrativeAreas] Aucun arrondissement avec ST_Contains, essai avec zone tampon...`);
      arrRows = await db.execute(sql`
        SELECT a.id, a.nom AS arrondissement, a.departement_id
        FROM public.arrondissements a
        WHERE a.geom IS NOT NULL
          AND ST_DWithin(a.geom, ST_Transform(${point4326}, 32628), 5000)
        ORDER BY ST_Distance(a.geom, ST_Transform(${point4326}, 32628)) ASC
        LIMIT 1
      ` as any);
    }

    if (arrRows && arrRows[0]) {
      arrondissement = arrRows[0].arrondissement || null;
      departementId = arrRows[0].departement_id ?? null;
      if (DEBUG) console.debug(`[resolveAdministrativeAreas] Arrondissement trouvé spatialement: ${arrondissement}, departement_id: ${departementId}`);
    }
  }

  // 3) Déterminer département et région s'ils manquent
  if (!departementName || !regionName) {
    if (departementId != null) {
      const deptRows: any[] = await db.execute(sql`
        SELECT d.id, d.nom AS departement, r.nom AS region
        FROM public.departements d
        LEFT JOIN public.regions r ON r.id = d.region_id
        WHERE d.id = ${departementId}
        LIMIT 1
      ` as any);
      if (deptRows && deptRows[0]) {
        departementName = departementName || deptRows[0].departement || null;
        regionName = regionName || deptRows[0].region || null;
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
          departementName = departementName || deptSpatial[0].departement || null;
          regionName = regionName || deptSpatial[0].region || null;
        }
      } catch (_) {
        // si la colonne geom n'existe pas dans departements
      }
    }
  }

  // 4) Trouver la commune la plus proche si non trouvée via localité
  if (!commune) {
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
  }

  // 5) Si on a trouvé aucune localité, en chercher une sans limite de distance
  if (!localite) {
    try {
      const locRows: any[] = await db.execute(sql`
        SELECT l.nom AS localite
        FROM public.localites l
        WHERE l.geom IS NOT NULL
        ORDER BY ST_Distance(l.geom, ${point4326}) ASC
        LIMIT 1
      ` as any);
      if (locRows && locRows[0]) {
        localite = locRows[0].localite || null;
      }
    } catch (err) {
      if (DEBUG) console.error('[resolveAdministrativeAreas] Erreur recherche localite fallback:', err);
    }
  }

  return {
    arrondissement,
    commune,
    departement: departementName,
    region: regionName,
    localite,
  };
}


