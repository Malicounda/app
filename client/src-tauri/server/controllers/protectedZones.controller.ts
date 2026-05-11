import { Request, Response } from 'express';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

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
    // Déterminer le SRID source (si votre table n'a pas de SRID défini)
    // Vous pouvez définir PROTECTED_ZONES_SRID dans .env (ex: 3857, 32630, etc.)
    const fallbackSrid = parseInt(process.env.PROTECTED_ZONES_SRID || '4326', 10);

    // Détecter dynamiquement la colonne contenant la géométrie dans protected_zones
    const cols = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'protected_zones'
    `) as unknown as { column_name: string; data_type: string }[];

    const has = (name: string) => cols.some(c => c.column_name === name);
    // Priorités: geom (geometry) -> zone_geo (geometry) -> geometry (jsonb/text) -> geojson (jsonb/text)
    let geomSource: 'geom' | 'zone_geo' | 'geometry' | 'geojson' | null = null;
    if (has('geom')) geomSource = 'geom';
    else if (has('zone_geo')) geomSource = 'zone_geo';
    else if (has('geometry')) geomSource = 'geometry';
    else if (has('geojson')) geomSource = 'geojson';

    if (!geomSource) {
      return res.status(404).json({ message: "Aucune colonne géométrique trouvée dans 'protected_zones' (recherché: geom, zone_geo, geometry, geojson)." });
    }

    // Construire la clause de sélection en fonction de la source
    // Si source geometry/json -> ST_GeomFromGeoJSON avec gestion Feature/FeatureCollection
    // Si source geom/zone_geo (déjà de type geometry) -> utiliser directement
    const buildSrcCase = (src: string) => {
      if (src === 'geom' || src === 'zone_geo') {
        return `${src} AS geom0`;
      }
      // src = 'geometry' ou 'geojson' (jsonb/text)
      return `CASE 
          WHEN ${src} IS NULL THEN NULL
          WHEN jsonb_typeof(${src}) = 'object' AND (${src}->>'type') = 'Feature' THEN ST_GeomFromGeoJSON((${src}->'geometry')::text)
          WHEN jsonb_typeof(${src}) = 'object' AND (${src}->>'type') = 'FeatureCollection' THEN ST_Collect(ARRAY(SELECT ST_GeomFromGeoJSON((feat->'geometry')::text) FROM jsonb_array_elements(${src}->'features') AS feat WHERE (feat->'geometry') IS NOT NULL))
          WHEN jsonb_typeof(${src}) = 'object' THEN ST_GeomFromGeoJSON(${src}::text)
          ELSE NULL
        END AS geom0`;
    };

    const query = `
      WITH src AS (
        SELECT 
          id,
          name,
          type,
          surface_ha,
          perimetre_m,
          ${buildSrcCase(geomSource)}
        FROM protected_zones
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
        id,
        name,
        type,
        surface_ha,
        perimetre_m,
        ST_AsGeoJSON(
          ST_Transform(
            ST_Force2D(geom_set),
            4326
          )
        ) AS geojson
      FROM norm
      WHERE geom_set IS NOT NULL;
    `;

    const result = await db.execute(sql.raw(query)) as unknown as ProtectedZoneRecord[];

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
        }
      }) : null;
    }).filter(Boolean) as any[];

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
