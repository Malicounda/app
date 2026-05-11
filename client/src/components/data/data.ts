import L from 'leaflet';
import { loadRegionsGeoJSON, addGeoJSONToMap, getRegionStatus, getRegionColor } from '@/lib/geoData';

// Fonction utilitaire pour normaliser les noms de région (minuscules, sans accents)
function normalizeRegionName(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .normalize("NFD") // Décomposer les caractères accentués
    .replace(/[\u0300-\u036f]/g, ""); // Supprimer les diacritiques
}


// Structure de données pour les zones écogéographiques
interface EcoZone {
  id: number;
  name: string;
  description?: string;
  coords: [number, number][];
  color: string;
  layer?: L.Polygon;
  marker?: L.Marker;
}

// Structure de données pour les agents régionaux
interface RegionalAgent {
  id: number;
  firstName: string;
  lastName: string;
  region: string;
  marker?: L.Marker;
}

// Liste des zones écogéographiques
// Les données sont chargées dynamiquement depuis l'API
let ecoZonesData: EcoZone[] = [];

// Liste des agents régionaux
// Les données sont chargées dynamiquement depuis l'API
let regionalAgentsData: RegionalAgent[] = [];

// Définir une interface pour les données des régions avec une signature d'index
interface RegionData {
  status: string;
  color: string;
  bounds: number[][];
  layer: L.Rectangle | L.Layer | null;
  [key: string]: any;
}

// Définir une interface pour la collection de régions
interface RegionsCollection {
  [key: string]: RegionData;
}

// Données des régions - Chargées dynamiquement depuis l'API et le fichier GeoJSON
let regionsData: RegionsCollection = {};

// Définir une interface pour les données des ZIC avec une signature d'index
interface ZicData {
  coords: number[][];
  color: string;
  region: string;
  department: string;
  status: string;
  dates: string;
  layer: L.Polygon | L.Layer | null;
  marker: L.Marker | null;
  [key: string]: any;
}

// Définir une interface pour la collection de ZIC
interface ZicsCollection {
  [key: string]: ZicData;
}

// Données des ZIC - Chargées dynamiquement depuis l'API
let zicsData: ZicsCollection = {};

// Définir une interface pour les données des zones amodiées
interface AmodieeData {
  name: string;
  region: string;
  department: string;
  coords: number[][];
  status: string;
  color: string;
  layer: L.Polygon | L.Layer | null;
  marker: L.Marker | null;
  [key: string]: any;
}

// Données des zones amodiées - Chargées dynamiquement depuis l'API
let amodieesData: AmodieeData[] = [];

