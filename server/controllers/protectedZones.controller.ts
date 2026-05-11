import { sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import { db } from '../db.js';

interface ProtectedZoneRecord {
  id: number;
  name: string | null;
  type: string | null;
  surface_ha: number | null;
  perimetre_m: number | null;
  geojson: string; // geometry as GeoJSON string
}

export const getAllProtectedZonesAsGeoJSON = async (req: Request, res: Response) => {
  try {
    // Récupérer le paramètre de type si fourni
    const typeFilter = req.query.type as string | undefined;

    // Récupérer les informations de l'utilisateur connecté
    const user = (req as any)?.user;
    const userRole = user?.role as string | undefined;
    const userRegion = user?.region as string | undefined; // Région de l'agent
    const userDepartement = (user?.departement || user?.zone) as string | undefined; // Dépt pour agent de secteur

    // Vérifier si le filtrage régional est activé
    let regionalFilterEnabled = false;
    try {
      const settingResult = await db.execute(sql`
        SELECT setting_value FROM system_settings
        WHERE setting_key = 'regional_filter_protected_zones'
        LIMIT 1
      `);
      if (Array.isArray(settingResult) && settingResult.length > 0) {
        const value = (settingResult[0] as any).setting_value;
        regionalFilterEnabled = value === 'true' || value === '1' || value === 1 || value === true;
      }
    } catch (e) {
      console.warn('[protectedZones] Erreur lors de la récupération du paramètre de filtrage régional:', e);
    }

    // Déterminer le SRID source (32628 pour le Sénégal - UTM Zone 28N)
    const fallbackSrid = parseInt(process.env.PROTECTED_ZONES_SRID || '32628', 10);

    // Détecter dynamiquement la colonne contenant la géométrie dans protected_zones
    const cols = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'protected_zones'
    `) as unknown as { column_name: string; data_type: string }[];

    const findCol = (name: string) => cols.find(c => c.column_name === name);
    const has = (name: string) => !!findCol(name);
    // Priorités: geom (geometry) -> zone_geo (geometry) -> geometry (json/jsonb/text) -> geojson (json/jsonb/text)
    let geomSource: 'geom' | 'zone_geo' | 'geometry' | 'geojson' | null = null;
    let geomSourceType: string | null = null;
    if (has('geom')) { geomSource = 'geom'; geomSourceType = findCol('geom')!.data_type; }
    else if (has('zone_geo')) { geomSource = 'zone_geo'; geomSourceType = findCol('zone_geo')!.data_type; }
    else if (has('geometry')) { geomSource = 'geometry'; geomSourceType = findCol('geometry')!.data_type; }
    else if (has('geojson')) { geomSource = 'geojson'; geomSourceType = findCol('geojson')!.data_type; }

    if (!geomSource) {
      return res.status(404).json({ message: "Aucune colonne géométrique trouvée dans 'protected_zones' (recherché: geom, zone_geo, geometry, geojson)." });
    }

    // Construire la clause de sélection en fonction de la source
    // Si source geometry/json -> ST_GeomFromGeoJSON avec gestion Feature/FeatureCollection
    // Si source geom/zone_geo (déjà de type geometry) -> utiliser directement
    const buildSrcCase = (src: string, srcType: string | null) => {
      if (src === 'geom' || src === 'zone_geo') {
        return `${src} AS geom0`;
      }
      // src = 'geometry' ou 'geojson' (json/jsonb/text)
      const t = (srcType || '').toLowerCase();
      const isJson = t.includes('json');
      const isText = t.includes('char') || t.includes('text');
      if (isJson) {
        return `CASE
            WHEN ${src} IS NULL THEN NULL
            WHEN jsonb_typeof(${src}) = 'object' AND (${src}->>'type') = 'Feature' THEN ST_GeomFromGeoJSON((${src}->'geometry')::text)
            WHEN jsonb_typeof(${src}) = 'object' AND (${src}->>'type') = 'FeatureCollection' THEN ST_Collect(ARRAY(SELECT ST_GeomFromGeoJSON((feat->'geometry')::text) FROM jsonb_array_elements(${src}->'features') AS feat WHERE (feat->'geometry') IS NOT NULL))
            WHEN jsonb_typeof(${src}) = 'object' THEN ST_GeomFromGeoJSON(${src}::text)
            ELSE NULL
          END AS geom0`;
      }
      if (isText) {
        // Colonne texte contenant un GeoJSON (Feature ou geometry). Essayer direct.
        return `CASE
            WHEN ${src} IS NULL OR TRIM(${src}) = '' THEN NULL
            ELSE
              COALESCE(
                -- Tenter d'extraire la géométrie si c'est un Feature
                (
                  CASE
                    WHEN (${src} LIKE '{%\"type\":%\"Feature\"%}' OR ${src} LIKE '{%"type":%"Feature"%}') THEN
                      ST_GeomFromGeoJSON(
                        (
                          CASE
                            WHEN (${src} LIKE '{%\"geometry\":%}' OR ${src} LIKE '{%"geometry":%}') THEN
                              (regexp_replace(${src}, '.*"geometry"\s*:\s*({.*})\s*,\s*"properties".*', '\\1'))
                            ELSE ${src}
                          END
                        )
                      )
                    ELSE ST_GeomFromGeoJSON(${src})
                  END
                ),
                NULL
              )
          END AS geom0`;
      }
      // Fallback inconnu: tenter direct
      return `CASE WHEN ${src} IS NULL THEN NULL ELSE ST_GeomFromGeoJSON(${src}::text) END AS geom0`;
    };

    // Construire la clause WHERE pour le filtrage par type
    let whereClause = typeFilter ? `AND type = '${typeFilter.replace(/'/g, "''")}'` : '';

    // Construire la requête principale avec option de filtrage géométrique par région
    // 1) CTE src: lecture des colonnes et géométrie source
    // 2) CTE norm: normalisation SRID et 2D
    // 3) CTE agent_region: géométrie de la région de l'agent si applicable
    // 4) Sélection finale avec ST_Intersects si agent_region est présent; sinon, pas de filtre spatial

    // Harmoniser avec les rôles du frontend: 'agent' (régional si pas de departement), 'sub-agent' (secteur),
    // et compatibilité avec anciens rôles explicites 'regional-agent'/'sector-agent'.
    const isRegionalAgent = !!(userRegion && (
      userRole === 'regional-agent' ||
      (userRole === 'agent' && !userDepartement)
    ));
    const isSectorAgent = !!(userDepartement && (
      userRole === 'sector-agent' ||
      userRole === 'sub-agent' ||
      (userRole === 'agent')
    ));
    const useRegionalGeomFilter = regionalFilterEnabled && (isRegionalAgent || isSectorAgent);

    // Debug logs
    console.log(`[protectedZones] User: ${user?.username}, Role: ${userRole}, Region: ${userRegion}, Dept: ${userDepartement}`);
    console.log(`[protectedZones] Regional filter enabled: ${regionalFilterEnabled}`);
    console.log(`[protectedZones] Is regional agent: ${isRegionalAgent}, Is sector agent: ${isSectorAgent}`);
    console.log(`[protectedZones] Use regional geom filter: ${useRegionalGeomFilter}`);

    // Préparer des versions normalisées simples des entrées utilisateur
    const normalizeStr = (s?: string) => (s || '')
      .toLowerCase()
      .trim();
    const userRegionNorm = normalizeStr(userRegion).replace(/'/g, "''");
    const userDepNorm = normalizeStr(userDepartement).replace(/'/g, "''");

    // Support optionnel: filtre par BBOX (format bbox=lon1,lat1,lon2,lat2 en WGS84)
    const bboxParam = (req.query.bbox as string | undefined)?.trim();
    let bboxCte = '';
    let bboxJoin = '';
    if (bboxParam) {
      const parts = bboxParam.split(',').map(s => parseFloat(s.trim()));
      if (parts.length === 4 && parts.every(n => Number.isFinite(n))) {
        const [lon1, lat1, lon2, lat2] = parts;
        bboxCte = `, viewport AS (\n  SELECT ST_Transform(ST_MakeEnvelope(${lon1}, ${lat1}, ${lon2}, ${lat2}, 4326), ${fallbackSrid}) AS env\n)`;
        bboxJoin = `\nJOIN viewport v ON n.geom_set && v.env`;
      }
    }

    const query = `
      ${useRegionalGeomFilter ? `
      -- Géométrie de l'aire de l'agent (région OU département)
      WITH agent_area AS (
        SELECT COALESCE(
          ${isRegionalAgent ? `
            -- Région par nom (gestion accents par codes ASCII)
            (SELECT geom FROM regions WHERE
              lower(trim(nom)) = '${userRegionNorm}'
              OR upper(trim(nom)) LIKE '%${userRegionNorm.toUpperCase()}%'
              OR replace(replace(upper(trim(nom)), chr(200), 'E'), chr(232), 'E') LIKE '%${userRegionNorm.toUpperCase()}%'
              OR translate(upper(trim(nom)), chr(200)||chr(232)||chr(201)||chr(233), 'EEEE') LIKE '%${userRegionNorm.toUpperCase()}%'
              LIMIT 1)
          ` : `NULL`},
          ${isSectorAgent ? `
            -- Département par nom (simple) - utiliser seulement geom
            (SELECT geom FROM departements WHERE lower(trim(nom)) = '${userDepNorm}' OR upper(trim(nom)) LIKE '%${userDepNorm.toUpperCase()}%' LIMIT 1)
          ` : `NULL`}
        ) AS geom
      )${bboxCte},
      ` : `WITH ${bboxCte ? bboxCte.slice(2) : ''}`}
      src AS (
        SELECT
          id,
          name,
          type,
          surface_ha,
          perimetre_m,
          ${buildSrcCase(geomSource, geomSourceType)}
        FROM protected_zones
        WHERE 1=1 ${whereClause}
      ), norm AS (
        SELECT
          id,
          name,
          type,
          surface_ha,
          perimetre_m,
          CASE
            WHEN geom0 IS NULL THEN NULL
            WHEN ST_SRID(geom0) = 0 THEN
              -- SRID manquant: déduire via heuristique (coords hors bornes geo -> fallbackSrid sinon 4326)
              ST_SetSRID(
                geom0,
                CASE
                  WHEN abs(ST_XMin(ST_Envelope(geom0))) > 180 OR abs(ST_XMax(ST_Envelope(geom0))) > 180
                    OR abs(ST_YMin(ST_Envelope(geom0))) > 90 OR abs(ST_YMax(ST_Envelope(geom0))) > 90
                  THEN ${fallbackSrid}
                  ELSE 4326
                END
              )
            ELSE geom0
          END AS geom_set
        FROM src
      )
      SELECT
        n.id,
        n.name,
        n.type,
        n.surface_ha,
        n.perimetre_m,
        r.nom AS region,
        d.nom AS departement,
        ST_AsGeoJSON(
          ST_Transform(
            ST_SimplifyPreserveTopology(n.geom_set, 50.0),
            4326
          )
        ) AS geojson
      FROM norm n
      ${useRegionalGeomFilter ? `JOIN agent_area ar ON n.geom_set && ar.geom AND ST_Intersects(n.geom_set, ar.geom)` : ''}
      ${bboxJoin}
      LEFT JOIN LATERAL (
        SELECT nom FROM regions r
        WHERE r.geom && n.geom_set AND ST_Intersects(r.geom, n.geom_set)
        LIMIT 1
      ) r ON TRUE
      LEFT JOIN LATERAL (
        SELECT nom FROM departements d
        WHERE d.geom && n.geom_set AND ST_Intersects(d.geom, n.geom_set)
        LIMIT 1
      ) d ON TRUE
      WHERE n.geom_set IS NOT NULL
      ;
    `;

    if (regionalFilterEnabled && !useRegionalGeomFilter) {
      console.warn('[protectedZones] Filtrage régional activé mais aucune aire agent déterminée (role/region/departement manquants).');
    }

    if (useRegionalGeomFilter) {
      console.log(`[protectedZones] Generated SQL query (first 500 chars):`, query.substring(0, 500));
    }

    const result = await db.execute(sql.raw(query)) as unknown as ProtectedZoneRecord[];

    console.log(`[protectedZones] Query executed, result count: ${result?.length || 0}`);
    if (useRegionalGeomFilter) {
      console.log(`[protectedZones] Regional filtering was applied for user: ${user?.username}`);
    }

    if (!result) {
      return res.status(404).json({ message: 'Aucune zone protégée trouvée.' });
    }

    const features = result.map(r => {
      let geometry: any = null;
      try { geometry = JSON.parse(r.geojson); } catch (e) { geometry = null; }
      return geometry ? ({
        type: 'Feature' as const,
        geometry,
        properties: {
          id: r.id,
          name: r.name,
          type: r.type,
          surface_ha: r.surface_ha,
          perimetre_m: r.perimetre_m,
          region: (r as any).region || null,
          departement: (r as any).departement || null,
        }
      }) : null;
    }).filter(Boolean);

    res.status(200).json({ type: 'FeatureCollection', features });
  } catch (error) {
    console.error('Erreur lors de la récupération des zones protégées:', error);
    const e = error as Error;
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des zones protégées.', error: e.message });
  }
};

// DELETE /api/protected-zones/:id
export const deleteProtectedZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Vérifier si la zone existe
    const checkQuery = sql.raw(`SELECT id FROM protected_zones WHERE id = ${Number(id)}`);
    const existing = await db.execute(checkQuery) as unknown as { id: number }[];

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Zone protégée non trouvée' });
    }

    // Supprimer la zone
    const deleteQuery = sql.raw(`DELETE FROM protected_zones WHERE id = ${Number(id)}`);
    await db.execute(deleteQuery);

    res.status(200).json({ message: 'Zone protégée supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la zone protégée:', error);
    const e = error as Error;
    res.status(500).json({ message: 'Erreur serveur lors de la suppression de la zone protégée.', error: e.message });
  }
};

