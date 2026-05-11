// Utility to load departements from GeoJSON and provide region -> departements mapping
// Source: https://raw.githubusercontent.com/laye1991/Regions_Departements/main/departements.geojson

export interface DepartementFeature {
  type: 'Feature';
  properties: {
    code_dep?: string;
    nom_dep?: string;
    code_region?: string;
    nom_region?: string; // legacy key
    [key: string]: any;
  };
  geometry: {
    type: string;
    coordinates: any;
  };
}

export interface DepartementsFC {
  type: 'FeatureCollection';
  features: DepartementFeature[];
}

const DEPARTEMENTS_GEOJSON_URL =
  'https://raw.githubusercontent.com/laye1991/Regions_Departements/main/departements.geojson';

// Simple in-memory cache to avoid re-fetch
let departementsCache: {
  byRegion: Record<string, string[]>; // normalized region name -> list of departement names
  loaded: boolean;
} = { byRegion: {}, loaded: false };

function normalizeName(name: string): string {
  // Lowercase, remove diacritics, then strip all non-alphanumeric characters
  // This collapses differences like hyphen vs en-dash vs space, etc.
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export async function ensureDepartementsLoaded(): Promise<void> {
  if (departementsCache.loaded) return;
  const res = await fetch(DEPARTEMENTS_GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to load departements: ${res.status}`);
  const data: DepartementsFC = await res.json();

  const byRegion: Record<string, string[]> = {};
  for (const f of data.features) {
    // Be tolerant to different datasets: accept multiple property names
    const props = f.properties || {};
    const regionName = props.nom_region || props.NOM_REGION || props.region || props.nom || '';
    const depName = f.properties?.nom_dep || '';
    if (!regionName || !depName) continue;
    const key = normalizeName(regionName);
    if (!byRegion[key]) byRegion[key] = [];
    // Avoid duplicates
    if (!byRegion[key].includes(depName)) byRegion[key].push(depName);
  }
  // Sort departements per region
  Object.keys(byRegion).forEach((k) => byRegion[k].sort((a, b) => a.localeCompare(b)));

  departementsCache = { byRegion, loaded: true };
}

export function getDepartementsForRegion(region: string): string[] {
  const key = normalizeName(region);
  return departementsCache.byRegion[key] || [];
}

export function listRegions(): string[] {
  return Object.keys(departementsCache.byRegion)
    .map((k) => k)
    .sort((a, b) => a.localeCompare(b));
}
