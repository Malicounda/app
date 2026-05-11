import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

type LatLon = { lat: number; lon: number };

type Feature = {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any; // number[][][] | number[][][][]
  };
};

type FeatureCollection = {
  type: 'FeatureCollection';
  features: Feature[];
};

let regionsMap: Record<string, LatLon> | null = null;
let departementsMap: Record<string, LatLon> | null = null;

function normalizeName(input?: string | null): string | null {
  if (!input) return null;
  return input
    .toString()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function getCandidateName(props: Record<string, any>, candidates: string[]): string | null {
  for (const key of Object.keys(props)) {
    const nk = normalizeName(key);
    if (!nk) continue;
    for (const cand of candidates) {
      if (nk === cand) {
        const val = props[key];
        if (typeof val === 'string' && val.trim().length > 0) return val;
      }
    }
  }
  return null;
}

function getFeatureName(f: Feature, type: 'region' | 'departement'): string | null {
  const p = f.properties || {};
  // Candidate property names (normalized)
  const regionCandidates = [
    'region', 'name', 'nom', 'libelle', 'libelle-region', 'region-name', 'nom-region', 'admin1name', 'adm1name'
  ];
  const deptCandidates = [
    'departement', 'department', 'dept', 'zone', 'nom', 'name', 'libelle', 'nom-departement', 'adm2name', 'admin2name'
  ];
  const candidates = type === 'region' ? regionCandidates : deptCandidates;
  const found = getCandidateName(p, candidates);
  return found;
}

function polygonCentroid(coords: number[][][]): LatLon | null {
  // coords: [ [ [lon,lat], ... ] , [holes] ]
  if (!coords || coords.length === 0) return null;
  const ring = coords[0];
  if (!ring || ring.length === 0) return null;
  // Simple average (not area-weighted) for robustness and speed
  let sumLat = 0, sumLon = 0, n = 0;
  for (const pt of ring) {
    const [lon, lat] = pt;
    if (typeof lon === 'number' && typeof lat === 'number') {
      sumLat += lat;
      sumLon += lon;
      n++;
    }
  }
  if (n === 0) return null;
  return { lat: sumLat / n, lon: sumLon / n };
}

function multiPolygonCentroid(coords: number[][][][]): LatLon | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  let sumLat = 0, sumLon = 0, parts = 0;
  for (const poly of coords) {
    const c = polygonCentroid(poly as any);
    if (c) {
      sumLat += c.lat;
      sumLon += c.lon;
      parts++;
    }
  }
  if (parts === 0) return null;
  return { lat: sumLat / parts, lon: sumLon / parts };
}

function featureCentroid(f: Feature): LatLon | null {
  if (!f.geometry) return null;
  const { type, coordinates } = f.geometry;
  if (type === 'Polygon') return polygonCentroid(coordinates);
  if (type === 'MultiPolygon') return multiPolygonCentroid(coordinates);
  return null;
}

function buildMapFromGeoJSON(fp: string, type: 'region' | 'departement'): Record<string, LatLon> {
  const abs = path.resolve(fp);
  const raw = fs.readFileSync(abs, 'utf-8');
  const data: FeatureCollection = JSON.parse(raw);
  const out: Record<string, LatLon> = {};
  for (const f of data.features || []) {
    const name = getFeatureName(f, type);
    const nName = normalizeName(name);
    const c = featureCentroid(f);
    if (nName && c) {
      out[nName] = c;
    }
  }
  return out;
}

function ensureLoaded() {
  if (regionsMap && departementsMap) return;
  // Compute dirname in ESM and prepare candidate locations
  let dirFromModule: string | null = null;
  try {
    const __filename = fileURLToPath(import.meta.url);
    dirFromModule = path.dirname(__filename);
  } catch {}

  const candidates: string[] = [];
  if (dirFromModule) candidates.push(path.resolve(dirFromModule, '../../Regions_Departements'));
  candidates.push(path.resolve(process.cwd(), 'Regions_Departements'));

  // Pick the first existing base
  let base: string | null = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) { base = c; break; }
  }
  if (!base) {
    console.warn('[geoAgentLookup] Dossier Regions_Departements introuvable. Candidats:', candidates);
    regionsMap = {};
    departementsMap = {};
    return;
  }

  const regionsPath = path.join(base, 'regions.geojson');
  const deptsPath = path.join(base, 'departements.geojson');
  try {
    regionsMap = buildMapFromGeoJSON(regionsPath, 'region');
  } catch (e) {
    console.warn('[geoAgentLookup] Échec chargement regions.geojson:', regionsPath, e);
    regionsMap = {};
  }
  try {
    departementsMap = buildMapFromGeoJSON(deptsPath, 'departement');
  } catch (e) {
    console.warn('[geoAgentLookup] Échec chargement departements.geojson:', deptsPath, e);
    departementsMap = {};
  }
}

export function getRegionCentroid(name?: string | null): LatLon | null {
  if (!name) return null;
  ensureLoaded();
  const key = normalizeName(name);
  if (!key) return null;
  return (regionsMap as any)[key] || null;
}

export function getDepartementCentroid(name?: string | null): LatLon | null {
  if (!name) return null;
  ensureLoaded();
  const key = normalizeName(name);
  if (!key) return null;
  return (departementsMap as any)[key] || null;
}