// PUT /api/protected-zones/:id
export const updateProtectedZone = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, type } = req.body;

    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ message: 'ID invalide' });
    }

    // Vérifier si la zone existe
    const checkQuery = sql.raw(`SELECT id FROM protected_zones WHERE id = ${Number(id)}`);
    const existing = await db.execute(checkQuery) as unknown as { id: number }[];

    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: 'Zone protégée non trouvée' });
    }

    // Construire la requête de mise à jour
    const updates: string[] = [];
    if (name !== undefined) updates.push(`name = '${name.replace(/'/g, "''")}'`);
    if (type !== undefined) updates.push(`type = '${type.replace(/'/g, "''")}'`);

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const updateQuery = sql.raw(`
      UPDATE protected_zones
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = ${Number(id)}
      RETURNING id, name, type, surface_ha, perimetre_m
    `);

    const result = await db.execute(updateQuery) as unknown as ProtectedZoneRecord[];

    res.status(200).json({
      message: 'Zone protégée mise à jour avec succès',
      zone: result[0]
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la zone protégée:', error);
    const e = error as Error;
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour de la zone protégée.', error: e.message });
  }
};

// GET /api/protected-zones/counts - Compteurs légers par type
export const getProtectedZonesCounts = async (req: Request, res: Response) => {
  try {
    const q = sql`SELECT lower(type) as type, COUNT(*)::int as count FROM protected_zones WHERE type IS NOT NULL GROUP BY lower(type)`;
    const rows = await db.execute(q) as unknown as { type: string; count: number }[];
    const counts: Record<string, number> = {};
    let total = 0;
    for (const r of rows || []) {
      counts[r.type] = r.count;
      total += r.count;
    }
    counts.total = total;
    res.status(200).json(counts);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du comptage des zones protégées.' });
  }
};
