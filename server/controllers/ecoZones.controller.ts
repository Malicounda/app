import { Request, Response } from 'express';
import { db } from '../db.js'; // Import Drizzle instance
import { sql } from 'drizzle-orm';

interface EcoZoneRecord {
  ogc_fid: number;
  nom: string | null;
  area: number | null;
  perimeter: number | null;
  zone: number | null;
  geojson: string; // Contiendra la géométrie au format GeoJSON string
}

export const getAllEcoZonesAsGeoJSON = async (req: Request, res: Response) => {
  try {
    // Utilisation de ST_AsGeoJSON pour convertir la géométrie en GeoJSON
    // Le troisième argument de ST_AsGeoJSON (maxdecimaldigits) est optionnel, 15 est une bonne précision.
    // Le quatrième argument (options) peut être utilisé pour inclure un BBOX (0) ou un CRS (8).
    // ST_Transform(geometry, 4326) est crucial si vos données ne sont pas déjà en WGS84 (SRID 4326)
    // Leaflet s'attend généralement à du WGS84.
    // Vérifiez le SRID de votre colonne 'geometry'. Si c'est déjà 4326, ST_Transform n'est pas nécessaire.
    const query = `
      SELECT 
        ogc_fid, 
        nom, 
        area, 
        perimeter, 
        zone, 
        ST_AsGeoJSON(ST_Transform(geometry, 4326)) as geojson 
      FROM eco_geographie_zones;
    `;
    // Si votre géométrie est déjà en SRID 4326, la requête peut être simplifiée :
    // const query = `
    //   SELECT 
    //     ogc_fid, 
    //     nom, 
    //     area, 
    //     perimeter, 
    //     zone, 
    //     ST_AsGeoJSON(geometry) as geojson 
    //   FROM eco_geographie_zones;
    // `;

    const result = await db.execute(sql.raw(query)) as unknown as EcoZoneRecord[];
    // Note: db.execute avec sql.raw retourne un type générique, d'où le 'as unknown as EcoZoneRecord[]'.
    // Pour une meilleure gestion des types avec Drizzle et les requêtes brutes,
    // vous pourriez avoir besoin de définir plus précisément le type de retour attendu
    // ou d'utiliser des fonctionnalités de mapping de Drizzle si disponibles pour cela.

    if (!result) {
      return res.status(404).json({ message: 'Aucune zone écogéographique trouvée.' });
    }

    // Transformation en format GeoJSON FeatureCollection
    const features = result.map(record => {
      let geometry = null;
      try {
        geometry = JSON.parse(record.geojson);
      } catch (e) {
        console.error(`Erreur de parsing GeoJSON pour la zone ${record.ogc_fid}:`, e);
        // Gérer l'erreur, par exemple en sautant cette feature ou en loggant
      }
      return {
        type: 'Feature',
        geometry: geometry, // La géométrie est déjà au format GeoJSON grâce à ST_AsGeoJSON
        properties: {
          ogc_fid: record.ogc_fid,
          nom: record.nom,
          area: record.area,
          perimeter: record.perimeter,
          zone_code: record.zone, // Renommé pour éviter confusion avec 'zone' d'un polygone
          // Ajoutez d'autres propriétés si nécessaire
        }
      };
    }).filter(feature => feature.geometry !== null); // Filtrer les features avec géométrie invalide

    const geoJsonResponse = {
      type: 'FeatureCollection',
      features: features
    };

    res.status(200).json(geoJsonResponse);

  } catch (error) {
    console.error('Erreur lors de la récupération des zones écogéographiques:', error);
    const e = error as Error;
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des données.', error: e.message });
  }
};
