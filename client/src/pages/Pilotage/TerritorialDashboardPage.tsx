import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { exportMultiSheetExcel } from "@/lib/excelWorkbook";
import { apiRequest } from "@/lib/queryClient";
import { getUserSubType } from "@/utils/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Download,
  FileCheck,
  FileSpreadsheet,
  Gavel,
  Globe,
  Loader2,
  Shield,
  Trees,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

interface TerritorialOverviewResponse {
  ok: boolean;
  scope: {
    level: "national" | "regional" | "departemental" | "arrondissement";
    levelLabel: string;
    territoryDisplay: string;
    subZoneHeading: string;
    activeSubZone: string | null;
    availableSubZones: string[];
    region: string | null;
    departement: string | null;
    arrondissement: string | null;
    commune: string | null;
    fullName: string;
    grade: string | null;
    matricule?: string | null;
    roleMetierLabel: string | null;
    allowedDomains: string[];
    operationalDomains: string[];
  };
  chasse: {
    totalHunters: number;
    totalGuides: number;
    totalPermits: number;
    activePermits: number;
    expiredPermits: number;
    pendingRequests: number;
    approvedRequests: number;
    rejectedRequests: number;
    permitsRevenue: number;
    taxesCount: number;
    taxesRevenue: number;
    totalRevenue: number;
    infractionsCount: number;
    infractionsAmount: number;
    permitsByCategory: Array<{ category: string; count: number; revenue: number }>;
    breakdownBySubZone: Array<{
      zone: string;
      hunters: number;
      guides: number;
      activePermits: number;
      pendingRequests: number;
      permitsRevenue: number;
      taxesRevenue: number;
      infractions: number;
    }>;
  } | null;
  reboisement: {
    totalReports: number;
    validatedReports: number;
    submittedReports: number;
    draftReports: number;
    totalPlantsProduced: number;
    totalPlantsPlanted: number;
    breakdownBySubZone: Array<{ zone: string; total: number; validated: number; submitted: number }>;
  } | null;
  alerte: {
    totalAlerts: number;
    unreadAlerts: number;
    readAlerts: number;
    byNature: Array<{ nature: string; count: number }>;
    recentAlerts: Array<{
      id: number;
      title: string | null;
      nature: string | null;
      region: string | null;
      departement: string | null;
      arrondissement: string | null;
      commune: string | null;
      isRead: boolean;
      createdAt: string;
    }>;
    breakdownBySubZone: Array<{ zone: string; total: number; unread: number }>;
  } | null;
  extraDomains?: Array<{ codeSlug: string; nomDomaine: string; agentsCount: number }>;
}

type TabKey = "global" | "chasse" | "reboisement" | "alerte";

const NATURE_LABELS: Record<string, string> = {
  feux_de_brousse: "Feux de brousse",
  braconnage: "Braconnage",
  trafic_bois: "Trafic de bois",
  coupe_abusive: "Coupe abusive",
  empietement: "Empiètement",
  spotrep: "Rapport terrain (Spotrep)",
  autre: "Autre",
};

const fmtNum = (n: number | undefined | null) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(Number(n) || 0));

const fmtFcfa = (n: number | undefined | null) => `${fmtNum(n)} FCFA`;

const normalizeDomainKey = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

const matchBuiltInDomain = (v: unknown): "CHASSE" | "REBOISEMENT" | "ALERTE" | null => {
  const k = normalizeDomainKey(v);
  if (!k) return null;
  if (k.includes("CHASSE") || k.includes("FAUNE")) return "CHASSE";
  if (k.includes("REBOISEMENT") || k.includes("PEPINI") || k.includes("REFOREST")) return "REBOISEMENT";
  if (k.includes("ALERTE")) return "ALERTE";
  return null;
};

