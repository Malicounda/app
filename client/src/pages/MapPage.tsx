import { loadEcoZones } from '@/components/data/data';
import MapComponent from '@/components/MapComponent';
import { useAuth } from '@/contexts/AuthContext';
import {
    DepartementProperties,
    GeoJSONProperties,
    RegionProperties,
    RegionStatusData
} from '@/lib/geoData';
import { mapCache } from '@/lib/mapCache';
import { apiRequest } from '@/lib/queryClient';
import React, { useEffect, useRef, useState } from 'react';

import {
    FaBullseye,
    FaChevronLeft,
    FaChevronRight,
    FaCrosshairs,
    FaDrawPolygon,
    FaExclamationTriangle,
    FaFire,
    FaGlobeEurope,
    FaIndustry,
    FaLeaf,
    FaMapMarkedAlt,
    FaMapMarkerAlt,
    FaPalette,
    FaPaw,
    FaSatellite,
    FaShieldAlt,
    FaTree,
    FaWater
} from 'react-icons/fa';
import { GiWoodPile } from 'react-icons/gi';
import './MapPage.css';

const MapPage: React.FC = () => {
      const [showRegions, setShowRegions] = useState(true);
  const [showDepartements, setShowDepartements] = useState(false);
  const [showCommunes, setShowCommunes] = useState(false);
  const [showArrondissements, setShowArrondissements] = useState(false);
  const [showZics, setShowZics] = useState(false);
  const [showAmodiees, setShowAmodiees] = useState(false);
  const [showParcVisite, setShowParcVisite] = useState(false);
  const [showRegulation, setShowRegulation] = useState(false);
  const [useSatellite, setUseSatellite] = useState(false);
  const { user } = useAuth();

  // --- Toolbar drag state ---
  const [toolbarPos, setToolbarPos] = useState<{ y: number } | null>(null);
  const toolbarDragRef = useRef<{ startY: number; origY: number; dragging: boolean }>({ startY: 0, origY: 0, dragging: false });
  const toolbarRef = useRef<HTMLDivElement>(null);

  const onToolbarPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const isDragHandle = target.closest('.map-controls-toggle') || target.closest('.toolbar-drag-handle');
    if (isDragHandle) {
      e.preventDefault();
      e.stopPropagation();
      const rect = toolbarRef.current?.getBoundingClientRect();
      const origY = toolbarPos?.y ?? (rect?.top ?? 0);
      toolbarDragRef.current = { startY: e.clientY, origY, dragging: true };
      target.setPointerCapture(e.pointerId);
    }
  };
  const onToolbarPointerMove = (e: React.PointerEvent) => {
    if (!toolbarDragRef.current.dragging) return;
    const dy = e.clientY - toolbarDragRef.current.startY;
    setToolbarPos({ y: toolbarDragRef.current.origY + dy });
  };
  const onToolbarPointerUp = () => {
    toolbarDragRef.current.dragging = false;
  };

  // Récupérer les paramètres URL pour centrer la carte
  const [initialCenter, setInitialCenter] = useState<[number, number] | null>(null);
  const [initialZoom, setInitialZoom] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lat = params.get('lat');
    const lon = params.get('lon');
    const zoom = params.get('zoom');

    if (lat && lon) {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (isFinite(latNum) && isFinite(lonNum)) {
        setInitialCenter([latNum, lonNum]);
        setInitialZoom(zoom ? parseInt(zoom) : 14);
      }
    }
  }, []);



  // Pour chasseurs et guides, toujours afficher toutes les zones
  const isHunterOrGuide = user?.role === 'hunter' || user?.role === 'hunting-guide';
  const finalShowZics = isHunterOrGuide || showZics;
  const finalShowAmodiees = isHunterOrGuide || showAmodiees;
  const finalShowParcVisite = isHunterOrGuide || showParcVisite;
  const finalShowRegulation = isHunterOrGuide || showRegulation;
  const [showAgents, setShowAgents] = useState(false);
  const [showEcoZones, setShowEcoZones] = useState(false);
  const [showProtectedZones, setShowProtectedZones] = useState(false);
  const [protectedZonesExpanded, setProtectedZonesExpanded] = useState(false);
  // États pour chaque type de zone protégée
  const [showForetClassee, setShowForetClassee] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [showParcNational, setShowParcNational] = useState(false);
  const [showAireCommunautaire, setShowAireCommunautaire] = useState(false);
  const [showZoneTampon, setShowZoneTampon] = useState(false);
  const [showAMP, setShowAMP] = useState(false);
  const [showExploitationForestiere, setShowExploitationForestiere] = useState(false);
  const [showEmpietement, setShowEmpietement] = useState(false);
  const [showFeuxBrousse, setShowFeuxBrousse] = useState(false);
  const [showCarriere, setShowCarriere] = useState(false);
  const [showConcessionMiniere, setShowConcessionMiniere] = useState(false);
  const [showAutre, setShowAutre] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [selectedMarkerType, setSelectedMarkerType] = useState<string | null>(null);
  const [agentsForMap, setAgentsForMap] = useState<Array<{ id: number; username?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; role?: string | null; region?: string | null; departement?: string | null; agentLat?: number | null; agentLon?: number | null }>>([]);
  const [agentsCounts, setAgentsCounts] = useState<{ regional: number; sector: number; total: number }>({ regional: 0, sector: 0, total: 0 });
  const [controlsCollapsed, setControlsCollapsed] = useState(true);
  const [showInfractions, setShowInfractions] = useState(false);
  const [departementsExpanded, setDepartementsExpanded] = useState(false);
  const [infractionsForMap, setInfractionsForMap] = useState<any[]>([]);
  const [infractionsCountsByRegion, setInfractionsCountsByRegion] = useState<Record<string, number>>({});
  const [infractionsPanel, setInfractionsPanel] = useState<null | {
    region: string;
    totals: { infractions: number; contrevenants: number; recette: number };
    byCodeInfractions: Array<{ label: string; value: number; color: string }>;
    byCodeContrevenants: Array<{ label: string; value: number; color: string }>;
    byCodeRecette: Array<{ label: string; value: number; color: string }>;
  }>(null);

  const [currentRegionsGeoJson, setCurrentRegionsGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties> | null>(null);
  const [currentDepartementsGeoJson, setCurrentDepartementsGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties> | null>(null);
  const [currentCommunesGeoJson, setCurrentCommunesGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties> | null>(null);
  const [currentArrondissementsGeoJson, setCurrentArrondissementsGeoJson] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties> | null>(null);
  const [currentEcoZonesGeoJson, setCurrentEcoZonesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentProtectedZonesGeoJson, setCurrentProtectedZonesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  // GeoJSON pour chaque type de zone protégée
  const [foretClasseeGeoJSON, setForetClasseeGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [reserveGeoJSON, setReserveGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [parcNationalGeoJSON, setParcNationalGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [aireCommunautaireGeoJSON, setAireCommunautaireGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoneTamponGeoJSON, setZoneTamponGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [ampGeoJSON, setAMPGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [empietementGeoJSON, setEmpietementGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [feuxBrousseGeoJSON, setFeuxBrousseGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [carriereGeoJSON, setCarriereGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [concessionMiniereGeoJSON, setConcessionMiniereGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [autreGeoJSON, setAutreGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [exploitationForestiereGeoJSON, setExploitationForestiereGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentZicsGeoJson, setCurrentZicsGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentAmodieesGeoJson, setCurrentAmodieesGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentParcVisiteGeoJson, setCurrentParcVisiteGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [currentRegulationGeoJson, setCurrentRegulationGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [regionStatuses, setRegionStatuses] = useState<RegionStatusData>({});
  const [colorizeRegionsByStatus, setColorizeRegionsByStatus] = useState(false);
  const [regionStatusDataLoaded, setRegionStatusDataLoaded] = useState(false);
  const infractionsButtonRef = useRef<HTMLSpanElement | null>(null);

  const renderProtectedZoneCount = (geoJSON?: GeoJSON.FeatureCollection | null) => {
    const count = Array.isArray(geoJSON?.features) ? geoJSON!.features.length : 0;
    if (!count) return null;
    return (
      <span className="protected-badge" style={{ marginLeft: 'auto' }}>
        {count}
      </span>
    );
  };

  // Précharger les infractions au montage pour afficher le badge immédiatement
  useEffect(() => {
    try {
      const cached = mapCache.get();
      const hasCached = Array.isArray(cached.infractions) && cached.infractions.length > 0;
      if (!hasCached) {
        fetchInfractionsForMap().catch(() => {});
      }
    } catch {}
  }, []);

  const [alertsForMap, setAlertsForMap] = useState<Array<{ id: number; title: string | null; message: string | null; nature: string | null; region: string | null; departement?: string | null; lat: number; lon: number; created_at: string; sender?: { first_name: string | null; last_name: string | null; phone: string | null; role?: string | null; region?: string | null; departement?: string | null } }>>([]);
  const [showHuntingReports, setShowHuntingReports] = useState(false);
  const [huntingReportsData, setHuntingReportsData] = useState<Array<{ lat: number; lon: number; species?: string | null; quantity?: number | null; date?: string | null; location?: string | null; photoUrl?: string | null; region?: string | null; departement?: string | null }>>([]);
  const [huntingReportsCount, setHuntingReportsCount] = useState<number>(0);

  // États pour les compteurs rapides
  const [zonesCounts, setZonesCounts] = useState<{ zic: number; amodiee: number; parc_visite: number; regulation: number }>({ zic: 0, amodiee: 0, parc_visite: 0, regulation: 0 });
  const [protectedZonesCounts, setProtectedZonesCounts] = useState<Record<string, number>>({});

    const mapRef = useRef<any>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(() => {
    const c = mapCache.get();
    return !(c.regions || c.zics || c.protectedZones);
  });
  const [loadProgress, setLoadProgress] = useState<number>(() => {
    const c = mapCache.get();
    return (c.regions || c.zics || c.protectedZones) ? 100 : 0;
  });

  // Mettre à jour la progression de chargement en fonction des couches reçues
  useEffect(() => {
    if (!initialLoading) return;
    const steps = [
      !!currentRegionsGeoJson,
      !!currentDepartementsGeoJson,
      !!currentEcoZonesGeoJson,
      !!currentZicsGeoJson,
      !!currentAmodieesGeoJson,
      !!currentParcVisiteGeoJson,
      !!currentRegulationGeoJson,
      !!currentProtectedZonesGeoJson,
    ];
    const total = steps.length;
    const loaded = steps.filter(Boolean).length;
    const pct = Math.round((loaded / Math.max(1, total)) * 100);
    setLoadProgress((prev) => Math.max(prev, pct));
  }, [
    initialLoading,
    currentRegionsGeoJson,
    currentDepartementsGeoJson,
    currentEcoZonesGeoJson,
    currentZicsGeoJson,
    currentAmodieesGeoJson,
    currentParcVisiteGeoJson,
    currentRegulationGeoJson,
    currentProtectedZonesGeoJson,
  ]);

  // Fermer l'overlay initial quand la progression est suffisante ou après un délai de sécurité
  useEffect(() => {
    if (!initialLoading) return;
    if (loadProgress >= 95) {
      const t = setTimeout(() => setInitialLoading(false), 300);
      return () => clearTimeout(t);
    }
    const safety = setTimeout(() => setInitialLoading(false), 8000);
    return () => clearTimeout(safety);
  }, [initialLoading, loadProgress]);

  useEffect(() => {
    const cached = mapCache.get();
    if (cached.regions) setCurrentRegionsGeoJson(cached.regions as any);
    if (cached.departements) setCurrentDepartementsGeoJson(cached.departements as any);
    if (cached.communes) setCurrentCommunesGeoJson(cached.communes as any);
    if (cached.arrondissements) setCurrentArrondissementsGeoJson(cached.arrondissements as any);
    if (cached.ecoZones) setCurrentEcoZonesGeoJson(cached.ecoZones as any);
    if (cached.zics) setCurrentZicsGeoJson(cached.zics as any);
    if (cached.amodiees) setCurrentAmodieesGeoJson(cached.amodiees as any);
    if (cached.parcVisite) setCurrentParcVisiteGeoJson(cached.parcVisite as any);
    if (cached.regulation) setCurrentRegulationGeoJson(cached.regulation as any);
    if (cached.protectedZones) setCurrentProtectedZonesGeoJson(cached.protectedZones as any);
    if (cached.foretClassee) setForetClasseeGeoJSON(cached.foretClassee as any);
    if (cached.reserve) setReserveGeoJSON(cached.reserve as any);
    if (cached.parcNational) setParcNationalGeoJSON(cached.parcNational as any);
    if (cached.aireCommunautaire) setAireCommunautaireGeoJSON(cached.aireCommunautaire as any);
    if (cached.zoneTampon) setZoneTamponGeoJSON(cached.zoneTampon as any);
    if (cached.amp) setAMPGeoJSON(cached.amp as any);
    if (cached.exploitationForestiere) setExploitationForestiereGeoJSON(cached.exploitationForestiere as any);
    if (cached.empietement) setEmpietementGeoJSON(cached.empietement as any);
    if (cached.feuxBrousse) setFeuxBrousseGeoJSON(cached.feuxBrousse as any);
    if (cached.carriere) setCarriereGeoJSON(cached.carriere as any);
    if (cached.concessionMiniere) setConcessionMiniereGeoJSON(cached.concessionMiniere as any);
    if (cached.autre) setAutreGeoJSON(cached.autre as any);
    if (cached.alerts) setAlertsForMap(cached.alerts as any);
    if (Array.isArray(cached.infractions) && cached.infractions.length) setInfractionsForMap(cached.infractions as any);
    if (cached.zonesCounts) setZonesCounts(cached.zonesCounts);
    if (cached.protectedCounts) setProtectedZonesCounts(cached.protectedCounts);
    if (cached.agents) setAgentsForMap(cached.agents);
    try {
      const saved = localStorage.getItem('mapPage.toggles');
      if (saved) {
        const t = JSON.parse(saved);
        if (typeof t.showRegions === 'boolean') setShowRegions(t.showRegions);
        if (typeof t.showDepartements === 'boolean') setShowDepartements(t.showDepartements);
        if (typeof t.showCommunes === 'boolean') setShowCommunes(t.showCommunes);
        if (typeof t.showArrondissements === 'boolean') setShowArrondissements(t.showArrondissements);
        if (typeof t.showZics === 'boolean') setShowZics(t.showZics);
        if (typeof t.showAmodiees === 'boolean') setShowAmodiees(t.showAmodiees);
        if (typeof t.showParcVisite === 'boolean') setShowParcVisite(t.showParcVisite);
        if (typeof t.showRegulation === 'boolean') setShowRegulation(t.showRegulation);
        if (typeof t.useSatellite === 'boolean') setUseSatellite(t.useSatellite);
        if (typeof t.showEcoZones === 'boolean') setShowEcoZones(t.showEcoZones);
        if (typeof t.showProtectedZones === 'boolean') setShowProtectedZones(t.showProtectedZones);
        if (typeof t.showAgents === 'boolean') setShowAgents(t.showAgents);
        if (typeof t.colorizeRegionsByStatus === 'boolean') setColorizeRegionsByStatus(t.colorizeRegionsByStatus);
        if (typeof t.showInfractions === 'boolean') setShowInfractions(t.showInfractions);
        if (typeof t.showExploitationForestiere === 'boolean') setShowExploitationForestiere(t.showExploitationForestiere);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = {
      showRegions,
      showDepartements,
      showCommunes,
      showArrondissements,
      showZics,
      showAmodiees,
      showParcVisite,
      showRegulation,
      showEcoZones,
      showProtectedZones,
      showAgents,
      colorizeRegionsByStatus,
      showInfractions,
      showExploitationForestiere,
      useSatellite,
    };
    try { localStorage.setItem('mapPage.toggles', JSON.stringify(t)); } catch {}
  }, [showRegions, showDepartements, showCommunes, showArrondissements, showZics, showAmodiees, showParcVisite, showRegulation, showEcoZones, showProtectedZones, showAgents, colorizeRegionsByStatus, showInfractions, showExploitationForestiere, useSatellite]);

  useEffect(() => {
    if (controlsCollapsed && departementsExpanded) {
      setDepartementsExpanded(false);
    }
  }, [controlsCollapsed, departementsExpanded]);

  // Helpers de normalisation + filtrage selon le rôle agent
  const normalize = (s?: string | null) => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const userRegion = normalize((user as any)?.region);
  const userDep = normalize((user as any)?.departement || (user as any)?.zone);
  const isAdmin = user?.role === 'admin';
  const isRegionalAgent = user?.role === 'agent' && (user as any)?.type !== 'secteur' && !!userRegion;
  const isSectorAgent = (user?.role === 'agent' && (user as any)?.type === 'secteur' && !!userDep) || (user?.role === 'sub-agent' && !!userDep);

  // Charger les infractions (lazy) pour la carte
  const fetchInfractionsForMap = async () => {
    try {
      const cached = mapCache.get();
      const cachedInfractions = Array.isArray(cached.infractions) ? cached.infractions : null;
      if (cachedInfractions && cachedInfractions.length) {
        setInfractionsForMap(cachedInfractions);
        return cachedInfractions;
      }

      const data = await apiRequest<any[]>({ url: '/api/infractions/infractions', method: 'GET' });
      const arr = Array.isArray(data) ? data : (data as any)?.data || [];
      setInfractionsForMap(arr);
      mapCache.set({ infractions: arr, infractionsFetchedAt: Date.now() });
      return arr;
    } catch (e) {
      console.error('[MapPage] Échec chargement infractions:', e);
      setInfractionsForMap([]);
      return [];
    }
  };

  // Agréger par région avec filtrage par rôle
  useEffect(() => {
    const list = Array.isArray(infractionsForMap) ? infractionsForMap : [];
    const filtered = list.filter((inf: any) => {
      if (isAdmin || isHunterOrGuide) return true;
      const reg = normalize(inf?.region);
      const dep = normalize(inf?.departement);
      if (isSectorAgent) {
        if (userDep && dep) return dep === userDep;
        if (userRegion && reg) return reg === userRegion;
        return false;
      }
      if (isRegionalAgent) {
        if (userRegion && reg) return reg === userRegion;
        return false;
      }
      return true;
    });
    const counts: Record<string, number> = {};
    for (const inf of filtered) {
      const key = normalize(inf?.region) || 'nondefini';
      counts[key] = (counts[key] || 0) + 1;
    }
    setInfractionsCountsByRegion(counts);
  }, [infractionsForMap, isAdmin, isHunterOrGuide, isSectorAgent, isRegionalAgent, userRegion, userDep]);

  // Helper: retrouver le nom original de région à partir de son nom normalisé
  const getOriginalRegionName = (normName: string): string => {
    const norm = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    for (const inf of infractionsForMap) {
      if (norm(inf?.region) === normName) return String(inf?.region || normName);
    }
    // fallback: essayer via GeoJSON régions
    const feats = currentRegionsGeoJson?.features || [];
    for (const f of feats as any[]) {
      const props = (f as any)?.properties || {};
      const name = props?.nom || props?.NOM_REGION || props?.nom_region || props?.name || props?.region || '';
      if (norm(name) === normName) return String(name);
    }
    return normName;
  };

  // Handler clic sur une étiquette région (infractions)
  const handleInfractionsRegionClick = (regionName: string) => {
    const norm = (s?: string | null) => String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const targetNorm = norm(regionName);
    // Toggle: si la même région est déjà ouverte, fermer
    if (infractionsPanel && norm(infractionsPanel.region) === targetNorm) {
      setInfractionsPanel(null);
      return;
    }
    const list = Array.isArray(infractionsForMap) ? infractionsForMap : [];
    // Appliquer le même filtrage rôle
    const roleFiltered = list.filter((inf: any) => {
      if (isAdmin || isHunterOrGuide) return true;
      const reg = norm(inf?.region);
      const dep = norm(inf?.departement);
      if (isSectorAgent) {
        if (userDep && dep) return dep === userDep;
        if (userRegion && reg) return reg === userRegion;
        return false;
      }
      if (isRegionalAgent) {
        if (userRegion && reg) return reg === userRegion;
        return false;
      }
      return true;
    });
    const inRegion = roleFiltered.filter((inf: any) => norm(inf?.region) === targetNorm);
    const totals = {
      infractions: inRegion.length,
      contrevenants: (() => {
        const ids = new Set<number | string>();
        for (const inf of inRegion) {
          const arr = Array.isArray(inf?.contrevenants) ? inf.contrevenants : [];
          for (const c of arr) {
            if (c?.id != null) ids.add(String(c.id));
          }
        }
        return ids.size;
      })(),
      recette: inRegion.reduce((sum: number, inf: any) => sum + (Number(inf?.montant_chiffre) || 0), 0),
    };
    // Groupes par code
    type Agg = { infractions: number; contrevenants: Set<string>; recette: number };
    const agg: Record<string, Agg> = {};
    const labelOf = (inf: any) => String(inf?.code || inf?.code_infraction || 'N/A');
    for (const inf of inRegion) {
      const key = labelOf(inf);
      if (!agg[key]) agg[key] = { infractions: 0, contrevenants: new Set(), recette: 0 };
      agg[key].infractions += 1;
      const arr = Array.isArray(inf?.contrevenants) ? inf.contrevenants : [];
      for (const c of arr) { if (c?.id != null) agg[key].contrevenants.add(String(c.id)); }
      agg[key].recette += Number(inf?.montant_chiffre) || 0;
    }
    const palette = ['#2563eb','#16a34a','#ea580c','#9333ea','#dc2626','#059669','#0891b2','#b45309','#1f2937'];
    const makeSeries = (selector: (a: Agg) => number) => Object.entries(agg)
      .map(([label, a], i) => ({ label, value: selector(a), color: palette[i % palette.length] }))
      .filter(s => s.value > 0)
      .sort((a,b) => b.value - a.value);
    const byCodeInfractions = makeSeries(a => a.infractions);
    const byCodeContrevenants = makeSeries(a => a.contrevenants.size);
    const byCodeRecette = makeSeries(a => a.recette);
    setInfractionsPanel({ region: regionName, totals, byCodeInfractions, byCodeContrevenants, byCodeRecette });
  };

  const filterZoneFeatureByUserScope = (f: any) => {
    if (!f || !f.properties) return false;
    if (isAdmin || isHunterOrGuide) return true; // pas de restriction pour admin/chasseur/guide
    const p = f.properties || {};
    const zRegion = normalize(p.region || p.nom_region || p.name_region);
    const zDep = normalize(p.departement || p.nom_departement || p.name_departement);
    if (isRegionalAgent) return !!zRegion && zRegion === userRegion;
    if (isSectorAgent) return !!zDep && zDep === userDep;
    return true;
  };

  const filterFCByUserScope = (fc: any): any => {
    try {
      if (!fc || !Array.isArray(fc.features)) return fc;
      // Conserver tout pour admin/chasseur/guide - admin voit TOUTES les zones protégées
      if (isAdmin || isHunterOrGuide) {
        console.log('[MapPage] Admin/Hunter/Guide: pas de filtrage, toutes les zones visibles');
        return fc;
      }
      // Filtrage pour agents régionaux/secteur uniquement
      const features = (fc.features as any[]).filter(filterZoneFeatureByUserScope);
      console.log(`[MapPage] Agent filtrage: ${fc.features.length} -> ${features.length} zones`);
      return { ...(fc || {}), features };
    } catch {
      return fc;
    }
  };

  // Callback pour MapComponent pour mettre à jour le type de marqueur sélectionné
  const handleMarkerTypeSelected = (type: string | null) => {
    setSelectedMarkerType(type);
  };

  // Charger les régions au montage
  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties>>({
          url: '/api/regions',
          method: 'GET'
        });
        setCurrentRegionsGeoJson(data);
        mapCache.set({ regions: data });
      } catch (error) {
        console.error("[MapPage] Échec chargement régions:", error);
      }
    };
    if (!currentRegionsGeoJson) fetchRegions();
  }, [currentRegionsGeoJson]);

  // Charger les départements au montage
  useEffect(() => {
    const fetchDepartements = async () => {
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties>>({
          url: '/api/departements',
          method: 'GET'
        });
        setCurrentDepartementsGeoJson(data);
        mapCache.set({ departements: data });
      } catch (error) {
        console.error("[MapPage] Échec chargement départements:", error);
      }
    };
    if (!currentDepartementsGeoJson) fetchDepartements();
  }, [currentDepartementsGeoJson]);

  // Charger les communes à la demande (lors du toggle)
  useEffect(() => {
    if (!showCommunes || currentCommunesGeoJson) return;
    let cancelled = false;
    const fetchCommunes = async () => {
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties>>({
          url: '/api/communes',
          method: 'GET'
        });
        if (!cancelled) {
          setCurrentCommunesGeoJson(data);
          mapCache.set({ communes: data });
        }
      } catch (error) {
        console.error('[MapPage] Échec chargement communes:', error);
      }
    };
    fetchCommunes();
    return () => { cancelled = true; };
  }, [showCommunes, currentCommunesGeoJson]);

  // Charger les arrondissements à la demande (lors du toggle)
  useEffect(() => {
    if (!showArrondissements || currentArrondissementsGeoJson) return;
    let cancelled = false;
    const fetchArrondissements = async () => {
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties>>({
          url: '/api/arrondissements',
          method: 'GET'
        });
        if (!cancelled) {
          setCurrentArrondissementsGeoJson(data);
          mapCache.set({ arrondissements: data });
        }
      } catch (error) {
        console.error('[MapPage] Échec chargement arrondissements:', error);
      }
    };
    fetchArrondissements();
    return () => { cancelled = true; };
  }, [showArrondissements, currentArrondissementsGeoJson]);

  // Charger les zones éco-géographiques au montage
  useEffect(() => {
    const fetchEcoZones = async () => {
      try {
        const data = await loadEcoZones();
        setCurrentEcoZonesGeoJson(data);
        mapCache.set({ ecoZones: data as any });
      } catch (error) {
        console.error("[MapPage] Échec chargement zones éco:", error);
      }
    };
    if (!currentEcoZonesGeoJson) fetchEcoZones();
  }, [currentEcoZonesGeoJson]);

  // Chargement rapide des compteurs au montage
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [zonesCountsData, protectedCountsData] = await Promise.all([
          apiRequest<{ zic: number; amodiee: number; parc_visite: number; regulation: number }>({ url: '/api/zones/counts', method: 'GET' }).catch(() => ({ zic: 0, amodiee: 0, parc_visite: 0, regulation: 0 })),
          apiRequest<Record<string, number>>({ url: '/api/protected-zones/counts', method: 'GET' }).catch(() => ({})),
        ]);
        setZonesCounts(zonesCountsData);
        setProtectedZonesCounts(protectedCountsData);
        mapCache.set({ zonesCounts: zonesCountsData, protectedCounts: protectedCountsData });
      } catch (e) {
        console.error('[MapPage] Échec chargement compteurs:', e);
      }
    };
    fetchCounts();
  }, [user?.role, userRegion, userDep]);

  // Préchargement des couches ZIC, Amodiées, Parc, Régulation et Zones protégées pour afficher les compteurs immédiatement
  useEffect(() => {
    const prefetchAll = async () => {
      try {
        const [zics, amod, parc, reg, prot] = await Promise.all([
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=zic', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=amodiee', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=parc_visite', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=regulation', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/protected-zones', method: 'GET' }).catch(() => null),
        ]);

        if (zics) setCurrentZicsGeoJson(filterFCByUserScope(zics));
        if (amod) setCurrentAmodieesGeoJson(filterFCByUserScope(amod));
        if (parc) setCurrentParcVisiteGeoJson(filterFCByUserScope(parc));
        if (reg) setCurrentRegulationGeoJson(filterFCByUserScope(reg));

        if (prot) {
          const fc = filterFCByUserScope(prot);
          setCurrentProtectedZonesGeoJson(fc);
          const norm = (s?: string | null) => String(s || '')
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_')
            .trim();
          const ofType = (t: string): GeoJSON.FeatureCollection => ({
            type: 'FeatureCollection',
            features: (fc.features || []).filter((f: any) => norm(f?.properties?.type) === t)
          } as any);
          setForetClasseeGeoJSON(ofType('foret_classee'));
          setReserveGeoJSON(ofType('reserve'));
          setParcNationalGeoJSON(ofType('parc_national'));
          setAireCommunautaireGeoJSON(ofType('aire_communautaire'));
          setZoneTamponGeoJSON(ofType('zone_tampon'));
          setAMPGeoJSON(ofType('amp'));
          setEmpietementGeoJSON(ofType('empietement'));
          setFeuxBrousseGeoJSON(ofType('feux_brousse'));
          setCarriereGeoJSON(ofType('carriere'));
          setConcessionMiniereGeoJSON(ofType('concession_miniere'));
          setAutreGeoJSON(ofType('autre'));
          setExploitationForestiereGeoJSON(ofType('exploitation_forestiere'));
          mapCache.set({
            protectedZones: fc as any,
            foretClassee: ofType('foret_classee') as any,
            reserve: ofType('reserve') as any,
            parcNational: ofType('parc_national') as any,
            aireCommunautaire: ofType('aire_communautaire') as any,
            zoneTampon: ofType('zone_tampon') as any,
            amp: ofType('amp') as any,
            empietement: ofType('empietement') as any,
            feuxBrousse: ofType('feux_brousse') as any,
            carriere: ofType('carriere') as any,
            concessionMiniere: ofType('concession_miniere') as any,
            autre: ofType('autre') as any,
            exploitationForestiere: ofType('exploitation_forestiere') as any,
          });
        }
        mapCache.set({
          zics: zics ? filterFCByUserScope(zics) as any : null,
          amodiees: amod ? filterFCByUserScope(amod) as any : null,
          parcVisite: parc ? filterFCByUserScope(parc) as any : null,
          regulation: reg ? filterFCByUserScope(reg) as any : null,
        });
      } catch (e) {
        console.error('[MapPage] Préchargement des couches échoué:', e);
      }
    };
    const hasAll = currentZicsGeoJson && currentAmodieesGeoJson && currentParcVisiteGeoJson && currentRegulationGeoJson && currentProtectedZonesGeoJson;
    if (!hasAll) prefetchAll();
  }, [user?.role, userRegion, userDep, currentZicsGeoJson, currentAmodieesGeoJson, currentParcVisiteGeoJson, currentRegulationGeoJson, currentProtectedZonesGeoJson]);

  // Charger ZICs si affichage activé et cache manquant
  useEffect(() => {
    const ensureZics = async () => {
      if (!finalShowZics) return;
      if (currentZicsGeoJson) return;
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=zic', method: 'GET' });
        setCurrentZicsGeoJson(filterFCByUserScope(data));
      } catch (e) {
        console.error('[MapPage] Échec chargement ZICs:', e);
      }
    };
    ensureZics();
  }, [finalShowZics, currentZicsGeoJson]);

  // Charger Amodiées si affichage activé et cache manquant
  useEffect(() => {
    const ensureAmodiees = async () => {
      if (!finalShowAmodiees) return;
      if (currentAmodieesGeoJson) return;
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=amodiee', method: 'GET' });
        setCurrentAmodieesGeoJson(filterFCByUserScope(data));
      } catch (e) {
        console.error('[MapPage] Échec chargement Amodiées:', e);
      }
    };
    ensureAmodiees();
  }, [finalShowAmodiees, currentAmodieesGeoJson]);

  // Charger Parc de visite si affichage activé et cache manquant
  useEffect(() => {
    const ensureParcVisite = async () => {
      if (!finalShowParcVisite) return;
      if (currentParcVisiteGeoJson) return;
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=parc_visite', method: 'GET' });
        setCurrentParcVisiteGeoJson(filterFCByUserScope(data));
      } catch (e) {
        console.error('[MapPage] Échec chargement Parc de visite:', e);
      }
    };
    ensureParcVisite();
  }, [finalShowParcVisite, currentParcVisiteGeoJson]);

  // Charger Régulation si affichage activé et cache manquant
  useEffect(() => {
    const ensureRegulation = async () => {
      if (!finalShowRegulation) return;
      if (currentRegulationGeoJson) return;
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=regulation', method: 'GET' });
        setCurrentRegulationGeoJson(filterFCByUserScope(data));
      } catch (e) {
        console.error('[MapPage] Échec chargement Régulation:', e);
      }
    };
    ensureRegulation();
  }, [finalShowRegulation, currentRegulationGeoJson]);

  // Charger Zones protégées (global) et répartir par type quand l'un des affichages est activé si cache manquant
  useEffect(() => {
    const ensureProtectedZones = async () => {
      const anyProtectedOn = !!(showProtectedZones || showForetClassee || showReserve || showParcNational || showAireCommunautaire || showZoneTampon || showAMP || showExploitationForestiere || showEmpietement || showFeuxBrousse || showCarriere || showConcessionMiniere || showAutre);
      if (!anyProtectedOn) return;
      if (currentProtectedZonesGeoJson) return;
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/protected-zones', method: 'GET' });
        const fc = filterFCByUserScope(data);
        setCurrentProtectedZonesGeoJson(fc);
        const norm = (s?: string | null) => String(s || '')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '_')
          .trim();
        const ofType = (t: string): GeoJSON.FeatureCollection => ({
          type: 'FeatureCollection',
          features: (fc.features || []).filter((f: any) => norm(f?.properties?.type) === t)
        } as any);
        setForetClasseeGeoJSON(ofType('foret_classee'));
        setReserveGeoJSON(ofType('reserve'));
        setParcNationalGeoJSON(ofType('parc_national'));
        setAireCommunautaireGeoJSON(ofType('aire_communautaire'));
        setZoneTamponGeoJSON(ofType('zone_tampon'));
        setAMPGeoJSON(ofType('amp'));
        setEmpietementGeoJSON(ofType('empietement'));
        setFeuxBrousseGeoJSON(ofType('feux_brousse'));
        setCarriereGeoJSON(ofType('carriere'));
        setConcessionMiniereGeoJSON(ofType('concession_miniere'));
        setAutreGeoJSON(ofType('autre'));
        setExploitationForestiereGeoJSON(ofType('exploitation_forestiere'));
      } catch (e) {
        console.error('[MapPage] Échec chargement Zones protégées:', e);
      }
    };
    ensureProtectedZones();
  }, [showProtectedZones, showForetClassee, showReserve, showParcNational, showAireCommunautaire, showZoneTampon, showAMP, showExploitationForestiere, showEmpietement, showFeuxBrousse, showCarriere, showConcessionMiniere, showAutre, currentProtectedZonesGeoJson]);

  useEffect(() => {
    const fetchRegionStatuses = async () => {
      if (!colorizeRegionsByStatus || regionStatusDataLoaded) return;

      try {
        const data = await apiRequest<RegionStatusData>({ url: '/api/statuses/regions', method: 'GET' });
        setRegionStatuses(data || {});
        setRegionStatusDataLoaded(true);
      } catch (error) {
        console.error("[MapPage] Failed to load region statuses", error);
        setRegionStatuses({});
        setRegionStatusDataLoaded(false);
      }
    };

    fetchRegionStatuses();
  }, [colorizeRegionsByStatus, regionStatusDataLoaded]);

  // Charger les agents pour la carte quand l'affichage est activé
  useEffect(() => {
    const fetchAgents = async () => {
      if (!showAgents) return;
      try {
        const json = await apiRequest<any>({ url: '/api/users/agents?limit=500', method: 'GET' });
        const data = Array.isArray(json) ? json : (json?.data ?? []);
        const arr = Array.isArray(data) ? data : [];
        setAgentsForMap(arr);
        mapCache.set({ agents: data || [] });
      } catch (e) {
        console.error('[MapPage] Échec chargement des agents:', e);
        setAgentsForMap([]);
      }
    };
    fetchAgents();
  }, [showAgents]);

  useEffect(() => {
    const arr = Array.isArray(agentsForMap) ? agentsForMap : [];
    const regional = arr.filter((a: any) => {
      const role = (a?.role || '').toLowerCase();
      const type = (a?.type || a?.agent_type || '').toLowerCase();
      return role === 'agent' && !['secteur', 'sector'].includes(type);
    }).length;
    const sector = arr.filter((a: any) => {
      const role = (a?.role || '').toLowerCase();
      const type = (a?.type || a?.agent_type || '').toLowerCase();
      return (role === 'agent' && ['secteur', 'sector'].includes(type)) || role === 'sub-agent';
    }).length;
    setAgentsCounts({ regional, sector, total: arr.length });
  }, [agentsForMap]);

  // Fonction réutilisable pour charger les alertes (appelée au montage et sur clic bouton)
  const fetchAlerts = async () => {
    try {
      // Un seul appel maintenant: le backend renvoie toutes les natures par défaut
      const data = await apiRequest<any[]>({ url: '/api/alerts/map', method: 'GET' });
      setAlertsForMap(Array.isArray(data) ? data : []);
      mapCache.set({ alerts: Array.isArray(data) ? data : [] });
    } catch (e) {
      console.error('[MapPage] Échec chargement des alertes carte:', e);
      setAlertsForMap([]);
    }
  };

  const refreshMapData = async () => {
    try {
      const [regions, departements, eco, zics, amod, parc, reg, prot] = await Promise.all([
        apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties>>({ url: '/api/regions', method: 'GET' }).catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties>>({ url: '/api/departements', method: 'GET' }).catch(() => null as any),
        loadEcoZones().catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=zic', method: 'GET' }).catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=amodiee', method: 'GET' }).catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=parc_visite', method: 'GET' }).catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection>({ url: '/api/zones?type=regulation', method: 'GET' }).catch(() => null as any),
        apiRequest<GeoJSON.FeatureCollection>({ url: '/api/protected-zones', method: 'GET' }).catch(() => null as any),
      ]);

      if (regions) { setCurrentRegionsGeoJson(regions); }
      if (departements) { setCurrentDepartementsGeoJson(departements); }
      if (eco) { setCurrentEcoZonesGeoJson(eco); }

      const _zics = zics ? filterFCByUserScope(zics) : null;
      const _amod = amod ? filterFCByUserScope(amod) : null;
      const _parc = parc ? filterFCByUserScope(parc) : null;
      const _reg = reg ? filterFCByUserScope(reg) : null;
      if (_zics) setCurrentZicsGeoJson(_zics);
      if (_amod) setCurrentAmodieesGeoJson(_amod);
      if (_parc) setCurrentParcVisiteGeoJson(_parc);
      if (_reg) setCurrentRegulationGeoJson(_reg);

      if (prot) {
        const fc = filterFCByUserScope(prot);
        setCurrentProtectedZonesGeoJson(fc);
        const norm = (s?: string | null) => String(s || '')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '_')
          .trim();
        const ofType = (t: string): GeoJSON.FeatureCollection => ({
          type: 'FeatureCollection',
          features: (fc.features || []).filter((f: any) => norm(f?.properties?.type) === t)
        } as any);
        setForetClasseeGeoJSON(ofType('foret_classee'));
        setReserveGeoJSON(ofType('reserve'));
        setParcNationalGeoJSON(ofType('parc_national'));
        setAireCommunautaireGeoJSON(ofType('aire_communautaire'));
        setZoneTamponGeoJSON(ofType('zone_tampon'));
        setAMPGeoJSON(ofType('amp'));
        setEmpietementGeoJSON(ofType('empietement'));
        setFeuxBrousseGeoJSON(ofType('feux_brousse'));
        setCarriereGeoJSON(ofType('carriere'));
        setConcessionMiniereGeoJSON(ofType('concession_miniere'));
        setAutreGeoJSON(ofType('autre'));
        setExploitationForestiereGeoJSON(ofType('exploitation_forestiere'));
      }

      await fetchAlerts();

      try {
        const [zonesCountsData, protectedCountsData] = await Promise.all([
          apiRequest<{ zic: number; amodiee: number; parc_visite: number; regulation: number }>({ url: '/api/zones/counts', method: 'GET' }).catch(() => ({ zic: 0, amodiee: 0, parc_visite: 0, regulation: 0 })),
          apiRequest<Record<string, number>>({ url: '/api/protected-zones/counts', method: 'GET' }).catch(() => ({})),
        ]);
        setZonesCounts(zonesCountsData);
        setProtectedZonesCounts(protectedCountsData);
        mapCache.set({ zonesCounts: zonesCountsData, protectedCounts: protectedCountsData });
      } catch {}

      if (showAgents) {
        try {
          const json = await apiRequest<any>({ url: '/api/users/agents?limit=500', method: 'GET' });
          const data = Array.isArray(json) ? json : (json?.data ?? []);
          setAgentsForMap(data || []);
          mapCache.set({ agents: data || [] });
        } catch {
          setAgentsForMap([]);
        }
      }

      mapCache.set({
        regions: regions as any,
        departements: departements as any,
        ecoZones: eco as any,
        zics: _zics as any,
        amodiees: _amod as any,
        parcVisite: _parc as any,
        regulation: _reg as any,
      });
    } catch (e) {
      console.error('[MapPage] Échec refresh map data:', e);
    }
  };

  // Charger les alertes automatiquement pour le badge et la carte
  useEffect(() => {
    fetchAlerts();
    const quick = setTimeout(fetchAlerts, 2000);
    const interval = setInterval(fetchAlerts, 60 * 1000);
    return () => { clearTimeout(quick); clearInterval(interval); };
  }, []);
 // Pas de dépendance sur showAlerts, toujours charger

  useEffect(() => {
    const handler = () => { refreshMapData(); };
    window.addEventListener('refresh-map-data', handler as EventListener);
    return () => { window.removeEventListener('refresh-map-data', handler as EventListener); };
  }, [showAgents, user?.role, userRegion, userDep]);

  // Charger le compteur des déclarations d'abattage (toujours chargé pour afficher le badge)
  useEffect(() => {
    const loadCount = async () => {
      try {
        const qs: string[] = [];
        const role = (user?.role || '').toLowerCase();
        const isAdmin = role.includes('admin');

        // Détection correcte des agents régionaux et secteur
        const isAgentGeneric = role === 'agent';
        const isSubAgent = role === 'sub-agent';
        const isRegional = role.includes('regional') || (isAgentGeneric && !(user as any)?.departement);
        const isSector = role.includes('sector') || role.includes('secteur') || isSubAgent || (isAgentGeneric && !isRegional && !isAdmin);
        if (isAdmin) {
          qs.push('scope=all');
        }
        // Pour agents secteur et régionaux: le backend utilise maintenant les coordonnées GPS
        // Pas besoin d'envoyer region/departement en paramètre
        qs.push('limit=1000');
        const url = '/api/hunting-reports' + (qs.length ? `?${qs.join('&')}` : '');
        const items = await apiRequest<any[]>({ url, method: 'GET' });
        const arr = Array.isArray(items) ? items : (items as any)?.data || [];

        // Charger les activités validées
        const activitiesUrl = '/api/hunting-activities' + (isAdmin ? '?scope=all&limit=1000' : '?limit=1000');
        const activitiesItems = await apiRequest<any[]>({ url: activitiesUrl, method: 'GET' });
        const activitiesArr = Array.isArray(activitiesItems) ? activitiesItems : (activitiesItems as any)?.data || [];

        // Filtrer par coordonnées GPS valides
        // Note: Le backend filtre déjà par région/département via PostGIS, pas besoin de refiltrer ici
        const validReports = arr.filter((r: any) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)));
        const validActivities = activitiesArr.filter((a: any) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)));

        const totalCount = validReports.length + validActivities.length;
        setHuntingReportsCount(totalCount);
        console.log('[MapPage] Compteur abattages chargé:', {
          role,
          isRegional,
          isSector,
          userRegion: (user as any)?.region,
          userDepartement: (user as any)?.departement,
          reportsCount: validReports.length,
          activitiesCount: validActivities.length,
          totalCount,
          sampleRegions: validActivities.slice(0, 3).map((a: any) => ({ region: a.region, departement: a.departement }))
        });
      } catch (e) {
        console.error('[MapPage] Échec chargement compteur abattages:', e);
        setHuntingReportsCount(0);
      }
    };
    loadCount();
    // Rafraîchir le compteur toutes les 2 minutes
    const interval = setInterval(loadCount, 120 * 1000);
    return () => clearInterval(interval);
  }, [user?.role, (user as any)?.region, (user as any)?.departement]); // Recharger si le rôle ou la zone change

  // Suppression de l'activation automatique des alertes au montage (demande utilisateur)

  // Appliquer les paramètres par défaut pour chasseurs et guides
  useEffect(() => {
    const isRestricted = user?.role === 'hunter' || user?.role === 'hunting-guide';
    if (isRestricted) {
      // Couches actives par défaut
      setShowRegions(true);
      setColorizeRegionsByStatus(true);
      setShowZics(true);
      setShowAmodiees(true);

      // Couches inactives/masquées
      setShowDepartements(false);
      setShowEcoZones(false);
      setShowAgents(false);
      setShowProtectedZones(false);
      // Les alertes restent activées par défaut même pour chasseurs/guides
      // setShowAlerts(false); // Commenté pour garder les alertes visibles
    }
  }, [user?.role]);

  // Garde-fou: empêcher l'activation de certaines couches pour chasseur/guide
  useEffect(() => {
    const isRestricted = user?.role === 'hunter' || user?.role === 'hunting-guide';
    if (!isRestricted) return;
    let changed = false;
    if (showDepartements) { setShowDepartements(false); changed = true; }
    if (showEcoZones) { setShowEcoZones(false); changed = true; }
    if (showAgents) { setShowAgents(false); changed = true; }
    if (showProtectedZones) { setShowProtectedZones(false); changed = true; }
    // no-op for changed flag; state setters suffice
  }, [user?.role, showDepartements, showEcoZones, showAgents, showProtectedZones]);

  // Garde-fou: ZICs et Amodiées doivent rester activées pour chasseur/guide
  useEffect(() => {
    const isRestricted = user?.role === 'hunter' || user?.role === 'hunting-guide';
    if (!isRestricted) return;
    if (!showZics) setShowZics(true);
    if (!showAmodiees) setShowAmodiees(true);
  }, [user?.role, showZics, showAmodiees]);

  // Désactiver automatiquement la coloration Statuts si aucune couche n'est active
  useEffect(() => {
    if (!showRegions && !showDepartements && colorizeRegionsByStatus) {
      setColorizeRegionsByStatus(false);
    }
  }, [showRegions, showDepartements, colorizeRegionsByStatus]);

  const getDefaultFeatureStyle = (feature?: GeoJSON.Feature<GeoJSON.Geometry, GeoJSONProperties>): L.PathOptions => {
    const defaultFillColor = '#D3D3D3';
    const unknownStatusColor = '#808080';
    const borderColor = '#047857';

    if (colorizeRegionsByStatus) {
      if (feature?.properties?.nom && regionStatuses[feature.properties.nom]) {
        const regionInfo = regionStatuses[feature.properties.nom];
        return {
          fillColor: regionInfo.color,
          weight: 2,
          opacity: 1,
          color: borderColor,
          fillOpacity: 0.75
        };
      } else {
        return {
          fillColor: unknownStatusColor,
          weight: 2,
          opacity: 1,
          color: borderColor,
          fillOpacity: 0.65
        };
      }
    }

    return {
      fillColor: defaultFillColor,
      weight: 1,
      opacity: 1,
      color: borderColor,
      fillOpacity: 0.5
    };
  };












  // Charger le nombre d'abattages en tâche de fond pour afficher le badge même sans clic
  useEffect(() => {
    const loadCount = async () => {
      try {
        const qs: string[] = [];
        const role = (user?.role || '').toLowerCase();
        const isAdmin = role.includes('admin');
        const isRegional = role.includes('regional');
        const isAgentGeneric = role.includes('agent');
        const isSector = role.includes('sector') || role.includes('secteur') || role.includes('sub-agent') || (isAgentGeneric && !!(user as any)?.departement);
        if (isAdmin) {
          qs.push('scope=all');
        }
        qs.push('limit=1000');

        // Charger les déclarations en attente (declaration_especes)
        const url = '/api/hunting-reports' + (qs.length ? `?${qs.join('&')}` : '');
        const items = await apiRequest<any[]>({ url, method: 'GET' });
        const arr = Array.isArray(items) ? items : (items as any)?.data || [];

        // Charger aussi les activités validées (hunting_activities)
        const activitiesUrl = '/api/hunting-activities' + (isAdmin ? '?scope=all&limit=1000' : '?limit=1000');
        const activitiesItems = await apiRequest<any[]>({ url: activitiesUrl, method: 'GET' });
        const activitiesArr = Array.isArray(activitiesItems) ? activitiesItems : (activitiesItems as any)?.data || [];

        // Mapper les déclarations en attente
        const mappedReports = arr.map((r: any) => ({
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
          source: 'declaration'
        }));

        // Mapper les activités validées
        const mappedActivities = activitiesArr.map((a: any) => ({
          lat: Number(a.lat),
          lon: Number(a.lon),
          species: a.speciesName ?? a.species_name ?? null,
          scientificName: a.scientificName ?? a.scientific_name ?? null,
          quantity: a.quantity ?? null,
          date: a.huntingDate ?? a.hunting_date ?? a.createdAt ?? a.created_at ?? null,
          location: a.location ?? null,
          photoUrl: a.id ? `/api/hunting-activities/${a.id}/photo` : null,
          region: a.region ?? null,
          departement: a.departement ?? null,
          commune: a.commune ?? null,
          permitNumber: a.permitNumber ?? a.permit_number ?? null,
          source: 'activity'
        }));

        // Combiner et filtrer par coordonnées GPS valides
        // Note: Le backend filtre déjà par région/département via PostGIS, pas besoin de refiltrer ici
        const mapped = [...mappedReports, ...mappedActivities].filter((it: any) => Number.isFinite(it.lat) && Number.isFinite(it.lon));

        console.log('[MapPage] Abattage fetch:', {
          reportsUrl: url,
          activitiesUrl,
          role,
          isRegional,
          isSector,
          userRegion: (user as any)?.region,
          userDepartement: (user as any)?.departement,
          reportsCount: mappedReports.length,
          activitiesCount: mappedActivities.length,
          totalCount: mapped.length,
          sample: mapped.slice(0, 3).map((m: any) => ({
            species: m.species,
            region: m.region,
            departement: m.departement,
            lat: m.lat,
            lon: m.lon
          }))
        });
        setHuntingReportsCount(mapped.length);
      } catch (e) {
        console.warn('[MapPage] Échec chargement count abattages:', e);
        setHuntingReportsCount(0);
      }
    };
    // Charger au montage et lorsque la zone/role change
    loadCount();
  }, [user?.role, (user as any)?.region, (user as any)?.departement]);

  return (
    <div className="map-page-container">
      <div className="map-content">
        {initialLoading && (
          <div className="map-initial-loader-overlay">
            <div className="map-initial-loader">
              <div className="map-progress">
                <div className="map-progress-bar" style={{ width: `${Math.max(5, Math.min(100, loadProgress))}%` }} />
              </div>
              <div className="map-progress-text">Chargement de la carte… {Math.max(5, Math.min(100, loadProgress))}%</div>
            </div>
          </div>
        )}
        <div
          ref={toolbarRef}
          className={`map-controls-container ${controlsCollapsed ? 'collapsed' : ''}`}
          onPointerDown={onToolbarPointerDown}
          onPointerMove={onToolbarPointerMove}
          onPointerUp={onToolbarPointerUp}
          style={toolbarPos ? { position: 'fixed', right: 0, top: toolbarPos.y, left: 'auto', zIndex: 1000 } : undefined}
        >
          {/* Poignée de déplacement */}
          <div
            className="toolbar-drag-handle"
            style={{
              cursor: 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px 0',
              borderBottom: '1px solid rgba(0,0,0,0.08)',
              marginBottom: 2,
              touchAction: 'none',
            }}
            title="Glisser pour déplacer"
          >
            <span style={{ fontSize: 10, color: '#999', letterSpacing: 2 }}>⠿⠿⠿</span>
          </div>
          {/* Bouton réduire/agrandir */}
          <button
            className="map-controls-toggle"
            onClick={() => setControlsCollapsed(!controlsCollapsed)}
            aria-expanded={!controlsCollapsed}
            title={controlsCollapsed ? 'Agrandir le panneau' : 'Réduire le panneau — glisser pour déplacer'}
            style={{ cursor: 'grab' }}
          >
            <span style={{ fontSize: 8, lineHeight: '10px', display: 'block', marginBottom: 2 }}>⠿</span>
            {controlsCollapsed ? <FaChevronRight /> : <FaChevronLeft />}
          </button>
          {/* Alertes en premier (désormais visible pour tous les rôles) */}
          {true && (
            <button
              className={`map-control-button alertes ${showAlerts ? 'active' : ''}`}
              onClick={async () => {
                if (!showAlerts) {
                  await fetchAlerts();
                }
                setShowAlerts(!showAlerts);
              }}
              title="Afficher/Masquer les alertes"
            >
              {/* Icône sirène avec badge circulaire conditionnel */}
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                <svg className="siren-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <defs>
                    <linearGradient id="sirenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fecaca"/>
                      <stop offset="100%" stopColor="#ef4444"/>
                    </linearGradient>
                    <filter id="sirenShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="rgba(0,0,0,0.35)"/>
                    </filter>
                  </defs>
                  <g filter="url(#sirenShadow)">
                    <path d="M6 12a6 6 0 1 1 12 0v2H6v-2z" fill="url(#sirenGrad)" stroke="#991b1b" strokeWidth="1"/>
                    <rect x="5" y="14" width="14" height="3.5" rx="1.2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1"/>
                    <circle cx="12" cy="9" r="2.4" fill="#fee2e2"/>
                  </g>
                  <g stroke="#ef4444" strokeWidth="1.4" strokeLinecap="round">
                    <path d="M3.5 8.5 L6 10"/>
                    <path d="M20.5 8.5 L18 10"/>
                  </g>
                </svg>
                {(() => {
                  const totalCount = (alertsForMap || []).length;
                  if (!totalCount || totalCount <= 0) return null;
                  return (
                    <span
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -10,
                        width: 20,
                        height: 20,
                        background: '#065f46',
                        color: 'white',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        lineHeight: '20px'
                      }}
                      aria-label="Total des alertes"
                    >{totalCount}</span>
                  );
                })()}
              </span>
              <span className="alertes-label">Alertes</span>
            </button>
          )}
          {/* Infractions: badge total + bascule d'étiquettes par région */}
          <span ref={infractionsButtonRef as any}>
          <button
            className={`map-control-button ${showInfractions ? 'active' : ''}`}
            onClick={async () => {
              if (!showInfractions && infractionsForMap.length === 0) {
                await fetchInfractionsForMap();
              }
              const next = !showInfractions;
              setShowInfractions(next);
              if (!next) setInfractionsPanel(null);
            }}
            title="Afficher/Masquer les infractions par région"
          >
            <span style={{ position: 'relative', display: 'inline-block', width: 26, height: 26, marginRight: 6 }}>
              <FaExclamationTriangle style={{ fontSize: 20, color: showInfractions ? '#f97316' : '#fdba74' }} />
              {(() => {
                const total = Object.values(infractionsCountsByRegion).reduce((a, b) => a + (b || 0), 0);
                if (!total) return null;
                return (
                  <span
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -10,
                      width: 20,
                      height: 20,
                      background: '#065f46',
                      color: 'white',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      lineHeight: '20px'
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      // toggle panel from total badge
                      if (infractionsPanel) { setInfractionsPanel(null); return; }
                      // choose user's region if present with >0, else region with max count
                      const pick = () => {
                        const hasUserRegion = userRegion && infractionsCountsByRegion[userRegion] > 0;
                        if (hasUserRegion) return getOriginalRegionName(userRegion);
                        let bestKey: string | null = null; let bestVal = -1;
                        for (const [k, v] of Object.entries(infractionsCountsByRegion)) {
                          if ((v || 0) > bestVal) { bestVal = v || 0; bestKey = k; }
                        }
                        if (bestKey) return getOriginalRegionName(bestKey);
                        return '';
                      };
                      const region = pick();
                      if (region) handleInfractionsRegionClick(region);
                    }}
                    aria-label="Total des infractions"
                  >{total}</span>
                );
              })()}
            </span>
            <span>Infractions</span>
          </button>
          </span>
          {/* Puis les autres boutons */}
          {/* Bouton Régions: masqué pour chasseur/guide */}
          {!(user?.role === 'hunter' || user?.role === 'hunting-guide') && (
            <button
              className={`map-control-button ${showRegions ? 'active' : ''}`}
              onClick={() => setShowRegions(!showRegions)}
              title="Afficher/Masquer les régions"
            >
              <FaGlobeEurope />
              <span>Régions</span>
            </button>
          )}
          <button
            className={`map-control-button ${colorizeRegionsByStatus ? 'active' : ''}`}
            onClick={() => setColorizeRegionsByStatus(!colorizeRegionsByStatus)}
            title="Afficher/Masquer la coloration par statuts"
            disabled={!showRegions && !showDepartements && !showCommunes && !showArrondissements}
          >
            <FaPalette />
            <span>Statuts</span>
          </button>
          {/* Bouton Départements: masqué pour chasseur/guide */}
          {!(user?.role === 'hunter' || user?.role === 'hunting-guide') && (
            <div style={{ width: '100%', position: 'relative' }}>
              <button
                className={`map-control-button ${showDepartements ? 'active' : ''}`}
                onClick={() => setShowDepartements(!showDepartements)}
                title="Afficher/Masquer les départements"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
                aria-expanded={departementsExpanded}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <FaMapMarkedAlt />
                  <span>Départements</span>
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  style={{ marginLeft: 'auto', paddingLeft: 8, fontSize: 14, cursor: 'pointer', userSelect: 'none' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDepartementsExpanded((prev) => !prev);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      setDepartementsExpanded((prev) => !prev);
                    }
                  }}
                  aria-label="Afficher les sous-couches"
                >
                  {departementsExpanded ? '◀' : '◁'}
                </span>
              </button>
              {departementsExpanded && (
                <div
                  style={{
                    position: 'absolute',
                    right: '100%',
                    left: 'auto',
                    top: 0,
                    marginRight: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    backgroundColor: 'white',
                    padding: '8px',
                    borderRadius: '8px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    minWidth: '200px'
                  }}
                >
                  <button
                    className={`map-control-button ${showCommunes ? 'active' : ''}`}
                    onClick={() => setShowCommunes(!showCommunes)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'auto', justifyContent: 'space-between' }}
                    title="Afficher/Masquer les communes"
                  >
                    <span>Communes</span>
                    {(() => {
                      const count = Array.isArray(currentCommunesGeoJson?.features) ? currentCommunesGeoJson!.features.length : 0;
                      if (!count) return null;
                      return <span className="protected-badge">{count}</span>;
                    })()}
                  </button>
                  <button
                    className={`map-control-button ${showArrondissements ? 'active' : ''}`}
                    onClick={() => setShowArrondissements(!showArrondissements)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'auto', justifyContent: 'space-between' }}
                    title="Afficher/Masquer les arrondissements"
                  >
                    <span>Arrondissements</span>
                    {(() => {
                      const count = Array.isArray(currentArrondissementsGeoJson?.features) ? currentArrondissementsGeoJson!.features.length : 0;
                      if (!count) return null;
                      return <span className="protected-badge">{count}</span>;
                    })()}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Bouton Zones Éco.: masqué pour chasseur/guide */}
          {!(user?.role === 'hunter' || user?.role === 'hunting-guide') && (
            <button
              className={`map-control-button ${showEcoZones ? 'active' : ''}`}
              onClick={() => setShowEcoZones(!showEcoZones)}
              title="Afficher/Masquer les zones écogéographiques"
            >
              <FaLeaf />
              <span>Zones Éco.</span>
            </button>
          )}
          {/* Panneau Zones protégées dépliable HORIZONTALEMENT: masqué pour chasseur/guide */}
          {!(user?.role === 'hunter' || user?.role === 'hunting-guide') && (
            <div style={{ width: '100%', position: 'relative' }}>
              <button
                className={`map-control-button ${protectedZonesExpanded ? 'active' : ''}`}
                onClick={() => setProtectedZonesExpanded(!protectedZonesExpanded)}
                title="Afficher/Masquer les types de zones protégées"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FaDrawPolygon style={{ color: '#000000' }} />
                  <span>Zones protégées</span>
                </div>
                {(() => {
                  const count = Array.isArray(currentProtectedZonesGeoJson?.features) ? currentProtectedZonesGeoJson!.features.length : 0;
                  if (!count || count <= 0) return null;
                  return (
                    <span
                      style={{
                        background: '#065f46',
                        color: 'white',
                        borderRadius: '12px',
                        padding: '0 8px',
                        fontSize: 12,
                        lineHeight: '20px',
                        height: 20,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 8
                      }}
                    >{count}</span>
                  );
                })()}
                <span style={{ fontSize: '16px', marginLeft: 'auto' }}>
                  {protectedZonesExpanded ? '▶' : '◀'}
                </span>
              </button>

              {/* Sous-panneaux dépliables HORIZONTALEMENT VERS LA GAUCHE */}
              {protectedZonesExpanded && (
                <div style={{
                  position: 'absolute',
                  right: '100%',
                  top: 0,
                  marginRight: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  flexWrap: 'nowrap',
                  gap: '4px',
                  backgroundColor: 'white',
                  padding: '8px',
                  borderRadius: '8px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  zIndex: 1000,
                  width: 'auto',
                  minWidth: '140px',
                  maxWidth: '220px',
                  maxHeight: 'calc(100vh - 120px)',
                  overflowY: 'auto'
                }}>
                  {/* Forêt classée */}
                  <button
                    className={`map-control-button ${showForetClassee ? 'active' : ''}`}
                    onClick={() => setShowForetClassee(!showForetClassee)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Forêt classée"
                  >
                    <FaTree style={{ color: '#065f46', fontSize: '16px' }} />
                    <span className="protected-label">Forêt classée</span>
                    {renderProtectedZoneCount(foretClasseeGeoJSON)}
                  </button>

                  {/* Réserve */}
                  <button
                    className={`map-control-button ${showReserve ? 'active' : ''}`}
                    onClick={() => setShowReserve(!showReserve)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Réserve"
                  >
                    <span className="protected-initials">RÉ</span>
                    <span className="protected-label">Réserve</span>
                    {renderProtectedZoneCount(reserveGeoJSON)}
                  </button>

                  {/* AMP */}
                  <button
                    className={`map-control-button ${showAMP ? 'active' : ''}`}
                    onClick={() => setShowAMP(!showAMP)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Aire marine protégée"
                  >
                    <FaWater style={{ color: '#0891b2', fontSize: '16px' }} />
                    <span className="protected-label">AMP</span>
                    {renderProtectedZoneCount(ampGeoJSON)}
                  </button>

                  {/* Zone tampon */}
                  <button
                    className={`map-control-button ${showZoneTampon ? 'active' : ''}`}
                    onClick={() => setShowZoneTampon(!showZoneTampon)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Zone tampon"
                  >
                    <FaShieldAlt style={{ color: '#34d399', fontSize: '16px' }} />
                    <span className="protected-label">Zone tampon</span>
                    {renderProtectedZoneCount(zoneTamponGeoJSON)}
                  </button>

                  {/* Exploitations Forestières */}
                  <button
                    className={`map-control-button ${showExploitationForestiere ? 'active' : ''}`}
                    onClick={() => setShowExploitationForestiere(!showExploitationForestiere)}
                    style={{
                      fontSize: '11px',
                      padding: '5px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      whiteSpace: 'nowrap',
                      minWidth: 'auto'
                    }}
                    title="Exploitations forestières"
                  >
                    <GiWoodPile style={{ color: '#b45309' }} />
                    <span className="protected-label">Exploit. forest.</span>
                    {renderProtectedZoneCount(exploitationForestiereGeoJSON)}
                  </button>

                  {/* Empiétement */}
                  <button
                    className={`map-control-button ${showEmpietement ? 'active' : ''}`}
                    onClick={() => setShowEmpietement(!showEmpietement)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Empiétement"
                  >
                    <FaExclamationTriangle style={{ color: '#f59e0b', fontSize: '16px' }} />
                    <span className="protected-label">Empiétement</span>
                    {renderProtectedZoneCount(empietementGeoJSON)}
                  </button>

                  {/* Feux de brousse */}
                  <button
                    className={`map-control-button ${showFeuxBrousse ? 'active' : ''}`}
                    onClick={() => setShowFeuxBrousse(!showFeuxBrousse)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Feux de brousse"
                  >
                    <FaFire style={{ color: '#dc2626', fontSize: '16px' }} />
                    <span className="protected-label">Feux de brousse</span>
                    {renderProtectedZoneCount(feuxBrousseGeoJSON)}
                  </button>

                  {/* Carrière */}
                  <button
                    className={`map-control-button ${showCarriere ? 'active' : ''}`}
                    onClick={() => setShowCarriere(!showCarriere)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Carrière"
                  >
                    <span className="protected-initials">CA</span>
                    <span className="protected-label">Carrière</span>
                    {renderProtectedZoneCount(carriereGeoJSON)}
                  </button>

                  {/* Concession minière */}
                  <button
                    className={`map-control-button ${showConcessionMiniere ? 'active' : ''}`}
                    onClick={() => setShowConcessionMiniere(!showConcessionMiniere)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Concession minière"
                  >
                    <FaIndustry style={{ color: '#9333ea', fontSize: '16px' }} />
                    <span className="protected-label">Concession minière</span>
                    {renderProtectedZoneCount(concessionMiniereGeoJSON)}
                  </button>

                  {/* Autre */}
                  <button
                    className={`map-control-button ${showAutre ? 'active' : ''}`}
                    onClick={() => setShowAutre(!showAutre)}
                    style={{ fontSize: '13px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', minWidth: 'auto' }}
                    title="Autre"
                  >
                    <FaMapMarkerAlt style={{ color: '#6b7280', fontSize: '16px' }} />
                    <span className="protected-label">Autre</span>
                    {renderProtectedZoneCount(autreGeoJSON)}
                  </button>

                </div>
              )}
            </div>
          )}
          {user?.role === 'hunter' || user?.role === 'hunting-guide' ? (
            <>
              <button
                className={`map-control-button active`}
                disabled
                title="Toujours actif pour ce rôle"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaCrosshairs />
                  {(() => {
                    const count = Array.isArray(currentZicsGeoJson?.features) ? currentZicsGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>ZICs</span>
              </button>
              <button
                className={`map-control-button active`}
                disabled
                title="Toujours actif pour ce rôle"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaCrosshairs />
                  {(() => {
                    const count = Array.isArray(currentAmodieesGeoJson?.features) ? currentAmodieesGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Amodiées</span>
              </button>
              <button
                className={`map-control-button active`}
                disabled
                title="Toujours actif pour ce rôle"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaPaw />
                  {(() => {
                    const count = Array.isArray(currentParcVisiteGeoJson?.features) ? currentParcVisiteGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Parcs</span>
              </button>
              <button
                className={`map-control-button active`}
                disabled
                title="Toujours actif pour ce rôle"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaBullseye />
                  {(() => {
                    const count = Array.isArray(currentRegulationGeoJson?.features) ? currentRegulationGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Régulation</span>
              </button>
            </>
          ) : (
            <>
              <button
                className={`map-control-button ${showZics ? 'active' : ''}`}
                onClick={() => setShowZics(!showZics)}
                title="Afficher/Masquer les ZICs"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaCrosshairs />
                  {(() => {
                    const count = Array.isArray(currentZicsGeoJson?.features) ? currentZicsGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>ZICs</span>
              </button>
              <button
                className={`map-control-button ${showAmodiees ? 'active' : ''}`}
                onClick={() => setShowAmodiees(!showAmodiees)}
                title="Afficher/Masquer les Amodiées"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaCrosshairs />
                  {(() => {
                    const count = Array.isArray(currentAmodieesGeoJson?.features) ? currentAmodieesGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Amodiées</span>
              </button>
              <button
                className={`map-control-button ${showParcVisite ? 'active' : ''}`}
                onClick={() => setShowParcVisite(!showParcVisite)}
                title="Afficher/Masquer les Parcs de visite"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaPaw />
                  {(() => {
                    const count = Array.isArray(currentParcVisiteGeoJson?.features) ? currentParcVisiteGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Parcs</span>
              </button>
              <button
                className={`map-control-button ${showRegulation ? 'active' : ''}`}
                onClick={() => setShowRegulation(!showRegulation)}
                title="Afficher/Masquer les zones de Régulation"
              >
                <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                  <FaBullseye />
                  {(() => {
                    const count = Array.isArray(currentRegulationGeoJson?.features) ? currentRegulationGeoJson!.features.length : 0;
                    if (!count || count <= 0) return null;
                    return (
                      <span style={{ position: 'absolute', top: -6, right: -10, width: 20, height: 20, background: '#065f46', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '20px' }}>{count}</span>
                    );
                  })()}
                </span>
                <span>Régulation</span>
              </button>
            </>
          )}
          {/* Bouton Abattage: admin/agents uniquement — masqué pour les rôles Alerte */}
          {!(user?.role === 'hunter' || user?.role === 'hunting-guide') && !((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole) && (
            <button
              className={`map-control-button ${showHuntingReports ? 'active' : ''}`}
              onClick={async () => {
                const next = !showHuntingReports;
                setShowHuntingReports(next);
                if (next) {
                  try {
                    const qs: string[] = [];
                    const role = (user?.role || '').toLowerCase();
                    const isAdmin = role.includes('admin');

                    // Détection correcte des agents régionaux et secteur
                    const isAgentGeneric = role === 'agent';
                    const isSubAgent = role === 'sub-agent';
                    const isRegional = role.includes('regional') || (isAgentGeneric && !(user as any)?.departement);
                    const isSector = role.includes('sector') || role.includes('secteur') || isSubAgent || (isAgentGeneric && !!(user as any)?.departement);
                    if (isAdmin) {
                      qs.push('scope=all');
                    }
                    qs.push('limit=1000');

                    // Charger les déclarations en attente (declaration_especes)
                    const url = '/api/hunting-reports' + (qs.length ? `?${qs.join('&')}` : '');
                    const items = await apiRequest<any[]>({ url, method: 'GET' });
                    const arr = Array.isArray(items) ? items : (items as any)?.data || [];

                    // Charger aussi les activités validées (hunting_activities)
                    const activitiesUrl = '/api/hunting-activities' + (isAdmin ? '?scope=all&limit=1000' : '?limit=1000');
                    const activitiesItems = await apiRequest<any[]>({ url: activitiesUrl, method: 'GET' });
                    const activitiesArr = Array.isArray(activitiesItems) ? activitiesItems : (activitiesItems as any)?.data || [];

                    // Mapper les déclarations en attente
                    const mappedReports = arr.map((r: any) => ({
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
                      source: 'declaration'
                    }));

                    // Mapper les activités validées
                    const mappedActivities = activitiesArr.map((a: any) => ({
                      lat: Number(a.lat),
                      lon: Number(a.lon),
                      species: a.speciesName ?? a.species_name ?? null,
                      scientificName: a.scientificName ?? a.scientific_name ?? null,
                      quantity: a.quantity ?? null,
                      date: a.huntingDate ?? a.hunting_date ?? a.createdAt ?? a.created_at ?? null,
                      location: a.location ?? null,
                      photoUrl: a.id ? `/api/hunting-activities/${a.id}/photo` : null,
                      region: a.region ?? null,
                      departement: a.departement ?? null,
                      commune: a.commune ?? null,
                      permitNumber: a.permitNumber ?? a.permit_number ?? null,
                      source: 'activity'
                    }));

                    // Combiner et filtrer par coordonnées GPS valides
                    // Note: Le backend filtre déjà par région/département via PostGIS, pas besoin de refiltrer ici
                    const mapped = [...mappedReports, ...mappedActivities].filter((it: any) => Number.isFinite(it.lat) && Number.isFinite(it.lon));

                    console.log('[MapPage] Abattage fetch:', {
                      reportsUrl: url,
                      activitiesUrl,
                      role,
                      isRegional,
                      isSector,
                      userRegion: (user as any)?.region,
                      userDepartement: (user as any)?.departement,
                      reportsCount: mappedReports.length,
                      activitiesCount: mappedActivities.length,
                      totalCount: mapped.length,
                      sample: mapped.slice(0, 3).map((m: any) => ({
                        species: m.species,
                        region: m.region,
                        departement: m.departement,
                        lat: m.lat,
                        lon: m.lon
                      }))
                    });
                    setHuntingReportsData(mapped);
                  } catch (e) {
                    console.error('[MapPage] Échec chargement abattages:', e);
                    setHuntingReportsData([]);
                  }
                } else {
                  setHuntingReportsData([]);
                }
              }}
              title="Afficher/Masquer les abattages déclarés"
            >
              {/* Icône avec badge circulaire conditionnel */}
              <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 6 }}>
                <FaBullseye />
                {(() => {
                  const count = showHuntingReports ? huntingReportsData.length : huntingReportsCount;
                  if (!count || count <= 0) return null;
                  return (
                    <span
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -10,
                        width: 20,
                        height: 20,
                        background: '#065f46',
                        color: 'white',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        lineHeight: '20px'
                      }}
                      aria-label="Nombre d'abattages affichés"
                    >{count}</span>
                  );
                })()}
              </span>
              <span>Abattage</span>
            </button>
          )}
          <button
            className={`map-control-button ${useSatellite ? 'active' : ''}`}
            onClick={() => setUseSatellite(!useSatellite)}
            title="Activer/Désactiver le fond satellite"
          >
            <FaSatellite />
            <span>Satellite</span>
          </button>
        </div>

        <MapComponent
          ref={mapRef}
          regionsGeoJSON={currentRegionsGeoJson}
          departementsGeoJSON={currentDepartementsGeoJson}
          communesGeoJSON={currentCommunesGeoJson}
          arrondissementsGeoJSON={currentArrondissementsGeoJson}
          zicsGeoJSON={currentZicsGeoJson}
          amodieesGeoJSON={currentAmodieesGeoJson}
          parcVisiteGeoJSON={currentParcVisiteGeoJson}
          regulationGeoJSON={currentRegulationGeoJson}
          ecoZonesGeoJSON={currentEcoZonesGeoJson}
          protectedZonesGeoJSON={currentProtectedZonesGeoJson}
          foretClasseeGeoJSON={foretClasseeGeoJSON}
          reserveGeoJSON={reserveGeoJSON}
          parcNationalGeoJSON={parcNationalGeoJSON}
          aireCommunautaireGeoJSON={aireCommunautaireGeoJSON}
          zoneTamponGeoJSON={zoneTamponGeoJSON}
          ampGeoJSON={ampGeoJSON}
          exploitationForestiereGeoJSON={exploitationForestiereGeoJSON}
          empietementGeoJSON={empietementGeoJSON}
          feuxBrousseGeoJSON={feuxBrousseGeoJSON}
          carriereGeoJSON={carriereGeoJSON}
          concessionMiniereGeoJSON={concessionMiniereGeoJSON}
          autreGeoJSON={autreGeoJSON}
          regionStatuses={regionStatuses}
          showRegions={showRegions}
          showDepartements={showDepartements}
          showCommunes={showCommunes}
          showArrondissements={showArrondissements}
          showZics={finalShowZics}
          showAmodiees={finalShowAmodiees}
          showParcVisite={finalShowParcVisite}
          showRegulation={finalShowRegulation}
          showEcoZones={showEcoZones}
          showProtectedZones={showProtectedZones}
          showForetClassee={showForetClassee}
          showReserve={showReserve}
          showParcNational={showParcNational}
          showAireCommunautaire={showAireCommunautaire}
          showZoneTampon={showZoneTampon}
          showAMP={showAMP}
          showExploitationForestiere={showExploitationForestiere}
          showEmpietement={showEmpietement}
          showFeuxBrousse={showFeuxBrousse}
          showCarriere={showCarriere}
          showConcessionMiniere={showConcessionMiniere}
          showAutre={showAutre}
          showRegionalAgents={showAgents}
          showAlerts={showAlerts}
          alerts={alertsForMap}
          agents={agentsForMap}
          selectedMarkerType={selectedMarkerType}
          onMarkerPlaced={() => {}}
          onMarkerTypeSelected={handleMarkerTypeSelected}
          showInfractionsCounts={showInfractions}
          infractionsCountsByRegion={showInfractions ? infractionsCountsByRegion : undefined}
          onInfractionsRegionClick={handleInfractionsRegionClick}
          showHuntingReports={showHuntingReports}
          huntingReports={showHuntingReports ? huntingReportsData : undefined}
          enableHuntingReportsToggle={false}
          userRole={user?.role ?? null}
          userRegion={(user as any)?.region ?? null}
          userDepartement={(user as any)?.departement ?? (user as any)?.zone ?? null}
          useSatellite={useSatellite}
          colorizeRegionsByStatus={colorizeRegionsByStatus}
          loadProgress={loadProgress}
          initialCenter={initialCenter}
          initialZoom={initialZoom}
        />

        {infractionsPanel && (
          <div style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 9999, maxWidth: 360 }}>
            <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 6px 24px rgba(0,0,0,0.18)', padding: 12, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>Infractions – {infractionsPanel.region}</div>
                <button onClick={() => setInfractionsPanel(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}>×</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ background: '#f3f4f6', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#374151' }}>Infractions</div>
                  <div
                    onClick={() => setInfractionsPanel(null)}
                    title="Fermer"
                    style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                  >{infractionsPanel.totals.infractions}</div>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#374151' }}>Contrevenants</div>
                  <div
                    onClick={() => setInfractionsPanel(null)}
                    title="Fermer"
                    style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                  >{infractionsPanel.totals.contrevenants}</div>
                </div>
                <div style={{ background: '#f3f4f6', borderRadius: 6, padding: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: '#374151' }}>Recette</div>
                  <div
                    onClick={() => setInfractionsPanel(null)}
                    title="Fermer"
                    style={{ fontSize: 18, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {new Intl.NumberFormat('fr-FR').format(infractionsPanel.totals.recette)}
                  </div>
                </div>
              </div>
              {/* Diagramme unique: pourcentage d'utilisation des codes (basé sur le nombre d'infractions par code) */}
              {(() => {
                const data = infractionsPanel.byCodeInfractions;
                if (!data.length) return null;
                const total = data.reduce((s, d) => s + d.value, 0) || 1;
                const fallbackColor = '#d6b48d';
                let acc = 0;
                const stops = data.map((d) => {
                  const sliceColor = d.color || fallbackColor;
                  const start = (acc / total) * 360;
                  acc += d.value;
                  const end = (acc / total) * 360;
                  return `${sliceColor} ${start}deg ${end}deg`;
                }).join(',');
                const gradient = stops || `${fallbackColor} 0deg 360deg`;
                const topSlice = data[0];
                const baseSliceColor = topSlice?.color || fallbackColor;
                const topPercent = Math.round(((topSlice?.value || 0) / total) * 100);
                return (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: '#111827' }}>Part d'utilisation des codes</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div
                        style={{
                          position: 'relative',
                          width: 128,
                          height: 128,
                          perspective: '650px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -18,
                            width: '86%',
                            height: '26%',
                            borderRadius: '50%',
                            background: 'radial-gradient(circle, rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0))',
                            filter: 'blur(4px)',
                            zIndex: 0,
                          }}
                        />
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            background: `conic-gradient(${gradient})`,
                            transform: 'rotateX(35deg)',
                            boxShadow: '0 18px 28px rgba(0, 0, 0, 0.25)',
                            border: '1px solid rgba(17, 24, 39, 0.4)',
                            overflow: 'hidden',
                            zIndex: 1,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-45%',
                              left: 0,
                              width: '100%',
                              height: '70%',
                              borderRadius: '50%',
                              background: `linear-gradient(to bottom, ${baseSliceColor}, rgba(0, 0, 0, 0.35))`,
                              opacity: 0.85,
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '8%',
                              left: '12%',
                              width: '76%',
                              height: '38%',
                              borderRadius: '50%',
                              background: 'radial-gradient(circle at 50% 20%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0))',
                              pointerEvents: 'none',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '18%',
                              left: '18%',
                              width: '64%',
                              height: '64%',
                              borderRadius: '50%',
                              background: 'linear-gradient(160deg, rgba(255,255,255,0.95), rgba(229,231,235,0.55))',
                              border: '1px solid rgba(17,24,39,0.12)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transform: 'rotateX(-35deg)',
                              boxShadow: 'inset 0 6px 12px rgba(0,0,0,0.08)',
                              pointerEvents: 'none',
                            }}
                          >
                            <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{topPercent}%</div>
                            <div style={{ fontSize: 10, color: '#4b5563', textAlign: 'center', padding: '0 6px' }}>{topSlice?.label || '—'}</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gap: 4, alignContent: 'start' }}>
                        {data.slice(0, 8).map((d, i) => (
                          <div key={d.label || i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                background: d.color || fallbackColor,
                                borderRadius: 2,
                                display: 'inline-block',
                                boxShadow: '0 0 4px rgba(0, 0, 0, 0.18)',
                              }}
                            />
                            <span style={{ color: '#111827' }}>{d.label}</span>
                            <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{Math.round((d.value / total) * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MapPage;
