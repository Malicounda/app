import MapComponent from '@/components/MapComponent';
import { useAuth } from '@/contexts/AuthContext';
import { DepartementProperties, GeoJSONProperties, RegionProperties, type RegionStatusData } from '@/lib/geoData';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export default function ReboisementLocalisation() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [regions, setRegions] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties> | null>(null);
  const [departements, setDepartements] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties> | null>(null);
  const [communes, setCommunes] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties> | null>(null);
  const [arrondissements, setArrondissements] = useState<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties> | null>(null);
  const [ecoZones, setEcoZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [protectedZones, setProtectedZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [foretClassee, setForetClassee] = useState<GeoJSON.FeatureCollection | null>(null);
  const [zoneTampon, setZoneTampon] = useState<GeoJSON.FeatureCollection | null>(null);
  const [aireCommunautaire, setAireCommunautaire] = useState<GeoJSON.FeatureCollection | null>(null);
  const [carriere, setCarriere] = useState<GeoJSON.FeatureCollection | null>(null);
  const [exploitationForestiere, setExploitationForestiere] = useState<GeoJSON.FeatureCollection | null>(null);
  const [ampZones, setAmpZones] = useState<GeoJSON.FeatureCollection | null>(null);
  const [statusData] = useState<RegionStatusData>({});
  const [loadProgress, setLoadProgress] = useState(0);
  const [showRegions, setShowRegions] = useState(true);
  const [showDepartements, setShowDepartements] = useState(true);
  const [showCommunes, setShowCommunes] = useState(false);
  const [showArrondissements, setShowArrondissements] = useState(false);
  const [showEcoZonesToggle, setShowEcoZonesToggle] = useState(false);
  const [showForetClassee, setShowForetClassee] = useState(false);
  const [showZoneTampon, setShowZoneTampon] = useState(false);
  const [showAireCommunautaire, setShowAireCommunautaire] = useState(false);
  const [showCarriere, setShowCarriere] = useState(false);
  const [showExploitationForestiere, setShowExploitationForestiere] = useState(false);
  const [showAMPZones, setShowAMPZones] = useState(false);
  const [useSatellite, setUseSatellite] = useState(false);
  const [nurseries, setNurseries] = useState<any[] | null>(null);
  const [reforestationZones, setReforestationZones] = useState<any[] | null>(null);
  const [showNurseries, setShowNurseries] = useState(false);
  const [showReforestationZones, setShowReforestationZones] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        setLoadProgress(10);
        const [reg, dep, com, arr, eco] = await Promise.all([
          apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, RegionProperties>>({ url: '/api/regions', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, DepartementProperties>>({ url: '/api/departements', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties>>({ url: '/api/communes', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection<GeoJSON.Geometry, GeoJSONProperties>>({ url: '/api/arrondissements', method: 'GET' }).catch(() => null),
          apiRequest<GeoJSON.FeatureCollection>({ url: '/api/eco-zones', method: 'GET' }).catch(() => null),
        ]);
        if (cancelled) return;
        if (reg) setRegions(reg);
        if (dep) setDepartements(dep);
        if (com) setCommunes(com);
        if (arr) setArrondissements(arr);
        if (eco) setEcoZones(eco);
        setLoadProgress(100);
      } catch {
        if (!cancelled) setLoadProgress(100);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // Chargement des zones protégées une seule fois (utilisation simplifiée pour le reboisement)
  useEffect(() => {
    const loadProtected = async () => {
      try {
        const data = await apiRequest<GeoJSON.FeatureCollection>({ url: '/api/protected-zones', method: 'GET' }).catch(() => null);
        if (!data) return;
        setProtectedZones(data);
        const norm = (s?: string | null) => String(s || '')
          .toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, '_')
          .trim();
        const ofType = (t: string): GeoJSON.FeatureCollection => ({
          type: 'FeatureCollection',
          features: (data.features || []).filter((f: any) => norm(f?.properties?.type) === t),
        } as any);
        setForetClassee(ofType('foret_classee'));
        setZoneTampon(ofType('zone_tampon'));
        setAireCommunautaire(ofType('aire_communautaire'));
        setCarriere(ofType('carriere'));
        setExploitationForestiere(ofType('exploitation_forestiere'));
        setAmpZones(ofType('amp'));
      } catch (e) {
        console.error('[ReboisementLocalisation] Échec chargement Zones protégées:', e);
      }
    };

    if (!protectedZones) {
      loadProtected();
    }
  }, [protectedZones]);

  const handleToggleNurseries = async () => {
    try {
      if (!nurseries && !showNurseries) {
        const data = await apiRequest<any[]>({ url: '/api/reboisement/pepinieres/map', method: 'GET' }).catch(() => null);
        if (data && Array.isArray(data)) {
          setNurseries(data);
        } else if (data && (data as any).data && Array.isArray((data as any).data)) {
          setNurseries((data as any).data);
        } else {
          setNurseries([]);
        }
      }
    } catch (e) {
      console.error('[ReboisementLocalisation] Échec chargement pépinières:', e);
    } finally {
      setShowNurseries((v) => !v);
    }
  };

  const handleToggleReforestationZones = async () => {
    try {
      if (!reforestationZones && !showReforestationZones) {
        const data = await apiRequest<any[]>({ url: '/api/reboisement/zones/map', method: 'GET' }).catch(() => null);
        if (data && Array.isArray(data)) {
          setReforestationZones(data);
        } else if (data && (data as any).data && Array.isArray((data as any).data)) {
          setReforestationZones((data as any).data);
        } else {
          setReforestationZones([]);
        }
      }
    } catch (e) {
      console.error('[ReboisementLocalisation] Échec chargement zones reboisées:', e);
    } finally {
      setShowReforestationZones((v) => !v);
    }
  };

  return (
    <div className="w-full bg-transparent">

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
          {/* Panneau de contrôle à gauche */}
          <div className="md:col-span-1 bg-white rounded-2xl shadow-xl p-4 space-y-4 text-sm text-gray-800">
            <div className="font-semibold text-gray-900 mb-1">Couches affichées</div>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-2">
                <span>Régions</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600"
                  checked={showRegions}
                  onChange={(e) => setShowRegions(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Départements</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600"
                  checked={showDepartements}
                  onChange={(e) => setShowDepartements(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Communes</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600"
                  checked={showCommunes}
                  onChange={(e) => setShowCommunes(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>Arrondissements</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600"
                  checked={showArrondissements}
                  onChange={(e) => setShowArrondissements(e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-2 opacity-80">
                <span>Zones éco-géographiques</span>
                <input
                  type="checkbox"
                  className="h-4 w-4 text-green-600"
                  checked={showEcoZonesToggle}
                  onChange={(e) => setShowEcoZonesToggle(e.target.checked)}
                />
              </label>
            </div>

            <div className="pt-3 border-t border-gray-200 mt-3 space-y-2">
              <div className="font-semibold text-gray-900 text-sm">Fond de carte</div>
              <button
                type="button"
                onClick={() => setUseSatellite((v) => !v)}
                className={`w-full inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border ${
                  useSatellite
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                }`}
              >
                {useSatellite ? 'Satellite activé' : 'Activer le satellite'}
              </button>
            </div>

            <div className="pt-3 border-t border-gray-200 mt-3 space-y-2">
              <div className="font-semibold text-gray-900 text-sm">Zones protégées</div>
              <div className="space-y-2">
                <label className="flex items-center justify-between gap-2">
                  <span>Forêts classées</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showForetClassee}
                    onChange={(e) => setShowForetClassee(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Zones tampons</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showZoneTampon}
                    onChange={(e) => setShowZoneTampon(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Aires communautaires</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showAireCommunautaire}
                    onChange={(e) => setShowAireCommunautaire(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Carrières</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showCarriere}
                    onChange={(e) => setShowCarriere(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>Exploit. forestières</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showExploitationForestiere}
                    onChange={(e) => setShowExploitationForestiere(e.target.checked)}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  <span>AMP</span>
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-green-600"
                    checked={showAMPZones}
                    onChange={(e) => setShowAMPZones(e.target.checked)}
                  />
                </label>
              </div>

              <div className="font-semibold text-gray-900 text-sm">Thèmes</div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleToggleNurseries}
                  className={`w-full inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border transition-colors ${
                    showNurseries
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                  }`}
                >
                  Pépinières
                </button>
                <button
                  type="button"
                  onClick={handleToggleReforestationZones}
                  className={`w-full inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium border transition-colors ${
                    showReforestationZones
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-green-700 border-green-200 hover:bg-green-50'
                  }`}
                >
                  Zones reboisées
                </button>
              </div>
            </div>
          </div>

          {/* Carte à droite */}
          <div className="md:col-span-3 bg-white rounded-2xl shadow-xl overflow-hidden" style={{ height: '70vh' }}>
            <MapComponent
            regionsGeoJSON={regions}
            departementsGeoJSON={departements}
            communesGeoJSON={communes}
            arrondissementsGeoJSON={arrondissements}
            ecoZonesGeoJSON={ecoZones}
            protectedZonesGeoJSON={protectedZones}
            foretClasseeGeoJSON={foretClassee}
            reserveGeoJSON={null}
            parcNationalGeoJSON={null}
            aireCommunautaireGeoJSON={aireCommunautaire}
            zoneTamponGeoJSON={zoneTampon}
            ampGeoJSON={ampZones}
            exploitationForestiereGeoJSON={exploitationForestiere}
            empietementGeoJSON={null}
            feuxBrousseGeoJSON={null}
            carriereGeoJSON={carriere}
            concessionMiniereGeoJSON={null}
            autreGeoJSON={null}
            zicsGeoJSON={null}
            amodieesGeoJSON={null}
            parcVisiteGeoJSON={null}
            regulationGeoJSON={null}
            regionStatuses={statusData}
            showRegions={showRegions}
            showDepartements={showDepartements}
            showCommunes={showCommunes}
            showArrondissements={showArrondissements}
            showZics={false}
            showAmodiees={false}
            showParcVisite={false}
            showRegulation={false}
            showEcoZones={!!ecoZones && showEcoZonesToggle}
            showProtectedZones={false}
            showForetClassee={showForetClassee}
            showReserve={false}
            showParcNational={false}
            showAireCommunautaire={showAireCommunautaire}
            showZoneTampon={showZoneTampon}
            showAMP={showAMPZones}
            showExploitationForestiere={showExploitationForestiere}
            showEmpietement={false}
            showFeuxBrousse={false}
            showCarriere={showCarriere}
            showConcessionMiniere={false}
            showAutre={false}
            showRegionalAgents={false}
            showAlerts={false}
            alerts={[]}
            agents={[]}
            selectedMarkerType={null}
            onMarkerPlaced={() => { }}
            onMarkerTypeSelected={() => { }}
            showInfractionsCounts={false}
            infractionsCountsByRegion={undefined}
            onInfractionsRegionClick={undefined}
            showHuntingReports={false}
            huntingReports={undefined}
            enableHuntingReportsToggle={false}
            userRole={user?.role ?? null}
            userRegion={(user as any)?.region ?? null}
            userDepartement={(user as any)?.departement ?? (user as any)?.zone ?? null}
            useSatellite={useSatellite}
            colorizeRegionsByStatus={false}
            loadProgress={loadProgress}
            nurseries={nurseries ?? []}
            showNurseries={showNurseries}
            reforestationZones={reforestationZones ?? []}
            showReforestationZones={showReforestationZones}
            minimal={true}
            compactControls={true}
          />
          </div>
        </div>
      </div>
    </div>
  );
}
