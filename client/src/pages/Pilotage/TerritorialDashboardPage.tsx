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
  ArrowLeft,
  ArrowRight,
  Bell,
  Download,
  FileSpreadsheet,
  Globe,
  Loader2,
  Map as MapIcon,
  MessageSquare,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import ChasseExecutiveSection, { type ChasseKpiData } from "./ChasseExecutiveSection";
import PilotageAlertsPanel from "./PilotageAlertsPanel";
import PilotageSmsPanel from "./PilotageSmsPanel";

const LazyMapPage = lazy(() => import("@/pages/MapPage"));
const LazyNationalStatistics = lazy(() => import("@/pages/National/NationalStatistics"));

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
  chasse: ChasseKpiData | null;
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

type TabKey = "chasse" | "reboisement" | "alerte" | "inbox-alerts" | "sms" | `extra:${string}`;
type ChasseSubTab = "synthese" | "regions" | "categories" | "especes" | "infractions" | "alertes" | "recette" | "armes";

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
  const [activeTab, setActiveTab] = useState<TabKey>("chasse");
  const [chasseSubTab, setChasseSubTab] = useState<ChasseSubTab>("synthese");
  const [showMapOverlay, setShowMapOverlay] = useState(false);
  const [smsReplyTarget, setSmsReplyTarget] = useState<{ identifier: string; label: string } | null>(null);
  const [liveUnreadSmsCount, setLiveUnreadSmsCount] = useState<number | null>(null);
  const embeddedExportFnRef = useRef<(() => Promise<void> | void) | null>(null);
  const registerEmbeddedExport = useCallback((fn: (() => Promise<void> | void) | null) => {
    embeddedExportFnRef.current = fn;
  }, []);

  useEffect(() => {
    if (!showMapOverlay) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowMapOverlay(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showMapOverlay]);

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
    const list: Array<{ key: TabKey; label: string }> = [];
    if (chasse) list.push({ key: "chasse", label: "Situation Chasse" });
    if (reboisement) list.push({ key: "reboisement", label: "Reboisement" });
    if (alerte) list.push({ key: "alerte", label: "Alertes" });
    for (const dom of extraDomains) {
      list.push({ key: `extra:${dom.codeSlug}`, label: dom.nomDomaine });
    }
    return list;
  }, [chasse, reboisement, alerte, extraDomains]);

  // Compteur léger de SMS non lus pour la pastille du bandeau haut
  const { data: smsInboxPreview } = useQuery<any[]>({
    queryKey: ["/api/messages/inbox", "pilotage-badge"],
    enabled: Boolean(user),
    queryFn: async () => {
      try {
        const resp: any = await apiRequest({ url: "/api/messages/inbox?domaineId=null", method: "GET" });
        if (Array.isArray(resp)) return resp;
        if (resp?.ok && Array.isArray(resp.data)) return resp.data;
        return [];
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const unreadSmsCount = useMemo(() => {
    if (liveUnreadSmsCount !== null) return liveUnreadSmsCount;
    return (Array.isArray(smsInboxPreview) ? smsInboxPreview : []).filter((m: any) => m?.isRead === false).length;
  }, [liveUnreadSmsCount, smsInboxPreview]);

  // Sélectionner automatiquement le premier onglet de domaine disponible
  useEffect(() => {
    if (activeTab === "inbox-alerts" || activeTab === "sms") return;
    if (availableTabs.length > 0 && !availableTabs.some((t) => t.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

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

  // Export CSV dédié aux Zones Amodiées / Établissements (Guides & Pisteurs par établissement)
  const handleExportZonesCsv = () => {
    if (!chasse || !scope) return;
    const escapeCsv = (val: string | number | null | undefined) => {
      const s = String(val ?? "");
      return s.includes(";") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = [
      "Zone amodiée",
      "Région",
      "Département",
      "Arrondissement",
      "Commune",
      "Responsable",
      "Téléphone",
      "Superficie (ha)",
      "Nombre de guides",
      "Nombre de pisteurs",
      "Statut",
    ];
    const rows = (chasse.zonesAmodiees ?? []).map((z) => [
      z.name,
      z.region,
      z.departement,
      z.arrondissement,
      z.commune,
      z.responsibleName,
      z.responsiblePhone,
      z.surfaceHa,
      z.guidesCount,
      z.trackersCount,
      z.status,
    ]);
    const csvLines = [headers.map(escapeCsv).join(";"), ...rows.map((r) => r.map(escapeCsv).join(";"))];
    const blob = new Blob(["\uFEFF" + csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Zones-Amodiees-Guides-Pisteurs-${scope.level}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({
      title: "Export CSV Zones amodiées généré",
      description: `${rows.length} zone(s) amodiée(s) avec guides et pisteurs exportée(s).`,
    });
  };

  // Bouton unique "Exporter Excel" : déclenche l'export analytique dédié sur les volets analytiques Chasse / Alertes,
  // ou le classeur KPI multi-onglets consolidé sur Synthèse KPI / autres domaines
  const handleExportExcel = () => {
    if (
      ((activeTab === "chasse" && chasseSubTab !== "synthese") || activeTab === "alerte") &&
      embeddedExportFnRef.current
    ) {
      void embeddedExportFnRef.current();
      return;
    }
    if (!data || !scope) return;
    const sheets: Array<{ name: string; headers: string[]; rows: Array<Array<string | number>> }> = [];

    const summaryRows: Array<Array<string | number>> = [
      ["Cadre", `${resolvedGrade ? `${resolvedGrade} ` : ""}${scope.fullName}`],
      ...(resolvedMatricule ? [["Matricule", resolvedMatricule] as Array<string | number>] : []),
      ["Rôle métier", scope.roleMetierLabel || "-"],
      ["Niveau", scope.levelLabel],
      ["Périmètre", scope.territoryDisplay],
      ["Date export", new Date().toLocaleString("fr-FR")],
    ];
    if (chasse) {
      summaryRows.push(
        ["Chasse — Chasseurs actifs", chasse.totalHunters],
        ["Chasse — Guides actifs", chasse.totalGuides],
        ["Chasse — Pisteurs (zones amodiées)", chasse.totalPisteurs ?? 0],
        ["Chasse — Zones amodiées (nombre)", chasse.amodieesCount ?? 0],
        ["Chasse — Zones amodiées (superficie ha)", chasse.amodieesSurfaceHa ?? 0],
        ["Chasse — Permis actifs", chasse.activePermits],
        ["Chasse — Demandes en attente", chasse.pendingRequests],
        ["Chasse — Espèces abattues (pièces)", chasse.totalPiecesAbattues ?? 0],
        ["Chasse — Armes à feu enregistrées", chasse.weapons?.totalWeapons ?? 0],
        ["Chasse — Taxe d'amodiation (FCFA)", chasse.amodieesFinance?.taxeAmodiation ?? 0],
        ["Chasse — Licences guides (FCFA)", chasse.amodieesFinance?.licencesGuides ?? 0],
        ["Chasse — Attestations pisteurs (FCFA)", chasse.amodieesFinance?.attestationsPisteurs ?? 0],
        ["Chasse — Recettes totales (FCFA)", chasse.totalRevenue],
        ["Chasse — Infractions", chasse.infractionsCount],
        ["Chasse — Contentieux (FCFA)", chasse.infractionsAmount]
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
          "Armes enregistrées",
          "Espèces abattues",
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
          z.weaponsCount ?? 0,
          z.piecesAbattues ?? 0,
          z.pendingRequests,
          z.permitsRevenue,
          z.taxesRevenue,
          z.infractions,
        ]),
      });

      sheets.push({
        name: "Zones amodiées",
        headers: [
          "Zone amodiée",
          "Région",
          "Département",
          "Arrondissement",
          "Commune",
          "Responsable",
          "Téléphone",
          "Superficie (ha)",
          "Guides",
          "Pisteurs",
          "Statut",
        ],
        rows: (chasse.zonesAmodiees ?? []).map((z) => [
          z.name,
          z.region,
          z.departement,
          z.arrondissement,
          z.commune,
          z.responsibleName,
          z.responsiblePhone,
          z.surfaceHa,
          z.guidesCount,
          z.trackersCount,
          z.status,
        ]),
      });

      sheets.push({
        name: "Espèces abattues",
        headers: ["Espèce", "Nom scientifique", "Catégorie", "Quantité abattue"],
        rows: (chasse.speciesBreakdown ?? []).map((s) => [
          s.speciesName,
          s.scientificName,
          s.category,
          s.quantity,
        ]),
      });

      sheets.push({
        name: "Permis par catégorie",
        headers: ["Catégorie de permis", "Nombre de permis", "Recettes (FCFA)"],
        rows: (chasse.permitsByCategory ?? []).map((cat) => [cat.category, cat.count, cat.revenue]),
      });

      if (chasse.revenuesBreakdown) {
        const rb = chasse.revenuesBreakdown;
        sheets.push({
          name: "Recettes par poste",
          headers: ["Poste de recette", "Montant (FCFA)"],
          rows: [
            ["Petite chasse", rb.petiteChasse],
            ["Gibier d'eau", rb.gibierEau],
            ["Grande chasse", rb.grandeChasse],
            ["Taxe d'amodiation", rb.taxeAmodiation],
            ["Licences guides", rb.licencesGuides],
            ["Attestations pisteurs", rb.attestationsPisteurs],
            ["Taxe réserve privée", rb.taxeReservePrivee],
            ["Taxes d'abattage", rb.taxesAbattage],
            ["Contentieux / Transactions", rb.contentieux],
          ],
        });
      }

      sheets.push({
        name: "Armes et Calibres",
        headers: ["Type d'arme", "Marque", "Calibre", "Nombre"],
        rows: (chasse.weapons?.details ?? []).map((w) => [
          w.weaponType,
          w.brand,
          w.caliber,
          w.count,
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
    <div className="w-full min-h-[calc(100dvh-5.5rem)] flex flex-col space-y-5 sm:space-y-6 py-3 sm:py-4 pb-10">
      {/* Bandeau de posture territoriale + Barre d'onglets collée — Un seul bloc exécutif vert clair */}
      <section className="w-full rounded-2xl border border-emerald-300/80 overflow-hidden shadow-sm bg-white">
        <div className="bg-gradient-to-r from-emerald-100/95 via-green-50 to-teal-50 text-emerald-950 p-5 sm:p-6">
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

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => setActiveTab((prev) => (prev === "inbox-alerts" ? (availableTabs[0]?.key ?? "chasse") : "inbox-alerts"))}
                className={`h-10 gap-2 font-semibold shadow-xs px-4 transition-all ${
                  activeTab === "inbox-alerts"
                    ? "bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                    : "bg-white hover:bg-amber-50 text-emerald-950 border-emerald-300"
                }`}
              >
                <Bell className={`h-4 w-4 ${activeTab === "inbox-alerts" ? "text-white" : "text-amber-600"}`} />
                <span>Alertes</span>
                {(alerte?.unreadAlerts ?? 0) > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold">
                    {alerte!.unreadAlerts}
                  </span>
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => {
                  setSmsReplyTarget(null);
                  setActiveTab((prev) => (prev === "sms" ? (availableTabs[0]?.key ?? "chasse") : "sms"));
                }}
                className={`h-10 gap-2 font-semibold shadow-xs px-4 transition-all ${
                  activeTab === "sms"
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white border-emerald-700"
                    : "bg-white hover:bg-emerald-50 text-emerald-950 border-emerald-300"
                }`}
              >
                <MessageSquare className={`h-4 w-4 ${activeTab === "sms" ? "text-white" : "text-emerald-700"}`} />
                <span>SMS</span>
                {unreadSmsCount > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                    {unreadSmsCount}
                  </span>
                )}
              </Button>

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
        </div>

        {/* Barre d'onglets collée directement au bandeau du haut + Bouton Carte plein écran */}
        <div className="w-full flex flex-wrap items-center justify-between gap-2 border-t border-emerald-200 bg-white px-4 sm:px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            {availableTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`rounded-lg px-5 py-2 text-sm sm:text-base font-semibold transition-all ${
                  activeTab === t.key
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-emerald-900/75 hover:bg-emerald-50 hover:text-emerald-950"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowMapOverlay(true)}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm sm:text-base font-semibold bg-emerald-50 hover:bg-emerald-600 text-emerald-900 hover:text-white border border-emerald-300 transition-all shadow-xs"
          >
            <MapIcon className="h-4 w-4" />
            <span>Carte dynamique</span>
          </button>
        </div>

        {/* Sous-onglets analytiques Chasse collés directement sous "Situation Chasse" */}
        {activeTab === "chasse" && chasse && (
          <div className="w-full overflow-x-auto border-t border-emerald-100 bg-emerald-50/40 px-4 sm:px-6 py-2">
            <div className="inline-flex items-center gap-1.5 min-w-max">
              {(
                [
                  {
                    key: "synthese" as ChasseSubTab,
                    label: "Synthèse KPI",
                    idle: "text-emerald-800 hover:bg-white",
                    active: "bg-white text-emerald-950 shadow-xs ring-1 ring-emerald-300",
                  },
                  {
                    key: "regions" as ChasseSubTab,
                    label:
                      scope.level === "regional"
                        ? "Par département"
                        : scope.level === "departemental"
                          ? "Par arrondissement"
                          : scope.level === "arrondissement"
                            ? "Par commune"
                            : "Par région",
                    idle: "text-emerald-700 hover:bg-emerald-100/70",
                    active: "bg-emerald-100 text-emerald-900 shadow-xs ring-1 ring-emerald-300",
                  },
                  {
                    key: "categories" as ChasseSubTab,
                    label: "Catégories de permis",
                    idle: "text-blue-600 hover:bg-blue-50",
                    active: "bg-blue-50 text-blue-800 shadow-xs ring-1 ring-blue-300",
                  },
                  {
                    key: "especes" as ChasseSubTab,
                    label: "Espèces chassées",
                    idle: "text-red-600 hover:bg-red-50",
                    active: "bg-red-50 text-red-800 shadow-xs ring-1 ring-red-300",
                  },
                  {
                    key: "infractions" as ChasseSubTab,
                    label: "Infractions",
                    idle: "text-amber-700 hover:bg-amber-50",
                    active: "bg-amber-50 text-amber-900 shadow-xs ring-1 ring-amber-300",
                  },
                  {
                    key: "recette" as ChasseSubTab,
                    label: "Recettes",
                    idle: "text-purple-700 hover:bg-purple-50",
                    active: "bg-purple-50 text-purple-900 shadow-xs ring-1 ring-purple-300",
                  },
                  {
                    key: "armes" as ChasseSubTab,
                    label: "Armes",
                    idle: "text-orange-600 hover:bg-orange-50",
                    active: "bg-orange-50 text-orange-800 shadow-xs ring-1 ring-orange-300",
                  },
                ] as const
              ).map((sub) => (
                <button
                  key={sub.key}
                  type="button"
                  onClick={() => setChasseSubTab(sub.key)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                    chasseSubTab === sub.key ? sub.active : sub.idle
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* État vide si aucun domaine actif configuré */}
      {availableTabs.length === 0 && (
        <Card className="border-emerald-200 bg-white shadow-sm">
          <CardContent className="p-10 text-center space-y-2">
            <Globe className="h-10 w-10 text-emerald-600 mx-auto opacity-80" />
            <h2 className="text-lg font-bold text-emerald-950">Aucun domaine actif configuré</h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
              Aucun domaine n&apos;est actuellement activé dans le système ou attribué à votre rôle métier pour l&apos;affichage des KPI.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ══════════════════ AUTRES DOMAINES DYNAMIQUES ══════════════════ */}
      {activeTab.startsWith("extra:") && (() => {
        const slug = activeTab.slice(6);
        const dom = extraDomains.find((d) => d.codeSlug === slug);
        if (!dom) return null;
        return (
          <Card className="border-indigo-200 shadow-sm bg-white">
            <CardHeader className="bg-indigo-50/80 border-b border-indigo-100 !py-4 px-6">
              <CardTitle className="text-lg sm:text-xl font-bold text-indigo-950 flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                  <Globe className="h-5 w-5" />
                </div>
                {dom.nomDomaine}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-100 p-5 max-w-sm">
                <div className="text-sm font-medium text-indigo-900">Agents affectés sur le périmètre</div>
                <div className="text-3xl sm:text-4xl font-extrabold text-indigo-950 mt-1.5 tracking-tight">
                  {fmtNum(dom.agentsCount)}
                </div>
              </div>
              <p className="text-sm sm:text-base text-slate-600">
                Domaine actif ({dom.codeSlug}) rattaché à votre portée territoriale.
              </p>
            </CardContent>
          </Card>
        );
      })()}

      {/* ══════════════════ SITUATION CHASSE DÉTAILLÉE ══════════════════ */}
      {activeTab === "chasse" && chasse && (
        <div className="w-full space-y-6">
          {chasseSubTab === "synthese" ? (
            <ChasseExecutiveSection chasse={chasse} />
          ) : (
            <Suspense
              fallback={
                <div className="w-full py-10 flex items-center justify-center gap-3 text-emerald-800">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <span className="text-sm font-medium">Chargement du volet analytique Chasse…</span>
                </div>
              }
            >
              <LazyNationalStatistics
                embedded
                hideEmbeddedTabs
                controlledTab={chasseSubTab}
                onRegisterExport={registerEmbeddedExport}
                territorialScope={{
                  level: scope.level,
                  region: scope.region,
                  departement: scope.departement,
                  arrondissement: scope.arrondissement,
                  commune: scope.commune,
                  territoryDisplay: scope.territoryDisplay,
                  subZoneHeading: scope.subZoneHeading,
                  subZoneBreakdown: chasse.breakdownBySubZone,
                }}
              />
            </Suspense>
          )}
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
          <Suspense
            fallback={
              <div className="w-full py-10 flex items-center justify-center gap-3 text-emerald-800">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                <span className="text-sm font-medium">Chargement du suivi analytique des alertes…</span>
              </div>
            }
          >
            <LazyNationalStatistics
              embedded
              hideEmbeddedTabs
              controlledTab="alertes"
              onRegisterExport={registerEmbeddedExport}
              territorialScope={{
                level: scope.level,
                region: scope.region,
                departement: scope.departement,
                arrondissement: scope.arrondissement,
                commune: scope.commune,
                territoryDisplay: scope.territoryDisplay,
                subZoneHeading: scope.subZoneHeading,
                subZoneBreakdown:
                  chasse?.breakdownBySubZone ??
                  alerte.breakdownBySubZone.map((z) => ({
                    zone: z.zone,
                    hunters: 0,
                    guides: 0,
                    activePermits: 0,
                    pendingRequests: 0,
                    permitsRevenue: 0,
                    taxesRevenue: 0,
                    infractions: 0,
                  })),
              }}
            />
          </Suspense>
        </div>
      )}

      {/* ══════════════════ BOÎTE DES ALERTES TERRAIN ══════════════════ */}
      {activeTab === "inbox-alerts" && (
        <div className="w-full space-y-4">
          <PilotageAlertsPanel
            scope={{
              level: scope.level,
              region: scope.region,
              departement: scope.departement,
              arrondissement: scope.arrondissement,
              commune: scope.commune,
              territoryDisplay: scope.territoryDisplay,
            }}
            onReplyBySms={(identifier, label) => {
              setSmsReplyTarget({ identifier, label });
              setActiveTab("sms");
            }}
          />
        </div>
      )}

      {/* ══════════════════ MESSAGERIE SMS (HIÉRARCHIE + ÉQUIPE SUPPORT) ══════════════════ */}
      {activeTab === "sms" && (
        <div className="w-full space-y-4">
          <PilotageSmsPanel
            scope={{
              level: scope.level,
              region: scope.region,
              departement: scope.departement,
              territoryDisplay: scope.territoryDisplay,
            }}
            initialRecipient={smsReplyTarget}
            onUnreadCountChange={setLiveUnreadSmsCount}
          />
        </div>
      )}

      {/* ══════════════════ CARTE DYNAMIQUE PLEIN ÉCRAN (avec barre d'onglets de retour KPI) ══════════════════ */}
      {showMapOverlay && (
        <div
          className="fixed inset-x-0 bottom-0 z-[150] bg-white"
          style={{ top: "var(--fixed-top, 56px)" }}
        >
          {/* Bouton flottant unique pour revenir instantanément aux KPI */}
          <div
            className="fixed left-1/2 -translate-x-1/2 z-[1200] flex items-center justify-center rounded-full bg-white/95 backdrop-blur-md border-2 border-emerald-400 shadow-xl p-1"
            style={{ top: "calc(var(--fixed-top, 56px) + 10px)" }}
          >
            <button
              type="button"
              onClick={() => setShowMapOverlay(false)}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 text-xs sm:text-sm font-bold shadow-xs transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour aux KPI</span>
            </button>
          </div>

          <Suspense
            fallback={
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-emerald-800">
                <Loader2 className="h-9 w-9 animate-spin text-emerald-600" />
                <p className="text-sm font-medium">Ouverture de la carte dynamique…</p>
              </div>
            }
          >
            <LazyMapPage />
          </Suspense>
        </div>
      )}
    </div>
  );
}
