// Utilitaires partagés entre le client et le serveur

import { GeoJSON } from './types/geo.js';

/**
 * Vérifie si un objet est une géométrie GeoJSON valide
 */
export function isGeoJSON(geojson: unknown): geojson is GeoJSON.GeometryObject {
  if (!geojson || typeof geojson !== 'object') return false;
  
  const geo = geojson as Record<string, unknown>;
  
  if (!('type' in geo) || typeof geo.type !== 'string') return false;
  if (!('coordinates' in geo)) return false;
  
  // Vérification basique des types de géométrie
  const validTypes = [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
    'GeometryCollection',
  ];
  
  return validTypes.includes(geo.type);
}

/**
 * Formate une date pour l'affichage
 */
export function formatDate(date: Date | string | number, locale = 'fr-FR'): string {
  const d = new Date(date);
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Vérifie si une valeur est vide (null, undefined, chaîne vide, tableau vide, objet vide)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Crée un objet d'erreur standardisé
 */
export function createError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Crée un objet de réponse standardisé pour les API
 */
export function createResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
) {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}