export default function TerritorialDashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("global");

  const { data, isLoading, error, refetch } = useQuery<TerritorialOverviewResponse>({
    queryKey: ["/api/territorial-kpi/overview"],
    queryFn: () =>
      apiRequest<TerritorialOverviewResponse>({
        url: "/api/territorial-kpi/overview",
        method: "GET",
      }),
    staleTime: 30_000,
  });

  // Vérification dynamique en temps réel des domaines réellement ajoutés et actifs dans la page Domaines
  const { data: activeDomainesList, isLoading: isLoadingDomains } = useQuery<
    Array<{ id: number; nomDomaine?: string | null; codeSlug?: string | null; isActive?: boolean | null }>
  >({
    queryKey: ["/api/domaines/public/active"],
    queryFn: () =>
      apiRequest<Array<{ id: number; nomDomaine?: string | null; codeSlug?: string | null; isActive?: boolean | null }>>({
        url: "/api/domaines/public/active",
        method: "GET",
      }),
    staleTime: 30_000,
  });

  const activeSystemDomainKeys = useMemo<Set<string> | null>(() => {
    if (!Array.isArray(activeDomainesList)) return null;
    const set = new Set<string>();
    for (const d of activeDomainesList) {
      if (!d || d.isActive === false) continue;
      const slugKey = normalizeDomainKey(d.codeSlug);
      const nomKey = normalizeDomainKey(d.nomDomaine);
      if (slugKey) set.add(slugKey);
      if (nomKey) set.add(nomKey);
    }
    return set;
  }, [activeDomainesList]);

  const isAddedInSystem = (target: "CHASSE" | "REBOISEMENT" | "ALERTE"): boolean => {
    if (!Array.isArray(activeDomainesList)) return true;
    return activeDomainesList.some(
      (d) =>
        d &&
        d.isActive !== false &&
        (matchBuiltInDomain(d.codeSlug) === target || matchBuiltInDomain(d.nomDomaine) === target)
    );
  };

  const scope = data?.scope;
  const resolvedGrade = (scope?.grade || (user as any)?.grade || "").trim();
  const resolvedMatricule = (scope?.matricule || (user as any)?.matricule || "").trim();
  const chasse = data?.chasse && isAddedInSystem("CHASSE") ? data.chasse : null;
  const reboisement = data?.reboisement && isAddedInSystem("REBOISEMENT") ? data.reboisement : null;
  const alerte = data?.alerte && isAddedInSystem("ALERTE") ? data.alerte : null;
  const extraDomains = useMemo(() => {
    const raw = data?.extraDomains ?? [];
    if (!activeSystemDomainKeys) return raw;
    return raw.filter(
      (d) =>
        activeSystemDomainKeys.has(normalizeDomainKey(d.codeSlug)) ||
        activeSystemDomainKeys.has(normalizeDomainKey(d.nomDomaine))
    );
  }, [data?.extraDomains, activeSystemDomainKeys]);

  const availableTabs = useMemo(() => {
    const list: Array<{ key: TabKey; label: string }> = [{ key: "global", label: "Vue Globale" }];
    if (chasse) list.push({ key: "chasse", label: "Situation Chasse" });
    if (reboisement) list.push({ key: "reboisement", label: "Reboisement" });
    if (alerte) list.push({ key: "alerte", label: "Alertes" });
    return list;
  }, [chasse, reboisement, alerte]);

  // Si l'onglet actif n'est plus disponible (ex: domaine retiré), revenir sur Vue Globale
  useEffect(() => {
    if (!availableTabs.some((t) => t.key === activeTab)) {
      setActiveTab("global");
    }
  }, [availableTabs, activeTab]);

  const activeDomainCardsCount =
    (chasse ? 1 : 0) + (reboisement ? 1 : 0) + (alerte ? 1 : 0) + extraDomains.length;

  const domainGridClass =
    activeDomainCardsCount <= 1
      ? "grid-cols-1"
      : activeDomainCardsCount === 2
        ? "grid-cols-1 lg:grid-cols-2"
        : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3";

  const reachableOperationalDomains = useMemo(() => {
    const raw = scope?.operationalDomains ?? [];
    const canOpenAlerte = Boolean((user as any)?.isSupervisorRole || (user as any)?.isDefaultRole);
    const hasOperationalRole = user?.role === "admin" || user?.role === "agent" || user?.role === "sub-agent";
    return raw.filter((code) => {
      const d = code.toUpperCase();
      if (d === "CHASSE" || d === "REBOISEMENT") return hasOperationalRole;
      if (d === "ALERTE") return canOpenAlerte;
      return false;
    });
  }, [scope?.operationalDomains, user]);

  const handleOpenOperationalDomain = (domainCode: string) => {
    const d = domainCode.toUpperCase();
    if (d === "CHASSE") {
      try { localStorage.setItem("domain", "CHASSE"); } catch {}
      if (user?.role === "admin") setLocation("/admin");
      else if (user?.role === "agent" && user?.type === "secteur") setLocation("/sector");
      else if (user?.role === "agent") setLocation("/regional");
      else if (user?.role === "sub-agent") {
        const subType = getUserSubType(user);
        const routes: Record<string, string> = {
          "sous-secteur": "/sous-secteur",
          brigade: "/brigade",
          triage: "/triage",
          "poste-control": "/poste-control",
        };
        setLocation(routes[subType] || "/sector-agents");
      }
      return;
    }
    if (d === "REBOISEMENT") {
      try { localStorage.setItem("domain", "REBOISEMENT"); } catch {}
      if (user?.role === "admin") setLocation("/reboisement/admin");
      else if (user?.role === "agent") setLocation("/reboisement/regional");
      else if (user?.role === "sub-agent") setLocation("/reboisement/departement");
      return;
    }
    if (d === "ALERTE") {
      if ((user as any)?.isSupervisorRole) {
        try { localStorage.setItem("domain", "ALERTE"); } catch {}
        setLocation("/supervisor");
      } else if ((user as any)?.isDefaultRole) {
        try { localStorage.setItem("domain", "ALERTE"); } catch {}
        setLocation("/default-home");
      }
    }
  };

  // Export Excel multi-onglets 100% dynamique : n'inclut STRICTEMENT que les domaines configurés et autorisés
  const handleExportExcel = () => {
    if (!data || !scope) return;
    const sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number>> }> = [];

    const summaryRows: Array<Array<string | number>> = [
      ["Cadre", `${resolvedGrade ? `${resolvedGrade} ` : ""}${scope.fullName}`],
      ...(resolvedMatricule ? [["Matricule", resolvedMatricule] as Array<string | number>] : []),
      ["Rôle métier", scope.roleMetierLabel || "-"],
      ["Niveau", scope.levelLabel],
      ["Périmètre", scope.territoryDisplay],
      ["Sous-filtre", scope.activeSubZone || "Tout le périmètre"],
      ["Date export", new Date().toLocaleString("fr-FR")],
    ];
    if (chasse) {
      summaryRows.push(
        ["Chasse — Chasseurs actifs", chasse.totalHunters],
        ["Chasse — Guides actifs", chasse.totalGuides],
        ["Chasse — Permis actifs", chasse.activePermits],
        ["Chasse — Demandes en attente", chasse.pendingRequests],
        ["Chasse — Recettes totales (FCFA)", chasse.totalRevenue],
        ["Chasse — Infractions", chasse.infractionsCount]
      );
    }
    if (reboisement) {
      summaryRows.push(
        ["Reboisement — Rapports", reboisement.totalReports],
        ["Reboisement — Rapports validés", reboisement.validatedReports],
        ["Reboisement — Plants produits", reboisement.totalPlantsProduced],
        ["Reboisement — Plants plantés", reboisement.totalPlantsPlanted]
      );
    }
    if (alerte) {
      summaryRows.push(
        ["Alertes — Total", alerte.totalAlerts],
        ["Alertes — Non lues", alerte.unreadAlerts]
      );
    }
    for (const dom of extraDomains) {
      summaryRows.push([`${dom.nomDomaine} — Agents affectés`, dom.agentsCount]);
    }
    sheets.push({ name: "Synthèse", headers: ["Indicateur", "Valeur"], rows: summaryRows });

    if (chasse) {
      sheets.push({
        name: "Chasse par zone",
        headers: [
          scope.subZoneHeading,
          "Chasseurs",
          "Guides",
          "Permis actifs",
          "Demandes en attente",
          "Recettes permis (FCFA)",
          "Recettes taxes (FCFA)",
          "Infractions",
        ],
        rows: chasse.breakdownBySubZone.map((z) => [
          z.zone,
          z.hunters,
          z.guides,
          z.activePermits,
          z.pendingRequests,
          z.permitsRevenue,
          z.taxesRevenue,
          z.infractions,
        ]),
      });
    }

    if (reboisement) {
      sheets.push({
        name: "Reboisement",
        headers: [scope.subZoneHeading, "Total rapports", "Validés", "Soumis"],
        rows: reboisement.breakdownBySubZone.map((z) => [z.zone, z.total, z.validated, z.submitted]),
      });
    }

    if (alerte) {
      sheets.push({
        name: "Alertes",
        headers: [scope.subZoneHeading, "Total alertes", "Non lues"],
        rows: alerte.breakdownBySubZone.map((z) => [z.zone, z.total, z.unread]),
      });
    }

    if (extraDomains.length > 0) {
      sheets.push({
        name: "Autres domaines",
        headers: ["Domaine", "Code", "Agents affectés"],
        rows: extraDomains.map((dom) => [dom.nomDomaine, dom.codeSlug, dom.agentsCount]),
      });
    }

    const fileSlug = `${scope.level}-${new Date().toISOString().slice(0, 10)}`;
    exportMultiSheetExcel(sheets, `KPI-Pilotage-${fileSlug}`);
    toast({
      title: "Export Excel généré",
      description: "Le classeur KPI dynamique a été téléchargé.",
    });
  };

  if (isLoading || isLoadingDomains) {
    return (
      <div className="w-full min-h-[70vh] flex flex-col items-center justify-center gap-4 text-emerald-800">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="text-base font-medium">Chargement de votre tableau de bord territorial…</p>
      </div>
    );
  }

  if (error || !data || !scope) {
    return (
      <div className="w-full py-16 px-4">
        <div className="mx-auto max-w-xl">
          <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
            <CardContent className="p-8 text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-amber-600 mx-auto" />
              <h2 className="text-xl font-bold text-gray-900">Pilotage territorial indisponible</h2>
              <p className="text-base text-gray-600">
                {(error as any)?.message || "Votre rôle métier n'a pas encore de portée KPI configurée."}
              </p>
              <Button variant="outline" size="lg" onClick={() => refetch()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const responsibleIdentity = [
    resolvedGrade,
    scope?.fullName || "",
    resolvedMatricule ? `Mat. ${resolvedMatricule}` : "",
  ]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="w-full min-h-[calc(100dvh-5.5rem)] flex flex-col space-y-5 sm:space-y-6 py-4 sm:py-5 pb-10">
      {/* Bandeau de posture territoriale — Vert clair exécutif */}
      <section className="w-full rounded-2xl border border-emerald-300/80 bg-gradient-to-r from-emerald-100/95 via-green-50 to-teal-50 text-emerald-950 p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5 px-3 py-1 text-xs sm:text-sm font-semibold shadow-xs">
                <Globe className="h-4 w-4" />
                {scope.levelLabel}
              </Badge>
              {scope.roleMetierLabel && (
                <Badge className="bg-white text-emerald-900 border border-emerald-300 hover:bg-emerald-50 px-3 py-1 text-xs sm:text-sm font-semibold shadow-xs">
                  {scope.roleMetierLabel}
                </Badge>
              )}
              {responsibleIdentity && (
                <Badge className="bg-emerald-50 text-emerald-950 border border-emerald-300 hover:bg-emerald-100 px-3 py-1 text-xs sm:text-sm font-bold shadow-xs">
                  {resolvedGrade ? `${resolvedGrade} ` : ""}
                  {scope.fullName}
                  {resolvedMatricule ? ` · ${resolvedMatricule}` : ""}
                </Badge>
              )}
            </div>
            <h1 className="!text-emerald-950 !text-2xl sm:!text-3xl !font-extrabold tracking-tight flex items-center gap-2 flex-wrap">
              <span>Pilotage Territorial</span>
              <span className="text-emerald-700 font-semibold">— {scope.territoryDisplay}</span>
            </h1>
            <p className="text-sm sm:text-base text-emerald-900/80 font-medium">
              Situation consolidée des domaines autorisés sur votre périmètre.
            </p>
          </div>

          <div className="flex items-center shrink-0">
            <Button
              type="button"
              size="default"
              onClick={handleExportExcel}
              className="h-10 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs px-5"
            >
              <Download className="h-4 w-4" />
              <span>Exporter Excel</span>
            </Button>
          </div>
        </div>

        {/* Bascule rapide vers les domaines opérationnels affectés (si l'agent cumule des fonctions) */}
        {reachableOperationalDomains.length > 0 && !(user as any)?.isSuperAdmin && (
          <div className="mt-4 pt-3.5 border-t border-emerald-200 flex flex-wrap items-center gap-2.5 text-sm">
            <span className="text-emerald-900/80 font-semibold">Mes espaces opérationnels :</span>
            {reachableOperationalDomains.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handleOpenOperationalDomain(d)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white hover:bg-emerald-600 hover:text-white border border-emerald-300 px-3.5 py-1.5 text-sm font-semibold text-emerald-900 transition-colors shadow-xs"
              >
                <span>Gérer {d}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Barre d'onglets */}
      <div className="w-full flex flex-wrap items-center gap-2 rounded-xl bg-white border border-emerald-200 p-2 shadow-xs">
        {availableTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`rounded-lg px-5 py-2.5 text-sm sm:text-base font-semibold transition-all ${
              activeTab === t.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-900/75 hover:bg-emerald-50 hover:text-emerald-950"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════ VUE GLOBALE ══════════════════ */}
      {activeTab === "global" && (
        <div className="w-full flex-1 flex flex-col space-y-6">
          {activeDomainCardsCount === 0 ? (
            <Card className="border-emerald-200 bg-white shadow-sm">
              <CardContent className="p-10 text-center space-y-2">
                <Globe className="h-10 w-10 text-emerald-600 mx-auto opacity-80" />
                <h2 className="text-lg font-bold text-emerald-950">Aucun domaine actif configuré</h2>
                <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                  Aucun domaine n&apos;est actuellement activé dans le système ou attribué à votre rôle métier pour l&apos;affichage des KPI.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
          {/* Cartes KPI pleine largeur — grandes polices lisibles pour cadres */}
          <div className={`grid ${domainGridClass} gap-5 sm:gap-6 items-stretch`}>
            {chasse && (
              <Card className="border-emerald-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden bg-white">
                <CardHeader className="bg-emerald-50/80 border-b border-emerald-100 !py-4 px-6 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-lg sm:text-xl font-bold text-emerald-950 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5" />
                    </div>
                    Domaine Chasse
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setActiveTab("chasse")}
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 hover:underline whitespace-nowrap"
                  >
                    Détails →
                  </button>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-4">
                      <div className="text-sm font-medium text-emerald-900/80">Permis actifs</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-emerald-950 mt-1.5 tracking-tight">
                        {fmtNum(chasse.activePermits)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-4">
                      <div className="text-sm font-medium text-slate-600">Chasseurs</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1.5 tracking-tight">
                        {fmtNum(chasse.totalHunters)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-50/70 border border-amber-100 p-4">
                      <div className="text-sm font-medium text-amber-900">Demandes en attente</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-amber-950 mt-1.5 tracking-tight">
                        {fmtNum(chasse.pendingRequests)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-red-50/70 border border-red-100 p-4">
                      <div className="text-sm font-medium text-red-900">Infractions</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-red-950 mt-1.5 tracking-tight">
                        {fmtNum(chasse.infractionsCount)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-3.5 flex items-center justify-between gap-3">
                    <span className="text-sm sm:text-base font-medium text-emerald-950">
                      Recettes totales (Permis + Taxes)
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold text-emerald-800 whitespace-nowrap">
                      {fmtFcfa(chasse.totalRevenue)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {reboisement && (
              <Card className="border-teal-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden bg-white">
                <CardHeader className="bg-teal-50/80 border-b border-teal-100 !py-4 px-6 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-lg sm:text-xl font-bold text-teal-950 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                      <Trees className="h-5 w-5" />
                    </div>
                    Domaine Reboisement
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setActiveTab("reboisement")}
                    className="text-sm font-semibold text-teal-700 hover:text-teal-900 hover:underline whitespace-nowrap"
                  >
                    Détails →
                  </button>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="rounded-xl bg-teal-50/70 border border-teal-100 p-4">
                      <div className="text-sm font-medium text-teal-900/80">Rapports suivis</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-teal-950 mt-1.5 tracking-tight">
                        {fmtNum(reboisement.totalReports)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-emerald-50/70 border border-emerald-100 p-4">
                      <div className="text-sm font-medium text-emerald-900">Rapports validés</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-emerald-950 mt-1.5 tracking-tight">
                        {fmtNum(reboisement.validatedReports)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-4">
                      <div className="text-sm font-medium text-slate-600">Plants produits</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1.5 tracking-tight">
                        {fmtNum(reboisement.totalPlantsProduced)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-green-50/70 border border-green-100 p-4">
                      <div className="text-sm font-medium text-green-900">Plants plantés</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-green-950 mt-1.5 tracking-tight">
                        {fmtNum(reboisement.totalPlantsPlanted)}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-teal-200 bg-teal-50/40 px-4 py-3.5 flex items-center justify-between gap-3">
                    <span className="text-sm sm:text-base font-medium text-teal-950">
                      Rapports soumis en attente
                    </span>
                    <span className="text-lg sm:text-xl font-extrabold text-teal-800 whitespace-nowrap">
                      {fmtNum(reboisement.submittedReports)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {alerte && (
              <Card className="border-amber-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden bg-white">
                <CardHeader className="bg-amber-50/80 border-b border-amber-100 !py-4 px-6 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-lg sm:text-xl font-bold text-amber-950 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <Bell className="h-5 w-5" />
                    </div>
                    Système d&apos;Alertes
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setActiveTab("alerte")}
                    className="text-sm font-semibold text-amber-800 hover:text-amber-950 hover:underline whitespace-nowrap"
                  >
                    Détails →
                  </button>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="rounded-xl bg-amber-50/80 border border-amber-100 p-4">
                      <div className="text-sm font-medium text-amber-900">Total alertes</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-amber-950 mt-1.5 tracking-tight">
                        {fmtNum(alerte.totalAlerts)}
                      </div>
                    </div>
                    <div className="rounded-xl bg-red-50/80 border border-red-100 p-4">
                      <div className="text-sm font-medium text-red-900">Non lues</div>
                      <div className="text-3xl sm:text-4xl font-extrabold text-red-900 mt-1.5 tracking-tight">
                        {fmtNum(alerte.unreadAlerts)}
                      </div>
                    </div>
                  </div>
                  {alerte.byNature.length > 0 ? (
                    <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/30 p-3.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-amber-900/75">
                        Principaux types d&apos;alertes
                      </div>
                      {alerte.byNature.slice(0, 4).map((n) => (
                        <div key={n.nature} className="flex items-center justify-between text-sm sm:text-base">
                          <span className="text-gray-800 font-medium capitalize">
                            {NATURE_LABELS[n.nature.toLowerCase()] || n.nature}
                          </span>
                          <Badge className="bg-amber-100 text-amber-950 border border-amber-200 hover:bg-amber-100 text-xs sm:text-sm font-bold px-2.5 py-0.5">
                            {fmtNum(n.count)}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 px-4 py-3.5 text-sm text-emerald-900/80 font-medium">
                      Aucune alerte signalée sur ce périmètre.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {extraDomains.map((dom) => (
              <Card
                key={dom.codeSlug}
                className="border-indigo-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden bg-white"
              >
                <CardHeader className="bg-indigo-50/80 border-b border-indigo-100 !py-4 px-6">
                  <CardTitle className="text-lg sm:text-xl font-bold text-indigo-950 flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <Globe className="h-5 w-5" />
                    </div>
                    {dom.nomDomaine}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 sm:p-6 flex-1 flex flex-col justify-between gap-4">
                  <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-4">
                    <div className="text-sm font-medium text-indigo-900">Agents affectés sur le périmètre</div>
                    <div className="text-3xl sm:text-4xl font-extrabold text-indigo-950 mt-1.5 tracking-tight">
                      {fmtNum(dom.agentsCount)}
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">
                    Domaine actif ({dom.codeSlug}) rattaché à votre portée territoriale.
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section inférieure Vue Globale : synthèses territoriales dynamiques (occupe utilement toute la page) */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6 flex-1">
            {chasse && (
              <Card className="border-emerald-200/80 shadow-sm bg-white flex flex-col">
                <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 !py-4 px-6 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base sm:text-lg font-bold text-emerald-950 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-emerald-700" />
                    Répartition Chasse par {scope.subZoneHeading}
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setActiveTab("chasse")}
                    className="text-sm font-semibold text-emerald-700 hover:underline"
                  >
                    Voir tout →
                  </button>
                </CardHeader>
                <CardContent className="p-0 sm:p-5 flex-1">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-emerald-50/40">
                          <TableHead className="text-sm font-bold text-emerald-950">{scope.subZoneHeading}</TableHead>
                          <TableHead className="text-right text-sm font-bold text-emerald-950">Chasseurs</TableHead>
                          <TableHead className="text-right text-sm font-bold text-emerald-950">Permis actifs</TableHead>
                          <TableHead className="text-right text-sm font-bold text-emerald-950">Recettes</TableHead>
                          <TableHead className="text-right text-sm font-bold text-emerald-950">Infractions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {chasse.breakdownBySubZone.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm sm:text-base text-muted-foreground py-10">
                              Aucune donnée Chasse enregistrée sur ce périmètre pour le moment.
                            </TableCell>
                          </TableRow>
                        ) : (
                          chasse.breakdownBySubZone.slice(0, 8).map((row) => (
                            <TableRow key={row.zone} className="text-sm sm:text-base">
                              <TableCell className="font-semibold text-gray-900">{row.zone}</TableCell>
                              <TableCell className="text-right">{fmtNum(row.hunters)}</TableCell>
                              <TableCell className="text-right font-bold text-emerald-700">
                                {fmtNum(row.activePermits)}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {fmtFcfa(row.permitsRevenue + row.taxesRevenue)}
                              </TableCell>
                              <TableCell className="text-right">{fmtNum(row.infractions)}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {alerte && (
              <Card className="border-amber-200/80 shadow-sm bg-white flex flex-col">
                <CardHeader className="bg-amber-50/60 border-b border-amber-100 !py-4 px-6 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base sm:text-lg font-bold text-amber-950 flex items-center gap-2">
                    <Bell className="h-5 w-5 text-amber-700" />
                    Dernières alertes sur le périmètre
                  </CardTitle>
                  <button
                    type="button"
                    onClick={() => setActiveTab("alerte")}
                    className="text-sm font-semibold text-amber-800 hover:underline"
                  >
                    Voir tout →
                  </button>
                </CardHeader>
                <CardContent className="p-5 space-y-3 flex-1">
                  {alerte.recentAlerts.length === 0 ? (
                    <div className="flex items-center justify-center py-10 text-sm sm:text-base text-muted-foreground">
                      Aucune alerte enregistrée sur ce périmètre pour le moment.
                    </div>
                  ) : (
                    alerte.recentAlerts.slice(0, 5).map((a) => (
                      <div
                        key={a.id}
                        className="rounded-xl border border-amber-100 bg-amber-50/25 p-3.5 sm:p-4 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-sm sm:text-base text-gray-900 truncate">
                            {a.title || NATURE_LABELS[(a.nature || "autre").toLowerCase()] || "Alerte"}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600 mt-0.5">
                            {[a.region, a.departement, a.arrondissement, a.commune].filter(Boolean).join(" · ") || "Zone non renseignée"}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {!a.isRead && (
                            <Badge variant="destructive" className="text-xs font-semibold mb-1">
                              Non lue
                            </Badge>
                          )}
                          <div className="text-xs sm:text-sm text-gray-500 font-medium">
                            {a.createdAt ? new Date(a.createdAt).toLocaleDateString("fr-FR") : ""}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════ SITUATION CHASSE DÉTAILLÉE ══════════════════ */}
      {activeTab === "chasse" && chasse && (
        <div className="w-full space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
            <Card className="border-emerald-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <FileCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-muted-foreground">Permis actifs</div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-emerald-950 mt-0.5">
                    {fmtNum(chasse.activePermits)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    sur {fmtNum(chasse.totalPermits)} total ({fmtNum(chasse.expiredPermits)} expirés)
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-muted-foreground">Chasseurs &amp; Guides</div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-0.5">
                    {fmtNum(chasse.totalHunters)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    + {fmtNum(chasse.totalGuides)} guide{chasse.totalGuides > 1 ? "s" : ""} actif{chasse.totalGuides > 1 ? "s" : ""}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-teal-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center shrink-0">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-muted-foreground">Recettes cumulées</div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-teal-900 mt-0.5 truncate">
                    {fmtFcfa(chasse.totalRevenue)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    Permis : {fmtNum(chasse.permitsRevenue)} · Taxes : {fmtNum(chasse.taxesRevenue)}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                  <Gavel className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-muted-foreground">Infractions &amp; Demandes</div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-red-900 mt-0.5">
                    {fmtNum(chasse.infractionsCount)}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                    {fmtNum(chasse.pendingRequests)} demande(s) en attente
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
            {/* Permis par catégorie */}
            <Card className="border-emerald-200/80 shadow-sm bg-white">
              <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 !py-4 px-6">
                <CardTitle className="text-base sm:text-lg font-bold text-emerald-950">Permis par catégorie</CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {chasse.permitsByCategory.length === 0 ? (
                  <p className="text-sm sm:text-base text-muted-foreground py-6 text-center">
                    Aucun permis dans ce périmètre.
                  </p>
                ) : (
                  chasse.permitsByCategory.map((cat) => (
                    <div key={cat.category} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-100 p-3.5 text-sm sm:text-base">
                      <div className="min-w-0">
                        <div className="font-semibold capitalize truncate text-gray-900">{cat.category}</div>
                        <div className="text-xs sm:text-sm text-muted-foreground">{fmtFcfa(cat.revenue)}</div>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-sm font-bold px-3 py-1" variant="outline">
                        {fmtNum(cat.count)}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Détail territorial */}
            <Card className="lg:col-span-2 border-emerald-200/80 shadow-sm bg-white">
              <CardHeader className="bg-emerald-50/60 border-b border-emerald-100 !py-4 px-6">
                <CardTitle className="text-base sm:text-lg font-bold text-emerald-950">
                  Détail Chasse par {scope.subZoneHeading}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-5">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-emerald-50/40">
                        <TableHead className="text-sm font-bold text-emerald-950">{scope.subZoneHeading}</TableHead>
                        <TableHead className="text-right text-sm font-bold text-emerald-950">Chasseurs</TableHead>
                        <TableHead className="text-right text-sm font-bold text-emerald-950">Permis actifs</TableHead>
                        <TableHead className="text-right text-sm font-bold text-emerald-950">Permis (FCFA)</TableHead>
                        <TableHead className="text-right text-sm font-bold text-emerald-950">Taxes (FCFA)</TableHead>
                        <TableHead className="text-right text-sm font-bold text-emerald-950">Infractions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {chasse.breakdownBySubZone.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm sm:text-base text-muted-foreground py-10">
                            Aucune donnée Chasse dans ce périmètre.
                          </TableCell>
                        </TableRow>
                      ) : (
                        chasse.breakdownBySubZone.map((row) => (
                          <TableRow key={row.zone} className="text-sm sm:text-base">
                            <TableCell className="font-semibold text-gray-900">{row.zone}</TableCell>
                            <TableCell className="text-right">{fmtNum(row.hunters)}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-700">
                              {fmtNum(row.activePermits)}
                            </TableCell>
                            <TableCell className="text-right">{fmtNum(row.permitsRevenue)}</TableCell>
                            <TableCell className="text-right">{fmtNum(row.taxesRevenue)}</TableCell>
                            <TableCell className="text-right">{fmtNum(row.infractions)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ══════════════════ SITUATION REBOISEMENT ══════════════════ */}
      {activeTab === "reboisement" && reboisement && (
        <div className="w-full space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
            <Card className="border-teal-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-muted-foreground">Rapports total</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1.5">
                  {fmtNum(reboisement.totalReports)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-emerald-700">Rapports validés</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-800 mt-1.5">
                  {fmtNum(reboisement.validatedReports)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-muted-foreground">Plants produits</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1.5">
                  {fmtNum(reboisement.totalPlantsProduced)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-teal-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-teal-700">Plants plantés</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-teal-800 mt-1.5">
                  {fmtNum(reboisement.totalPlantsPlanted)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-teal-200/80 shadow-sm bg-white">
            <CardHeader className="bg-teal-50/60 border-b border-teal-100 !py-4 px-6">
              <CardTitle className="text-base sm:text-lg font-bold text-teal-950 flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-teal-700" />
                Rapports Reboisement par {scope.subZoneHeading}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 sm:p-5">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-teal-50/40">
                      <TableHead className="text-sm font-bold text-teal-950">{scope.subZoneHeading}</TableHead>
                      <TableHead className="text-right text-sm font-bold text-teal-950">Total rapports</TableHead>
                      <TableHead className="text-right text-sm font-bold text-teal-950">Validés</TableHead>
                      <TableHead className="text-right text-sm font-bold text-teal-950">Soumis</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reboisement.breakdownBySubZone.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm sm:text-base text-muted-foreground py-10">
                          Aucun rapport Reboisement dans ce périmètre.
                        </TableCell>
                      </TableRow>
                    ) : (
                      reboisement.breakdownBySubZone.map((row) => (
                        <TableRow key={row.zone} className="text-sm sm:text-base">
                          <TableCell className="font-semibold text-gray-900">{row.zone}</TableCell>
                          <TableCell className="text-right">{fmtNum(row.total)}</TableCell>
                          <TableCell className="text-right text-emerald-700 font-bold">{fmtNum(row.validated)}</TableCell>
                          <TableCell className="text-right">{fmtNum(row.submitted)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════ SITUATION ALERTES ══════════════════ */}
      {activeTab === "alerte" && alerte && (
        <div className="w-full space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            <Card className="border-amber-200/80 shadow-sm bg-white">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-amber-900">Total alertes</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-amber-950 mt-1.5">
                  {fmtNum(alerte.totalAlerts)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-red-200/80 bg-red-50/40 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-red-700">Non lues</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-red-900 mt-1.5">
                  {fmtNum(alerte.unreadAlerts)}
                </div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200/80 bg-emerald-50/40 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="text-sm font-medium text-emerald-800">Lues / Traitées</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-emerald-900 mt-1.5">
                  {fmtNum(alerte.readAlerts)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
            <Card className="border-amber-200/80 shadow-sm bg-white">
              <CardHeader className="bg-amber-50/60 border-b border-amber-100 !py-4 px-6">
                <CardTitle className="text-base sm:text-lg font-bold text-amber-950">
                  Alertes par {scope.subZoneHeading}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 sm:p-5">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-amber-50/40">
                      <TableHead className="text-sm font-bold text-amber-950">{scope.subZoneHeading}</TableHead>
                      <TableHead className="text-right text-sm font-bold text-amber-950">Total</TableHead>
                      <TableHead className="text-right text-sm font-bold text-amber-950">Non lues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alerte.breakdownBySubZone.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm sm:text-base text-muted-foreground py-10">
                          Aucune alerte dans ce périmètre.
                        </TableCell>
                      </TableRow>
                    ) : (
                      alerte.breakdownBySubZone.map((z) => (
                        <TableRow key={z.zone} className="text-sm sm:text-base">
                          <TableCell className="font-semibold text-gray-900">{z.zone}</TableCell>
                          <TableCell className="text-right">{fmtNum(z.total)}</TableCell>
                          <TableCell className="text-right text-red-700 font-bold">{fmtNum(z.unread)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-amber-200/80 shadow-sm bg-white">
              <CardHeader className="bg-amber-50/60 border-b border-amber-100 !py-4 px-6">
                <CardTitle className="text-base sm:text-lg font-bold text-amber-950">
                  Dernières alertes reçues
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-3">
                {alerte.recentAlerts.length === 0 ? (
                  <p className="text-sm sm:text-base text-muted-foreground py-6 text-center">
                    Aucune alerte récente.
                  </p>
                ) : (
                  alerte.recentAlerts.map((a) => (
                    <div
                      key={a.id}
                      className="rounded-xl border border-amber-100 bg-amber-50/20 p-3.5 sm:p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-sm sm:text-base text-gray-900 truncate">
                          {a.title || NATURE_LABELS[(a.nature || "autre").toLowerCase()] || "Alerte"}
                        </div>
                        <div className="text-xs sm:text-sm text-gray-600 mt-0.5">
                          {[a.region, a.departement, a.arrondissement, a.commune].filter(Boolean).join(" · ") || "Zone non renseignée"}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        {!a.isRead && (
                          <Badge variant="destructive" className="text-xs font-semibold mb-1">
                            Nouveau
                          </Badge>
                        )}
                        <div className="text-xs sm:text-sm text-gray-500 font-medium">
                          {a.createdAt ? new Date(a.createdAt).toLocaleDateString("fr-FR") : ""}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
