import ResponsivePage from "@/components/layout/ResponsivePage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { exportToCsv } from "@/utils/export";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Loader2, MapPin } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function RegionalStatsPage() {
  const { user } = useAuth();
  const selectedPeriod = "all";

  // Types locaux pour contraindre les réponses API et éviter les '{}'
  interface AgentInfo { region?: string }
  interface RegionalStats {
    hunterCount: number;
    contrevenantCount: number;
    activePermitCount: number;
    expiredPermitCount: number;
    suspendedPermitCount: number;
    taxCount: number;
    infractionCount?: number;
    revenue: number;            // Permis + Taxes + Infractions pour la région
    pendingRequests: number;
    infractionRevenue?: number; // Montant total des infractions dans la région (optionnel)
  }
  interface PermitByMonth { month: string; count: number }

  // Récupérer les informations de l'agent connecté
  const { data: agentInfo } = useQuery({
    queryKey: ["/api/users/me"],
    queryFn: () => apiRequest({ url: "/api/auth/me", method: "GET" }),
    enabled: !!user && user.role === "agent",
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Région de l'agent connecté
  const agent = (agentInfo as AgentInfo | undefined);
  const agentRegion = agent?.region || "";

  // Récupérer les statistiques régionales
  const { data: regionalStats, isLoading: isLoadingStats } = useQuery({
    queryKey: ["/api/stats/regional", agentRegion, selectedPeriod],
    queryFn: () => apiRequest({
      url: `/api/stats/regional?region=${agentRegion}&period=${selectedPeriod}`,
      method: "GET"
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer l'évolution des permis par mois dans la région
  const { data: permitsByMonth, isLoading: isLoadingPermitsByMonth } = useQuery({
    queryKey: ["/api/stats/regional/permits-by-month", agentRegion],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/permits-by-month?region=${agentRegion}`,
      method: "GET"
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer l'évolution des taxes par mois dans la région
  const { data: taxesByMonth, isLoading: isLoadingTaxesByMonth } = useQuery({
    queryKey: ["/api/stats/regional/taxes-by-month", agentRegion],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/taxes-by-month?region=${agentRegion}`,
      method: "GET",
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer l'évolution des infractions par mois dans la région
  const { data: infractionsByMonth, isLoading: isLoadingInfractionsByMonth } = useQuery({
    queryKey: ["/api/stats/regional/infractions-by-month", agentRegion],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/infractions-by-month?region=${agentRegion}`,
      method: "GET",
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer la répartition des revenus par type
  const { data: revenueByType, isLoading: isLoadingRevenueByType } = useQuery({
    queryKey: ["/api/stats/regional/revenue-by-type", agentRegion],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/revenue-by-type?region=${agentRegion}`,
      method: "GET"
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Récupérer la distribution des taxes
  const { data: taxDistribution, isLoading: isLoadingTaxDistribution } = useQuery({
    queryKey: ["/api/stats/regional/tax-distribution", agentRegion],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/tax-distribution?region=${agentRegion}`,
      method: "GET"
    }),
    enabled: !!agentRegion,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Couleurs pour les graphiques
  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

  // Formatage de la monnaie
  const formatMoney = (amount: number) => {
    return amount.toLocaleString() + " FCFA";
  };

  // Données utilisées pour les graphiques (uniquement API; sans simulation)
  const stats: RegionalStats = (regionalStats as RegionalStats) || {
    hunterCount: 0,
    contrevenantCount: 0,
    activePermitCount: 0,
    expiredPermitCount: 0,
    suspendedPermitCount: 0,
    taxCount: 0,
    revenue: 0,
    pendingRequests: 0,
    infractionRevenue: 0,
  };
  const permits: PermitByMonth[] = Array.isArray(permitsByMonth)
    ? (permitsByMonth as PermitByMonth[])
    : [];
  const taxesMonthly: { month: string; yearMonth?: string; count: number; amount?: number }[] = Array.isArray(taxesByMonth)
    ? (taxesByMonth as { month: string; yearMonth?: string; count: number; amount?: number }[])
    : [];
  const infractionsMonthly: { month: string; yearMonth?: string; count: number; amount?: number }[] = Array.isArray(infractionsByMonth)
    ? (infractionsByMonth as { month: string; yearMonth?: string; count: number; amount?: number }[])
    : [];

  // Fusion des données par mois (ascending par année-mois si dispo, sinon par libellé)
  const toMap = (arr: { month: string; yearMonth?: string; count: number; amount?: number }[]) => {
    const m = new Map<string, { label: string; count: number; amount: number }>();
    for (const it of arr) {
      const key = it.yearMonth ?? it.month;
      m.set(key, { label: it.month, count: it.count, amount: it.amount ?? 0 });
    }
    return m;
  };
  const pm = toMap(permits as any);
  const tm = toMap(taxesMonthly);
  const im = toMap(infractionsMonthly);
  const keys = Array.from(new Set<string>([...pm.keys(), ...tm.keys(), ...im.keys()]));
  // Trier par YYYY-MM si possible, sinon par libellé
  keys.sort((a, b) => {
    const iso = /^\d{4}-\d{2}$/;
    if (iso.test(a) && iso.test(b)) return a.localeCompare(b);
    return a.localeCompare(b);
  });
  const chartData = keys.map((k) => ({
    month: (pm.get(k)?.label ?? tm.get(k)?.label ?? k),
    permits: pm.get(k)?.count ?? 0,
    taxes: tm.get(k)?.count ?? 0,
    taxAmount: tm.get(k)?.amount ?? 0,
    infractions: im.get(k)?.count ?? 0,
  }));
  const revenues: { name: string; value: number }[] = Array.isArray(revenueByType)
    ? (revenueByType as { name: string; value: number }[])
    : [];
  const taxes: { name: string; count: number; amount: number }[] = Array.isArray(taxDistribution)
    ? (taxDistribution as { name: string; count: number; amount: number }[])
    : [];

  const downloadRevenueCsv = async () => {
    if (!agentRegion) return;
    const rows = await apiRequest({
      url: `/api/stats/regional/revenue-by-type-export?region=${agentRegion}`,
      method: "GET",
    });

    const safeRows: any[] = Array.isArray(rows) ? rows : [];
    exportToCsv(`repartition-recettes-${agentRegion}.csv`, [
      { key: "departement", label: "Lieux d'enregistrement" },
      { key: "type", label: "Type" },
      { key: "montant", label: "Montant" },
    ], safeRows);
  };

  const downloadTaxesCsv = async () => {
    if (!agentRegion) return;
    const rows = await apiRequest({
      url: `/api/stats/regional/taxes-export?region=${agentRegion}`,
      method: "GET",
    });

    const safeRows: any[] = Array.isArray(rows) ? rows : [];
    exportToCsv(`taxes-abattage-${agentRegion}.csv`, [
      { key: "departement", label: "Lieux d'enregistrement" },
      { key: "taxNumber", label: "Numéro taxe" },
      { key: "issueDate", label: "Date" },
      { key: "animalType", label: "Espèce" },
      { key: "quantity", label: "Quantité" },
      { key: "amount", label: "Montant" },
      { key: "receiptNumber", label: "Numéro reçu" },
      { key: "hunterNameSnapshot", label: "Chasseur" },
      { key: "permitNumberSnapshot", label: "Numéro permis" },
      { key: "permitCategorySnapshot", label: "Catégorie permis" },
      { key: "issuerServiceSnapshot", label: "Service" },
      { key: "createdAt", label: "Créé le" },
    ], safeRows);
  };

  if (!user || user.role !== "agent") {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription>
              Vous devez être connecté en tant qu'agent pour accéder aux statistiques régionales.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Cette page est réservée aux agents des Eaux et Forêts.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ResponsivePage>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold">Statistiques Régionales</h1>
            <p className="text-muted-foreground mt-1">
              <MapPin className="inline-block mr-1 h-4 w-4" />
              {agent?.region ? `Région de ${agent.region}` : "Chargement..."}
            </p>
          </div>
        </div>

        {/* Graphiques */}
        <Tabs defaultValue="revenue" className="space-y-4">
          <TabsList>
            <TabsTrigger value="revenue">Répartition des recettes</TabsTrigger>
            <TabsTrigger value="taxes">Taxes d'abattage</TabsTrigger>
            <TabsTrigger value="permits">Suivi</TabsTrigger>
          </TabsList>

          <TabsContent value="permits" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Suivi mensuel des opérations</CardTitle>
                <CardDescription>
                  Nombre de permis, taxes d'abattage et infractions enregistrés dans la région au cours des 12 derniers mois
                </CardDescription>
              </CardHeader>
              <CardContent className="pl-2">
                {isLoadingPermitsByMonth || isLoadingTaxesByMonth || isLoadingInfractionsByMonth ? (
                  <div className="flex items-center justify-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart
                      data={chartData}
                      margin={{
                        top: 20,
                        right: 30,
                        left: 20,
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload as any;
                          return (
                            <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
                              <div className="font-medium mb-1">{label}</div>
                              <div>Permis: {d.permits}</div>
                              <div>Taxes: {d.taxes}</div>
                              <div>Infractions: {d.infractions}</div>
                            </div>
                          );
                        }
                        return null;
                      }} />
                      <Legend />
                      <Bar dataKey="permits" name="Permis" fill="#0088FE" barSize={24} stackId="total" />
                      <Bar dataKey="taxes" name="Taxes" fill="#FF8042" barSize={24} stackId="total" />
                      <Bar dataKey="infractions" name="Infractions" fill="#EF4444" barSize={24} stackId="total" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="revenue" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Répartition des recettes par type</CardTitle>
                <CardDescription>
                  Distribution des recettes par type de permis et taxes d'abattage
                </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={downloadRevenueCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingRevenueByType ? (
                  <div className="flex items-center justify-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={revenues}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={120}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {revenues.map((entry, index) => {
                          const name = entry.name || "";
                          let color = COLORS[index % COLORS.length];
                          if (name === "Permis") color = "#0088FE";
                          else if (name === "Taxes d'abattage") color = "#FF8042";
                          else if (name === "Infractions") color = "#EF4444";
                          return <Cell key={`cell-${index}`} fill={color} />;
                        })}
                      </Pie>
                      <Tooltip formatter={(value) => [`${formatMoney(value as number)}`, "Montant"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {revenues.map((item, index) => (
                <Card key={index}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">{item.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{formatMoney(item.value)}</div>
                    <p className="text-xs text-muted-foreground">
                      {((item.value / stats.revenue) * 100).toFixed(1)}% du total
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="taxes" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Taxes d'abattage</CardTitle>
                <CardDescription>
                  Nombre d'animaux abattus par espèce
                </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={downloadTaxesCsv}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                {isLoadingTaxDistribution ? (
                  <div className="flex items-center justify-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={taxes}
                          cx="50%"
                          cy="50%"
                          labelLine={true}
                          label={({ name, count, percent }) => `${name}: ${count} (${(percent * 100).toFixed(0)}%)`}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="count"
                        >
                          {taxes.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} animaux`, "Nombre"]} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ResponsivePage>
  );
}
