import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CreditCard, Users } from "lucide-react";

import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
// import MainLayout from "@/components/layout/MainLayout"; // Supprimé pour éviter la duplication du layout

export default function RegionalDashboard() {
  const { user } = useAuth();

  const region = user?.region || "";

  const { data: regionalStats } = useQuery({
    queryKey: ["/api/stats/regional", region, "all"],
    queryFn: () => apiRequest({
      url: `/api/stats/regional?region=${region}&period=all`,
      method: "GET",
    }),
    enabled: !!region,
  });

  // Agents de secteur de la région de l'agent régional
  const { data: sectorAgents } = useQuery({
    queryKey: ["/api/regional/my-sector-agents"],
    queryFn: () => apiRequest({
      url: "/api/regional/my-sector-agents",
      method: "GET",
    }),
    enabled: !!user,
  });

  const { data: revenueByType } = useQuery({
    queryKey: ["/api/stats/regional/revenue-by-type", region],
    queryFn: () => apiRequest({
      url: `/api/stats/regional/revenue-by-type?region=${region}`,
      method: "GET",
    }),
    enabled: !!region,
  });

  const { data: permitsByMonth } = useQuery({
    queryKey: ["/api/stats/regional/permits-by-month", region],
    queryFn: () =>
      apiRequest({
        url: `/api/stats/regional/permits-by-month?region=${region}`,
        method: "GET",
      }),
    enabled: !!region,
  });

  const rs = (regionalStats as any) || {};

  const rbt: { name: string; value: number }[] = Array.isArray(revenueByType) ? (revenueByType as any) : [];
  const permitRevenue = Number(rbt.find((x) => x?.name === "Permis")?.value || 0);
  const taxesAmount = Number(rbt.find((x) => x?.name === "Taxes d'abattage")?.value || 0);
  const issuedPermitsLast12 = Array.isArray(permitsByMonth)
    ? (permitsByMonth as any[]).reduce((sum, it) => sum + Number(it?.count || 0), 0)
    : 0;

  const regionalAgentsCount = Array.isArray(sectorAgents) ? (sectorAgents as any[]).length : 0;

  const formatMoney = (n: number) => `${Number(n || 0).toLocaleString()} FCFA`;

  return (
    <div className="px-6 py-8">
        <div className="mb-8">
          <div className="bg-green-50 border-l-4 border-green-400 rounded-xl px-6 py-4 shadow-sm flex flex-col gap-2">
            <div className="flex flex-row items-center gap-3">
              <h1 className="text-3xl font-bold text-green-900">Espace Agent Régional</h1>
              <span className="bg-green-100 text-green-800 text-xs font-semibold px-3 py-1 rounded-lg ml-2">Administration</span>
            </div>
            <div className="mt-1 text-lg">
              <span className="font-semibold text-green-900 uppercase">{user?.firstName} {user?.lastName}</span>
              <span className="mx-2 text-green-700">|</span>
              <span className="text-green-700">Région: <span className="font-bold lowercase text-green-800">{user?.region || "Non définie"}</span></span>
            </div>
          </div>
        </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4 w-full">
          {/* Chasseurs enregistrés */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Chasseurs enregistrés</CardTitle>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                className="h-4 w-4 text-muted-foreground"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{Number(rs?.hunterCount || 0)}</div>
            </CardContent>
          </Card>

          {/* Agents de la région */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Agents de la région</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{regionalAgentsCount}</div>
            </CardContent>
          </Card>

        {/* Recette permis */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recette permis</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold">{formatMoney(permitRevenue)}</div>
          </CardContent>
        </Card>

        {/* Taxes d'abattage */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxes d'abattage</CardTitle>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              className="h-4 w-4 text-muted-foreground"
            >
              <rect width="20" height="14" x="2" y="5" rx="2" />
              <path d="M2 10h20" />
            </svg>
          </CardHeader>
          <CardContent className="text-center">
            <div className="text-2xl font-bold">{formatMoney(taxesAmount)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Contrevenants enregistrés</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{Number(rs?.contrevenantCount || 0)}</div>
              <p className="text-xs text-muted-foreground">Région de {user?.region || ""}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Infractions</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{formatMoney(Number(rs?.infractionRevenue || 0))}</div>
              <p className="text-xs text-muted-foreground">Nombre: {Number(rs?.infractionCount || 0)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Permis actifs</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Actifs</p>
                  <div className="text-2xl font-bold">{Number(rs?.activePermitCount || 0)}</div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Suspendus</p>
                  <div className="text-2xl font-bold">{Number(rs?.suspendedPermitCount || 0)}</div>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Expirés</p>
                  <div className="text-2xl font-bold">{Number(rs?.expiredPermitCount || 0)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Taxes enregistrées</CardTitle>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{Number(rs?.taxCount || 0)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Recette</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-2xl font-bold">{formatMoney(Number(rs?.revenue || 0))}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
