import { amodieesData, zicsData } from '@/components/data/data'; // Assuming these are exported
import Legend from '@/components/Legend';
import { RadiusControl } from '@/components/RadiusControl';
import '@/components/RadiusControl.css';
import '@/styles/markers.css';

// Ajouter le style CSS pour le motif de croix des zones inactives
if (typeof window !== 'undefined' && !document.getElementById('inactive-zone-pattern-style')) {
  const style = document.createElement('style');
  style.id = 'inactive-zone-pattern-style';
  style.textContent = `
    .inactive-zone-pattern {
      position: relative;
    }
    .inactive-zone-pattern::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image:
        repeating-linear-gradient(
          45deg,
          transparent,
          transparent 10px,
          #ff6b6b 10px,
          #ff6b6b 12px
        ),
        repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 10px,
          #ff6b6b 10px,
          #ff6b6b 12px
        );
      opacity: 0.6;
      pointer-events: none;
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
}

import { apiRequest } from '@/lib/api';
import { RegionProperties, RegionStatusData } from '@/lib/geoData';
import type * as GeoJSON from 'geojson';
import L from 'leaflet';
// Imports du géocodeur supprimés - remplacé par RadiusControl
// import 'leaflet-control-geocoder';
// import 'leaflet-control-geocoder/dist/Control.Geocoder.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet/dist/leaflet.css';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import ReactDOMServer from 'react-dom/server';
import {
    FaCrosshairs
} from 'react-icons/fa';

// Déclaration des types pour Leaflet Draw
interface CustomDrawOptions extends L.ControlOptions {
  position?: L.ControlPosition;
  draw?: {
    polygon?: any;
    polyline?: any;
    rectangle?: any;
    circle?: boolean;
    marker?: any;
    circlemarker?: boolean;
  };
  edit?: {
    featureGroup: L.FeatureGroup;
    edit?: {
      selectedPathOptions?: L.PathOptions;
    };
  };
}

// Extension des types Leaflet pour inclure le contrôle de dessin et markercluster
declare module 'leaflet' {
  namespace control {
    function draw(options?: any): any;
  }
  interface MarkerClusterGroup extends L.FeatureGroup {
    clearLayers(): this;
  }
  function markerClusterGroup(options?: any): MarkerClusterGroup;
}

// Définition des types pour les marqueurs personnalisés
type MarkerType = 'default' | 'village' | 'ville' | 'point_eau' | 'foret' | 'champ' | 'elevage';

interface CustomMarkerOptions extends L.MarkerOptions {
  type?: MarkerType;
  title?: string;
  description?: string;
}
// If ZicsCollection and AmodieeData types are not exported from data.ts, define them or use 'any'
// For simplicity, 'any' is used in helper functions for now if types aren't available. // GeoJSONFeature and GeoJSONFeatureCollection will be from 'geojson' for Leaflet

// Ensure Leaflet's default icon paths are set correctly
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: '/leaflet/marker-icon-2x.png', // Vérifiez que ce fichier est dans public/leaflet/
  iconUrl: '/leaflet/marker-icon.png',         // Vérifiez que ce fichier est dans public/leaflet/
  shadowUrl: '/leaflet/marker-shadow.png'      // Vérifiez que ce fichier est dans public/leaflet/
});

export interface MapComponentHandles {
  getMapCenter: () => L.LatLng | null;
  fitHuntingReportsBounds: () => void;
  fitRadiusKm: (km: number) => void;
}

import { DepartementProperties } from '@/lib/geoData';

export interface MapComponentProps {
  regionsGeoJSON: GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties> | null;
  departementsGeoJSON?: GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties> | null;
  communesGeoJSON?: GeoJSON.FeatureCollection | null;
  arrondissementsGeoJSON?: GeoJSON.FeatureCollection | null;
  ecoZonesGeoJSON?: GeoJSON.FeatureCollection | null;
  protectedZonesGeoJSON?: GeoJSON.FeatureCollection | null;
  // GeoJSON pour chaque type de zone protégée
  foretClasseeGeoJSON?: GeoJSON.FeatureCollection | null;
  reserveGeoJSON?: GeoJSON.FeatureCollection | null;
  parcNationalGeoJSON?: GeoJSON.FeatureCollection | null;
  aireCommunautaireGeoJSON?: GeoJSON.FeatureCollection | null;
  zoneTamponGeoJSON?: GeoJSON.FeatureCollection | null;
  ampGeoJSON?: GeoJSON.FeatureCollection | null;
  exploitationForestiereGeoJSON?: GeoJSON.FeatureCollection | null;
  empietementGeoJSON?: GeoJSON.FeatureCollection | null;
  feuxBrousseGeoJSON?: GeoJSON.FeatureCollection | null;
  carriereGeoJSON?: GeoJSON.FeatureCollection | null;
  concessionMiniereGeoJSON?: GeoJSON.FeatureCollection | null;
  autreGeoJSON?: GeoJSON.FeatureCollection | null;
  // Nouvelles props: zones dynamiques depuis l'API
  zicsGeoJSON?: GeoJSON.FeatureCollection | null;
  amodieesGeoJSON?: GeoJSON.FeatureCollection | null;
  parcVisiteGeoJSON?: GeoJSON.FeatureCollection | null;
  regulationGeoJSON?: GeoJSON.FeatureCollection | null;
  // Marqueurs centroïdes pour les zones
  showZoneCentroids?: boolean;
  regionStatuses?: RegionStatusData;
  showRegions: boolean;
  showZics: boolean;
  showAmodiees: boolean;
  showParcVisite?: boolean;
  showRegulation?: boolean;
  showEcoZones: boolean;
  showProtectedZones: boolean;
  // États d'affichage pour chaque type de zone protégée
  showForetClassee?: boolean;
  showReserve?: boolean;
  showParcNational?: boolean;
  showAireCommunautaire?: boolean;
  showZoneTampon?: boolean;
  showAMP?: boolean;
  showExploitationForestiere?: boolean;
  showEmpietement?: boolean;
  showFeuxBrousse?: boolean;
  showCarriere?: boolean;
  showConcessionMiniere?: boolean;
  showAutre?: boolean;
  showRegionalAgents?: boolean;
  showDepartements: boolean;
  showCommunes?: boolean;
  showArrondissements?: boolean;
  useSatellite?: boolean;
  colorizeRegionsByStatus?: boolean;
  showAlerts?: boolean;
  alerts?: Array<{ id: number; title: string | null; message: string | null; nature: string | null; region: string | null; departement?: string | null; lat: number; lon: number; created_at: string; sender?: { first_name: string | null; last_name: string | null; phone: string | null; role?: string | null; region?: string | null; departement?: string | null } }>;
  // Agents
  agents?: Array<{ id: number; username?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; role?: string | null; region?: string | null; departement?: string | null; agentLat?: number | null; agentLon?: number | null }>;
  selectedMarkerType: string | null; // Prop: type de marqueur actuellement sélectionné par le parent
  onMarkerPlaced: () => void; // Callback quand un marqueur est placé
  onMarkerTypeSelected: (type: string | null) => void; // Callback quand un type est sélectionné dans MarkerMenu
  // Mode minimal: pas de légende, pas d'échelle, pas de géocoder, pas de contrôles
  minimal?: boolean;
  // Masquer certains éléments de légende pour les chasseurs et guides
  hideLegendForHunterGuide?: boolean;
  // Rendre les contrôles (légende, geocoder, attribution) plus compacts
  compactControls?: boolean;
  // Déclarations d'espèces (prélèvements) à afficher
  showHuntingReports?: boolean;
  huntingReports?: Array<{
    lat: number;
    lon: number;
    species?: string | null;
    quantity?: number | null;
    date?: string | null;
    location?: string | null;
    photoUrl?: string | null;
    region?: string | null;
    departement?: string | null;
    commune?: string | null;
    permitNumber?: string | null;
  }>;
  // Contexte utilisateur pour adapter le rendu
  userRole?: string | null;
  userRegion?: string | null;
  userDepartement?: string | null;
  // Activer un bouton pour charger/afficher les abattages (admin/agents)
  enableHuntingReportsToggle?: boolean;
  // Centrage initial depuis l'URL (lat/lon/zoom)
  initialCenter?: [number, number] | null;
  initialZoom?: number | null;
  // Contrôle de rayon et recherche
  showRadiusControl?: boolean;
  onRadiusChange?: (radius: number) => void;
  onLocationSearch?: (query: string) => void;
  // Infractions counts by region
  showInfractionsCounts?: boolean;
  infractionsCountsByRegion?: Record<string, number>;
  onInfractionsRegionClick?: (regionName: string) => void;
  loadProgress?: number;
  // Reboisement : pépinières et zones reboisées
  nurseries?: Array<{
    id: number;
    nom?: string | null;
    type?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    surfaceHa?: number | string | null;
    region?: string | null;
    departement?: string | null;
    arrondissement?: string | null;
    commune?: string | null;
  }>;
  showNurseries?: boolean;
  reforestationZones?: Array<{
    id: number;
    name?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    areaHa?: number | string | null;
    plantingYear?: number | null;
    species?: string | null;
    program?: string | null;
    region?: string | null;
    departement?: string | null;
    arrondissement?: string | null;
    commune?: string | null;
  }>;
  showReforestationZones?: boolean;
}


interface LayersRef {
  regions?: L.GeoJSON;
  departements?: L.GeoJSON;
  communes?: L.GeoJSON;
  arrondissements?: L.GeoJSON;
  zics?: L.GeoJSON;
  amodiees?: L.GeoJSON;
  parcVisite?: L.GeoJSON;
  regulation?: L.GeoJSON;
  ecoZones?: L.GeoJSON;
  protectedZones?: L.GeoJSON;
  regionalAgents?: L.LayerGroup;
  alerts?: L.LayerGroup;
  huntingReports?: L.LayerGroup;
  zoneCentroids?: L.LayerGroup;
  infractionsCounts?: L.LayerGroup;
  exploitationForestiere?: L.GeoJSON;
  nurseries?: L.LayerGroup;
  reforestationZones?: L.LayerGroup;
  // Tuiles vectorielles
  zicsVectorTiles?: any;
  amodieesVectorTiles?: any;
  parcVisiteVectorTiles?: any;
  regulationVectorTiles?: any;
  protectedZonesVectorTiles?: any;
  baseOsm?: L.TileLayer;
  baseSatellite?: L.TileLayer;
}

const MapComponent = forwardRef<MapComponentHandles, MapComponentProps>(
  (props, ref) => {
    const {
      regionsGeoJSON,
      departementsGeoJSON,
      communesGeoJSON,
      arrondissementsGeoJSON,
      ecoZonesGeoJSON,
      protectedZonesGeoJSON,
      foretClasseeGeoJSON,
      reserveGeoJSON,
      parcNationalGeoJSON,
      aireCommunautaireGeoJSON,
      zoneTamponGeoJSON,
      ampGeoJSON,
      exploitationForestiereGeoJSON,
      empietementGeoJSON,
      feuxBrousseGeoJSON,
      carriereGeoJSON,
      concessionMiniereGeoJSON,
      autreGeoJSON,
      zicsGeoJSON,
      amodieesGeoJSON,
      parcVisiteGeoJSON,
      regulationGeoJSON,
      regionStatuses,
      showRegions,
      showDepartements,
      showCommunes = false,
      showArrondissements = false,
      useSatellite = false,
      showZics,
      showAmodiees,
      showParcVisite,
      showRegulation,
      showEcoZones,
      showProtectedZones,
      showRegionalAgents,
      showForetClassee,
      showReserve,
      showParcNational,
      showAireCommunautaire,
      showZoneTampon,
      showAMP,
      showExploitationForestiere,
      showEmpietement,
      showFeuxBrousse,
      showCarriere,
      showConcessionMiniere,
      showAutre,
      colorizeRegionsByStatus,
      agents,
      hideLegendForHunterGuide,
      compactControls = false,
      minimal,
      alerts,
      showAlerts,
      selectedMarkerType,
      onMarkerPlaced,
      onMarkerTypeSelected,
      showZoneCentroids,
      showHuntingReports,
      huntingReports,
      userRole,
      userRegion,
      userDepartement,
      enableHuntingReportsToggle,
      initialCenter,
      initialZoom,
      showRadiusControl,
      onRadiusChange,
      onLocationSearch,
      showInfractionsCounts,
      infractionsCountsByRegion,
      onInfractionsRegionClick,
      loadProgress,
      nurseries,
      showNurseries,
      reforestationZones,
      showReforestationZones,
    } = props;

    const mapRef = useRef<any>(null);
    const ALERTS_PANE_Z_INDEX = '900';
    const ensureAlertsPaneZIndex = () => {
      const map = mapRef.current;
      if (!map) return;
      const alertsPane = map.getPane('alertsPane');
      if (alertsPane) alertsPane.style.zIndex = ALERTS_PANE_Z_INDEX;
    };

    const computeProgressText = (value?: number): string => {
      if (typeof value !== 'number' || Number.isNaN(value)) return '';
      const clamped = Math.max(0, Math.min(100, Math.round(value)));
      if (clamped >= 100) return '';
      return `Chargement de la carte… ${clamped}%`;
    };
    const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
    const markersRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
    const layersRef = useRef<LayersRef>({});
    const mapInitializedRef = useRef(false);
    const totalAlertsElRef = useRef<HTMLDivElement | null>(null);
    const noReportsElRef = useRef<HTMLDivElement | null>(null);
    const noReportsControlRef = useRef<L.Control | null>(null);
    const [mapReady, setMapReady] = useState(false);

    const [showDrawingTools, setShowDrawingTools] = useState(false);
    const [currentTool, setCurrentTool] = useState<string | null>(null);
    const [internalHuntingReports, setInternalHuntingReports] = useState<Array<{
      lat: number; lon: number; species?: string | null; quantity?: number | null; date?: string | null; location?: string | null; photoUrl?: string | null; region?: string | null; departement?: string | null;
    }>>([]);
    const [reportsVisible, setReportsVisible] = useState(false);

    // États pour le contrôle de rayon
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const [radiusCircle, setRadiusCircle] = useState<L.Circle | null>(null);
    // Couches sélectionnées pour surlignage (quand contrôle statut OFF)
    const selectedRegionLayerRef = useRef<L.Layer | null>(null);
    const selectedDepartementLayerRef = useRef<L.Layer | null>(null);
    const selectedCommuneLayerRef = useRef<L.Layer | null>(null);
    const selectedArrondissementLayerRef = useRef<L.Layer | null>(null);

    // Nettoyer la sélection si le contrôle statut s'active
    useEffect(() => {
      if (props.colorizeRegionsByStatus) {
        try {
          if (selectedRegionLayerRef.current && layersRef.current.regions) {
            (layersRef.current.regions as any).resetStyle(selectedRegionLayerRef.current as any);
          }
          if (selectedDepartementLayerRef.current && layersRef.current.departements) {
            (layersRef.current.departements as any).resetStyle(selectedDepartementLayerRef.current as any);
          }
          if (selectedCommuneLayerRef.current && layersRef.current.communes) {
            (layersRef.current.communes as any).resetStyle(selectedCommuneLayerRef.current as any);
          }
          if (selectedArrondissementLayerRef.current && layersRef.current.arrondissements) {
            (layersRef.current.arrondissements as any).resetStyle(selectedArrondissementLayerRef.current as any);
          }
        } catch {}
        selectedRegionLayerRef.current = null;
        selectedDepartementLayerRef.current = null;
        selectedCommuneLayerRef.current = null;
        selectedArrondissementLayerRef.current = null;
      }
    }, [props.colorizeRegionsByStatus]);

    // Fonction pour obtenir le SVG en fonction du type de marqueur
    const getMarkerSvg = (type: string): string => {
      if (type === 'sight') {
        return `
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
            <line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2"/>
            <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2"/>
            <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2"/>
            <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
          </svg>
        `;
      }

      // Icônes par défaut pour les autres types
      const icons: Record<string, string> = {
        'village': `<path d="M12 3L4 9v12h16V9l-8-6zm0 2.5l6 4.5v1H6v-1l6-4.5zM6 18v-6h12v6H6z"/>`,
        'city': `<path d="M17.5 15.5V9c0-3.07-2.13-5.64-5-6.32V3.5c0-.83-.67-1.5-1.5-1.5S9 2.67 9 3.5v.18c-2.87.68-5 3.25-5 6.32v6.5l-2 1.5v.5h15v-.5l-2-1.5z"/>`,
        'water': `<path d="M12 20c-3.31 0-6-2.69-6-6 0-4 6-10.75 6-10.75S18 10 18 14c0 3.31-2.69 6-6 6zm0-15.39C10.8 6.46 8 11.27 8 14c0 2.21 1.79 4 4 4s4-1.79 4-4c0-2.73-2.8-7.54-4-9.39z"/>`,
        'forest': `<path d="M16 12l3 8H5l3-8 3 2 2-2 3-2z"/><path d="M12 2L8 12l4-2 4 2-4-10z"/>`,
        'field': `<path d="M12 2L4 22h16L12 2z"/><path d="M12 2v20l8-10-8-10z"/>`,
        'livestock': `<path d="M12 5.5A2.5 2.5 0 0 1 14.5 8a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 9.5 8 2.5 2.5 0 0 1 12 5.5z"/><path d="M16.5 16v1c0 1.1-.9 2-2 2h-5c-1.1 0-2-.9-2-2v-1h9z"/><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>`,
      };

      return `
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
          ${icons[type] || icons['village']}
        </svg>
      `;
    };

    // Fonction utilitaire pour obtenir le nom du marqueur
    const getMarkerName = (type: string): string => {
      const names: Record<string, string> = {
        'village': 'Village',
        'city': 'Ville',
        'water': 'Point d\'Eau',
        'forest': 'Forêt',
        'field': 'Champ',
        'livestock': 'Élevage',
        'sight': 'Zone de tir',
      };
      return names[type] || 'Marqueur';
    };

    // Fonction pour créer une icône de pin colorée pour les centroïdes de zones
    const createZoneCentroidIcon = (color: string): L.DivIcon => {
      const svgIcon = `
        <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                fill="${color}" stroke="#fff" stroke-width="0.5"/>
        </svg>
      `;
      return L.divIcon({
        className: 'zone-centroid-marker',
        html: svgIcon,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32]
      });
    };

    // Handlers pour le contrôle de rayon
    const handleRadiusChange = (radius: number) => {
      const map = mapRef.current;
      if (!map) return;

      // Supprimer l'ancien cercle s'il existe
      if (radiusCircle) {
        map.removeLayer(radiusCircle);
      }

      // Créer un nouveau cercle
      const center = map.getCenter();
      const radiusMeters = radius * 1000;
      const newCircle = L.circle(center, {
        radius: radiusMeters,
        fillColor: '#3b82f6',
        fillOpacity: 0.1,
        color: '#3b82f6',
        weight: 2,
        dashArray: '5, 5'
      });

      newCircle.addTo(map);
      setRadiusCircle(newCircle);

      // Ajuster la vue pour montrer le cercle
      const bounds = newCircle.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }

      // Appeler le callback parent si fourni
      if (props.onRadiusChange) {
        props.onRadiusChange(radius);
      }
    };

    const handleLocationSearch = async (query: string) => {
      const map = mapRef.current;
      if (!map || !query.trim()) return;

      try {
        // Utiliser le géocodeur Nominatim pour la recherche
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=sn&limit=1`
        );
        const results = await response.json();

        if (results && results.length > 0) {
          const result = results[0];
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);

          if (isFinite(lat) && isFinite(lon)) {
            map.setView([lat, lon], 13);

            // Ajouter un marqueur temporaire
            const marker = L.marker([lat, lon], {
              icon: L.divIcon({
                html: `<div style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap;">${result.display_name}</div>`,
                className: 'search-result-marker',
                iconSize: [200, 30],
                iconAnchor: [100, 15]
              })
            });

            marker.addTo(map);

            // Supprimer le marqueur après 5 secondes
            setTimeout(() => {
              map.removeLayer(marker);
            }, 5000);
          }
        }

        // Appeler le callback parent si fourni
        if (props.onLocationSearch) {
          props.onLocationSearch(query);
        }
      } catch (error) {
        console.error('Erreur lors de la recherche:', error);
      }
    };

    // Détecter les changements de taille d'écran
    useEffect(() => {
      const handleResize = () => {
        setIsMobile(window.innerWidth <= 768);
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Basemap switcher when toggle changes
    useEffect(() => {
      const map = mapRef.current;
      const baseOsm = layersRef.current.baseOsm;
      const baseSatellite = layersRef.current.baseSatellite;
      if (!map || !baseOsm || !baseSatellite) return;

      if (useSatellite) {
        if (map.hasLayer(baseOsm)) map.removeLayer(baseOsm);
        if (!map.hasLayer(baseSatellite)) baseSatellite.addTo(map);
      } else {
        if (map.hasLayer(baseSatellite)) map.removeLayer(baseSatellite);
        if (!map.hasLayer(baseOsm)) baseOsm.addTo(map);
      }
    }, [useSatellite]);

    useImperativeHandle(ref, () => ({
      getMapCenter: () => {
        if (mapRef.current) {
          return mapRef.current.getCenter();
        }
        return null;
      },
      fitHuntingReportsBounds: () => {
        const map = mapRef.current;
        if (!map) return;
        const group = layersRef.current.huntingReports;
        if (!group) return;
        const latlngs: L.LatLng[] = [];
        (group.getLayers() as any[]).forEach((layer: any) => {
          if (layer.getLatLng) {
            latlngs.push(layer.getLatLng());
          } else if (layer.getLatLngs) {
            const arr = layer.getLatLngs();
            if (Array.isArray(arr)) {
              arr.flat(Infinity).forEach((pt: any) => {
                if (pt && pt.lat && pt.lng) latlngs.push(pt);
              });
            }
          }
        });
        if (latlngs.length > 0) {
          map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 10 });
        }
      },
      fitRadiusKm: (km: number) => {
        const map = mapRef.current;
        if (!map) return;
        try {
          const center = map.getCenter();
          const radiusMeters = Math.max(0, km) * 1000;
          const circle = L.circle(center, { radius: radiusMeters });
          const bounds = circle.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [24, 24] });
          }
        } catch (e) {
          console.warn('[MapComponent] fitRadiusKm failed:', e);
        }
      }
    }));

    useEffect(() => {
      const existingMap = mapRef.current;
      if (existingMap || mapInitializedRef.current) return;

      const southWest = L.latLng(12.0, -18.0); // Lat, Lng
      const northEast = L.latLng(17.0, -11.0); // Lat, Lng
      const bounds = L.latLngBounds(southWest, northEast);

      // Configuration de la carte avec des options compatibles TypeScript
      const map = L.map('map', {
        maxBounds: bounds,
        maxBoundsViscosity: 0.8,
        minZoom: 7,
        zoom: 7,
        center: [14.5, -14.45],
        // Options de contrôle
        zoomControl: false, // On l'ajoutera manuellement après
        // Options d'interaction
        dragging: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true
      });

      // Contrôles de zoom en bas supprimés
      // L.control.zoom({ position: 'bottomleft' }).addTo(map);
      // Ajuster la vue: si initialCenter fourni, l'utiliser; sinon, vue Sénégal
      if (Array.isArray((props as any).initialCenter) && (props as any).initialCenter.length === 2) {
        const center = (props as any).initialCenter as [number, number];
        const zoom = Number((props as any).initialZoom ?? 14);
        map.setView(center, isFinite(zoom) ? zoom : 14, { animate: false });
      } else {
        map.setView([14.5, -14.45], 7, { animate: false });
      }
      mapRef.current = map;

      // Ajouter le FeatureGroup pour les marqueurs utilisateur à la carte
      if (markersRef.current) {
        markersRef.current.addTo(map);
      }

      // Pane et calque pour les alertes (PRIORITAIRE sur toutes les autres couches)
      if (!props.minimal) {
        map.createPane('alertsPane');
        map.getPane('alertsPane')!.style.zIndex = ALERTS_PANE_Z_INDEX; // Aligné sur la couche infractions
        if (!layersRef.current.alerts) {
          layersRef.current.alerts = L.layerGroup([], { pane: 'alertsPane' as any });
        }
        layersRef.current.alerts.addTo(map);
      }

      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" style="text-decoration:none">OpenStreetMap/contributors_A.S.P.CH.S</a>',
        minZoom: 7,
        crossOrigin: true
      });

      const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
          minZoom: 7,
          crossOrigin: true
        }
      );

      layersRef.current.baseOsm = osmLayer;
      layersRef.current.baseSatellite = satelliteLayer;

      if (useSatellite) {
        satelliteLayer.addTo(map);
      } else {
        osmLayer.addTo(map);
      }

      // Pane pour les zones protégées
      map.createPane('protectedZonesPane');
      map.getPane('protectedZonesPane')!.style.zIndex = '625'; // Above ecoZones, below amodiees/zics

      map.createPane('amodieesPane');
      map.getPane('amodieesPane')!.style.zIndex = '630'; // Above ecoZones

      map.createPane('zicsPane');
      map.getPane('zicsPane')!.style.zIndex = '630'; // Same level as amodiees, above ecoZones

      map.createPane('parcVisitePane');
      map.getPane('parcVisitePane')!.style.zIndex = '635'; // Above ZICs/Amodiees

      map.createPane('regulationPane');
      map.getPane('regulationPane')!.style.zIndex = '635'; // Same level as parc visite

      map.createPane('regionalAgentsPane');
      map.getPane('regionalAgentsPane')!.style.zIndex = '640'; // Above all zones

      map.createPane('drawnItemsPane');
      map.getPane('drawnItemsPane')!.style.zIndex = '700'; // Highest for drawn items
      if (drawnItemsRef.current.options) {
        drawnItemsRef.current.options.pane = 'drawnItemsPane';
      }

      // Pane et calque pour les prélèvements (au-dessus des couches thématiques mais sous les alertes)
      map.createPane('huntingReportsPane');
      map.getPane('huntingReportsPane')!.style.zIndex = '650';
      if (!layersRef.current.huntingReports) {
        layersRef.current.huntingReports = L.layerGroup([], { pane: 'huntingReportsPane' as any });
      }
      layersRef.current.huntingReports.addTo(map);

      // Remove the default Leaflet attribution prefix that contains the flag
      map.attributionControl.setPrefix('');

      // Ajouter une barre d'échelle
      L.control.scale({
        position: 'bottomright',
        metric: true,
        imperial: false,
        maxWidth: 150
      }).addTo(map);

      // Leaflet Draw toolbar removed per request

      map.createPane('regionsPane');
      map.getPane('regionsPane')!.style.zIndex = '600'; // Lowest for thematic data layers

      map.createPane('departementsPane');
      map.getPane('departementsPane')!.style.zIndex = '610'; // Above regions

      map.createPane('communesPane');
      map.getPane('communesPane')!.style.zIndex = '615'; // Above departements

      map.createPane('arrondissementsPane');
      map.getPane('arrondissementsPane')!.style.zIndex = '618'; // Above communes

      map.createPane('ecoZonesPane');
      map.getPane('ecoZonesPane')!.style.zIndex = '620'; // Above departements

      // Création des icônes SVG personnalisées
      const createCustomIcon = (type: MarkerType = 'default') => {
        const baseIcon = L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="marker-container">
              <svg viewBox="0 0 24 24" class="marker-icon">
                ${getMarkerSvg(type)}
              </svg>
              <div class="marker-pulse"></div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });
        return baseIcon;
      };

      // Fonction pour obtenir le SVG en fonction du type de marqueur
      const getMarkerSvg = (type: MarkerType): string => {
        const svgs = {
          default: `
            <path fill="#3388ff" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <path fill="#fff" d="M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>
          `,
          village: `
            <path fill="#4CAF50" d="M12 2L2 22h20L12 2zm0 3.5L18.5 20h-13L12 5.5z"/>
            <path fill="#81C784" d="M12 10l-5 10h10l-5-10z"/>
          `,
          ville: `
            <path fill="#2196F3" d="M17.5 15.5V9c0-3.07-2.13-5.64-5-6.32V3.5c0-.83-.67-1.5-1.5-1.5S9 2.67 9 3.5v.18c-2.87.68-5 3.25-5 6.32v6.5l-2 1.5v.5h15v-.5l-2-1.5z"/>
            <path fill="#fff" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"/>
          `,
          point_eau: `
            <path fill="#03A9F4" d="M12 20c-3.31 0-6-2.69-6-6 0-4 6-10.75 6-10.75S18 10 18 14c0 3.31-2.69 6-6 6z"/>
            <path fill="#81D4FA" d="M12 5.09c-1.24 2-2.5 4.3-3.75 6.75 1.25 2.45 2.5 4.66 3.75 6.5 1.25-1.84 2.5-4.05 3.75-6.5-1.25-2.45-2.5-4.75-3.75-6.75z"/>
          `,
          foret: `
            <path fill="#4CAF50" d="M16 12l3 8H5l3-8 3 2 2-2 3-2z"/>
            <path fill="#81C784" d="M12 2L8 12l4-2 4 2-4-10z"/>
          `,
          champ: `
            <path fill="#8BC34A" d="M12 2L4 22h16L12 2z"/>
            <path fill="#9CCC65" d="M12 2v20l8-10-8-10z"/>
          `,
          elevage: `
            <path fill="#795548" d="M12 5.5A2.5 2.5 0 0 1 14.5 8a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 9.5 8 2.5 2.5 0 0 1 12 5.5z"/>
            <path fill="#5D4037" d="M16.5 16v1c0 1.1-.9 2-2 2h-5c-1.1 0-2-.9-2-2v-1h9z"/>
            <path fill="#8D6E63" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
          `,
          sight: `
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
              <line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2"/>
              <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2"/>
            </svg>
          `
        };
        return svgs[type] || svgs.default;
      };

      // Fonction pour ajouter un marqueur personnalisé
      const addCustomMarker = (latlng: L.LatLngExpression, options: CustomMarkerOptions = {}) => {
        const { type = 'default', title = '', description = '', ...markerOptions } = options;

        const marker = L.marker(latlng, {
          ...markerOptions,
          icon: createCustomIcon(type),
          draggable: true
        });

        // Ajout d'un popup personnalisé
        const popupContent = `
          <div class="custom-popup">
            <h3>${title || 'Marqueur'}</h3>
            <p>${description || 'Aucune description disponible'}</p>
            <small>${L.latLng(latlng).toString()}</small>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 300,
          minWidth: 200,
          className: 'custom-popup-container'
        });

        // Gestion du déplacement
        marker.on('dragend', (e) => {
          const newLatLng = e.target.getLatLng();
          console.log('Marqueur déplacé vers:', newLatLng);
          // Mettre à jour le popup avec les nouvelles coordonnées
          marker.setPopupContent(`
            <div class="custom-popup">
              <h3>${title || 'Marqueur'}</h3>
              <p>${description || 'Aucune description disponible'}</p>
              <small>${newLatLng.toString()}</small>
            </div>
          `);
        });

        return marker;
      };

      // Exemple d'ajout de marqueurs personnalisés
      if (mapRef.current) {
        // Ajout de quelques marqueurs de démonstration (maintenant désactivé)
        /*
        const demoMarkers = [
          { lat: 14.5, lng: -14.45, type: 'ville' as MarkerType, title: 'Ville Principale', description: 'Centre administratif' },
          { lat: 14.2, lng: -14.1, type: 'village' as MarkerType, title: 'Village Rural', description: 'Communauté agricole' },
          { lat: 13.8, lng: -13.9, type: 'point_eau' as MarkerType, title: 'Point d\'Eau', description: 'Puits communautaire' },
          { lat: 14.1, lng: -14.7, type: 'foret' as MarkerType, title: 'Forêt Protégée', description: 'Zone de conservation' },
          { lat: 13.9, lng: -14.3, type: 'champ' as MarkerType, title: 'Champ Agricole', description: 'Culture de céréales' },
          { lat: 14.3, lng: -14.5, type: 'elevage' as MarkerType, title: 'Élevage', description: 'Troupeau de bovins' }
        ];

        demoMarkers.forEach(markerData => {
          const marker = addCustomMarker([markerData.lat, markerData.lng], {
            type: markerData.type,
            title: markerData.title,
            description: markerData.description
          });
          marker.addTo(mapRef.current!);
        });
        */
      }

      // Fonction pour créer une icône de cible pour la recherche
      const createTargetIcon = () => {
        return L.divIcon({
          html: ReactDOMServer.renderToString(<FaCrosshairs size={30} color="#e63946" />),
          className: 'leaflet-div-icon-target', // Classe pour un style personnalisé
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
      };

      // Remove the default Leaflet attribution prefix that contains the flag
      map.attributionControl.setPrefix('');
      // Leaflet Draw toolbar removed per request

      map.createPane('regionsPane');
      map.getPane('regionsPane')!.style.zIndex = '600'; // Lowest for thematic data layers

      map.createPane('departementsPane');
      map.getPane('departementsPane')!.style.zIndex = '610'; // Above regions

      map.createPane('communesPane');
      map.getPane('communesPane')!.style.zIndex = '615'; // Above departements

      map.createPane('arrondissementsPane');
      map.getPane('arrondissementsPane')!.style.zIndex = '618'; // Above communes

      map.createPane('ecoZonesPane');
      map.getPane('ecoZonesPane')!.style.zIndex = '620'; // Above departements

      // Pane pour les zones protégées
      map.createPane('protectedZonesPane');
      map.getPane('protectedZonesPane')!.style.zIndex = '625'; // Above ecoZones, below amodiees/zics

      map.createPane('amodieesPane');
      map.getPane('amodieesPane')!.style.zIndex = '630'; // Above ecoZones

      map.createPane('zicsPane');
      map.getPane('zicsPane')!.style.zIndex = '630'; // Same level as amodiees, above ecoZones

      map.createPane('parcVisitePane');
      map.getPane('parcVisitePane')!.style.zIndex = '635'; // Above ZICs/Amodiees

      map.createPane('regulationPane');
      map.getPane('regulationPane')!.style.zIndex = '635'; // Same level as parc visite

      map.createPane('regionalAgentsPane');
      map.getPane('regionalAgentsPane')!.style.zIndex = '640'; // Above all zones

      map.createPane('drawnItemsPane');
      map.getPane('drawnItemsPane')!.style.zIndex = '700'; // Highest for drawn items
      if (drawnItemsRef.current.options) {
        drawnItemsRef.current.options.pane = 'drawnItemsPane';
      }

      // Pane et calque pour les prélèvements (au-dessus des couches thématiques mais sous les alertes)
      map.createPane('huntingReportsPane');
      map.getPane('huntingReportsPane')!.style.zIndex = '650';
      if (!layersRef.current.huntingReports) {
        layersRef.current.huntingReports = L.layerGroup([], { pane: 'huntingReportsPane' as any });
      }
      layersRef.current.huntingReports.addTo(map);

      // Contrôle d'échelle supprimé
      // L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
      // La légende est désormais gérée par l'overlay React <Legend /> plus bas.

      // Bouton 'Abattage' pour admin/agents si demandé: affiché en haut à gauche, sous les autres contrôles
      if (props.enableHuntingReportsToggle) {
        const AbattageControl = L.Control.extend({
          onAdd: () => {
            const div = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
            div.style.background = 'white';
            div.style.border = '1px solid #ccc';
            div.style.borderRadius = '6px';
            div.style.overflow = 'hidden';
            div.style.marginTop = '6px';
            const btn = L.DomUtil.create('a', '', div);
            btn.href = '#';
            btn.title = 'Afficher les abattages';
            btn.style.display = 'inline-block';
            btn.style.padding = '6px 10px';
            btn.style.fontSize = '12px';
            btn.style.color = '#065f46';
            btn.style.background = '#ecfdf5';
            btn.style.borderBottom = '1px solid #d1fae5';
            btn.innerHTML = 'Abattage';
            L.DomEvent.on(btn, 'click', async (e: any) => {
              L.DomEvent.stop(e);
              try {
                // Charger depuis l'API (le backend doit filtrer par rôle utilisateur)
                const qs: string[] = [];
                if (props.userRole && props.userRole !== 'admin') {
                  if (props.userRegion) qs.push(`region=${encodeURIComponent(props.userRegion)}`);
                  if (props.userDepartement) qs.push(`departement=${encodeURIComponent(props.userDepartement)}`);
                } else {
                  qs.push('scope=all');
                }
                const url = '/api/hunting-reports' + (qs.length ? `?${qs.join('&')}` : '');
                const resp = await apiRequest<any[]>('GET', url);
                const items = Array.isArray(resp) ? resp : (resp as any)?.data || [];
                const mapped = items.map((r: any) => ({
                  lat: Number(r.lat),
                  lon: Number(r.lon),
                  species: r.speciesName ?? r.nom_espece ?? null,
                  scientificName: r.scientificName ?? r.nom_scientifique ?? null,
                  quantity: r.quantity ?? null,
                  date: r.date ?? null,
                  location: r.location ?? null,
                  photoUrl: r.id ? `/api/hunting-reports/${r.id}/photo` : null,
                  region: r.region ?? null,
                  departement: r.departement ?? null,
                  commune: r.commune ?? null,
                  permitNumber: r.permitNumber ?? r.permit_number ?? null,
                })).filter((it: any) => Number.isFinite(it.lat) && Number.isFinite(it.lon));
                setInternalHuntingReports(mapped);
                setReportsVisible(true);
              } catch (err) {
                console.error('Erreur chargement abattages:', err);
              }
            });
            return div;
          },
          onRemove: function() {}
        });
        new AbattageControl({ position: 'topleft' }).addTo(map);
      }

      // Total alerts control next to legend
      const TotalAlertsControl = L.Control.extend({
        onAdd: () => {
          const div = L.DomUtil.create('div', 'info legend leaflet-control leaflet-bar');
          div.style.backgroundColor = 'white';
          div.style.padding = '6px 10px';
          div.style.border = '1px solid #ccc';
          div.style.borderRadius = '5px';
          div.style.boxShadow = '0 1px 5px rgba(0,0,0,0.2)';
          div.style.marginLeft = '8px';
          div.style.display = 'flex';
          div.style.alignItems = 'center';
          div.style.gap = '12px';
          const progressText = computeProgressText(loadProgress);
          div.innerHTML = `
            <span class="map-total-alerts-progress" style="color:#0f766e;font-weight:600;white-space:nowrap;${progressText ? '' : 'display:none;'}">
              ${progressText}
            </span>
            <span class="map-total-alerts-count" style="white-space:nowrap;">
              <strong>SCoDi_00491/</strong>
            </span>
          `;
          totalAlertsElRef.current = div;
          L.DomEvent.disableClickPropagation(div);
          L.DomEvent.disableScrollPropagation(div);
          return div;
        },
        onRemove: function() {}
      });
      if (!props.minimal && !props.hideLegendForHunterGuide) {
        new TotalAlertsControl({ position: 'bottomright' }).addTo(map);
      }
      // Rendre l'attribution plus compacte si demandé
      if (!props.minimal && compactControls) {
        const attr = (map as any).attributionControl && (map as any).attributionControl._container as HTMLDivElement | undefined;
        if (attr) {
          attr.style.fontSize = '11px';
          attr.style.padding = '2px 4px';
        }
      }

      mapInitializedRef.current = true;
      setMapReady(true);

      return () => {
        if (layersRef.current.baseOsm && map.hasLayer(layersRef.current.baseOsm)) {
          map.removeLayer(layersRef.current.baseOsm);
        }
        if (layersRef.current.baseSatellite && map.hasLayer(layersRef.current.baseSatellite)) {
          map.removeLayer(layersRef.current.baseSatellite);
        }
        map.remove();
        mapRef.current = null;
        mapInitializedRef.current = false;
        initialViewAppliedRef.current = false;
        layersRef.current = {};
      };
    }, []);

    // Appliquer un recentrage UNE SEULE FOIS quand les props initiales arrivent.
    // On utilise un ref pour éviter le cycle zoom→dezoom→rezoom causé par
    // les re-renders quand initialCenter/initialZoom passent de null à une valeur.
    const initialViewAppliedRef = useRef(false);
    useEffect(() => {
      if (initialViewAppliedRef.current) return;
      const map = mapRef.current;
      if (!map) return;
      const center = (props as any).initialCenter as [number, number] | null | undefined;
      const zoomVal = (props as any).initialZoom as number | null | undefined;
      if (Array.isArray(center) && center.length === 2) {
        const z = Number(zoomVal ?? map.getZoom());
        map.setView(center, isFinite(z) ? z : map.getZoom(), { animate: false });
        initialViewAppliedRef.current = true;
      }
    }, [props.initialCenter, props.initialZoom]);

    // Rendu des zones protégées (Forêts) sans filtrage de type
    useEffect(() => {
      const map = mapRef.current;
      const data = (props as any).protectedZonesGeoJSON as GeoJSON.FeatureCollection | null | undefined;
      const show = !!(props as any).showProtectedZones;
      if (!map) return;

      // Supprimer l'ancien calque si présent
      if (layersRef.current.protectedZones) {
        layersRef.current.protectedZones.remove();
        layersRef.current.protectedZones = undefined as any;
      }

      if (!show || !data || !Array.isArray(data.features) || data.features.length === 0) {
        return;
      }

      const styleFn = (feature?: GeoJSON.Feature) => {
        const color = (feature?.properties as any)?.color || '#22c55e';
        return {
          color,
          weight: 2,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.25,
          pane: 'protectedZonesPane'
        } as L.PathOptions as any;
      };

      const onEach = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p: any = feature.properties || {};
        const name = p.name || 'N/A';
        const type = p.type || 'N/A';
        const areaHa = Number(p.surface_ha || p.area || 0);
        const areaTxt = areaHa > 0 ? `${areaHa.toFixed(2)} ha` : 'N/A';
        const perim = Number(p.perimetre_m || p.perimeter || 0);
        const html = `
          <div>
            <div style="font-weight:600">Zone protégée</div>
            <div style="font-size:12px;color:#374151">Nom: ${name}</div>
            <div style="font-size:12px;color:#374151">Type: ${type}</div>
            <div style="font-size:12px;color:#374151">Surface: ${areaTxt}</div>
            <div style="font-size:12px;color:#374151">Périmètre: ${perim > 0 ? perim.toFixed(0) + ' m' : 'N/A'}</div>
          </div>
        `;
        (layer as any).bindPopup(html);
      };

      const layer = L.geoJSON(data as any, {
        style: styleFn as any,
        onEachFeature: onEach as any,
        pane: 'protectedZonesPane' as any
      });

      layersRef.current.protectedZones = layer as any;
      layer.addTo(map);
      console.log('[MapComponent] ProtectedZones layer added', { features: (data as any).features.length });
      try {
        const b = (layersRef.current.protectedZones as any).getBounds?.();
        if (b && b.isValid && b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 11 });
        }
      } catch (e) {
        console.warn('[MapComponent] fitBounds protected_zones failed:', e);
      }
    }, [props.showProtectedZones, props.protectedZonesGeoJSON]);

    // Rendu des ZICs depuis les données GeoJSON en props
    useEffect(() => {
      const map = mapRef.current;
      const data = (props as any).zicsGeoJSON as GeoJSON.FeatureCollection | null | undefined;
      const show = !!(props as any).showZics;
      if (!map) return;

      // Nettoyer l'ancien calque si présent
      if (layersRef.current.zics) {
        console.log('[MapComponent] Removing previous ZICs layer');
        layersRef.current.zics.remove();
        layersRef.current.zics = undefined as any;
      }

      if (!show || !data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log('[MapComponent] ZICs not rendered', { show, hasData: !!data, features: Array.isArray((data as any)?.features) ? (data as any).features.length : 'n/a' });
        return;
      }

      const styleFn = (feature?: GeoJSON.Feature) => {
        const color = (feature?.properties as any)?.color || '#0ea5e9';
        return {
          color,
          weight: 2,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.25
        } as L.PathOptions;
      };

      const onEach = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p: any = feature.properties || {};
        const name = p.name || 'ZIC';
        const type = (p.type || 'zic').toString().toUpperCase();
        const region = p.region || 'N/A';
        const departement = p.departement || p.department || 'N/A';
        const area = Number(p.area_sq_km || 0);
        const areaTxt = area > 0 ? `${area.toFixed(2)} km²` : 'N/A';
        const status = p.status || 'active';
        const html = `
          <div>
            <div style="font-weight:600">${name}</div>
            <div style="font-size:12px;color:#374151">Type: ${type}</div>
            <div style="font-size:12px;color:#374151">Région: ${region}</div>
            <div style="font-size:12px;color:#374151">Département: ${departement}</div>
            <div style="font-size:12px;color:#374151">Superficie: ${areaTxt}</div>
            <div style="font-size:12px;color:#374151">Statut: ${status}</div>
          </div>
        `;
        (layer as any).bindPopup(html);
      };

      layersRef.current.zics = L.geoJSON(data as any, {
        style: styleFn as any,
        pane: 'zicsPane',
        onEachFeature: onEach as any
      } as any);
      layersRef.current.zics.addTo(map);
      console.log('[MapComponent] ZICs layer added', { features: (data as any).features.length });
      try {
        const b = (layersRef.current.zics as any).getBounds?.();
        if (b && b.isValid && b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 11 });
        }
      } catch {}
    }, [(props as any).zicsGeoJSON, (props as any).showZics]);

    // Rendu des zones Amodiées depuis les données GeoJSON en props
    useEffect(() => {
      const map = mapRef.current;
      const data = (props as any).amodieesGeoJSON as GeoJSON.FeatureCollection | null | undefined;
      const show = !!(props as any).showAmodiees;
      if (!map) return;

      // Nettoyer l'ancien calque si présent
      if (layersRef.current.amodiees) {
        console.log('[MapComponent] Removing previous Amodiées layer');
        layersRef.current.amodiees.remove();
        layersRef.current.amodiees = undefined as any;
      }

      if (!show || !data || !Array.isArray(data.features) || data.features.length === 0) {
        return;
      }

      const styleFn = (feature?: GeoJSON.Feature) => {
        const color = (feature?.properties as any)?.color || '#10b981';
        return {
          color,
          weight: 2,
          opacity: 0.9,
          fillColor: color,
          fillOpacity: 0.25
        } as L.PathOptions;
      };

      const onEach = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p: any = feature.properties || {};
        const name = p.name || 'Zone Amodiée';
        const type = (p.type || 'amodiee').toString().toUpperCase();
        const region = p.region || 'N/A';
        const departement = p.departement || p.department || 'N/A';
        const area = Number(p.area_sq_km || 0);
        const areaTxt = area > 0 ? `${area.toFixed(2)} km²` : 'N/A';
        const status = p.status || 'active';
        const html = `
          <div>
            <div style="font-weight:600">${name}</div>
            <div style="font-size:12px;color:#374151">Type: ${type}</div>
            <div style="font-size:12px;color:#374151">Région: ${region}</div>
            <div style="font-size:12px;color:#374151">Département: ${departement}</div>
            <div style="font-size:12px;color:#374151">Superficie: ${areaTxt}</div>
            <div style="font-size:12px;color:#374151">Statut: ${status}</div>
          </div>
        `;
        (layer as any).bindPopup(html);
      };

      layersRef.current.amodiees = L.geoJSON(data as any, {
        style: styleFn as any,
        pane: 'amodieesPane',
        onEachFeature: onEach as any
      } as any);
      layersRef.current.amodiees.addTo(map);
      console.log('[MapComponent] Amodiées layer added', { features: (data as any).features.length });
      try {
        const b = (layersRef.current.amodiees as any).getBounds?.();
        if (b && b.isValid && b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 11 });
        }
      } catch {}
    }, [(props as any).amodieesGeoJSON, (props as any).showAmodiees]);

    // Rendu des Parcs de visite depuis les données GeoJSON en props
    useEffect(() => {
      const map = mapRef.current;
      const data = (props as any).parcVisiteGeoJSON as GeoJSON.FeatureCollection | null | undefined;
      const show = !!(props as any).showParcVisite;
      if (!map) return;

      // Nettoyer l'ancien calque si présent
      if (layersRef.current.parcVisite) {
        console.log('[MapComponent] Removing previous Parc de visite layer');
        layersRef.current.parcVisite.remove();
        layersRef.current.parcVisite = undefined as any;
      }

      if (!show || !data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log('[MapComponent] Parc de visite not rendered', { show, hasData: !!data, features: Array.isArray((data as any)?.features) ? (data as any).features.length : 'n/a' });
        return;
      }

      const styleFn = (feature?: GeoJSON.Feature) => {
        const props = feature?.properties || {};
        const isInactive = props.isInactive || props.status === 'inactive';

        // Utiliser les propriétés de style pour les zones inactives
        if (isInactive) {
          const baseStyle = {
            color: props.mapColor || '#9ca3af',
            fillColor: props.mapColor || '#9ca3af',
            weight: 2,
            opacity: props.mapOpacity || 0.5,
            fillOpacity: (props.mapOpacity || 0.5) * 0.5,
          } as L.PathOptions;

          // Ajouter le motif de croix si demandé
          if (props.showCrossPattern) {
            return {
              ...baseStyle,
              dashArray: '8,8',
              dashOffset: '4',
              className: 'inactive-zone-pattern'
            };
          }
          return baseStyle;
        }

        // Style normal pour les zones actives
        const color = props.mapColor || props.color || '#f59e0b';
        return {
          color,
          weight: 2,
          opacity: props.mapOpacity || 0.9,
          fillColor: color,
          fillOpacity: (props.mapOpacity || 0.9) * 0.28,
        } as L.PathOptions;
      };

      const onEach = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p: any = feature.properties || {};
        const name = p.name || 'Parc de visite';
        const type = (p.type || 'parc_visite').toString().replace('_', ' ').toUpperCase();
        const region = p.region || 'N/A';
        const departement = p.departement || p.department || 'N/A';
        const area = Number(p.area_sq_km || 0);
        const areaTxt = area > 0 ? `${area.toFixed(2)} km²` : 'N/A';
        const status = p.status || 'active';
        const html = `
          <div>
            <div style="font-weight:600">${name}</div>
            <div style="font-size:12px;color:#374151">Type: ${type}</div>
            <div style="font-size:12px;color:#374151">Région: ${region}</div>
            <div style="font-size:12px;color:#374151">Département: ${departement}</div>
            <div style="font-size:12px;color:#374151">Superficie: ${areaTxt}</div>
            <div style="font-size:12px;color:#374151">Statut: ${status}</div>
          </div>
        `;
        (layer as any).bindPopup(html);
      };

      layersRef.current.parcVisite = L.geoJSON(data as any, {
        style: styleFn as any,
        pane: 'parcVisitePane',
        onEachFeature: onEach as any
      } as any);
      layersRef.current.parcVisite.addTo(map);
      console.log('[MapComponent] Parc de visite layer added', { features: (data as any).features.length });
      try {
        const b = (layersRef.current.parcVisite as any).getBounds?.();
        if (b && b.isValid && b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 11 });
        }
      } catch {}
    }, [(props as any).parcVisiteGeoJSON, (props as any).showParcVisite]);

    // Rendu des zones de Régulation depuis les données GeoJSON en props
    useEffect(() => {
      const map = mapRef.current;
      const data = (props as any).regulationGeoJSON as GeoJSON.FeatureCollection | null | undefined;
      const show = !!(props as any).showRegulation;
      if (!map) return;

      // Nettoyer l'ancien calque si présent
      if (layersRef.current.regulation) {
        console.log('[MapComponent] Removing previous Régulation layer');
        layersRef.current.regulation.remove();
        layersRef.current.regulation = undefined as any;
      }

      if (!show || !data || !Array.isArray(data.features) || data.features.length === 0) {
        console.log('[MapComponent] Régulation not rendered', { show, hasData: !!data, features: Array.isArray((data as any)?.features) ? (data as any).features.length : 'n/a' });
        return;
      }

      const styleFn = (feature?: GeoJSON.Feature) => {
        const props = feature?.properties || {};
        const isInactive = props.isInactive || props.status === 'inactive';

        // Utiliser les propriétés de style pour les zones inactives
        if (isInactive) {
          const baseStyle = {
            color: props.mapColor || '#9ca3af',
            fillColor: props.mapColor || '#9ca3af',
            weight: 2,
            opacity: props.mapOpacity || 0.5,
            fillOpacity: (props.mapOpacity || 0.5) * 0.5,
          } as L.PathOptions;

          // Ajouter le motif de croix si demandé
          if (props.showCrossPattern) {
            return {
              ...baseStyle,
              dashArray: '8,8',
              dashOffset: '4',
              className: 'inactive-zone-pattern'
            };
          }
          return baseStyle;
        }

        // Style normal pour les zones actives
        const color = props.mapColor || props.color || '#dc2626';
        return {
          color,
          weight: 2,
          opacity: props.mapOpacity || 0.9,
          fillColor: color,
          fillOpacity: (props.mapOpacity || 0.9) * 0.28,
        } as L.PathOptions;
      };

      const onEach = (feature: GeoJSON.Feature, layer: L.Layer) => {
        const p: any = feature.properties || {};
        const name = p.name || 'Zone de Régulation';
        const type = (p.type || 'regulation').toString().toUpperCase();
        const region = p.region || 'N/A';
        const departement = p.departement || p.department || 'N/A';
        const area = Number(p.area_sq_km || 0);
        const areaTxt = area > 0 ? `${area.toFixed(2)} km²` : 'N/A';
        const status = p.status || 'active';
        const html = `
          <div>
            <div style="font-weight:600">${name}</div>
            <div style="font-size:12px;color:#374151">Type: ${type}</div>
            <div style="font-size:12px;color:#374151">Région: ${region}</div>
            <div style="font-size:12px;color:#374151">Département: ${departement}</div>
            <div style="font-size:12px;color:#374151">Superficie: ${areaTxt}</div>
            <div style="font-size:12px;color:#374151">Statut: ${status}</div>
          </div>
        `;
        (layer as any).bindPopup(html);
      };

      layersRef.current.regulation = L.geoJSON(data as any, {
        style: styleFn as any,
        pane: 'regulationPane',
        onEachFeature: onEach as any
      } as any);
      layersRef.current.regulation.addTo(map);
      console.log('[MapComponent] Régulation layer added', { features: (data as any).features.length });
      try {
        const b = (layersRef.current.regulation as any).getBounds?.();
        if (b && b.isValid && b.isValid()) {
          map.fitBounds(b, { padding: [24, 24], maxZoom: 11 });
        }
      } catch {}
    }, [(props as any).regulationGeoJSON, (props as any).showRegulation]);

    // État pour filtrer les alertes par type
    const [alertTypeFilters, setAlertTypeFilters] = useState({
      feux_de_brousse: true,
      'trafic-bois': true,
      braconnage: true,
      autre: true,
    });

    // --- Panneau filtre alertes déplaçable ---
    const [alertFilterPos, setAlertFilterPos] = useState<{ left: number; top: number } | null>(null);
    const alertFilterDragRef = useRef<{ startX: number; startY: number; origLeft: number; origTop: number; dragging: boolean }>({ startX: 0, startY: 0, origLeft: 0, origTop: 0, dragging: false });
    const alertFilterRef = useRef<HTMLDivElement>(null);

    const onAlertFilterPointerDown = (e: React.PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.alert-filter-drag-handle')) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = alertFilterRef.current?.getBoundingClientRect();
      const origLeft = alertFilterPos?.left ?? (rect?.left ?? 48);
      const origTop = alertFilterPos?.top ?? (rect?.top ?? 125);
      alertFilterDragRef.current = { startX: e.clientX, startY: e.clientY, origLeft, origTop, dragging: true };
      target.setPointerCapture(e.pointerId);
    };
    const onAlertFilterPointerMove = (e: React.PointerEvent) => {
      if (!alertFilterDragRef.current.dragging) return;
      const dx = e.clientX - alertFilterDragRef.current.startX;
      const dy = e.clientY - alertFilterDragRef.current.startY;
      setAlertFilterPos({ left: alertFilterDragRef.current.origLeft + dx, top: alertFilterDragRef.current.origTop + dy });
    };
    const onAlertFilterPointerUp = () => {
      alertFilterDragRef.current.dragging = false;
    };

    // Rendu des alertes en tant que marqueurs
    // Ref pour stocker les cluster groups par région
    const alertsClustersRef = useRef<Map<string, any>>(new Map());

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      const show = !!props.showAlerts;
      const allData = props.alerts || [];

      // Filtrer les alertes selon les types sélectionnés
      const data = allData.filter(alert => {
        const n = (alert.nature || '').toLowerCase();
        if (n.includes('feu') || n.includes('brousse')) return alertTypeFilters.feux_de_brousse;
        if (n.includes('trafic') || n.includes('bois')) return alertTypeFilters['trafic-bois'];
        if (n.includes('braconn')) return alertTypeFilters.braconnage;
        return alertTypeFilters.autre;
      });

      // Nettoyer les anciens clusters
      alertsClustersRef.current.forEach((clusterGroup) => {
        if (map.hasLayer(clusterGroup)) {
          map.removeLayer(clusterGroup);
        }
        clusterGroup.clearLayers();
      });
      alertsClustersRef.current.clear();

      // Nettoyer l'ancien contenu
      if (layersRef.current.alerts) {
        layersRef.current.alerts.clearLayers();
      }

      if (!show || !data.length) return;

      // Regrouper les alertes par région
      const alertsByRegion = new Map<string, typeof data>();
      data.forEach(alert => {
        const region = (alert.region || 'Inconnu').trim();
        if (!alertsByRegion.has(region)) {
          alertsByRegion.set(region, []);
        }
        alertsByRegion.get(region)!.push(alert);
      });

      const getAlertIcon = (nature?: string | null, isOld: boolean = false) => {
        const n = (nature || '').toLowerCase();
        const isFire = n.includes('feu') || n.includes('incendi') || n.includes('fire') || n.includes('brousse');
        const isWoodTraffic = n.includes('trafic') || n.includes('traffic') || n.includes('bois') || n.includes('wood');
        const isPoaching = n.includes('braconn') || n.includes('poach');

        if (isWoodTraffic) {
          // Icône "bûches" (trafic de bois) avec anneau marron. Pulse si <24h, gris/no pulse si >24h
          const grayFilter = isOld ? 'grayscale(1) opacity(0.85)' : 'none';
          return L.divIcon({
            className: 'custom-marker',
            html: `
              <div class="marker-container" style="position: relative; width:34px; height:34px;">
                <!-- Anneau -->
                <div style="
                  position:absolute; inset:0;
                  border-radius: 50%;
                  background: transparent; border: 4px solid ${isOld ? '#9CA3AF' : '#8B5A2B'};
                  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                "></div>
                ${isOld ? '' : `
                <!-- Pulsation marron discrète -->
                <svg viewBox="0 0 32 32" width="32" height="32" style="position:absolute; inset:0;">
                  <circle cx="16" cy="16" r="8" fill="none" stroke="#8B5A2B" stroke-width="2" opacity="0.7">
                    <animate attributeName="r" values="8;13;8" dur="1.6s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="indefinite"/>
                  </circle>
                </svg>`}
                <!-- Icône bûches (3 pièces) -->
                <div style="position:absolute; top:50%; left:50%; transform: translate(-50%, -50%); filter:${grayFilter};">
                  <svg viewBox="0 0 84 60" width="26" height="26" aria-hidden="true">
                    <defs>
                      <linearGradient id="woodGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#7c5b3e"/>
                        <stop offset="100%" stop-color="#5a3f2a"/>
                      </linearGradient>
                    </defs>
                    <!-- Bûche 1 (bas) -->
                    <rect x="12" y="32" width="52" height="12" rx="6" fill="url(#woodGrad)"/>
                    <circle cx="12" cy="38" r="6" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="64" cy="38" r="6" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="12" cy="38" r="4" fill="none" stroke="#caa873" stroke-width="1"/>
                    <circle cx="64" cy="38" r="4" fill="none" stroke="#caa873" stroke-width="1"/>
                    <!-- Bûche 2 (milieu, décalée) -->
                    <rect x="16" y="22" width="52" height="12" rx="6" fill="url(#woodGrad)"/>
                    <circle cx="16" cy="28" r="6" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="68" cy="28" r="6" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="16" cy="28" r="4" fill="none" stroke="#caa873" stroke-width="1"/>
                    <circle cx="68" cy="28" r="4" fill="none" stroke="#caa873" stroke-width="1"/>
                    <!-- Bûche 3 (haut, courte) -->
                    <rect x="20" y="12" width="44" height="10" rx="5" fill="url(#woodGrad)"/>
                    <circle cx="20" cy="17" r="5" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="64" cy="17" r="5" fill="#f4d7a3" stroke="#7c5b3e" stroke-width="2"/>
                    <circle cx="20" cy="17" r="3.5" fill="none" stroke="#caa873" stroke-width="1"/>
                    <circle cx="64" cy="17" r="3.5" fill="none" stroke="#caa873" stroke-width="1"/>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -20]
          });
        }

        if (isPoaching) {
          // Icône "braconnage" réaliste: viseur rouge vif + cervidé stylisé. Pas de pulsation. Gris si >24h
          const grayFilter = isOld ? 'grayscale(1) opacity(0.85)' : 'none';
          return L.divIcon({
            className: 'custom-marker',
            html: `
              <div class="marker-container" style="position: relative; width:34px; height:34px;">
                <div style="
                  position:absolute; inset:0;
                  border-radius: 50%;
                  background: transparent; border: 4px solid ${isOld ? '#9CA3AF' : '#FF1F3D'};
                  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                "></div>
                ${isOld ? '' : `
                <!-- Pulsation rouge vif -->
                <svg viewBox="0 0 32 32" width="32" height="32" style="position:absolute; inset:0;">
                  <circle cx="16" cy="16" r="8" fill="none" stroke="#FF1F3D" stroke-width="2" opacity="0.7">
                    <animate attributeName="r" values="8;13;8" dur="1.6s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="indefinite"/>
                  </circle>
                </svg>`}
                <div style="position:absolute; top:50%; left:50%; transform: translate(-50%, -50%); filter:${grayFilter};">
                  <!-- SVG viseur + cervidé plus réaliste -->
                  <svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true">
                    <defs>
                      <linearGradient id="sightGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#ff6b6b"/>
                        <stop offset="100%" stop-color="#FF1F3D"/>
                      </linearGradient>
                    </defs>
                    <circle cx="32" cy="32" r="22" fill="none" stroke="url(#sightGrad)" stroke-width="5"/>
                    <line x1="32" y1="8" x2="32" y2="18" stroke="#FF1F3D" stroke-width="4" stroke-linecap="round"/>
                    <line x1="8" y1="32" x2="18" y2="32" stroke="#FF1F3D" stroke-width="4" stroke-linecap="round"/>
                    <line x1="46" y1="32" x2="56" y2="32" stroke="#FF1F3D" stroke-width="4" stroke-linecap="round"/>
                    <line x1="32" y1="46" x2="32" y2="56" stroke="#FF1F3D" stroke-width="4" stroke-linecap="round"/>
                    <g transform="translate(0,2)">
                      <path d="M28 42 C28 36, 36 36, 36 42 Q32 45 28 42 Z" fill="#8b5e34"/>
                      <path d="M24 30 C22 26, 18 24, 18 22 C21 22, 25 24, 27 28" fill="none" stroke="#8b5e34" stroke-width="3" stroke-linecap="round"/>
                      <path d="M40 30 C42 26, 46 24, 46 22 C43 22, 39 24, 37 28" fill="none" stroke="#8b5e34" stroke-width="3" stroke-linecap="round"/>
                      <circle cx="30" cy="38" r="1.6" fill="#1f2937"/>
                      <circle cx="34" cy="38" r="1.6" fill="#1f2937"/>
                    </g>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -20]
          });
        }

        if (isFire) {
          if (isOld) {
            // Fire icon without pulse, gray color when resolved/older than 24h
            return L.divIcon({
              className: 'custom-marker',
              html: `
                <div class="marker-container" style="position: relative; width:32px; height:32px;">
                  <div style="
                    position:absolute; inset:0;
                    border-radius: 50%;
                    background: transparent; border: 4px solid #9CA3AF;
                    box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                  "></div>
                  <div style="
                    position:absolute; top:50%; left:50%; transform: translate(-50%, -50%);
                    display:flex; align-items:center; justify-content:center;
                  ">
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                      <path d="M12 2 C12 2, 16 8, 16 11 C16 13.761 13.761 16 11 16 C8.239 16 6 13.761 6 11 C6 8 12 2 12 2 Z" fill="#9CA3AF"></path>
                      <ellipse cx="11" cy="12.2" rx="2.8" ry="2.2" fill="#D1D5DB"></ellipse>
                    </svg>
                  </div>
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
              popupAnchor: [0, -20]
            });
          }
          // Icône spéciale: anneau ROUGE, centre transparent, flamme visible, avec clignotement/pulse via SVG animate
          return L.divIcon({
            className: 'custom-marker',
            html: `
              <div class="marker-container" style="position: relative; width:32px; height:32px;">
                <!-- Anneau rouge -->
                <div style="
                  position:absolute; inset:0;
                  border-radius: 50%;
                  background: transparent; border: 4px solid #ef4444;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                "></div>
                <!-- Pulsation (cercle rouge animé) -->
                <svg viewBox="0 0 32 32" width="32" height="32" style="position:absolute; inset:0;">
                  <circle cx="16" cy="16" r="8" fill="none" stroke="#ef4444" stroke-width="2" opacity="0.7">
                    <animate attributeName="r" values="8;13;8" dur="1.6s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.7;0;0.7" dur="1.6s" repeatCount="indefinite"/>
                  </circle>
                </svg>
                <!-- Flamme -->
                <div style="
                  position:absolute; top:50%; left:50%; transform: translate(-50%, -50%);
                  display:flex; align-items:center; justify-content:center;
                ">
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                    <path d="M12 2 C12 2, 16 8, 16 11 C16 13.761 13.761 16 11 16 C8.239 16 6 13.761 6 11 C6 8 12 2 12 2 Z" fill="#f97316">
                      <animate attributeName="opacity" values="1;0.8;1" dur="1.2s" repeatCount="indefinite"/>
                    </path>
                    <ellipse cx="11" cy="12.2" rx="2.8" ry="2.2" fill="#fde047">
                      <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite"/>
                    </ellipse>
                  </svg>
                </div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -20]
          });
        }

        // Icônes de base par couleur pour autres natures
        let color = '#e11d48'; // défaut
        if (n.includes('braconn') || n.includes('poaching')) color = '#ef4444';
        else if (n.includes('incident') || n.includes('accident')) color = '#f59e0b';
        else if (n.includes('animal') || n.includes('faune')) color = '#10b981';
        else if (n.includes('police') || n.includes('controle') || n.includes('contrôle')) color = '#3b82f6';

        if (isOld) color = '#9CA3AF'; // gray for resolved/old

        return L.divIcon({
          className: 'custom-marker',
          html: `
            <div class="marker-container">
              <svg viewBox="0 0 24 24" class="marker-icon">
                <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9.5" r="2.5" fill="none"/>
              </svg>
              ${isOld ? '' : '<div class="marker-pulse"></div>'}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -32]
        });
      };

      const now = Date.now();
      const twentyFourH = 24 * 60 * 60 * 1000;
      const ensureLayerOnTop = (layer: any) => {
        if (!layer) return;
        if (typeof layer.setZIndexOffset === 'function') {
          try { layer.setZIndexOffset(2000); } catch {}
        }
        const el = layer.getElement?.();
        if (el) {
          el.style.zIndex = '2000';
        }
      };

      data.forEach(a => {
        const isOld = (now - new Date(a.created_at).getTime()) >= twentyFourH;
        // Place alert markers into the dedicated alerts pane (z-index élevé, prioritaire au-dessus des régions)
        const m = L.marker([a.lat, a.lon], {
          icon: getAlertIcon(a.nature, isOld),
          pane: 'alertsPane',
          zIndexOffset: 2000,
        } as any);

        // Empêcher TOUS les événements de se propager vers la carte
        m.on('click mousedown mouseup', (e: any) => {
          console.log('[Marker] Individual marker click intercepted');
          try {
            if (e?.originalEvent) {
              L.DomEvent.preventDefault(e.originalEvent);
              L.DomEvent.stopPropagation(e.originalEvent);
            }
            L.DomEvent.stop(e);
          } catch {}
          return false;
        });

        const title = a.title || 'Alerte';
        const msg = a.message || '';
        const when = new Date(a.created_at).toLocaleString();
        const region = a.region || 'N/A';
        const departement = (a as any).departement || '';
        const s = a.sender || undefined;
        const senderName = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : '';
        const senderPhone = s?.phone || '';
        const role = (s?.role || '').toLowerCase().replace(/[_\s-]+/g, '-');
        const dep = (s?.departement || '').toUpperCase();
        let roleLabel = '';
        if (role === 'sub-agent') {
          roleLabel = `Agent secteur${dep ? `, ${dep}` : ''}`;
        } else if (role === 'agent') {
          roleLabel = s?.departement ? `Secteur, ${dep}` : 'IREF';
        } else if (role) {
          roleLabel = role.replace(/-/g, ' ');
        }
        const latStr = typeof a.lat === 'number' ? a.lat.toFixed(5) : String(a.lat);
        const lonStr = typeof a.lon === 'number' ? a.lon.toFixed(5) : String(a.lon);
        const senderLine = senderName || roleLabel ? `Envoyé par : ${[senderName, roleLabel ? `(${roleLabel}${s?.region ? `, ${s.region}` : ''})` : ''].filter(Boolean).join(' ')}` : '';
        m.bindPopup(`
          <div class="custom-popup">
            <h3>${title}</h3>
            ${a.nature ? `<div><b>Nature:</b> ${a.nature}</div>` : ''}
            <div><b>Région:</b> ${region}${departement ? `, <b>Département:</b> ${departement}` : ''}</div>
            <div><b>Date/Heure:</b> ${when}</div>
            <div><b>Coordonnées:</b> ${latStr}, ${lonStr}</div>
            ${senderLine ? `<div><b>${senderLine}</b></div>` : ''}
            ${senderPhone ? `<div><b>Téléphone:</b> ${senderPhone}</div>` : ''}
            ${msg ? `<p style="margin-top:6px;">${msg}</p>` : ''}
          </div>
        `);
        // Ajouter le marqueur au cluster de sa région
        const alertRegion = (a.region || 'Inconnu').trim();
        if (!alertsClustersRef.current.has(alertRegion)) {
          // Créer un cluster group pour cette région avec icône rouge clair compacte
          const clusterGroup = (L as any).markerClusterGroup({
            maxClusterRadius: 35,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: false, // Désactiver le zoom automatique
            // Toujours conserver les clusters à tous les niveaux de zoom
            // (les branches sont visibles via spiderfy au clic)
            disableClusteringAtZoom: 22,
            pane: 'alertsPane',
            iconCreateFunction: (cluster: any) => {
              const count = cluster.getChildCount();
              // Taille adaptative selon le nombre
              let size = 28;
              let fontSize = 11;
              if (count >= 100) {
                size = 32;
                fontSize = 10;
              } else if (count >= 10) {
                size = 30;
                fontSize = 11;
              }
              return L.divIcon({
                html: `<div style="
                  background: #ff6b6b;
                  border: 2px solid #ff4444;
                  border-radius: 50%;
                  width: ${size}px;
                  height: ${size}px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: ${fontSize}px;
                  box-shadow: 0 1px 4px rgba(255,68,68,0.35);
                ">${count}</div>`,
                className: 'custom-cluster-icon',
                iconSize: L.point(size, size)
              });
            }
          });

          clusterGroup.on('layeradd', (e: any) => {
            ensureLayerOnTop(e?.layer);
          });
          clusterGroup.on('animationend', () => {
            clusterGroup.eachLayer((layer: any) => ensureLayerOnTop(layer));
          });
          clusterGroup.on('spiderfied unspiderfied', () => {
            clusterGroup.eachLayer((layer: any) => ensureLayerOnTop(layer));
          });

          // Empêcher TOUS les clics de se propager vers la carte
          clusterGroup.on('click', (e: any) => {
            console.log('[Cluster] Generic click intercepted');
            try {
              if (e?.originalEvent) {
                L.DomEvent.preventDefault(e.originalEvent);
                L.DomEvent.stopPropagation(e.originalEvent);
              }
              L.DomEvent.stop(e);
            } catch {}
            return false;
          });

          // Effet de chargement circulaire au survol du cluster
          clusterGroup.on('clustermouseover', (e: any) => {
            const clusterIcon = e.layer.getElement();
            if (clusterIcon) {
              clusterIcon.style.cursor = 'pointer';
              // Ajouter un cercle de chargement autour du cluster
              const loadingRing = document.createElement('div');
              loadingRing.className = 'cluster-loading-ring';
              loadingRing.style.cssText = `
                position: absolute;
                top: -4px;
                left: -4px;
                width: calc(100% + 8px);
                height: calc(100% + 8px);
                border: 2px solid transparent;
                border-top: 2px solid #ff4444;
                border-radius: 50%;
                animation: cluster-spin 1s linear infinite;
                pointer-events: none;
                z-index: 1000;
              `;
              clusterIcon.style.position = 'relative';
              clusterIcon.appendChild(loadingRing);
            }
          });

          clusterGroup.on('clustermouseout', (e: any) => {
            const clusterIcon = e.layer.getElement();
            if (clusterIcon) {
              // Retirer le cercle de chargement
              const loadingRing = clusterIcon.querySelector('.cluster-loading-ring');
              if (loadingRing) {
                loadingRing.remove();
              }
            }
          });

          // Forcer le déploiement en branches au clic (spiderfy)
          clusterGroup.on('clusterclick', (e: any) => {
            console.log('[Cluster] Cluster click - triggering spiderfy');
            try {
              if (e?.originalEvent) {
                L.DomEvent.preventDefault(e.originalEvent);
                L.DomEvent.stopPropagation(e.originalEvent);
              }
              L.DomEvent.stop(e);
            } catch {}
            try {
              if (e?.layer?.spiderfy) {
                e.layer.spiderfy();
                console.log('[Cluster] Spiderfy executed');
              }
            } catch {}
            return false;
          });

          // Gestionnaire supplémentaire pour intercepter mousedown/mouseup
          clusterGroup.on('mousedown mouseup', (e: any) => {
            try {
              if (e?.originalEvent) {
                L.DomEvent.preventDefault(e.originalEvent);
                L.DomEvent.stopPropagation(e.originalEvent);
              }
              L.DomEvent.stop(e);
            } catch {}
            return false;
          });

          alertsClustersRef.current.set(alertRegion, clusterGroup);
          map.addLayer(clusterGroup);
        }
        const clusterGroup = alertsClustersRef.current.get(alertRegion)!;
        clusterGroup.addLayer(m);
        ensureLayerOnTop(m);
      });

      // Cleanup: retirer tous les clusters au démontage
      return () => {
        alertsClustersRef.current.forEach((clusterGroup) => {
          if (map.hasLayer(clusterGroup)) {
            map.removeLayer(clusterGroup);
          }
        });
      };
    }, [props.showAlerts, props.alerts, mapReady, alertTypeFilters]);

    // Forcer périodiquement le z-index des alertes pour maintenir la priorité
    useEffect(() => {
      const map = mapRef.current;
      if (!map || props.minimal) return;

      const enforceAlertsPriority = () => {
        ensureAlertsPaneZIndex();
      };

      // Forcer immédiatement
      enforceAlertsPriority();

      // Forcer toutes les 2 secondes pour contrer les bringToFront()
      const interval = setInterval(enforceAlertsPriority, 2000);

      return () => clearInterval(interval);
    }, [props.minimal, mapReady]);

    // Rendu des pépinières (Division Reboisement)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.nurseries && map.hasLayer(layersRef.current.nurseries)) {
        layersRef.current.nurseries.clearLayers();
        map.removeLayer(layersRef.current.nurseries);
      }
      layersRef.current.nurseries = undefined as any;

      if (!props.showNurseries || !props.nurseries || !props.nurseries.length) return;

      const group = L.layerGroup();

      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div class="marker-container">
            <svg viewBox="0 0 24 24" class="marker-icon">
              <path fill="#16a34a" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <path fill="#bbf7d0" d="M12 6c-1.66 0-3 1.57-3 3.5S10.34 13 12 13s3-1.57 3-3.5S13.66 6 12 6z"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      props.nurseries.forEach((n) => {
        const lat = Number(n.latitude);
        const lon = Number(n.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const surface = n.surfaceHa != null ? Number(n.surfaceHa) : NaN;
        const surfaceTxt = Number.isFinite(surface) && surface > 0 ? `${surface.toFixed(2)} ha` : 'N/A';
        const locationTxt = [n.commune, n.arrondissement, n.departement, n.region]
          .filter(Boolean)
          .join(', ') || 'N/A';

        const html = `
          <div class="custom-popup">
            <h3>${n.nom || 'Pépinière'}</h3>
            ${n.type ? `<div><b>Type :</b> ${n.type}</div>` : ''}
            <div><b>Surface :</b> ${surfaceTxt}</div>
            <div><b>Localisation :</b> ${locationTxt}</div>
            <div><b>Coordonnées :</b> ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
          </div>
        `;

        const m = L.marker([lat, lon], { icon });
        m.bindPopup(html, { maxWidth: 320, minWidth: 220, className: 'custom-popup-container' });
        group.addLayer(m);
      });

      if ((group as any).getLayers().length > 0) {
        group.addTo(map);
        layersRef.current.nurseries = group;
      }

      return () => {
        if (layersRef.current.nurseries && map.hasLayer(layersRef.current.nurseries)) {
          map.removeLayer(layersRef.current.nurseries);
        }
        layersRef.current.nurseries = undefined as any;
      };
    }, [props.showNurseries, props.nurseries]);

    // Rendu des zones reboisées (Division Reboisement)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.reforestationZones && map.hasLayer(layersRef.current.reforestationZones)) {
        layersRef.current.reforestationZones.clearLayers();
        map.removeLayer(layersRef.current.reforestationZones);
      }
      layersRef.current.reforestationZones = undefined as any;

      if (!props.showReforestationZones || !props.reforestationZones || !props.reforestationZones.length) return;

      const group = L.layerGroup();

      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div class="marker-container">
            <svg viewBox="0 0 24 24" class="marker-icon">
              <path fill="#15803d" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
              <path fill="#facc15" d="M9 13c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3z"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28],
      });

      props.reforestationZones.forEach((z) => {
        const lat = Number(z.latitude);
        const lon = Number(z.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

        const area = z.areaHa != null ? Number(z.areaHa) : NaN;
        const areaTxt = Number.isFinite(area) && area > 0 ? `${area.toFixed(2)} ha` : 'N/A';
        const yearTxt = z.plantingYear != null ? String(z.plantingYear) : 'N/A';
        const locationTxt = [z.commune, z.arrondissement, z.departement, z.region]
          .filter(Boolean)
          .join(', ') || 'N/A';

        const html = `
          <div class="custom-popup">
            <h3>${z.name || 'Zone reboisée'}</h3>
            <div><b>Programme :</b> ${z.program || 'N/A'}</div>
            <div><b>Espèces :</b> ${z.species || 'N/A'}</div>
            <div><b>Année de plantation :</b> ${yearTxt}</div>
            <div><b>Surface :</b> ${areaTxt}</div>
            <div><b>Localisation :</b> ${locationTxt}</div>
            <div><b>Coordonnées :</b> ${lat.toFixed(5)}, ${lon.toFixed(5)}</div>
          </div>
        `;

        const m = L.marker([lat, lon], { icon });
        m.bindPopup(html, { maxWidth: 320, minWidth: 220, className: 'custom-popup-container' });
        group.addLayer(m);
      });

      if ((group as any).getLayers().length > 0) {
        group.addTo(map);
        layersRef.current.reforestationZones = group;
      }

      return () => {
        if (layersRef.current.reforestationZones && map.hasLayer(layersRef.current.reforestationZones)) {
          map.removeLayer(layersRef.current.reforestationZones);
        }
        layersRef.current.reforestationZones = undefined as any;
      };
    }, [props.showReforestationZones, props.reforestationZones]);

    // Rendu des étiquettes d'infractions par région
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      const show = !!props.showInfractionsCounts;
      const counts = props.infractionsCountsByRegion || {};
      // Nettoyer
      if (layersRef.current.infractionsCounts && map.hasLayer(layersRef.current.infractionsCounts)) {
        map.removeLayer(layersRef.current.infractionsCounts);
      }
      layersRef.current.infractionsCounts = undefined as any;
      if (!show || !props.regionsGeoJSON || !props.regionsGeoJSON.features?.length) return;

      const layer = L.layerGroup();
      // pane dédié pour contrôle du zIndex
      const paneName = 'infractionsCountsPane';
      if (!map.getPane(paneName)) {
        map.createPane(paneName);
      }
      const pane = map.getPane(paneName)!;
      pane.style.zIndex = '850';

      const getRegionName = (props: Record<string, any>): string => {
        return (
          props?.nom || props?.NOM_REGION || props?.nom_region || props?.name || props?.region || ''
        );
      };

      // Utiliser centroïde approximatif des polygones
      const featureCenter = (geom: any): L.LatLng | null => {
        try {
          const gj = L.geoJSON({ type: 'Feature', properties: {}, geometry: geom } as any);
          const b = gj.getBounds();
          const c = b.getCenter();
          (gj as any).remove();
          return c;
        } catch { return null; }
      };

      for (const f of (props.regionsGeoJSON.features as any[])) {
        const name = String(getRegionName(f.properties) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (!name) continue;
        const count = counts[name] ?? counts[(getRegionName(f.properties) || '').trim()] ?? 0;
        if (!count || count <= 0) continue;
        const center = featureCenter(f.geometry);
        if (!center) continue;
        const html = `
          <svg width="28" height="26" viewBox="0 0 28 26" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 1px 4px rgba(0,0,0,0.25));">
            <polygon points="14,2 26,24 2,24" fill="#d97706" stroke="#ef4444" stroke-width="2" />
            <text x="14" y="18" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">${count}</text>
          </svg>`;
        const icon = L.divIcon({ html, className: 'infraction-count-label', iconSize: [28, 26] as any });
        const m = L.marker(center, { icon, pane: paneName } as any);
        // Hover blink effect (slight)
        m.on('mouseover', () => {
          const el = (m as any).getElement?.();
          if (!el) return;
          if ((el as any)._blinkTimer) return;
          (el as any)._blinkTimer = setInterval(() => {
            const cur = parseFloat(String(el.style.opacity || '1'));
            el.style.opacity = cur > 0.8 ? '0.6' : '1';
          }, 260);
        });
        m.on('mouseout', () => {
          const el = (m as any).getElement?.();
          if (!el) return;
          if ((el as any)._blinkTimer) {
            clearInterval((el as any)._blinkTimer);
            (el as any)._blinkTimer = null;
          }
          el.style.opacity = '1';
        });
        if (props.onInfractionsRegionClick) {
          const originalName = String(getRegionName(f.properties) || '').trim();
          m.on('click', () => props.onInfractionsRegionClick!(originalName));
        }
        layer.addLayer(m);
      }

      layer.addTo(map);
      layersRef.current.infractionsCounts = layer;

      return () => {
        if (layersRef.current.infractionsCounts && map.hasLayer(layersRef.current.infractionsCounts)) {
          map.removeLayer(layersRef.current.infractionsCounts);
        }
        layersRef.current.infractionsCounts = undefined as any;
      };
    }, [props.showInfractionsCounts, props.infractionsCountsByRegion, props.regionsGeoJSON, mapReady]);

    // Rendu des prélèvements (déclarations d'espèces) en tant que marqueurs avec OMS si dispo, sinon spiderfier manuel
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      const show = !!(props.showHuntingReports || (props.enableHuntingReportsToggle && reportsVisible));
      const data = (props.huntingReports && props.huntingReports.length ? props.huntingReports : internalHuntingReports) || [];

      if (layersRef.current.huntingReports) {
        layersRef.current.huntingReports.clearLayers();
      }

      // Gestion de la bannière "Aucune déclaration": ne pas l'afficher avant rendu/fitBounds pour éviter le flicker
      const showNoReportsBanner = (message: string) => {
        if (!noReportsControlRef.current) {
          const NoReportsControl = L.Control.extend({
            onAdd: () => {
              const div = L.DomUtil.create('div', 'info legend leaflet-control leaflet-bar');
              div.style.backgroundColor = 'rgba(255,255,255,0.95)';
              div.style.padding = '8px 12px';
              div.style.border = '1px solid #d1d5db';
              div.style.borderRadius = '8px';
              div.style.boxShadow = '0 1px 5px rgba(0,0,0,0.2)';
              div.style.fontSize = '13px';
              div.style.color = '#374151';
              div.innerHTML = `<strong>Aucune déclaration</strong><br/><span style=\"font-size:12px;color:#6b7280;\">${message}</span>`;
              noReportsElRef.current = div;
              L.DomEvent.disableClickPropagation(div);
              L.DomEvent.disableScrollPropagation(div);
              return div;
            },
            onRemove: function() {}
          });
          noReportsControlRef.current = new NoReportsControl({ position: 'topright' });
          noReportsControlRef.current.addTo(map);
        }
      };
      const hideNoReportsBanner = () => {
        if (noReportsControlRef.current) {
          try { (noReportsControlRef.current as any).remove(); } catch {}
          noReportsControlRef.current = null;
          noReportsElRef.current = null;
        }
      };

      let bannerTimer: any;
      const updateNoReportsBanner = () => {
        if (!show) { hideNoReportsBanner(); return; }
        const hasData = data.length > 0;
        if (!hasData) { showNoReportsBanner('Aucune déclaration disponible'); return; }
        try {
          const bounds = map.getBounds();
          const visibleCount = data.reduce((acc, r) => {
            const lat = Number((r as any).lat);
            const lon = Number((r as any).lon);
            return acc + (Number.isFinite(lat) && Number.isFinite(lon) && bounds.contains([lat, lon]) ? 1 : 0);
          }, 0);
          if (visibleCount === 0) {
            showNoReportsBanner('Aucun prélèvement visible dans la vue actuelle');
          } else {
            hideNoReportsBanner();
          }
        } catch { /* ignore */ }
      };

      if (!show || !data.length) return;

      const getHarvestIconHtml = (opts?: { badge?: number; recent?: boolean }) => {
        const badge = opts?.badge;
        const recent = !!opts?.recent;
        return `
        <div class="marker-container" style="position:relative;">
          ${recent ? '<div class="marker-blink-red"></div>' : ''}
          <!-- Cercle extérieur fin -->
          <div style="position:absolute; width:30px; height:30px; border-radius:9999px; border:2px solid rgba(16,185,129,0.7);"></div>
          <svg viewBox="0 0 24 24" class="marker-icon" width="28" height="28">
            <!-- Disque vert émeraude -->
            <circle cx="12" cy="12" r="11" fill="#10B981"/>
            <!-- Réticule blanc -->
            <circle cx="12" cy="12" r="3" fill="none" stroke="#FFFFFF" stroke-width="2"/>
            <line x1="12" y1="3" x2="12" y2="7" stroke="#FFFFFF" stroke-width="2"/>
            <line x1="12" y1="17" x2="12" y2="21" stroke="#FFFFFF" stroke-width="2"/>
            <line x1="3" y1="12" x2="7" y2="12" stroke="#FFFFFF" stroke-width="2"/>
            <line x1="17" y1="12" x2="21" y2="12" stroke="#FFFFFF" stroke-width="2"/>
          </svg>
          ${badge && badge > 1 ? `<div style="position:absolute; top:-6px; right:-6px; background:#065f46; color:#fff; font-size:10px; padding:2px 5px; border-radius:9999px; border:1px solid #ecfdf5;">${badge}</div>` : ''}
        </div>`;
      };

      const buildCenterIcon = (count: number, recent: boolean) => L.divIcon({
        className: 'custom-marker',
        html: getHarvestIconHtml({ badge: count, recent }),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -18],
      });

      const makeReportIcon = (recent: boolean) => L.divIcon({
        className: 'custom-marker',
        html: getHarvestIconHtml({ recent }),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        popupAnchor: [0, -18],
      });

      // Type des éléments de prélèvement utilisés pour les popups
      type ReportItem = NonNullable<typeof props.huntingReports>[number];

      const mkPopup = (r: ReportItem, lat: number, lon: number) => {
        const role = (props.userRole || '').toLowerCase();
        const isHunter = role === 'hunter' || role === 'hunting-guide';
        const species = (r.species || '').toString();
        const scientificName = ((r as any).scientificName || '').toString();
        const qty = (r.quantity ?? '').toString();
        const iso = (r.date || '').toString();
        const dt = iso ? new Date(iso) : null;
        const heure = dt ? dt.toLocaleTimeString() : '';
        const dateStr = dt ? dt.toLocaleDateString() : '';
        const commune = r.commune || '';
        const permit = r.permitNumber || '';
        const niceCoords = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        const photoHtml = r.photoUrl ? `<div style="margin-top:8px;"><img src="${r.photoUrl}" alt="photo" style="max-width:160px; height:auto; border-radius:6px; border:1px solid #e5e7eb; display:block;"/></div>` : '';

        if (isHunter) {
          // Version simplifiée pour chasseur/guide
          return `
            <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';">
              <div style="font-weight:700; font-size:14px; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
                <span>Prélèvement</span>
                ${heure ? `<span style="color:#065f46; font-weight:600;">• ${heure}</span>` : ''}
              </div>
              <div><strong>Espèce:</strong> ${species || '-'}</div>
              <div><strong>Quantité:</strong> ${qty || '-'}${dateStr ? ` — <strong>Date:</strong> <span style="color:#dc2626;">${dateStr}</span>` : ''}</div>
              ${photoHtml}
            </div>
          `;
        }

        // Version Agents/Admins: Nom, Photo, Quantité, Commune, N° pièce (permis), Heure (dans le titre), GPS
        return `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';">
            <div style="font-weight:700; font-size:14px; margin-bottom:6px; display:flex; align-items:center; gap:8px;">
              <span>Prélèvement</span>
              ${heure ? `<span style=\"color:#065f46; font-weight:600;\">• ${heure}</span>` : ''}
            </div>
            <div><strong>Espèce:</strong> ${species || '-'}</div>
            ${scientificName ? `<div style="color:#6b7280; margin-top:2px; font-style:italic;">${scientificName}</div>` : ''}
            ${photoHtml}
            <div><strong>Quantité:</strong> ${qty || '-'}${dateStr ? ` — <strong>Date:</strong> <span style="color:#dc2626;">${dateStr}</span>` : ''}</div>
            <div><strong>Commune:</strong> ${commune || '-'}</div>
            <div><strong>Numéro de permis:</strong> ${permit || '-'}</div>
            <div><strong>GPS:</strong> ${niceCoords}</div>
          </div>
        `;
      };

      (async () => {
        // ...
        // Tenter d'utiliser OverlappingMarkerSpiderfier
        try {
          // @ts-ignore - import dynamique sans types
          const mod = await import('overlapping-marker-spiderfier-leaflet');
          const OMS = (mod as any).default || (mod as any).OverlappingMarkerSpiderfier || (mod as any);
          if (OMS && typeof OMS === 'function') {
            const oms = new OMS(map, {
              keepSpiderfied: true,
              nearbyDistance: 40, // ~40m
              circleSpiralSwitchover: 9,
              legWeight: 4,
              legColors: { usual: '#059669', highlighted: '#047857' },
            });

            const latlngs: L.LatLng[] = [];
            const now = Date.now();
            data.forEach((r) => {
              const lat = Number(r.lat);
              const lon = Number(r.lon);
              if (!isFinite(lat) || !isFinite(lon)) return;
              const t = r.date ? new Date(String(r.date)).getTime() : 0;
              const recent = !!t && (now - t) <= 2 * 60 * 60 * 1000; // 2h
              const marker = L.marker([lat, lon], { icon: makeReportIcon(recent), pane: 'huntingReportsPane' as any });
              marker.bindPopup(mkPopup(r, lat, lon), { maxWidth: 320, minWidth: 220, className: 'custom-popup-container' });
              layersRef.current.huntingReports!.addLayer(marker);
              oms.addMarker(marker);
              latlngs.push(L.latLng(lat, lon));
            });

            // Ouvrir popup et zoomer au clic
            oms.addListener('click', function(marker: L.Marker) {
              try { map.setView((marker as any).getLatLng(), 16, { animate: true }); } catch {}
              marker.openPopup();
            });
            // Fit bounds sur l'ensemble des points
            if (latlngs.length > 0) {
              const bounds = L.latLngBounds(latlngs);
              map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
              // La vue s'est ajustée, retirer la bannière si elle était affichée
              if (noReportsControlRef.current) {
                try { (noReportsControlRef.current as any).remove(); } catch {}
                noReportsControlRef.current = null;
                noReportsElRef.current = null;
              }
            }
            // Recalcul après rendu
            bannerTimer = setTimeout(() => updateNoReportsBanner(), 50);
            map.once('moveend', updateNoReportsBanner);
            return; // Utilisation OMS réussie, on sort sans fallback
          }
        } catch (e) {
          console.warn('OMS non disponible, fallback sur spiderfier manuel.', e);
        }

        // Fallback: spiderfier manuel (groupe par proximité)
        const distanceMeters = (a: L.LatLng, b: L.LatLng) => a.distanceTo(b);
        const THRESHOLD_M = 40;
        const groups: Array<{ center: L.LatLng; items: ReportItem[] }> = [];
        data.forEach((r) => {
          const lat = Number(r.lat);
          const lon = Number(r.lon);
          if (!isFinite(lat) || !isFinite(lon)) return;
          const pt = L.latLng(lat, lon);
          let found = false;
          for (const g of groups) {
            if (distanceMeters(g.center, pt) <= THRESHOLD_M) { g.items.push(r); found = true; break; }
          }
          if (!found) { groups.push({ center: pt, items: [r] }); }
        });

        const latlngs: L.LatLng[] = [];
        const now = Date.now();
        groups.forEach(({ center, items }) => {
          if (!items.length) return;
          const first = items[0];
          const anyRecent = items.some((it) => {
            const t = it.date ? new Date(String(it.date)).getTime() : 0;
            return !!t && (now - t) <= 2 * 60 * 60 * 1000;
          });
          const centerMarker = L.marker(center, { icon: buildCenterIcon(items.length, anyRecent), pane: 'huntingReportsPane' as any });
          centerMarker.bindPopup(mkPopup(first, center.lat, center.lng), { maxWidth: 320, minWidth: 220, className: 'custom-popup-container' });
          latlngs.push(center);
          const branchMarkers: L.Marker[] = [];
          const branchLines: L.Polyline[] = [];
          const n = items.length - 1;
          if (n > 0) {
            const radiusDeg = 0.0012; // plus d'espacement pour mieux voir les branches
            const angleStep = (2 * Math.PI) / n;
            for (let i = 0; i < n; i++) {
              const angle = i * angleStep;
              const lat = center.lat + radiusDeg * Math.sin(angle);
              const lon = center.lng + radiusDeg * Math.cos(angle);
              const item = items[i + 1];
              const t = item.date ? new Date(String(item.date)).getTime() : 0;
              const recent = !!t && (now - t) <= 2 * 60 * 60 * 1000;
              const m = L.marker([lat, lon], { icon: makeReportIcon(recent), pane: 'huntingReportsPane' as any });
              m.bindPopup(mkPopup(item, lat, lon), { maxWidth: 320, minWidth: 220, className: 'custom-popup-container' });
              const line = L.polyline([[center.lat, center.lng], [lat, lon]], { color: '#059669', weight: 4, opacity: 1, pane: 'huntingReportsPane' as any });
              branchMarkers.push(m);
              branchLines.push(line);
              latlngs.push(L.latLng(lat, lon));
            }
          }
          let expanded = false;
          const addBranches = () => { if (expanded) return; branchLines.forEach(l => layersRef.current.huntingReports!.addLayer(l)); branchMarkers.forEach(m => { try { (m as any).setZIndexOffset?.(1000); } catch {} layersRef.current.huntingReports!.addLayer(m); }); expanded = true; };
          const removeBranches = () => { if (!expanded) return; branchLines.forEach(l => layersRef.current.huntingReports!.removeLayer(l)); branchMarkers.forEach(m => layersRef.current.huntingReports!.removeLayer(m)); expanded = false; };
          centerMarker.on('click', () => {
            // Zoomer sur la zone, déployer les branches et ouvrir la popup du premier prélèvement
            try { map.setView(center, 16, { animate: true }); } catch {}
            if (!expanded) addBranches(); else addBranches();
            centerMarker.openPopup();
          });
          map.on('zoomstart movestart', removeBranches);
          layersRef.current.huntingReports!.addLayer(centerMarker);
          if (branchMarkers.length > 0) { addBranches(); }
        });
        if (latlngs.length > 0) {
          const bounds = L.latLngBounds(latlngs);
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
          // La vue s'est ajustée, retirer la bannière si elle était affichée
          if (noReportsControlRef.current) {
            try { (noReportsControlRef.current as any).remove(); } catch {}
            noReportsControlRef.current = null;
            noReportsElRef.current = null;
          }
        }
        // Recalcul après rendu
        bannerTimer = setTimeout(() => updateNoReportsBanner(), 50);
        map.once('moveend', updateNoReportsBanner);
      })();

      // Cleanup: timer et listener
      return () => {
        try { if (bannerTimer) clearTimeout(bannerTimer); } catch {}
        try { map.off('moveend', updateNoReportsBanner as any); } catch {}
      };
    }, [props.showHuntingReports, props.huntingReports, internalHuntingReports, reportsVisible, props.userRole]);

    const updateTotalAlertsControl = () => {
      if (!totalAlertsElRef.current) return;
      const progressText = computeProgressText(loadProgress);
      totalAlertsElRef.current.innerHTML = `
        <span class="map-total-alerts-progress" style="color:#0f766e;font-weight:600;white-space:nowrap;${progressText ? '' : 'display:none;'}">
          ${progressText}
        </span>
        <span class="map-total-alerts-count" style="white-space:nowrap;">
          <strong>SCoDi_00491/</strong>
        </span>
      `;
    };

    useEffect(() => {
      updateTotalAlertsControl();
    }, [props.alerts, loadProgress]);

    useEffect(() => {
      if (mapRef.current && regionsGeoJSON && mapRef.current.getContainer()) {
        const map = mapRef.current;
        const container = map.getContainer();
        if (!container || !document.body.contains(container)) {
          console.warn('Map container DOM absent, skip regions add/remove');
          return;
        }
        if (layersRef.current.regions) {
          map.removeLayer(layersRef.current.regions);
          layersRef.current.regions = undefined;
        }
        if (showRegions) {
          // Filtrer les features strictement valides
          const validFeatures = regionsGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && f.geometry.type
          );
          console.log('Régions features valides:', validFeatures.length, validFeatures);
          if (validFeatures.length > 0) {
            const geoJsonData = { ...regionsGeoJSON, features: validFeatures };

            // Ensure regions pane exists (below departements)
            if (!map.getPane('regionsPane')) {
              map.createPane('regionsPane');
              const paneEl = map.getPane('regionsPane');
              if (paneEl) paneEl.style.zIndex = '400';
            }

            layersRef.current.regions = L.geoJSON(geoJsonData, {
              style: getRegionStyle,
              onEachFeature: onEachRegionFeature,
              pane: 'regionsPane',
            }).addTo(map);

            // Assurer la visibilité: cadrer sur les régions chargées
            try {
              const b = layersRef.current.regions.getBounds();
              if (b && b.isValid()) {
                map.fitBounds(b, { padding: [30, 30] });
              }
            } catch (e) {
              console.warn('[REGIONS] fitBounds failed:', e);
            }

            // Diagnostics: liste des régions sans correspondance de statut
            try {
              const statuses = regionStatuses || {};
              const statusKeys = Object.keys(statuses);
              const normalizedStatusKeys = new Set(statusKeys.map(k => normalizeRegionName(k)));
              const unmatched: string[] = [];
              validFeatures.forEach((f: any) => {
                const p: any = f.properties || {};
                const name: string | undefined = p?.nom || p?.NOM_REGION;
                if (!name) { unmatched.push('(sans nom)'); return; }
                const norm = normalizeRegionName(name);
                if (!normalizedStatusKeys.has(norm)) unmatched.push(name);
              });
              if (unmatched.length) {
                console.warn('[REGIONS][DIAG] Noms de régions sans statut correspondant:', unmatched);
              }
            } catch (e) {
              console.warn('[REGIONS][DIAG] Échec du diagnostic des correspondances de statut:', e);
            }
          }
        }
      }
    }, [showRegions, regionsGeoJSON, regionStatuses, props.colorizeRegionsByStatus]);

    useEffect(() => {
      if (mapRef.current && departementsGeoJSON && mapRef.current.getContainer()) {
        const map = mapRef.current;
        const container = map.getContainer();
        console.log('[DEBUG] mapRef.current:', map);
        console.log('[DEBUG] mapRef.current.getContainer():', container);
        console.log('[DEBUG] container in DOM:', !!container && document.body.contains(container));
        if (!container || !document.body.contains(container)) {
          console.warn('Map container DOM absent, skip departements add/remove');
          return;
        }
        // Remove existing layer if any
        if (layersRef.current.departements) {
          map.removeLayer(layersRef.current.departements);
          layersRef.current.departements = undefined;
        }

        // Add layer if toggled on and data present
        if (showDepartements) {
          const validFeatures = departementsGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && f.geometry.type
          );
          if (validFeatures.length > 0) {
            const geoJsonData = { ...departementsGeoJSON, features: validFeatures };

            // Ensure pane exists
            if (!map.getPane('departementsPane')) {
              map.createPane('departementsPane');
              const paneEl = map.getPane('departementsPane');
              if (paneEl) paneEl.style.zIndex = '610'; // toujours au-dessus des régions (400)
            }

            try {
              const statusColor = (s?: string): string | undefined => {
                switch ((s || '').toLowerCase()) {
                  case 'open':
                  case 'ouverte':
                    return '#34D399'; // vert
                  case 'partial':
                  case 'partielle':
                  case 'partiellement ouverte':
                    return '#FBBF24'; // jaune
                  case 'closed':
                  case 'fermee':
                  case 'fermée':
                    return '#EF4444'; // rouge
                  default:
                    return undefined; // inconnu -> laisser fallback
                }
              };

              layersRef.current.departements = L.geoJSON(geoJsonData, {
                style: (feature) => {
                  const p: any = feature?.properties || {};
                  // Si le bouton Statuts est OFF, neutraliser la coloration (fond quasi transparent)
                  if (!props.colorizeRegionsByStatus) {
                    return {
                      color: '#334155',
                      weight: 2,
                      opacity: 1,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                    };
                  }
                  // Sinon, appliquer la couleur par statut/couleur du département exclusivement
                  const fill: string | undefined = p.color || p.couleur || statusColor(p.statut || p.status || p.statut_chasse || p.statuts_chasse);
                  // Si pas d'info de statut/couleur au niveau du département, pas de remplissage
                  if (!fill) {
                    return {
                      color: '#334155',
                      weight: 2,
                      opacity: 1,
                      fillColor: 'transparent',
                      fillOpacity: 0,
                    };
                  }
                  return {
                    color: '#334155',
                    weight: 2,
                    opacity: 1,
                    fillColor: fill,
                    fillOpacity: 0.6, // couleurs pleines (non transparentes) pour les départements
                  };
                },
                pane: 'departementsPane',
                onEachFeature: (feature, layer) => {
                  const p: any = feature.properties || {};
                  const name = p.nom_dep || p.nom || p.name;
                  if (!props.colorizeRegionsByStatus) {
                    const content = name ? `<div style="background:#d1fae5;padding:6px 8px;border-radius:6px;"><b>${name}</b></div>` : '';
                    if (content) (layer as any).bindPopup(content);
                  } else {
                    const s = (p.statut || p.status || p.statut_chasse || p.statuts_chasse || '').toString();
                    const label = s.toLowerCase() === 'open' ? 'Ouvert'
                      : s.toLowerCase() === 'partial' ? 'Partiel'
                      : s.toLowerCase() === 'closed' ? 'Fermé'
                      : s || '';
                    const lines = [name ? `<b>${name}</b>` : '', label ? `<div>Statut: ${label}</div>` : ''].filter(Boolean).join('');
                    if (lines) (layer as any).bindPopup(lines);
                  }

                  // Interactions comme pour les régions: survol + clic
                  layer.on({
                    mouseover: (e: any) => {
                      const l = e.target;
                      l.setStyle({
                        weight: 3,
                        color: '#111827',
                        fillOpacity: 0.65
                      });
                      if ((l as any).bringToFront) (l as any).bringToFront();
                      ensureAlertsPaneZIndex();
                    },
                    mouseout: (e: any) => {
                      // Préserver la sélection en mode statut OFF
                      if (!props.colorizeRegionsByStatus && selectedDepartementLayerRef.current === e.target) {
                        return;
                      }
                      layersRef.current.departements?.resetStyle(e.target);
                    },
                    click: (e: any) => {
                      const map = mapRef.current;
                      if (map && (e.target as any).getBounds) {
                        map.fitBounds((e.target as any).getBounds());
                      }
                      // Surlignage jaune persistant quand contrôle statut OFF
                      if (!props.colorizeRegionsByStatus) {
                        // Toggle: re-click to deselect
                        if (selectedDepartementLayerRef.current === (e.target as any)) {
                          if (layersRef.current.departements) {
                            try { (layersRef.current.departements as any).resetStyle(selectedDepartementLayerRef.current as any); } catch {}
                          }
                          selectedDepartementLayerRef.current = null;
                        } else {
                          if (selectedDepartementLayerRef.current && layersRef.current.departements) {
                            try { (layersRef.current.departements as any).resetStyle(selectedDepartementLayerRef.current as any); } catch {}
                          }
                          selectedDepartementLayerRef.current = e.target as any;
                          (e.target as any).setStyle({ color: '#FFD700', weight: 3 });
                          if ((e.target as any).bringToFront) (e.target as any).bringToFront();
                          // Forcer les alertes à rester prioritaires après bringToFront
                          ensureAlertsPaneZIndex();
                        }
                      }
                    }
                  });
                }
              }).addTo(map);

              // Assurer la visibilité: cadrer sur les départements chargés si couche activée
              try {
                const b = layersRef.current.departements.getBounds();
                if (b && b.isValid()) {
                  map.fitBounds(b, { padding: [30, 30] });
                }
              } catch (e) {
                console.warn('[DEPARTEMENTS] fitBounds failed:', e);
              }
            } catch (e) {
              console.error('[DEBUG] Erreur lors de addTo(map) pour departements:', e);
            }
          }
        }
      }
    }, [departementsGeoJSON, showDepartements, props.colorizeRegionsByStatus]);

    // Communes layer from props/toggle
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.communes) {
        map.removeLayer(layersRef.current.communes);
        layersRef.current.communes = undefined;
      }
      selectedCommuneLayerRef.current = null;

      if (!showCommunes || !communesGeoJSON || !Array.isArray(communesGeoJSON.features) || communesGeoJSON.features.length === 0) {
        return;
      }

      if (!map.getPane('communesPane')) {
        map.createPane('communesPane');
        const paneEl = map.getPane('communesPane');
        if (paneEl) paneEl.style.zIndex = '615';
      }

      const statusColor = (statusRaw: any): string | undefined => {
        const val = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : statusRaw;
        if (val === true || val === 'open' || val === 'ouverte') return '#34D399';
        if (val === false || val === 'closed' || val === 'fermee' || val === 'fermée') return '#EF4444';
        if (val === 'partial' || val === 'partielle' || val === 'partiellement ouverte') return '#FBBF24';
        return undefined;
      };

      const geoJsonData: GeoJSON.FeatureCollection = {
        ...communesGeoJSON,
        features: communesGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && (f.geometry as any).type)
      } as any;

      const layer = L.geoJSON(geoJsonData as any, {
        pane: 'communesPane' as any,
        style: (feature: GeoJSON.Feature) => {
          const p: any = feature?.properties || {};
          if (!colorizeRegionsByStatus) {
            return {
              color: '#475569',
              weight: 1.3,
              opacity: 1,
              fillColor: '#cbd5f5',
              fillOpacity: 0.25,
            };
          }
          const color = p.color || p.couleur || statusColor(p.statut ?? p.status ?? p.statut_chasse ?? p.statuts_chasse);
          if (!color) {
            return {
              color: '#475569',
              weight: 1.5,
              opacity: 1,
              fillColor: 'transparent',
              fillOpacity: 0,
            };
          }
          return {
            color: '#1f2937',
            weight: 1.5,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.55,
          };
        },
        onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => {
          const p: any = feature?.properties || {};
          const name = p.nom || p.name || p.libelle || p.commune || p.code || 'Commune';
          const statusRaw = p.statut ?? p.status ?? p.statut_chasse ?? p.statuts_chasse;
          const statusLabel = (() => {
            if (statusRaw === true) return 'Ouverte';
            if (statusRaw === false) return 'Fermée';
            const val = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : '';
            if (val === 'open' || val === 'ouverte') return 'Ouverte';
            if (val === 'closed' || val === 'fermee' || val === 'fermée') return 'Fermée';
            if (val === 'partial' || val === 'partielle') return 'Partielle';
            return statusRaw ?? '';
          })();

          if (!colorizeRegionsByStatus) {
            const content = `<div style="padding:6px 8px;">${name ? `<div style="font-weight:600;">${name}</div>` : ''}</div>`;
            if (content) (layer as any).bindPopup(content);
          } else {
            const html = `
              <div style="font-weight:600;">${name}</div>
              ${statusLabel ? `<div style="font-size:12px;color:#374151;">Statut: ${statusLabel}</div>` : ''}
            `;
            (layer as any).bindPopup(html);
          }

          layer.on({
            mouseover: (e: any) => {
              const l = e.target;
              l.setStyle({ weight: 2.2, color: '#1d4ed8', fillOpacity: Math.max(0.6, (l.options.fillOpacity ?? 0.4)) });
              if ((l as any).bringToFront) (l as any).bringToFront();
              ensureAlertsPaneZIndex();
            },
            mouseout: (e: any) => {
              if (!colorizeRegionsByStatus && selectedCommuneLayerRef.current === e.target) {
                return;
              }
              layersRef.current.communes?.resetStyle(e.target);
            },
            click: (e: any) => {
              if ((e.target as any).getBounds) {
                try { map.fitBounds((e.target as any).getBounds()); } catch {}
              }
              if (!colorizeRegionsByStatus) {
                if (selectedCommuneLayerRef.current === (e.target as any)) {
                  if (layersRef.current.communes) {
                    try { (layersRef.current.communes as any).resetStyle(selectedCommuneLayerRef.current as any); } catch {}
                  }
                  selectedCommuneLayerRef.current = null;
                } else {
                  if (selectedCommuneLayerRef.current && layersRef.current.communes) {
                    try { (layersRef.current.communes as any).resetStyle(selectedCommuneLayerRef.current as any); } catch {}
                  }
                  selectedCommuneLayerRef.current = e.target as any;
                  (e.target as any).setStyle({ color: '#f59e0b', weight: 2.4 });
                  if ((e.target as any).bringToFront) (e.target as any).bringToFront();
                  ensureAlertsPaneZIndex();
                }
              }
            }
          });
        }
      } as any);

      layersRef.current.communes = layer as any;
      layer.addTo(map);
      try {
        const bounds = (layer as any).getBounds?.();
        if (bounds && bounds.isValid && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
        }
      } catch (error) {
        console.warn('[MapComponent] fitBounds communes failed:', error);
      }
    }, [communesGeoJSON, showCommunes, colorizeRegionsByStatus]);

    // Arrondissements layer from props/toggle
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.arrondissements) {
        map.removeLayer(layersRef.current.arrondissements);
        layersRef.current.arrondissements = undefined;
      }
      selectedArrondissementLayerRef.current = null;

      if (!showArrondissements || !arrondissementsGeoJSON || !Array.isArray(arrondissementsGeoJSON.features) || arrondissementsGeoJSON.features.length === 0) {
        return;
      }

      if (!map.getPane('arrondissementsPane')) {
        map.createPane('arrondissementsPane');
        const paneEl = map.getPane('arrondissementsPane');
        if (paneEl) paneEl.style.zIndex = '618';
      }

      const statusColor = (statusRaw: any): string | undefined => {
        const val = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : statusRaw;
        if (val === 'open' || val === 'ouverte') return '#4ade80';
        if (val === 'closed' || val === 'fermee' || val === 'fermée') return '#f87171';
        if (val === 'partial' || val === 'partielle') return '#facc15';
        return undefined;
      };

      const geoJsonData: GeoJSON.FeatureCollection = {
        ...arrondissementsGeoJSON,
        features: arrondissementsGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && (f.geometry as any).type)
      } as any;

      const layer = L.geoJSON(geoJsonData as any, {
        pane: 'arrondissementsPane' as any,
        style: (feature: GeoJSON.Feature) => {
          const p: any = feature?.properties || {};
          if (!colorizeRegionsByStatus) {
            return {
              color: '#0f172a',
              weight: 1.4,
              opacity: 1,
              fillColor: '#fde68a',
              fillOpacity: 0.22,
              dashArray: '4 3'
            };
          }
          const color = p.color || p.couleur || statusColor(p.statut ?? p.status ?? p.statut_chasse ?? p.statuts_chasse);
          if (!color) {
            return {
              color: '#0f172a',
              weight: 1.4,
              opacity: 1,
              fillColor: 'transparent',
              fillOpacity: 0,
              dashArray: '4 3'
            };
          }
          return {
            color: '#111827',
            weight: 1.4,
            opacity: 1,
            fillColor: color,
            fillOpacity: 0.5,
            dashArray: '4 3'
          };
        },
        onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer) => {
          const p: any = feature?.properties || {};
          const name = p.nom || p.name || p.libelle || p.arrondissement || p.code || 'Arrondissement';
          const statusRaw = p.statut ?? p.status ?? p.statut_chasse ?? p.statuts_chasse;
          const statusLabel = (() => {
            if (!statusRaw && statusRaw !== false) return '';
            const val = typeof statusRaw === 'string' ? statusRaw.toLowerCase() : statusRaw;
            if (val === 'open' || val === 'ouverte') return 'Ouvert';
            if (val === 'closed' || val === 'fermee' || val === 'fermée') return 'Fermé';
            if (val === 'partial' || val === 'partielle') return 'Partiel';
            return statusRaw ?? '';
          })();

          const html = colorizeRegionsByStatus
            ? `
              <div style="font-weight:600;">${name}</div>
              ${statusLabel ? `<div style="font-size:12px;color:#374151;">Statut: ${statusLabel}</div>` : ''}
            `
            : `<div style="padding:6px 8px;"><div style="font-weight:600;">${name}</div></div>`;
          (layer as any).bindPopup(html);

          layer.on({
            mouseover: (e: any) => {
              const l = e.target;
              l.setStyle({ weight: 2, color: '#2563eb', fillOpacity: Math.max(0.6, (l.options.fillOpacity ?? 0.4)) });
              if ((l as any).bringToFront) (l as any).bringToFront();
              ensureAlertsPaneZIndex();
            },
            mouseout: (e: any) => {
              if (!colorizeRegionsByStatus && selectedArrondissementLayerRef.current === e.target) {
                return;
              }
              layersRef.current.arrondissements?.resetStyle(e.target);
            },
            click: (e: any) => {
              if ((e.target as any).getBounds) {
                try { map.fitBounds((e.target as any).getBounds()); } catch {}
              }
              if (!colorizeRegionsByStatus) {
                if (selectedArrondissementLayerRef.current === (e.target as any)) {
                  if (layersRef.current.arrondissements) {
                    try { (layersRef.current.arrondissements as any).resetStyle(selectedArrondissementLayerRef.current as any); } catch {}
                  }
                  selectedArrondissementLayerRef.current = null;
                } else {
                  if (selectedArrondissementLayerRef.current && layersRef.current.arrondissements) {
                    try { (layersRef.current.arrondissements as any).resetStyle(selectedArrondissementLayerRef.current as any); } catch {}
                  }
                  selectedArrondissementLayerRef.current = e.target as any;
                  (e.target as any).setStyle({ color: '#a855f7', weight: 2.1 });
                  if ((e.target as any).bringToFront) (e.target as any).bringToFront();
                  ensureAlertsPaneZIndex();
                }
              }
            }
          });
        }
      } as any);

      layersRef.current.arrondissements = layer as any;
      layer.addTo(map);
      try {
        const bounds = (layer as any).getBounds?.();
        if (bounds && bounds.isValid && bounds.isValid()) {
          map.fitBounds(bounds, { padding: [24, 24], maxZoom: 11 });
        }
      } catch (error) {
        console.warn('[MapComponent] fitBounds arrondissements failed:', error);
      }
    }, [arrondissementsGeoJSON, showArrondissements, colorizeRegionsByStatus]);

    // Eco-zones layer from props/toggle
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.ecoZones) {
        map.removeLayer(layersRef.current.ecoZones);
        layersRef.current.ecoZones = undefined;
      }

      if (props.showEcoZones && props.ecoZonesGeoJSON && props.ecoZonesGeoJSON.features) {
        const valid = props.ecoZonesGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && f.geometry.type
        );
        if (valid.length > 0) {
          if (!map.getPane('ecoZonesPane')) {
            map.createPane('ecoZonesPane');
            const paneEl = map.getPane('ecoZonesPane');
            if (paneEl) paneEl.style.zIndex = '415';
          }
          const data = { ...props.ecoZonesGeoJSON, features: valid } as GeoJSON.FeatureCollection;
          try {
            // Variable pour stocker la couche sélectionnée
            let selectedLayer: any = null;

            layersRef.current.ecoZones = L.geoJSON(data, {
              style: () => ({
                color: '#2E7D32',
                weight: 1,
                fillOpacity: 0.25,
                fillColor: '#2E7D32'
              }),
              pane: 'ecoZonesPane',
              onEachFeature: (feature, layer) => {
                const p: any = feature.properties || {};
                const name = p.nom || p.name || p.NAME;
                if (name) (layer as any).bindPopup(String(name));

                // Ajouter l'effet de sélection au clic
                layer.on('click', function(e: any) {
                  // Réinitialiser le style de la couche précédemment sélectionnée
                  if (selectedLayer && selectedLayer !== e.target) {
                    selectedLayer.setStyle({
                      fillColor: '#2E7D32',
                      fillOpacity: 0.25,
                      color: '#2E7D32',
                      weight: 1
                    });
                  }

                  // Appliquer le style de sélection (jaune transparent)
                  e.target.setStyle({
                    fillColor: '#FFFF00',  // Jaune
                    fillOpacity: 0.5,       // Transparent (50%)
                    color: '#FFD700',       // Contour jaune doré
                    weight: 3               // Contour plus épais
                  });

                  // Forcer les alertes à rester prioritaires après sélection
                  if (map) {
                    const alertsPane = map.getPane('alertsPane');
                    if (alertsPane) alertsPane.style.zIndex = '800';
                  }

                  // Mettre à jour la référence de la couche sélectionnée
                  selectedLayer = e.target;

                  // Empêcher la propagation du clic à la carte
                  L.DomEvent.stopPropagation(e);
                });

                // Réinitialiser au survol (optionnel)
                layer.on('mouseover', function(e: any) {
                  if (e.target !== selectedLayer) {
                    e.target.setStyle({
                      fillOpacity: 0.4,
                      weight: 2
                    });
                  }
                });

                layer.on('mouseout', function(e: any) {
                  if (e.target !== selectedLayer) {
                    e.target.setStyle({
                      fillOpacity: 0.25,
                      weight: 1
                    });
                  }
                });
              }
            }).addTo(map);
          } catch (e) {
            console.error('[DEBUG] EcoZones: Error adding layer:', e);
          }
        }
      }
    }, [props.ecoZonesGeoJSON, props.showEcoZones]);

    // Protected zones layer (Forêts)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.protectedZones) {
        map.removeLayer(layersRef.current.protectedZones);
        layersRef.current.protectedZones = undefined;
      }

      if (props.showProtectedZones && props.protectedZonesGeoJSON && props.protectedZonesGeoJSON.features) {
        const valid = props.protectedZonesGeoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && f.geometry.type
        );
        if (valid.length > 0) {
          if (!map.getPane('protectedZonesPane')) {
            map.createPane('protectedZonesPane');
            const paneEl = map.getPane('protectedZonesPane');
            // Above regions (600), departements (610), ecoZones (415/620), but below amodiees/zics (630)
            if (paneEl) paneEl.style.zIndex = '625';
          }
          const data = { ...props.protectedZonesGeoJSON, features: valid } as GeoJSON.FeatureCollection;
          try {
            layersRef.current.protectedZones = L.geoJSON(data, {
              style: () => ({ color: '#065f46', weight: 1, fillOpacity: 0.2 }),
              pane: 'protectedZonesPane',
              onEachFeature: (feature, layer) => {
                const p: any = feature.properties || {};
                const html = `
                  <div>
                    <strong>Zone protégée</strong><br/>
                    ${p.name ? `Nom: ${p.name}<br/>` : ''}
                    ${p.type ? `Type: ${p.type}<br/>` : ''}
                    ${p.surface_ha ? `Surface (ha): ${p.surface_ha}<br/>` : ''}
                    ${p.perimetre_m ? `Périmètre (m): ${p.perimetre_m}<br/>` : ''}
                  </div>`;
                (layer as any).bindPopup(html);
              }
            }).addTo(map);
          } catch (e) {
            console.error('[DEBUG] ProtectedZones: Error adding layer:', e);
          }
        }
      }
    }, [protectedZonesGeoJSON, showProtectedZones]);

    // Helper pour rendre les zones protégées par type
    const renderProtectedZoneType = (
      layerKey: string,
      geoJSON: GeoJSON.FeatureCollection | null | undefined,
      show: boolean,
      color: string,
      zIndex: string,
      typeLabel: string,
      borderColor?: string // Couleur du contour optionnelle
    ) => {
      const map = mapRef.current;
      if (!map) return;

      // Nettoyer la couche existante
      if ((layersRef.current as any)[layerKey]) {
        map.removeLayer((layersRef.current as any)[layerKey]);
        (layersRef.current as any)[layerKey] = undefined;
      }

      if (show && geoJSON && geoJSON.features) {
        const valid = geoJSON.features.filter((f: any) => f.geometry && typeof f.geometry === 'object' && f.geometry.type
        );
        if (valid.length > 0) {
          const paneName = `${layerKey}Pane`;
          if (!map.getPane(paneName)) {
            map.createPane(paneName);
            const paneEl = map.getPane(paneName);
            if (paneEl) paneEl.style.zIndex = zIndex;
          }
          const data = { ...geoJSON, features: valid } as GeoJSON.FeatureCollection;
          try {
            (layersRef.current as any)[layerKey] = L.geoJSON(data, {
              style: () => ({
                color: borderColor || color, // Utiliser borderColor si fourni, sinon color
                weight: 3, // Augmenté à 3 pour meilleure visibilité
                fillColor: color, // Couleur de remplissage
                fillOpacity: 0.3
              }),
              pane: paneName,
              onEachFeature: (feature, layer) => {
                const p: any = feature.properties || {};
                const html = `
                  <div>
                    <strong>${typeLabel}</strong><br/>
                    ${p.name ? `Nom: ${p.name}<br/>` : ''}
                    ${p.type ? `Type: ${p.type}<br/>` : ''}
                    ${p.surface_ha ? `Surface (ha): ${p.surface_ha}<br/>` : ''}
                    ${p.perimetre_m ? `Périmètre (m): ${p.perimetre_m}<br/>` : ''}
                  </div>`;
                (layer as any).bindPopup(html);
              }
            }).addTo(map);
          } catch (e) {
            console.error(`[DEBUG] ${layerKey}: Error adding layer:`, e);
          }
        }
      }
    };

    // Rendu Forêt classée
    useEffect(() => {
      renderProtectedZoneType(
        'foretClassee',
        foretClasseeGeoJSON,
        showForetClassee || false,
        '#22c55e', // vert moyen comme dans l'image
        '626',
        'Forêt classée'
      );
    }, [foretClasseeGeoJSON, showForetClassee]);

    // Rendu Réserve
    useEffect(() => {
      renderProtectedZoneType(
        'reserve',
        reserveGeoJSON,
        showReserve || false,
        '#16a34a', // vert moyen-clair comme dans l'image
        '627',
        'Réserve',
        '#FFFFFF' // Contour blanc
      );
    }, [reserveGeoJSON, showReserve]);

    // Rendu Parc national
    useEffect(() => {
      renderProtectedZoneType(
        'parcNational',
        parcNationalGeoJSON,
        showParcNational || false,
        '#059669', // vert clair
        '628',
        'Parc national'
      );
    }, [parcNationalGeoJSON, showParcNational]);

    // Rendu Aire communautaire
    useEffect(() => {
      renderProtectedZoneType(
        'aireCommunautaire',
        aireCommunautaireGeoJSON,
        showAireCommunautaire || false,
        '#10b981', // vert émeraude
        '629',
        'Aire communautaire'
      );
    }, [aireCommunautaireGeoJSON, showAireCommunautaire]);

    // Rendu Zone tampon
    useEffect(() => {
      renderProtectedZoneType(
        'zoneTampon',
        zoneTamponGeoJSON,
        showZoneTampon || false,
        '#34d399', // vert menthe
        '630',
        'Zone tampon'
      );
    }, [zoneTamponGeoJSON, showZoneTampon]);

    // Rendu AMP
    useEffect(() => {
      renderProtectedZoneType(
        'amp',
        ampGeoJSON,
        showAMP || false,
        '#0891b2', // cyan
        '631',
        'Aire marine protégée (AMP)'
      );
    }, [ampGeoJSON, showAMP]);

    // Rendu Exploitations forestières
    useEffect(() => {
      renderProtectedZoneType(
        'exploitationForestiere',
        exploitationForestiereGeoJSON,
        showExploitationForestiere || false,
        '#1f2937',
        '6325',
        'Exploitation forestière',
        '#d97706'
      );
    }, [exploitationForestiereGeoJSON, showExploitationForestiere]);

    // Rendu Empiétement
    useEffect(() => {
      renderProtectedZoneType(
        'empietement',
        empietementGeoJSON,
        showEmpietement || false,
        '#f59e0b', // orange
        '632',
        'Empiétement'
      );
    }, [empietementGeoJSON, showEmpietement]);

    // Rendu Feux de brousse
    useEffect(() => {
      renderProtectedZoneType(
        'feuxBrousse',
        feuxBrousseGeoJSON,
        showFeuxBrousse || false,
        '#dc2626', // rouge
        '633',
        'Feux de brousse'
      );
    }, [feuxBrousseGeoJSON, showFeuxBrousse]);

    // Rendu Carrière
    useEffect(() => {
      renderProtectedZoneType(
        'carriere',
        carriereGeoJSON,
        showCarriere || false,
        '#7c3aed', // violet
        '634',
        'Carrière'
      );
    }, [carriereGeoJSON, showCarriere]);

    // Rendu Concession minière
    useEffect(() => {
      renderProtectedZoneType(
        'concessionMiniere',
        concessionMiniereGeoJSON,
        showConcessionMiniere || false,
        '#9333ea', // violet foncé
        '635',
        'Concession minière'
      );
    }, [concessionMiniereGeoJSON, showConcessionMiniere]);

    // Rendu Autre
    useEffect(() => {
      renderProtectedZoneType(
        'autre',
        autreGeoJSON,
        showAutre || false,
        '#6b7280', // gris
        '636',
        'Autre'
      );
    }, [autreGeoJSON, showAutre]);

    // Helper function to convert ZicsCollection to GeoJSON FeatureCollection
    function convertZicsToGeoJSON(data: any /* ZicsCollection */): GeoJSON.FeatureCollection {
      const features: GeoJSON.Feature[] = Object.entries(data).map(([name, zicInfo]: [string, any]) => {
        return {
          type: 'Feature' as 'Feature',
          properties: {
            name: name,
            region: zicInfo.region,
            department: zicInfo.department,
            status: zicInfo.status,
            dates: zicInfo.dates,
            color: zicInfo.color,
          },
          geometry: {
            type: 'Polygon' as 'Polygon',
            coordinates: [zicInfo.coords.map((coord: number[]) => [coord[1], coord[0]])],
          },
        };
      });
      return {
        type: 'FeatureCollection' as 'FeatureCollection',
        features: features,
      };
    }

    // Helper function to convert AmodieeData[] to GeoJSON FeatureCollection
    function convertAmodieesToGeoJSON(data: any[] /* AmodieeData[] */): GeoJSON.FeatureCollection {
      const features: GeoJSON.Feature[] = data.map((amodiee: any) => {
        return {
          type: 'Feature' as 'Feature',
          properties: {
            name: amodiee.name,
            region: amodiee.region,
            department: amodiee.department,
            status: amodiee.status,
            color: amodiee.color,
          },
          geometry: {
            type: 'Polygon' as 'Polygon',
            coordinates: [amodiee.coords.map((coord: number[]) => [coord[1], coord[0]])],
          },
        };
      });
      return {
        type: 'FeatureCollection' as 'FeatureCollection',
        features: features,
      };
    }

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.zics) {
        map.removeLayer(layersRef.current.zics);
        layersRef.current.zics = undefined;
      }

      if (showZics) {
        const fc = props.zicsGeoJSON || (zicsData ? convertZicsToGeoJSON(zicsData) : null);
        if (!fc) return;
        layersRef.current.zics = L.geoJSON(fc as any, {
          style: (feature) => {
            const props = (feature as any)?.properties || {};
            const isInactive = props.isInactive || props.status === 'inactive';

            // Utiliser les propriétés de style pour les zones inactives
            if (isInactive) {
              const baseStyle = {
                color: props.mapColor || '#9ca3af',
                fillColor: props.mapColor || '#9ca3af',
                weight: 2,
                opacity: props.mapOpacity || 0.5,
                fillOpacity: (props.mapOpacity || 0.5) * 0.7, // Réduire encore la transparence du fill
              } as L.PathOptions;

              // Ajouter le motif de croix si demandé
              if (props.showCrossPattern) {
                return {
                  ...baseStyle,
                  dashArray: '8,8', // Lignes discontinues pour simuler des croix
                  dashOffset: '4',
                  className: 'inactive-zone-pattern'
                };
              }
              return baseStyle;
            }

            // Style normal pour les zones actives
            const c = props.mapColor || props.color || '#3B82F6';
            return {
              color: c,
              fillColor: c,
              weight: 2,
              opacity: props.mapOpacity || 1,
              fillOpacity: (props.mapOpacity || 1) * 0.35,
            } as L.PathOptions;
          },
          pane: 'zicsPane',
          onEachFeature: (feature, layer) => {
            if (feature.properties && feature.properties.name) {
              let popupContent = `<b>${feature.properties.name}</b>`;
              if (feature.properties.dates) {
                popupContent += `<br>Dates: ${feature.properties.dates}`;
              }
              if (feature.properties.status) {
                popupContent += `<br>Statut: ${feature.properties.status}`;
              }
              layer.bindPopup(popupContent);
            }
          }
        }).addTo(map);
      }
    }, [showZics, props.zicsGeoJSON]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      if (layersRef.current.amodiees) {
        map.removeLayer(layersRef.current.amodiees);
        layersRef.current.amodiees = undefined;
      }

      if (showAmodiees) {
        const fc = props.amodieesGeoJSON || (amodieesData ? convertAmodieesToGeoJSON(amodieesData) : null);
        if (!fc) return;
        layersRef.current.amodiees = L.geoJSON(fc as any, {
          style: (feature) => {
            const props = (feature as any)?.properties || {};
            const isInactive = props.isInactive || props.status === 'inactive';

            // Utiliser les propriétés de style pour les zones inactives
            if (isInactive) {
              const baseStyle = {
                color: props.mapColor || '#9ca3af',
                fillColor: props.mapColor || '#9ca3af',
                weight: 2,
                opacity: props.mapOpacity || 0.5,
                fillOpacity: (props.mapOpacity || 0.5) * 0.7,
              } as L.PathOptions;

              // Ajouter le motif de croix si demandé
              if (props.showCrossPattern) {
                return {
                  ...baseStyle,
                  dashArray: '8,8',
                  dashOffset: '4',
                  className: 'inactive-zone-pattern'
                };
              }
              return baseStyle;
            }

            // Style normal pour les zones actives
            const c = props.mapColor || props.color || '#F472B6';
            return {
              color: c,
              fillColor: c,
              weight: 2,
              opacity: props.mapOpacity || 1,
              fillOpacity: (props.mapOpacity || 1) * 0.35,
            } as L.PathOptions;
          },
          pane: 'amodieesPane',
          onEachFeature: (feature, layer) => {
            if (feature.properties && feature.properties.name) {
              let popupContent = `<b>${feature.properties.name}</b>`;
               if (feature.properties.status) {
                popupContent += `<br>Statut: ${feature.properties.status}`;
              }
              layer.bindPopup(popupContent);
              try {
                (layer as any).bringToFront && (layer as any).bringToFront();
                ensureAlertsPaneZIndex();
              } catch {}
            }
          }
        }).addTo(map);
      }
    }, [showAmodiees, props.amodieesGeoJSON]);

    // --- Agents (régionaux et de secteur) ---
    // Icône agent: cercle vert avec personne
    const getAgentIcon = (): L.DivIcon => {
      return L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="width:30px; height:30px; display:flex; align-items:center; justify-content:center;">
            <svg viewBox="0 0 40 40" width="24" height="24" aria-hidden="true">
              <circle cx="14" cy="13.5" r="7" fill="#047857" />
              <path d="M5 30.5c0-6.9 5.4-12.5 12-12.5s12 5.6 12 12.5v2H5v-2z" fill="#047857" />
              <path d="M24 14l8-2.7 8 2.7v6.5c0 5-3.7 10.5-8 12-4.3-1.5-8-7-8-12z" fill="#0f766e" stroke="#047857" stroke-width="1.2" stroke-linejoin="round" />
              <path d="M32 16.8l4 1.3v3.1c0 2.3-1.3 4.9-4 6.1-2.7-1.2-4-3.8-4-6.1v-3.1z" fill="#d1fae5" />
            </svg>
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15],
      });
    };

    const findRegionCenter = (name?: string): L.LatLng | null => {
      if (!name || !regionsGeoJSON) return null;
      const target = normalizeRegionName(name);
      const f = regionsGeoJSON.features.find((feat: any) => {
        const p: any = feat.properties || {};
        const n: string | undefined = p?.nom || p?.NOM_REGION;
        return n ? normalizeRegionName(n) === target : false;
      });
      if (!f) return null;
      try {
        const gj = L.geoJSON(f as any);
        const center = gj.getBounds().getCenter();
        gj.remove();
        return center;
      } catch {
        return null;
      }
    };

    const findDepartementCenter = (name?: string): L.LatLng | null => {
      if (!name || !departementsGeoJSON) return null;
      const target = normalizeRegionName(name);
      const f = departementsGeoJSON.features.find((feat: any) => {
        const p: any = feat.properties || {};
        const n: string | undefined = p?.nom_dep || p?.nom || p?.name;
        return n ? normalizeRegionName(n) === target : false;
      });
      if (!f) return null;
      try {
        const gj = L.geoJSON(f as any);
        const center = gj.getBounds().getCenter();
        gj.remove();
        return center;
      } catch { return null; }
    };

    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Remove previous layer
      if (layersRef.current.regionalAgents) {
        map.removeLayer(layersRef.current.regionalAgents);
        layersRef.current.regionalAgents = undefined;
      }

      if (!showRegionalAgents || !agents || agents.length === 0) return;

      // Ensure pane exists (created during init, but safe-check)
      if (!map.getPane('regionalAgentsPane')) {
        map.createPane('regionalAgentsPane');
        const paneEl = map.getPane('regionalAgentsPane');
        if (paneEl) paneEl.style.zIndex = '640';
      }

      const group = L.layerGroup([], { pane: 'regionalAgentsPane' as any });
      const icon = getAgentIcon();

      agents.forEach(a => {
        // Prefer precise coordinates if available
        const hasCoords = typeof a.agentLat === 'number' && typeof a.agentLon === 'number' && isFinite(a.agentLat!) && isFinite(a.agentLon!);
        let position: L.LatLngExpression | null = null;
        if (hasCoords) {
          position = [a.agentLat as number, a.agentLon as number];
        } else {
          // Fallback: departement centroid then region centroid
          const depCenter = findDepartementCenter(a.departement || undefined);
          const regCenter = depCenter || findRegionCenter(a.region || undefined);
          position = regCenter;
        }
        if (!position) return; // skip if not locatable

        const m = L.marker(position, { icon, pane: 'regionalAgentsPane' });
        const fullName = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.username || 'Agent';
        const role = (a.role || '').toLowerCase();
        const roleLabel = role === 'sub-agent' ? 'Agent de secteur' : role === 'agent' ? 'Agent régional' : a.role || '';
        const region = a.region || 'N/A';
        const dep = a.departement || '';
        const phone = a.phone || '';
        const coordLine = hasCoords ? `<div><b>Coordonnées:</b> ${(a.agentLat as number).toFixed(5)}, ${(a.agentLon as number).toFixed(5)}</div>` : '';
        m.bindPopup(`
          <div class="custom-popup">
            <h3>${fullName}</h3>
            ${roleLabel ? `<div><b>Rôle:</b> ${roleLabel}</div>` : ''}
            <div><b>Région:</b> ${region}${dep ? `, <b>Département:</b> ${dep}` : ''}</div>
            ${phone ? `<div><b>Téléphone:</b> ${phone}</div>` : ''}
            ${coordLine}
          </div>
        `);
        group.addLayer(m);
      });

      layersRef.current.regionalAgents = group.addTo(map);
    }, [showRegionalAgents, agents, regionsGeoJSON, departementsGeoJSON]);

    // useEffect pour afficher les marqueurs centroïdes des zones
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !mapReady) return;

      // Supprimer la couche précédente
      if (layersRef.current.zoneCentroids) {
        map.removeLayer(layersRef.current.zoneCentroids);
        layersRef.current.zoneCentroids = undefined;
      }

      // Créer le pane si nécessaire (z-index 650 pour être au-dessus de tout)
      if (!map.getPane('zoneCentroidsPane')) {
        map.createPane('zoneCentroidsPane');
        const paneEl = map.getPane('zoneCentroidsPane');
        if (paneEl) paneEl.style.zIndex = '650';
      }

      const group = L.layerGroup([], { pane: 'zoneCentroidsPane' as any });

      // Fonction helper pour ajouter les centroïdes d'un GeoJSON
      const addCentroidsFromGeoJSON = (geoJson: GeoJSON.FeatureCollection | null, show: boolean) => {
        if (!geoJson || !show) return;

        geoJson.features.forEach((feature: any) => {
          const props = feature.properties;
          if (!props) return;

          const lat = props.centroid_lat;
          const lon = props.centroid_lon;
          const color = props.color || '#0ea5e9';
          const name = props.name || 'Zone';
          const type = props.type || 'zone';

          if (typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon)) {
            const marker = L.marker([lat, lon], {
              icon: createZoneCentroidIcon(color),
              pane: 'zoneCentroidsPane'
            });

            marker.bindPopup(`
              <div class="custom-popup">
                <h3>${name}</h3>
                <div><b>Type:</b> ${type}</div>
                <div><b>Centre:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}</div>
              </div>
            `);

            group.addLayer(marker);
          }
        });
      };

      // Ajouter les centroïdes pour chaque type de zone
      addCentroidsFromGeoJSON(props.zicsGeoJSON || null, showZics);
      addCentroidsFromGeoJSON(props.amodieesGeoJSON || null, showAmodiees);
      addCentroidsFromGeoJSON(props.parcVisiteGeoJSON || null, props.showParcVisite || false);
      addCentroidsFromGeoJSON(props.regulationGeoJSON || null, props.showRegulation || false);

      if (group.getLayers().length > 0) {
        layersRef.current.zoneCentroids = group.addTo(map);
      }
    }, [mapReady, showZics, showAmodiees, props.showParcVisite, props.showRegulation, props.zicsGeoJSON, props.amodieesGeoJSON, props.parcVisiteGeoJSON, props.regulationGeoJSON]);

    // Fonction pour obtenir l'icône du marqueur en fonction du type
    const getMarkerIcon = (type: string): L.DivIcon => {
      const iconSize = 32;
      const html = `
        <div class="marker-container" title="${getMarkerName(type)}">
          <div class="marker-pulse"></div>
          <div class="marker-icon" style="color: ${getMarkerColor(type)}">
            ${getMarkerSvg(type)}
          </div>
        </div>
      `;

      return L.divIcon({
        html,
        className: 'custom-marker',
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize],
        popupAnchor: [0, -iconSize / 2]
      });
    };



    // Fonction utilitaire pour obtenir la couleur du marqueur
    const getMarkerColor = (type: string): string => {
      const colors: Record<string, string> = {
        'village': '#4CAF50',
        'city': '#2196F3',
        'water': '#00BCD4',
        'forest': '#4CAF50',
        'field': '#8BC34A',
        'livestock': '#795548',
        'sight': '#F44336',
      };
      return colors[type] || '#3388FF';
    };

    // Style des régions (coloration par statut si disponible)
    // Fonction de normalisation pour les noms de régions
    const normalizeRegionName = (name: string): string => {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
        .replace(/[-\s]+/g, ' ') // Remplacer tirets et espaces multiples par un espace
        .trim();
    };

    const getStatusInfoByName = (name?: string): { status: string; color: string } | undefined => {
      if (!name || !regionStatuses) return undefined;

      // Essayer d'abord avec le nom exact
      let candidate = regionStatuses[name];
      if (candidate) return candidate;

      // Si pas trouvé, essayer avec normalisation
      const normalizedName = normalizeRegionName(name);
      const normalizedKeys = Object.keys(regionStatuses).map(key => ({
        original: key,
        normalized: normalizeRegionName(key)
      }));

      const match = normalizedKeys.find(item => item.normalized === normalizedName);
      if (match) {
        candidate = regionStatuses[match.original];
        if (candidate) return candidate;
      }

      return undefined;
    };

    const resolveRegionName = (propsObj: any): string | undefined => {
      if (!propsObj) return undefined;
      const candidates = [
        propsObj.nom,
        propsObj.NOM_REGION,
        propsObj.nom_region,
        propsObj.NOM,
        propsObj.name,
        propsObj.region,
      ];
      return candidates.find((v) => typeof v === 'string' && v.trim().length > 0);
    };

    const getRegionStyle = (feature?: GeoJSON.Feature): L.PathOptions => {
      const base: L.PathOptions = {
        weight: 2,
        opacity: 1,
        color: '#495057',
        fillOpacity: props.minimal ? 0 : 0.3, // valeur par défaut quand la coloration par statut est active
        dashArray: '3'
      };

      if (props.minimal) {
        // Bordure uniquement, pas de remplissage
        return { ...base, fillOpacity: 0, fillColor: 'transparent' };
      }

      // Quand le bouton Statuts est OFF, on neutralise le remplissage pour garder seulement les contours
      if (!props.colorizeRegionsByStatus) {
        return { ...base, fillOpacity: 0, fillColor: 'transparent' };
      }

      if (!feature || !feature.properties) {
        return { ...base, fillColor: '#e5e7eb', color: '#6b7280' };
      }

      const p: any = feature.properties;
      const name: string | undefined = resolveRegionName(p);

      // Priorité 1: couleur de la table (regionStatuses)
      const info = props.colorizeRegionsByStatus ? getStatusInfoByName(name) : undefined;
      const tableColor = info?.color;

      // Priorité 2: couleur portée par la feature (si on alimente depuis la DB en GeoJSON)
      const featureColor: string | undefined = p?.color || p?.COLOR;

      const fillColor = tableColor || featureColor || '#e5e7eb';

      return {
        ...base,
        fillColor,
        color: '#3f3f46' // bordure neutre sombre pour démarcation nette
      };
    };

    // Gestion des interactions avec les régions (popup nom + statut)
    const onEachRegionFeature = (feature: GeoJSON.Feature, layer: L.Layer): void => {
      if (!feature.properties) return;

      const p: any = feature.properties;
      const name: string | undefined = resolveRegionName(p);

      if (!props.colorizeRegionsByStatus) {
        const popupContent = `${name ? `<div style="background:#d1fae5;padding:6px 8px;border-radius:6px;"><strong>${name}</strong></div>` : ''}`;
        if (popupContent) (layer as any).bindPopup(popupContent);
      } else {
        const statuses = regionStatuses || {};
        const info = name ? statuses[name] : undefined;

        const statusLabel = info?.status === 'open'
          ? 'Ouverte'
          : info?.status === 'partial'
          ? 'Partiellement ouverte'
          : info?.status === 'closed'
          ? 'Fermée'
          : 'Inconnue';

        const popupContent = `<div>
          ${name ? `<strong>${name}</strong><br/>` : ''}
          <span>Statut: ${statusLabel}</span>
        </div>`;
        (layer as any).bindPopup(popupContent);
      }

      // Gestion des événements de survol
      layer.on({
        mouseover: (e) => {
          const layer = e.target;
          layer.setStyle({
            weight: 3,
            color: '#212529',
            fillOpacity: 0.55
          });
          if ((layer as any).bringToFront) (layer as any).bringToFront();
          ensureAlertsPaneZIndex();
        },
        mouseout: (e) => {
          // Ne pas réinitialiser le style si cette couche est la sélection courante en mode statut OFF
          if (!props.colorizeRegionsByStatus && selectedRegionLayerRef.current === e.target) {
            return;
          }
          layersRef.current.regions?.resetStyle(e.target);
        },
        click: (e) => {
          const map = mapRef.current;
          if (map && (e.target as any).getBounds) {
            map.fitBounds((e.target as any).getBounds());
          }
          // Mettre en surbrillance jaune si contrôle statut OFF
          if (!props.colorizeRegionsByStatus) {
            // Toggle: si on re-clique la même couche, on désélectionne
            if (selectedRegionLayerRef.current === (e.target as any)) {
              if (layersRef.current.regions) {
                try { (layersRef.current.regions as any).resetStyle(selectedRegionLayerRef.current as any); } catch {}
              }
              selectedRegionLayerRef.current = null;
            } else {
              // Réinitialiser l'ancienne sélection
              if (selectedRegionLayerRef.current && layersRef.current.regions) {
                try { (layersRef.current.regions as any).resetStyle(selectedRegionLayerRef.current as any); } catch {}
              }
              selectedRegionLayerRef.current = e.target as any;
              (e.target as any).setStyle({ color: '#FFD700', weight: 3 });
              if ((e.target as any).bringToFront) (e.target as any).bringToFront();
              // Forcer les alertes à rester prioritaires après bringToFront
              ensureAlertsPaneZIndex();
            }
          }
        }
      });
    };



    // Gestionnaire pour supprimer tous les marqueurs
    const handleDeleteMarkers = () => {
      console.log('handleDeleteMarkers called');
      if (confirm('Êtes-vous sûr de vouloir supprimer tous les marqueurs ?')) {
        console.log('Confirmation received. Attempting to clear layers.');
        if (markersRef.current) {
          console.log('markersRef.current exists. Number of layers before clear:', markersRef.current.getLayers().length);
          markersRef.current.clearLayers();
          console.log('markersRef.current.clearLayers() called. Number of layers after clear:', markersRef.current.getLayers().length);
        } else {
          console.error('markersRef.current is null or undefined.');
        }
      } else {
        console.log('Deletion cancelled by user.');
      }
    };

    // Gestionnaire pour sélectionner un type de marqueur
    const handleSelectMarker = (type: string) => {
      // Si le même type de marqueur est cliqué, cela signifie une désélection.
      // Sinon, c'est une nouvelle sélection.
      const newSelectedType = props.selectedMarkerType === type ? null : type;
      props.onMarkerTypeSelected(newSelectedType); // Notifier le parent

      // Gérer l'affichage de la popup d'information
      if (mapRef.current) {
        mapRef.current.closePopup(); // Fermer les popups précédentes

        if (newSelectedType) {
          L.popup({ closeButton: false, autoClose: true, closeOnClick: false, className: 'custom-popup-container' })
            .setLatLng(mapRef.current.getCenter())
            .setContent(`<div class="custom-popup">
              <h3>Mode ajout de marqueurs</h3>
              <p>Cliquez sur la carte pour ajouter un marqueur de type <strong>${getMarkerName(newSelectedType)}</strong>.</p>
              <small>Cliquez à nouveau sur l'icône de ce marqueur pour annuler.</small>
            </div>`)
            .openOn(mapRef.current);
        } else {
          // Optionnel: si on veut s'assurer que toutes les popups "Mode ajout" sont fermées lors de la désélection
          mapRef.current.eachLayer((layer: any) => {
            if (layer instanceof L.Popup) {
              const content = layer.getContent();
              if (typeof content === 'string' && content.includes("Mode ajout de marqueurs")) {
                mapRef.current?.closePopup(layer);
              }
            }
          });
        }
      }
    };

    // Déduire la présence réelle des couches à partir des layers ajoutés à la carte (plus fiable que les seuls props)
    const mapObj = mapRef.current;
    const hasRegionsLayer = !!layersRef.current.regions && !!(mapObj && mapObj.hasLayer(layersRef.current.regions as any));
    const hasDepartementsLayer = !!layersRef.current.departements && !!(mapObj && mapObj.hasLayer(layersRef.current.departements as any));
    const hasCommunesLayer = !!layersRef.current.communes && !!(mapObj && mapObj.hasLayer(layersRef.current.communes as any));
    const hasArrondissementsLayer = !!layersRef.current.arrondissements && !!(mapObj && mapObj.hasLayer(layersRef.current.arrondissements as any));

    // Fallback aux props si la map n'est pas encore initialisée
    const anyRegionOrDeptActive = hasRegionsLayer || hasDepartementsLayer || hasCommunesLayer || hasArrondissementsLayer;
    const showLegendStatuses = !props.minimal && !props.hideLegendForHunterGuide && !!props.colorizeRegionsByStatus && anyRegionOrDeptActive;
    // Lier directement la légende ZICs/Amodiées/Parcs/Régulation aux toggles pour un affichage immédiat
    const showLegendZics = !props.minimal && !props.hideLegendForHunterGuide && !!props.showZics;
    const showLegendAmodiees = !props.minimal && !props.hideLegendForHunterGuide && !!props.showAmodiees;
    const showLegendParcVisite = !props.minimal && !props.hideLegendForHunterGuide && !!props.showParcVisite;
    const showLegendRegulation = !props.minimal && !props.hideLegendForHunterGuide && !!props.showRegulation;

    // --- Position dynamique de la légende (mode PC): près du nez de Dakar sur la mer ---
    const [legendPos, setLegendPos] = useState<{ left: number; top: number } | null>(null);

    const findDakarCenter = (): L.LatLng | null => {
      try {
        // 1) Chercher dans les données régions si disponibles
        const feats = (props.regionsGeoJSON?.features || []) as any[];
        const f = feats.find((ft: any) => {
          const p = ft?.properties || {};
          const name = (p.nom || p.NOM_REGION || p.name || '').toString().toLowerCase();
          return name.includes('dakar');
        });
        if (f && f.geometry) {
          const b = L.geoJSON(f as any).getBounds();
          const c = b.getCenter();
          return c;
        }
      } catch {}
      // 2) Fallback: coordonnées approximatives de Dakar (Cap-Vert)
      return new L.LatLng(14.7167, -17.4677);
    };

    const updateLegendPosition = () => {
      const map = mapRef.current;
      if (!map) return;
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
      if (!isDesktop) {
        setLegendPos(null);
        return;
      }
      const center = findDakarCenter();
      if (!center) { setLegendPos(null); return; }
      const pt = map.latLngToContainerPoint(center);
      // Décaler vers la gauche (mer) et descendre d'environ 1.6cm supplémentaires (~61px) par rapport à la position initiale
      const EXTRA_UP_PX = -80; // déplacement net vers le BAS (~1.6cm) par rapport à l'offset de base
      const left = Math.max(10, pt.x - 180);
      const top = Math.max(10, pt.y - 30 - EXTRA_UP_PX);
      setLegendPos({ left, top });
    };

    // Mettre à jour la position de la légende lors des mouvements/zoom et des changements d'état pertinents
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;
      const handler = () => updateLegendPosition();
      map.on('moveend zoomend resize', handler);
      updateLegendPosition();
      return () => { map.off('moveend zoomend resize', handler); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.showRegions, props.showDepartements, props.colorizeRegionsByStatus, props.regionsGeoJSON]);


    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div id="map" style={{ width: '100%', height: '100%' }} />

        {/* Contrôle de rayon et recherche */}
        {props.showRadiusControl && !props.minimal && (
          <div style={{
            position: 'absolute',
            top: 39,
            left: isMobile ? '50%' : 20,
            transform: isMobile ? 'translateX(-50%)' : 'none',
            zIndex: 1100
          }}>
            <RadiusControl
              onRadiusChange={handleRadiusChange}
              onSearch={handleLocationSearch}
              compact={isMobile}
              className="map-radius-control"
            />
          </div>
        )}

        {/* Boutons de filtrage des alertes par type */}
        {props.showAlerts && !props.minimal && (() => {
          const allAlerts = props.alerts || [];
          // Compter les alertes par type
          const counts = {
            feux_de_brousse: allAlerts.filter(a => {
              const n = (a.nature || '').toLowerCase();
              return n.includes('feu') || n.includes('brousse');
            }).length,
            'trafic-bois': allAlerts.filter(a => {
              const n = (a.nature || '').toLowerCase();
              return n.includes('trafic') || n.includes('bois');
            }).length,
            braconnage: allAlerts.filter(a => {
              const n = (a.nature || '').toLowerCase();
              return n.includes('braconn');
            }).length,
            autre: allAlerts.filter(a => {
              const n = (a.nature || '').toLowerCase();
              const isFire = n.includes('feu') || n.includes('brousse');
              const isTraffic = n.includes('trafic') || n.includes('bois');
              const isPoaching = n.includes('braconn');
              return !isFire && !isTraffic && !isPoaching;
            }).length,
          };

          return (
            <div
              ref={alertFilterRef}
              onPointerDown={onAlertFilterPointerDown}
              onPointerMove={onAlertFilterPointerMove}
              onPointerUp={onAlertFilterPointerUp}
              style={{
              position: 'absolute',
              ...(alertFilterPos ? { left: alertFilterPos.left, top: alertFilterPos.top } : { top: props.showRadiusControl ? 175 : 125, left: 48 }),
              zIndex: 1100,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.95)',
              padding: '10px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <div className="alert-filter-drag-handle" style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#374151', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}>
                ⠿ Filtrer alertes
              </div>
              {[
                { key: 'feux_de_brousse', label: 'Feux de brousse', color: '#ef4444', icon: '🔥' },
                { key: 'trafic-bois', label: 'Trafic de bois', color: '#8B5A2B', icon: '🪵' },
                { key: 'braconnage', label: 'Braconnage', color: '#FF1F3D', icon: '🎯' },
                { key: 'autre', label: 'Information', color: '#6b7280', icon: 'ℹ️' },
              ].map(({ key, label, color, icon }) => {
                const count = counts[key as keyof typeof counts];
                return (
                  <button
                    key={key}
                    onClick={() => setAlertTypeFilters(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      border: `2px solid ${color}`,
                      borderRadius: '6px',
                      background: alertTypeFilters[key as keyof typeof alertTypeFilters] ? color : 'white',
                      color: alertTypeFilters[key as keyof typeof alertTypeFilters] ? 'white' : color,
                      fontSize: '12px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      opacity: alertTypeFilters[key as keyof typeof alertTypeFilters] ? 1 : 0.6,
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>{icon}</span>
                    <span style={{ flex: 1 }}>{label}</span>
                    <span style={{
                      background: alertTypeFilters[key as keyof typeof alertTypeFilters] ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.1)',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      minWidth: '20px',
                      textAlign: 'center',
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}

        {(showLegendStatuses || showLegendZics || showLegendAmodiees || showLegendParcVisite || showLegendRegulation) && (
          <div style={{ position: 'absolute', zIndex: 1200, ...(legendPos ? { left: legendPos.left, top: legendPos.top } : { left: 20, bottom: 20 }) }}>
            <Legend
              showStatuses={showLegendStatuses}
              showZics={showLegendZics}
              showAmodiees={showLegendAmodiees}
              showParcVisite={showLegendParcVisite}
              showRegulation={showLegendRegulation}
              statusColors={{ open: '#34D399', partial: '#FBBF24', closed: '#EF4444' }}
              zicsColor="#3B82F6"
              amodieesColor="#F472B6"
              parcVisiteColor="#f59e0b"
              regulationColor="#dc2626"
            />
          </div>
        )}
      </div>
    );
  }
);

MapComponent.displayName = 'MapComponent';
export default MapComponent;
