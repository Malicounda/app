import AddReforestationAgentForm from "@/components/reboisement/AddReforestationAgentForm";
import { NurseryTypeManager } from "@/components/reboisement/NurseryTypeManager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, FileText, Map as MapIcon, MapPin, Sprout, TreePine, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

// Types pour les données du tableau de bord reboisement
type ReforestationDashboardStats = {
  totalAgents: number;
  regionalAgents: number;
  sectorAgents: number;
  activeNurseries: number;
  regieNurseries: number;
  otherNurseries: number;
  totalPlants: number;
  regiePlants: number;
  otherPlants: number;
  totalAttributedPlants: number;
  totalLinearKm: number;
  totalMassifHa: number;
  totalProjects: number;
  plantedTrees: number;
  survivalRate: number;
  pendingReports: number;
};

const formatNumber = (val: number | string) => {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  return n.toLocaleString('fr-FR');
};

const SplitCardContent = ({ total, label1, value1, label2, value2 }: { total: number | string, label1: string, value1: number | string, label2: string, value2: number | string }) => (
  <div className="flex flex-col w-full space-y-3">
    <div className="text-3xl font-bold text-gray-900 text-center">{total}</div>
    <div className="border rounded-md overflow-hidden bg-gray-50/50">
      <div className="grid grid-cols-2 border-b bg-gray-100/50">
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-800 py-1 text-center border-r">{label1}</div>
        <div className="text-[10px] uppercase tracking-wider font-bold text-green-800 py-1 text-center">{label2}</div>
      </div>
      <div className="grid grid-cols-2 bg-white">
        <div className="text-lg font-bold text-gray-800 py-1 text-center border-r">{value1}</div>
        <div className="text-lg font-bold text-gray-800 py-1 text-center">{value2}</div>
      </div>
    </div>
  </div>
);

