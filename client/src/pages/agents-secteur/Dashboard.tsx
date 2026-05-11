import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface SectorRevenueMonthlyRow {
  monthKey: string;
  permitAmount: number;
  taxAmount: number;
  infractionAmount: number;
}

interface DepartmentRevenueRow {
  region: string;
  departement: string;
  permitAmount: number;
  taxAmount: number;
  infractionAmount: number;
}

const SectorAgentDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  // search field removed for sector agent view

  const [showRevenueChart, setShowRevenueChart] = useState(false);

  // Charger les permis (scopés par createdBy côté backend)
  const permitsQuery = useQuery<any[], Error>({
    queryKey: ["/api/permits", (user as any)?.id],
    queryFn: () => apiRequest({ url: "/api/permits", method: "GET" }),
    enabled: true,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Statistiques de recettes par département (agrégat national filtré sur le département de l'agent)
  const { data: revenueByDepartment } = useQuery<DepartmentRevenueRow[]>({
    queryKey: ["/api/stats/national/revenue-by-department"],
    queryFn: async () => {
      const resp = await apiRequest<any>({ url: "/api/stats/national/revenue-by-department", method: "GET" });
      // Supporte à la fois un format brut [] et { ok, data }
      return (((resp as any)?.data ?? resp) || []) as DepartmentRevenueRow[];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  // Recettes mensuelles (permits + taxes + infractions) pour l'agent secteur
  const { data: revenueByMonth, isLoading: revenueByMonthLoading } = useQuery<SectorRevenueMonthlyRow[]>({
    queryKey: ["/api/stats/sector/revenue-by-month"],
    queryFn: async () => {
      const resp = await apiRequest<any>({ url: "/api/stats/sector/revenue-by-month", method: "GET" });
      if (!(resp as any)?.ok && (resp as any)?.error) {
        console.error("Erreur /api/stats/sector/revenue-by-month:", (resp as any).error);
        return [] as SectorRevenueMonthlyRow[];
      }
      return (((resp as any)?.data ?? resp) || []) as SectorRevenueMonthlyRow[];
    },
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Charger les taxes (scopées par createdBy)
  const taxesQuery = useQuery<any[], Error>({
    queryKey: ["/api/taxes", (user as any)?.id],
    queryFn: () => apiRequest({ url: "/api/taxes", method: "GET" }),
    enabled: true,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Toast on errors
  useEffect(() => {
    if (permitsQuery.error) {
      const err = permitsQuery.error as unknown as { message?: string };
      toast({ title: "Erreur", description: err?.message || "Impossible de charger les permis", variant: "destructive" });
    }
  }, [permitsQuery.error]);
  useEffect(() => {
    if (taxesQuery.error) {
      const err = taxesQuery.error as unknown as { message?: string };
      toast({ title: "Erreur", description: err?.message || "Impossible de charger les taxes", variant: "destructive" });
    }
  }, [taxesQuery.error]);

  const permits = Array.isArray(permitsQuery.data) ? permitsQuery.data : [];
  const taxes = Array.isArray(taxesQuery.data) ? taxesQuery.data : [];

  // KPIs dérivés
  const uniqueHunterIds = new Set<number>();
  for (const p of permits) {
    if (p.hunterId != null) uniqueHunterIds.add(Number(p.hunterId));
  }
  const totalHunters = uniqueHunterIds.size; // approximation: chasseurs avec permis émis par l'agent

  // Charger les infractions (scopées par le backend selon le rôle)
  const infractionsQuery = useQuery<any[], Error>({
    queryKey: ["/api/infractions/infractions", (user as any)?.id],
    queryFn: () => apiRequest({ url: "/api/infractions/infractions", method: "GET" }),
    enabled: !!user,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const infractions = Array.isArray(infractionsQuery.data) ? infractionsQuery.data : [];

  const { data: sectorSubAgents } = useQuery<any[]>({
    queryKey: ["/api/users/sector-subagents", (user as any)?.id],
    queryFn: () => apiRequest({ url: "/api/users/sector-subagents", method: "GET" }),
    enabled: !!user,
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const sectorSubAgentsCount = Array.isArray(sectorSubAgents) ? sectorSubAgents.length : 0;
  const contrevenantsCount = useMemo(() => {
    if (!Array.isArray(infractions)) return 0;
    const ids = new Set<number>();
    for (const inf of infractions) {
      const list = (inf as any)?.contrevenants as any[] | undefined;
      if (!Array.isArray(list)) continue;
      for (const c of list) {
        if (c && c.id != null) ids.add(Number(c.id));
      }
    }
    return ids.size;
  }, [infractions]);

  const revenueMonthlyData = useMemo(() => {
    const rows = Array.isArray(revenueByMonth) ? revenueByMonth : [];
    if (rows.length === 0) return [] as Array<{ monthKey: string; label: string; permitTax: number; infractions: number }>;

    const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });

    return rows
      .map((row) => {
        const [yearStr, monthStr] = String(row.monthKey || '').split('-');
        const year = Number(yearStr);
        const monthIndex = Number(monthStr) - 1;
        const hasValidDate = Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0;
        const date = hasValidDate ? new Date(year, monthIndex, 1) : null;
        const label = date ? monthFormatter.format(date) : String(row.monthKey || '');
        const permitAmount = Number(row.permitAmount || 0);
        const taxAmount = Number(row.taxAmount || 0);
        const infractionAmount = Number(row.infractionAmount || 0);
        return {
          monthKey: String(row.monthKey || ''),
          label,
          permitTax: permitAmount + taxAmount,
          infractions: infractionAmount,
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [revenueByMonth]);

  // Agrégat départemental pour le département de l'agent
  const departmentStats = useMemo(() => {
    if (!user) return null;

    const agentRegionRaw = String((user as any).region || '').trim().toLowerCase();
    const agentDeptRaw = String((user as any).departement || '').trim().toLowerCase();

    const rows = Array.isArray(revenueByDepartment) ? revenueByDepartment : [];
    const matches = rows.filter((row) => {
      const r = String(row.region || '').trim().toLowerCase();
      const d = String(row.departement || '').trim().toLowerCase();
      return (!agentRegionRaw || r === agentRegionRaw) && (!agentDeptRaw || d === agentDeptRaw);
    });

    if (matches.length === 0) return null;

    const permitAmount = matches.reduce((sum, r) => sum + Number(r.permitAmount || 0), 0);
    const taxAmount = matches.reduce((sum, r) => sum + Number(r.taxAmount || 0), 0);
    const infractionAmount = matches.reduce((sum, r) => sum + Number(r.infractionAmount || 0), 0);

    return {
      permitAmount,
      taxAmount,
      infractionAmount,
      total: permitAmount + taxAmount + infractionAmount,
    };
  }, [user, revenueByDepartment]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord secteur</h1>
          <p className="text-muted-foreground">
            {(() => {
              const rawRegion = (user?.region || '').trim();
              const regionKey = rawRegion
                .toLowerCase()
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '') // remove accents
                .replace(/\s+/g, '-');
              const sectorValue = ((user as any)?.zone || (user as any)?.departement || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .replace(/\s+/g, '-');
              const list = (departmentsByRegion as any)[regionKey] as Array<{ value: string; label: string }>|undefined;
              const found = list?.find(d => d.value === sectorValue);
              const label = found?.label?.replace(/^Secteur\s+/i, '');
              const fallback = sectorValue ? sectorValue.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '';
              return (
                <>Bienvenue, Agent {user?.firstName} - Secteur {label || fallback || 'Non spécifié'}</>
              );
            })()}
          </p>
        </div>
        {/* Search and refresh removed for sector agent */}
      </div>

      {/* Cartes de statistiques (données réelles) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chasseurs actifs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHunters}</div>
            <p className="text-xs text-muted-foreground">avec un permis délivré</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contrevenants enregistrés</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contrevenantsCount}</div>
            <p className="text-xs text-muted-foreground">liés à des infractions dans votre zone</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Infractions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Array.isArray(infractions) ? infractions.length : 0}</div>
            <p className="text-xs text-muted-foreground">enregistrées dans votre zone</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recette</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{Number(departmentStats?.total || 0).toLocaleString('fr-FR')} FCFA</div>
            <p className="text-xs text-muted-foreground">Total (Permis + Taxes + Infractions)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Agents Sous Secteur/Brigade</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{sectorSubAgentsCount}</div>
            <p className="text-xs text-muted-foreground">Agents rattachés à votre secteur</p>
          </CardContent>
        </Card>
      </div>

      {/* Statistiques départementales basées sur le département de l'agent */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Statistiques départementales (recettes)</CardTitle>
        </CardHeader>
        <CardContent>
          {!departmentStats ? (
            <div className="text-sm text-muted-foreground">
              Aucune donnée de recettes départementales disponible pour votre département.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Total (Permis + Taxes + Infractions)</p>
                <div className="text-lg font-bold">{departmentStats.total.toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Permis</p>
                <div className="text-lg font-bold">{departmentStats.permitAmount.toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taxes</p>
                <div className="text-lg font-bold">{departmentStats.taxAmount.toLocaleString('fr-FR')} FCFA</div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Infractions</p>
                <div className="text-lg font-bold">{departmentStats.infractionAmount.toLocaleString('fr-FR')} FCFA</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recettes mensuelles secteur */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Recettes mensuelles (Permis + Taxes / Infractions)</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRevenueChart((prev) => !prev)}
          >
            {showRevenueChart ? "Masquer les recettes" : "Voir les recettes"}
          </Button>
        </CardHeader>
        {showRevenueChart && (
          <CardContent>
            {revenueByMonthLoading ? (
              <div className="text-sm text-muted-foreground">Chargement des recettes mensuelles…</div>
            ) : revenueMonthlyData.length === 0 ? (
              <div className="text-sm text-muted-foreground">Aucune donnée de recettes mensuelles disponible.</div>
            ) : (
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueMonthlyData} margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} angle={-15} textAnchor="end" height={60} />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => Number(value).toLocaleString('fr-FR')}
                    />
                    <Tooltip formatter={(value: number) => [`${Number(value).toLocaleString('fr-FR')} FCFA`, 'Montant']} />
                    <Legend />
                    <Line type="monotone" dataKey="permitTax" name="Permis + Taxes" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="infractions" name="Infractions" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Alertes section removed for sector agent view */}
    </div>
  );
};

export default SectorAgentDashboard;