async function loadRegions(map?: L.Map) {
  if (!map) return;
  
  try {
    // Charger les données GeoJSON des régions
    const regionsGeoJSON = await loadRegionsGeoJSON();
    
    // Supprimer les couches existantes
    for (const region in regionsData) {
      if (regionsData[region].layer) {
        map.removeLayer(regionsData[region].layer);
        regionsData[region].layer = null;
      }
    }
    
    // Ajouter les données GeoJSON à la carte
    const geoJSONLayer = addGeoJSONToMap(map, regionsGeoJSON, {
      style: (feature) => {
        // Helper pour récupérer un nom de région robuste
        const getRegionName = (props: any): string | undefined => {
          return (
            props?.nom ||
            props?.NOM_REGION ||
            props?.nom_region ||
            props?.name ||
            props?.region
          );
        };

        if (feature && feature.properties) {
          const name = getRegionName(feature.properties);
          if (name) {
            const regionsDataKey = Object.keys(regionsData).find(key => normalizeRegionName(key) === normalizeRegionName(name));
            if (regionsDataKey) {
              const statusInfo = getRegionStatus(regionsDataKey, regionsData);
              const fillColor = getRegionColor(statusInfo.status);
              let borderColor = '#4B5563'; // Gris foncé par défaut pour 'unknown'

              if (statusInfo.status === 'open') {
                borderColor = '#047857'; // Vert foncé
              } else if (statusInfo.status === 'partial') {
                borderColor = '#D97706'; // Orange foncé / Ambre
              } else if (statusInfo.status === 'closed') {
                borderColor = '#B91C1C'; // Rouge foncé
              }

              return {
                fillColor: fillColor,
                weight: 2,
                opacity: 1,
                color: borderColor,
                fillOpacity: 0.5
              };
            }
          }
        }

        // Style de fallback (nom manquant ou non mappé)
        return {
          fillColor: '#6b7280',
          weight: 2,
          opacity: 1,
          color: '#4B5563',
          fillOpacity: 0.5
        };
      },
      onEachFeature: (feature, layer) => {
        // Helper pour récupérer un nom de région robuste
        const getRegionName = (props: any): string | undefined => {
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
          if (!name) return;
          // Trouver la clé correspondante dans regionsData en normalisant
          const regionsDataKey = Object.keys(regionsData).find(key => normalizeRegionName(key) === normalizeRegionName(name));

          if (regionsDataKey) {
            const statusInfo = getRegionStatus(regionsDataKey, regionsData); // Utiliser la clé trouvée

            layer.bindPopup(`
              <b>${name}</b><br>
              Code: ${feature.properties.code_region || feature.properties.code || 'N/A'}<br>
              Statut: ${statusInfo.status === 'open' ? 'Ouverte' : statusInfo.status === 'partial' ? 'Partiellement ouverte' : 'Fermée'}
            `);

            // Stocker la couche dans regionsData si la région existe
            if (regionsData[regionsDataKey]) {
              regionsData[regionsDataKey].layer = layer;
            }
          }
        }
      }
    });
    
    return geoJSONLayer;
  } catch (error) {
    console.error('Erreur lors du chargement des régions GeoJSON:', error);
    
    // Fallback vers l'ancienne méthode si le chargement GeoJSON échoue
    for (const region in regionsData) {
      const adjustedBounds = clampCoordinates(regionsData[region].bounds);
      regionsData[region].bounds = adjustedBounds;
      
      // Remove existing layer if it exists
      if (regionsData[region].layer) {
        map.removeLayer(regionsData[region].layer);
      }
      
      // Create and add new layer
      const area = L.rectangle(adjustedBounds, {
        color: regionsData[region].color,
        fillOpacity: 0.5,
        weight: 1,
      });
      
      // Only add to map if map is defined
      area.addTo(map);
      
      regionsData[region].layer = area;
      area.bindPopup(`<b>${region}</b><br>Statut: ${regionsData[region].status === 'open' ? 'Ouverte' : regionsData[region].status === 'partial' ? 'Partiellement ouverte' : 'Fermée'}`);
    }
  }
}

function loadZics(map?: L.Map) {
  if (!map) return;
  
  for (const zic in zicsData) {
    const adjustedCoords = clampCoordinates(zicsData[zic].coords);
    zicsData[zic].coords = adjustedCoords;
    
    // Remove existing layers if they exist
    if (zicsData[zic].layer) {
      map.removeLayer(zicsData[zic].layer);
    }
    if (zicsData[zic].marker) {
      map.removeLayer(zicsData[zic].marker);
    }
    
    // Create polygon
    const polygon = L.polygon(adjustedCoords, {
      color: zicsData[zic].color,
      fillOpacity: 0.3,
      weight: 2,
    });
    polygon.addTo(map);
    zicsData[zic].layer = polygon;
    polygon.bindPopup(`<b>${zic}</b><br>Région: ${zicsData[zic].region}<br>Département: ${zicsData[zic].department}<br>Statut: ${zicsData[zic].status}<br>Dates: ${zicsData[zic].dates}`);
    
    // Create marker
    const center = calculatePolygonCenter(adjustedCoords);
    const marker = L.marker(center, {
      icon: L.divIcon({ className: 'zone-marker-zic' }),
    });
    marker.addTo(map).bindPopup(`<b>${zic}</b>`);
    zicsData[zic].marker = marker;
  }
}

function loadAmodiees(map?: L.Map) {
  if (!map) return;
  
  amodieesData.forEach(zone => {
    const adjustedCoords = clampCoordinates(zone.coords);
    zone.coords = adjustedCoords;
    
    // Remove existing layers if they exist
    if (zone.layer) {
      map.removeLayer(zone.layer);
    }
    if (zone.marker) {
      map.removeLayer(zone.marker);
    }
    
    // Create polygon
    const polygon = L.polygon(adjustedCoords, {
      color: zone.color,
      fillOpacity: 0.3,
      weight: 2,
    });
    polygon.addTo(map);
    zone.layer = polygon;
    polygon.bindPopup(`<b>${zone.name}</b><br>Région: ${zone.region}<br>Département: ${zone.department}<br>Statut: ${zone.status}`);
    
    // Create marker
    const center = calculatePolygonCenter(adjustedCoords);
    const marker = L.marker(center, {
      icon: L.divIcon({ className: 'zone-marker-amodiee' }),
    });
    marker.addTo(map).bindPopup(`<b>${zone.name}</b>`);
    zone.marker = marker;
  });
}