const ReforestationAdminDashboard = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [showAddAgentDialog, setShowAddAgentDialog] = useState(false);
  const [showNurseryTypeManager, setShowNurseryTypeManager] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (selectedRegion) return;
    const r = (user as any)?.region;
    if (typeof r === 'string' && r.trim().length > 0) {
      setSelectedRegion(r);
    }
  }, [user, selectedRegion]);

  // Récupération dynamique des régions depuis l'API (/api/regions)
  type RegionsFC = { type: 'FeatureCollection'; features: Array<{ properties?: { nom?: string; code?: string; NOM_REGION?: string } }> };
  const { data: regionsFC } = useQuery({
    queryKey: ['regions-list'],
    queryFn: async () => {
      return await apiRequest({ url: '/regions', method: 'GET' }) as RegionsFC;
    },
    enabled: isAuthenticated && !authLoading,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // Options de régions
  const regionOptions = useMemo(() => {
    const feats = regionsFC?.features || [];
    const normalize = (s: string) => (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase();
    const names = feats
      .map(f => f?.properties?.nom || f?.properties?.NOM_REGION || f?.properties?.code)
      .filter((v): v is string => !!v && v.trim().length > 0)
      .map(v => normalize(v))
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b));
    return names;
  }, [regionsFC]);

  // Récupération des départements
  const { data: deptsFC } = useQuery({
    queryKey: ['departements-list', selectedRegion],
    queryFn: async () => {
      const url = selectedRegion
        ? `/api/departements?region=${encodeURIComponent(selectedRegion)}`
        : '/api/departements';
      return await apiRequest({ url, method: 'GET' });
    },
    enabled: isAuthenticated && !authLoading,
  });

  const departementOptions = useMemo(() => {
    const feats = (deptsFC as any)?.features || [];
    return feats
      .map((f: any) => f?.properties?.nom || f?.properties?.NOM_DEPT)
      .filter((v: string) => !!v)
      .sort((a: string, b: string) => a.localeCompare(b));
  }, [deptsFC]);

  // Récupérer les statistiques reboisement (placeholder pour l'instant)
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['reforestation-admin-stats', selectedRegion],
    queryFn: async () => {
      const url = selectedRegion
        ? `/api/reboisement/stats/regional?region=${encodeURIComponent(selectedRegion)}`
        : '/api/reboisement/stats/regional';
      return await apiRequest({ url, method: 'GET' }) as ReforestationDashboardStats;
    },
    enabled: isAuthenticated && !authLoading,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  return (
    <div className="flex flex-col min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Administration Reboisement</h1>
          <p className="text-gray-600">
            Espace dédié à la Division REBOISEMENT - Bienvenue, {user?.firstName} {user?.lastName}
          </p>
        </div>
      </div>

      {/* Cartes principales - Statistiques clés */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 w-full">
        {/* Chef de Division Reboisement */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-gray-500">Chef de Division Reboisement</CardTitle>
            <Users className="h-4 w-4 text-emerald-700" />
          </CardHeader>
          <CardContent>
            <SplitCardContent
              total={loadingStats ? '...' : stats?.totalAgents ?? 0}
              label1="Régionaux"
              value1={stats?.regionalAgents ?? 0}
              label2="Secteurs"
              value2={stats?.sectorAgents ?? 0}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Agents {selectedRegion ? `en ${selectedRegion}` : 'au National'}
            </p>
          </CardContent>
        </Card>

        {/* Pépinières actives */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pépinières actives</CardTitle>
            <Sprout className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <SplitCardContent
              total={loadingStats ? '...' : stats?.activeNurseries ?? 0}
              label1="Régie"
              value1={stats?.regieNurseries ?? 0}
              label2="Autre"
              value2={stats?.otherNurseries ?? 0}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              En fonctionnement
            </p>
          </CardContent>
        </Card>

        {/* Nombre de plants */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nombre de plants</CardTitle>
            <TreePine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <SplitCardContent
              total={loadingStats ? '...' : formatNumber(stats?.totalPlants ?? 0)}
              label1="Régie"
              value1={formatNumber(stats?.regiePlants ?? 0)}
              label2="Autre"
              value2={formatNumber(stats?.otherPlants ?? 0)}
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Production totale enregistrée
            </p>
          </CardContent>
        </Card>

        {/* Réalisations terrain */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Réalisations terrain</CardTitle>
            <MapIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
             <div className="grid grid-cols-1 gap-2 mt-1">
                <div className="flex justify-between items-center text-sm border-b pb-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Plants attribués</span>
                   <span className="font-bold text-emerald-700">{loadingStats ? '...' : formatNumber(stats?.totalAttributedPlants ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-b pb-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Linéaire (km)</span>
                   <span className="font-bold text-emerald-700">{loadingStats ? '...' : formatNumber(stats?.totalLinearKm ?? 0)} km</span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1">
                   <span className="text-muted-foreground text-xs uppercase font-semibold">Massif (ha)</span>
                   <span className="font-bold text-emerald-700">{loadingStats ? '...' : formatNumber(stats?.totalMassifHa ?? 0)} ha</span>
                </div>
             </div>
             <p className="text-[10px] text-muted-foreground mt-3 italic">
               Basé sur les rapports validés/soumis
             </p>
          </CardContent>
        </Card>
      </div>

      {/* Indicateurs de performance secondaires */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projets de reboisement</CardTitle>
            <TreePine className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold">{loadingStats ? '...' : stats?.totalProjects ?? 0}</div>
            <p className="text-xs text-muted-foreground">Projets en cours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taux de survie</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold">{loadingStats ? '...' : `${stats?.survivalRate ?? 0}%`}</div>
            <p className="text-xs text-muted-foreground">Moyenne {selectedRegion ? `en ${selectedRegion}` : 'Nationale'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demandes en attente</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold">{loadingStats ? '...' : stats?.pendingReports ?? 0}</div>
            <p className="text-xs text-muted-foreground">Rapports à valider</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertes</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-bold">0</div>
            <p className="text-xs text-muted-foreground">Notifications actives</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions rapides - Grille de fonctionnalités */}
      <Card>
        <CardHeader>
          <CardTitle>Actions administrateur</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div
              className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => setShowAddAgentDialog(true)}
            >
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-green-700" />
                <h3 className="font-semibold text-gray-800">Gestion des agents</h3>
              </div>
              <p className="text-sm text-gray-600">Créer et gérer les comptes agents régionaux, secteur, brigade, triage</p>
            </div>

            <div
              className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => setShowNurseryTypeManager(true)}
            >
              <div className="flex items-center gap-3 mb-2">
                <Sprout className="w-5 h-5 text-green-700" />
                <h3 className="font-semibold text-gray-800">Types de pépinières</h3>
              </div>
              <p className="text-sm text-gray-600">Gérer les types de pépinières par département (+ Ajouter)</p>
            </div>

            <div className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <TreePine className="w-5 h-5 text-green-700" />
                <h3 className="font-semibold text-gray-800">Projets</h3>
              </div>
              <p className="text-sm text-gray-600">Création et suivi des projets de reboisement</p>
            </div>

            <div className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-5 h-5 text-green-700" />
                <h3 className="font-semibold text-gray-800">Cartographie</h3>
              </div>
              <p className="text-sm text-gray-600">Visualisation des zones de reboisement sur la carte</p>
            </div>

            <Link href="/reboisement/reports">
              <div className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="w-5 h-5 text-green-700" />
                  <h3 className="font-semibold text-gray-800">Rapports quinzaine</h3>
                </div>
                <p className="text-sm text-gray-600">Consolidation et validation des rapports par région</p>
              </div>
            </Link>

            <div className="rounded-lg border p-4 hover:bg-gray-50 cursor-pointer transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-green-700" />
                <h3 className="font-semibold text-gray-800">Indicateurs</h3>
              </div>
              <p className="text-sm text-gray-600">Tableaux de bord et statistiques de performance</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddReforestationAgentForm
        open={showAddAgentDialog}
        onClose={() => setShowAddAgentDialog(false)}
      />

      <NurseryTypeManager
        open={showNurseryTypeManager}
        onOpenChange={setShowNurseryTypeManager}
        departements={departementOptions}
      />
    </div>
  );
};

export default ReforestationAdminDashboard;
