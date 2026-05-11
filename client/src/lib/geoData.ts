import L from 'leaflet';

// URL du fichier GeoJSON des régions
const REGIONS_GEOJSON_URL = 'https://raw.githubusercontent.com/laye1991/Regions_Departements/main/regions.geojson';

// Interface pour les propriétés des entités GeoJSON
export type GeoJSONGeometryType = "Point" | "MultiPoint" | "LineString" | "MultiLineString" | "Polygon" | "MultiPolygon" | "GeometryCollection";
export type GeoJSONFeatureType = "Feature";
export type GeoJSONFeatureCollectionType = "FeatureCollection";

export interface GeoJSONProperties {
  nom_region?: string; // ancien champ
  code_region?: string; // code région si disponible
  [key: string]: any;
}

// Specific properties for a Region feature
export interface DepartementProperties extends GeoJSONProperties {
  code_dep?: string;
  nom_dep?: string;
  code_region?: string;
}

export interface RegionProperties extends GeoJSONProperties {
  // Currently inherits all from GeoJSONProperties
  // Add any other region-specific properties here if needed
}

// Define RegionStatusInfo type
type RegionStatus = 'open' | 'partial' | 'closed' | 'unknown';

interface RegionStatusInfo {
  status: RegionStatus;
  color: string;
}

export type RegionStatusData = Record<string, RegionStatusInfo>;

// Interface pour les entités GeoJSON
export interface GeoJSONGeometry {
  type: GeoJSONGeometryType;
  coordinates: any[];
}

export interface GeoJSONFeature<P = GeoJSONProperties> {
  type: GeoJSONFeatureType;
  properties: P;
  geometry: GeoJSONGeometry;
}

// Interface pour la collection d'entités GeoJSON
export interface GeoJSONFeatureCollection<P = GeoJSONProperties> {
  type: GeoJSONFeatureCollectionType;
  features: GeoJSONFeature<P>[];
  crs?: {
    type: string;
    properties: {
      name: string;
    };
  };
}

// Fonction pour charger les données GeoJSON des régions
export async function loadRegionsGeoJSON(): Promise<GeoJSONFeatureCollection<RegionProperties>> {
  try {
    const response = await fetch(REGIONS_GEOJSON_URL);
    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }
    const data: GeoJSONFeatureCollection<RegionProperties> = await response.json();
    return data;
  } catch (error) {
    console.error('Erreur lors du chargement des données GeoJSON:', error);
    // Retourner une collection vide en cas d'erreur
    return { type: 'FeatureCollection', features: [] };
  }
}

// Fonction pour ajouter les données GeoJSON à la carte Leaflet
export function addGeoJSONToMap(map: L.Map, geoJSON: GeoJSONFeatureCollection<any>, options: L.GeoJSONOptions = {}): L.GeoJSON {
  // Créer une couche GeoJSON avec les options fournies
  const geoJSONLayer = L.geoJSON(geoJSON as any, {
    style: (feature) => {
      // Style par défaut pour les régions
      return {
        fillColor: '#10b981', // Couleur de remplissage verte par défaut
        weight: 2,
        opacity: 1,
        color: '#047857', // Couleur de bordure
        fillOpacity: 0.5
      };
    },
    onEachFeature: (feature, layer) => {
      // Helper: obtention robuste du nom de région depuis diverses clés possibles
      const getRegionName = (props: Record<string, any>): string | undefined => {
        return (
          props?.nom ||
          props?.NOM_REGION ||
          props?.nom_region ||
          props?.name ||
          props?.region
        );
      };

      if (feature.properties) {
        const name = getRegionName(feature.properties);
        const code = feature.properties.code_region || feature.properties.code || feature.properties.CODE || 'N/A';
        if (name) {
          layer.bindPopup(`<b>${name}</b><br>Code: ${code}`);
        }
      }
    },
    ...options
  });

  // Ajouter la couche à la carte
  geoJSONLayer.addTo(map);

  return geoJSONLayer;
}

// Fonction pour obtenir les statuts des régions (à intégrer avec les données existantes)
export function getRegionStatus(regionName: string, regionsData: any): RegionStatusInfo {
  // Implémentation simplifiée - à adapter selon la structure de vos données
  const statuses: Array<'open' | 'partial' | 'closed' | 'unknown'> = ['open', 'partial', 'closed', 'unknown'];
  const randomIndex = Math.floor(Math.random() * statuses.length);
  const status = statuses[randomIndex];
  return {
    status,
    color: getRegionColor(status)
  };
}

// Fonction pour obtenir la couleur d'une région en fonction de son statut
export function getRegionColor(status: string): string {
  switch (status) {
    case 'open':
      return '#10b981'; // vert
    case 'partial':
      return '#fbbf24'; // jaune
    case 'closed':
      return '#ef4444'; // rouge
    default:
      return '#6b7280'; // gris par défaut
  }
}