// Cette fonction garantit que les coordonnées sont dans les limites valides pour Leaflet
function clampCoordinates(coords: any) {
  // Si c'est un tableau de coordonnées pour un polygone
  if (coords.length && coords[0].length && typeof coords[0][0] === 'number') {
    return coords.map((coord: [number, number]) => [
      Math.max(-90, Math.min(90, coord[0])),
      Math.max(-180, Math.min(180, coord[1]))
    ]);
  }
  // Si c'est un rectangle (bounds)
  else if (coords.length === 2 && coords[0].length === 2 && coords[1].length === 2) {
    return [
      [Math.max(-90, Math.min(90, coords[0][0])), Math.max(-180, Math.min(180, coords[0][1]))],
      [Math.max(-90, Math.min(90, coords[1][0])), Math.max(-180, Math.min(180, coords[1][1]))]
    ];
  }
  return coords;
}

// Calculer le centre d'un polygone pour placer un marqueur
function calculatePolygonCenter(coords: [number, number][]) {
  let latSum = 0;
  let lngSum = 0;
  coords.forEach(coord => {
    latSum += coord[0];
    lngSum += coord[1];
  });
  return [latSum / coords.length, lngSum / coords.length] as [number, number];
}

// Fonction pour charger les agents régionaux sur la carte
function loadRegionalAgents(map?: L.Map) {
  if (!map) return;
  
  // Supprimer les marqueurs existants
  regionalAgentsData.forEach(agent => {
    if (agent.marker) {
      map.removeLayer(agent.marker);
      agent.marker = undefined;
    }
  });
  
  // Ajouter les nouveaux marqueurs
  regionalAgentsData.forEach(agent => {
    // Vérifier si la région existe dans les données
    if (regionsData[agent.region]) {
      // Calculer le centre de la région pour placer l'agent
      const bounds = regionsData[agent.region].bounds;
      const center: [number, number] = [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2
      ];
      
      // Créer une icône personnalisée pour l'agent (marqueur de personne en vert)
      const agentIcon = L.divIcon({
        className: 'agent-marker',
        html: `<div style="background-color: #10b981; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16" height="16">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      
      // Créer le marqueur
      const marker = L.marker(center, {
        icon: agentIcon
      });
      
      // Ajouter le popup avec les informations de l'agent
      marker.bindPopup(`
        <b>Agent Régional</b><br>
        Nom: ${agent.firstName} ${agent.lastName}<br>
        Région: ${agent.region}
      `);
      
      // Ajouter le marqueur à la carte
      marker.addTo(map);
      
      // Stocker le marqueur dans les données de l'agent
      agent.marker = marker;
    }
  });
}

// Fonction pour ajouter un nouvel agent régional
function addRegionalAgent(agent: RegionalAgent, map?: L.Map) {
  // Ajouter l'agent aux données
  // Ajouter le nouvel agent et créer une nouvelle instance de tableau
  regionalAgentsData = [...regionalAgentsData, agent];
  
  // Si la carte est disponible, ajouter le marqueur
  if (map && regionsData[agent.region]) {
    const bounds = regionsData[agent.region].bounds;
    const center: [number, number] = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2
    ];
    
    const agentIcon = L.divIcon({
      className: 'agent-marker',
      html: `<div style="background-color: #10b981; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="16" height="16">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    
    const marker = L.marker(center, {
      icon: agentIcon
    });
    
    marker.bindPopup(`
      <b>Agent Régional</b><br>
      Nom: ${agent.firstName} ${agent.lastName}<br>
      Région: ${agent.region}
    `);
    
    marker.addTo(map);
    agent.marker = marker;
  }
  
  return agent;
}

// Mettre à jour ou créer une zone (ZIC ou amodiée)
// zoneType attendu côté UI: 'zic' | 'amodiee' (mais on tolère d'autres libellés)
function updateZone(
  name: string,
  data: {
    name?: string;
    region?: string;
    department?: string;
    type?: string; // 'zic' | 'amodiee' | autre libellé
    status?: string;
    color?: string;
    coords?: [number, number][];
  }
): boolean {
  const type = (data.type || '').toLowerCase();

  // Normaliser les coordonnées si fournies
  const normalizedCoords = data.coords ? (clampCoordinates(data.coords) as [number, number][]) : undefined;

  // Cas ZIC: stocké dans l'objet zicsData par clé (nom)
  const isZic = type === 'zic' || name.toLowerCase().includes('zic');
  if (isZic) {
    const existing = zicsData[name];
    if (existing) {
      zicsData[name] = {
        ...existing,
        ...(data.region ? { region: data.region } : {}),
        ...(data.department ? { department: data.department } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.color ? { color: data.color } : {}),
        ...(normalizedCoords ? { coords: normalizedCoords } : {}),
      };
      return true;
    }
    // Création
    zicsData[name] = {
      coords: normalizedCoords || [],
      color: data.color || '#3b82f6',
      region: data.region || '',
      department: data.department || '',
      status: data.status || 'open',
      dates: '',
      layer: null,
      marker: null,
    };
    return true;
  }

  // Cas amodiée: stocké dans le tableau amodieesData
  const idx = amodieesData.findIndex((z) => z.name === name);
  if (idx >= 0) {
    amodieesData[idx] = {
      ...amodieesData[idx],
      ...(data.region ? { region: data.region } : {}),
      ...(data.department ? { department: data.department } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.color ? { color: data.color } : {}),
      ...(normalizedCoords ? { coords: normalizedCoords } : {}),
    };
    return true;
  }
  // Création
  amodieesData = [
    ...amodieesData,
    {
      name,
      region: data.region || '',
      department: data.department || '',
      coords: normalizedCoords || [],
      status: data.status || 'open',
      color: data.color || '#f472b6',
      layer: null,
      marker: null,
    },
  ];
  return true;
}

// Mettre à jour une région (statut, bounds, ...)
function updateRegion(
  name: string,
  data: Partial<Pick<RegionData, 'status' | 'color' | 'bounds' | 'layer'>>
): boolean {
  if (!regionsData[name]) return false;
  const next: RegionData = {
    ...regionsData[name],
    ...(data.status ? { status: data.status } : {}),
    ...(data.color ? { color: data.color } : {}),
    ...(data.bounds ? { bounds: clampCoordinates(data.bounds) as number[][] } : {}),
    ...(data.layer ? { layer: data.layer } : {}),
  };
  regionsData[name] = next;
  return true;
}

// Supprimer une zone (par nom)
function deleteZone(name: string): boolean {
  // Essayer d'abord côté ZIC
  if (zicsData[name]) {
    // Retirer couche/marker si présents (responsabilité d'affichage côté carte)
    const { layer, marker } = zicsData[name];
    if (layer && (layer as any).remove) {
      try { (layer as any).remove(); } catch {}
    }
    if (marker && (marker as any).remove) {
      try { (marker as any).remove(); } catch {}
    }
    delete zicsData[name];
    return true;
  }

  // Sinon côté amodiées
  const before = amodieesData.length;
  amodieesData.forEach((z) => {
    if (z.name === name) {
      if (z.layer && (z.layer as any).remove) {
        try { (z.layer as any).remove(); } catch {}
      }
      if (z.marker && (z.marker as any).remove) {
        try { (z.marker as any).remove(); } catch {}
      }
    }
  });
  amodieesData = amodieesData.filter((z) => z.name !== name);
  return amodieesData.length !== before;
}

// Fonction pour charger les zones écogéographiques sur la carte
export async function loadEcoZones() {
  try {
    // Charger les données depuis l'API
    const response = await fetch('/api/eco-zones', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Pour inclure les cookies d'authentification
    });
    
    if (!response.ok) {
      throw new Error(`Erreur lors de la récupération des zones écogéographiques: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Zones écogéographiques chargées depuis l\'API:', data);
    
    return data; // Retourner la FeatureCollection brute
  } catch (error) {
    console.error('Erreur lors du chargement des zones écogéographiques:', error);
    return null; // Ou { type: 'FeatureCollection', features: [] }
  }

}

export { 
  regionsData,
  zicsData,
  amodieesData,
  regionalAgentsData,
  ecoZonesData,
  loadRegions,
  loadZics,
  loadAmodiees,
  loadRegionalAgents,
  addRegionalAgent,
  updateZone,
  updateRegion,
  deleteZone,
  clampCoordinates,
  calculatePolygonCenter,
};