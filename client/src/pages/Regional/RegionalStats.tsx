import ResponsivePage from "@/components/layout/ResponsivePage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { departmentsByRegion } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { exportMultiSheetXlsx, type ExcelSheetData } from "@/utils/export";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Loader2, MapPin } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function RegionalStatsPage() {
  const { user } = useAuth();
  const selectedPeriod = "all";
  const [isExporting, setIsExporting] = useState(false);

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

  const handleExportRegionalWorkbook = async () => {
    if (!agentRegion || isExporting) return;
    setIsExporting(true);
    try {
      const encodedRegion = encodeURIComponent(agentRegion);
      const [revenueRowsRaw, taxRowsRaw, permitsRaw, huntersRaw, infractionsRaw, speciesHuntedRaw, zonesRaw] = await Promise.all([
        apiRequest<any[]>({ url: `/api/stats/regional/revenue-by-type-export?region=${encodedRegion}`, method: "GET" }).catch(() => []),
        apiRequest<any[]>({ url: `/api/stats/regional/taxes-export?region=${encodedRegion}`, method: "GET" }).catch(() => []),
        apiRequest<any[]>({ url: `/api/permits/region/${encodedRegion}`, method: "GET" }).catch(() => []),
        apiRequest<any[]>({ url: `/api/hunters/region/${encodedRegion}`, method: "GET" }).catch(() => []),
        apiRequest<any[]>({ url: `/api/infractions?region=${encodedRegion}`, method: "GET" }).catch(() => []),
        apiRequest<any[]>({ url: `/api/stats/national/species-by-region`, method: "GET" }).catch(() => []),
        apiRequest<any>({ url: `/api/zones?lite=1`, method: "GET" }).catch(() => []),
      ]);

      const revenueRows: any[] = Array.isArray(revenueRowsRaw) ? revenueRowsRaw : [];
      const taxRows: any[] = Array.isArray(taxRowsRaw) ? taxRowsRaw : [];
      const permitsList: any[] = Array.isArray(permitsRaw) ? permitsRaw : (Array.isArray((permitsRaw as any)?.data) ? (permitsRaw as any).data : []);
      const huntersList: any[] = Array.isArray(huntersRaw) ? huntersRaw : (Array.isArray((huntersRaw as any)?.data) ? (huntersRaw as any).data : []);
      const allInfractions: any[] = Array.isArray(infractionsRaw) ? infractionsRaw : (Array.isArray((infractionsRaw as any)?.data) ? (infractionsRaw as any).data : []);
      const allSpeciesHunted: any[] = Array.isArray(speciesHuntedRaw) ? speciesHuntedRaw : [];
      const allZones: any[] = Array.isArray((zonesRaw as any)?.features)
        ? (zonesRaw as any).features.map((f: any) => f?.properties || f)
        : Array.isArray(zonesRaw)
          ? zonesRaw
          : Array.isArray((zonesRaw as any)?.data)
            ? (zonesRaw as any).data
            : Array.isArray((zonesRaw as any)?.zones)
              ? (zonesRaw as any).zones
              : [];

      const norm = (s?: string | null) =>
        String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const targetRegionNorm = norm(agentRegion);
      const regionalInfractions = allInfractions.filter((inf) => {
        const r = norm(inf?.region || inf?.locationRegion || inf?.lieu);
        return !r || r === targetRegionNorm || r.includes(targetRegionNorm);
      });

      const formatDateCell = (val: any) => {
        if (!val) return "";
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString("fr-FR");
      };

      const totalPermitsCount =
        Number(stats.activePermitCount || 0) +
        Number(stats.suspendedPermitCount || 0) +
        Number(stats.expiredPermitCount || 0);

      // 1. Synthèse régionale
      const sheetSynthese: ExcelSheetData = {
        name: "Synthèse régionale",
        headers: ["Indicateur", "Valeur"],
        rows: [
          ["Région", agentRegion],
          ["Chasseurs enregistrés", Number(stats.hunterCount || huntersList.length || 0)],
          ["Permis actifs", Number(stats.activePermitCount || 0)],
          ["Permis suspendus", Number(stats.suspendedPermitCount || 0)],
          ["Permis expirés", Number(stats.expiredPermitCount || 0)],
          ["Total permis délivrés", totalPermitsCount || permitsList.length],
          ["Taxes d'abattage enregistrées", Number(stats.taxCount || taxRows.length || 0)],
          ["Infractions enregistrées", Number(stats.infractionCount ?? regionalInfractions.length ?? 0)],
          ["Contrevenants enregistrés", Number(stats.contrevenantCount || 0)],
          ["Recettes totales (FCFA)", Number(stats.revenue || 0)],
          ["Recettes infractions (FCFA)", Number(stats.infractionRevenue || 0)],
        ],
      };

      // 2. Répartition des recettes (modèle officiel DEFCCS par département de la région)
      const normKey = (s?: string | null) =>
        String(s || "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/^secteur\s+/i, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

      const prettyDeptLabel = (raw: string) => {
        const clean = raw.replace(/^secteur\s+/i, "").trim();
        return clean
          .toLowerCase()
          .replace(/(^|[\s-])(\S)/g, (_, sep, ch) => sep + ch.toUpperCase());
      };

      const regionKey = normKey(agentRegion);
      const configuredDepts =
        (departmentsByRegion as Record<string, Array<{ value: string; label: string }>>)[regionKey] || [];

      const deptCols: Array<{ key: string; label: string }> = configuredDepts.map((d) => ({
        key: normKey(d.value),
        label: prettyDeptLabel(d.label),
      }));
      const knownDeptKeys = new Set(deptCols.map((c) => c.key));

      // Fallback si la région n'est pas dans departmentsByRegion
      if (deptCols.length === 0) {
        const fallbackKey = regionKey || "region";
        deptCols.push({ key: fallbackKey, label: prettyDeptLabel(agentRegion) });
        knownDeptKeys.add(fallbackKey);
      }

      const resolveDeptKey = (rawDept?: string | null): string => {
        const k = normKey(rawDept);
        if (!k) return deptCols[0].key;
        if (knownDeptKeys.has(k)) return k;
        // Correspondance partielle avec un département officiel de la région
        for (const col of deptCols) {
          if (k.includes(col.key) || col.key.includes(k)) return col.key;
        }
        // Si c'est le nom de la région elle-même (émission IREF), rattacher au chef-lieu (1er département)
        if (k === regionKey || k.includes(regionKey)) return deptCols[0].key;
        // Ajouter dynamiquement si un autre lieu/département apparaît
        knownDeptKeys.add(k);
        deptCols.push({ key: k, label: prettyDeptLabel(String(rawDept)) });
        return k;
      };

      const hunterDeptById = new Map<number, string>();
      for (const h of huntersList) {
        if (h?.id != null && (h?.departement || h?.zone)) {
          hunterDeptById.set(Number(h.id), String(h.departement || h.zone));
        }
      }

      // Accumulateur matrice : `${section}|${rowLabel}|${deptKey}` -> montant
      const matrixAcc = new Map<string, number>();
      const addMatrixAmount = (section: string, rowLabel: string, deptKey: string, amount: number) => {
        const amt = Number(amount || 0);
        if (!amt) return;
        const k = `${section}|${rowLabel}|${deptKey}`;
        matrixAcc.set(k, (matrixAcc.get(k) || 0) + amt);
      };
      const getMatrixAmount = (section: string, rowLabel: string, deptKey: string) =>
        matrixAcc.get(`${section}|${rowLabel}|${deptKey}`) || 0;

      // Alimenter depuis les permis de la région
      for (const p of permitsList) {
        const amt = Number(p?.price ?? p?.amount ?? 0);
        if (!amt) continue;
        const rawType = norm(p?.type || p?.category || p?.permitType || "");
        const rawSub = norm(p?.hunterCategory || p?.category || p?.hunter?.category || "");
        const combined = `${rawType} ${rawSub}`;
        const isTouriste = combined.includes("touriste");

        let section = "petite_chasse";
        let rowLabel = "Résident";

        if (combined.includes("coutumier")) {
          section = "petite_chasse";
          rowLabel = "Coutumier";
        } else if (combined.includes("gibier") || combined.includes("eau")) {
          section = "gibier_eau";
          rowLabel = isTouriste ? "Touriste" : "Résident";
        } else if (combined.includes("grande")) {
          section = "grande_chasse";
          rowLabel = isTouriste ? "Touriste" : "Résident";
        } else {
          section = "petite_chasse";
          rowLabel = isTouriste ? "Touriste" : "Résident";
        }

        const deptKey = resolveDeptKey(
          p?.departement || p?.issuerDepartment || p?.zone || hunterDeptById.get(Number(p?.hunterId))
        );
        addMatrixAmount(section, rowLabel, deptKey, amt);
      }

      // Alimenter depuis les taxes d'abattage de la région
      for (const r of taxRows) {
        const amt = Number(r?.amount || 0);
        if (!amt) continue;
        const speciesNorm = norm(r?.animalType || "");
        const rowLabel = speciesNorm.includes("phaco") ? "Taxe phaco" : "Taxe grande chasse";
        const deptKey = resolveDeptKey(r?.departement || r?.issuerServiceSnapshot);
        addMatrixAmount("licence_taxe", rowLabel, deptKey, amt);
      }

      // Alimenter le contentieux (infractions) de la région
      let infractionsMatrixSum = 0;
      for (const inf of regionalInfractions) {
        const amt = Number(inf?.fineAmount ?? inf?.amount ?? inf?.montant ?? 0);
        if (!amt) continue;
        const deptKey = resolveDeptKey(inf?.departement || inf?.lieu || inf?.location);
        addMatrixAmount("contentieux", "Contentieux", deptKey, amt);
        infractionsMatrixSum += amt;
      }
      // Si la synthèse régionale indique un montant d'infractions non reflété dans la liste détaillée
      const expectedInfractionRev = Number(stats.infractionRevenue || 0);
      if (expectedInfractionRev > infractionsMatrixSum) {
        addMatrixAmount("contentieux", "Contentieux", deptCols[0].key, expectedInfractionRev - infractionsMatrixSum);
      }

      const curYear = new Date().getFullYear();
      const recetteMatrixRows: (string | number)[][] = [];
      const domanialByDept = new Map<string, number>();
      let domanialGrandTotal = 0;

      const buildDeptSection = (
        sectionKey: string,
        sectionTitle: string,
        rowLabels: string[],
        totalLabel: string
      ) => {
        recetteMatrixRows.push([sectionTitle, ...deptCols.map(() => ""), ""]);
        const secTotals = new Map<string, number>();
        let secGrandTotal = 0;

        for (const rLabel of rowLabels) {
          let rowSum = 0;
          const cells = deptCols.map((c) => {
            const val = getMatrixAmount(sectionKey, rLabel, c.key);
            rowSum += val;
            secTotals.set(c.key, (secTotals.get(c.key) || 0) + val);
            domanialByDept.set(c.key, (domanialByDept.get(c.key) || 0) + val);
            return val;
          });
          secGrandTotal += rowSum;
          domanialGrandTotal += rowSum;
          recetteMatrixRows.push([rLabel, ...cells, rowSum]);
        }

        recetteMatrixRows.push([
          totalLabel,
          ...deptCols.map((c) => secTotals.get(c.key) || 0),
          secGrandTotal,
        ]);
      };

      buildDeptSection("petite_chasse", "Petite chasse", ["Coutumier", "Résident", "Touriste"], "Total 1");
      buildDeptSection("gibier_eau", "Gibier d'eau", ["Résident", "Touriste"], "Total 2");
      buildDeptSection("grande_chasse", "Grande chasse", ["Résident", "Touriste"], "Total 3");
      buildDeptSection(
        "licence_taxe",
        "Licence, Taxe et Redevances",
        [
          "Taxe phaco",
          "Taxe grande chasse",
          "Attestation pisteur",
          "Permis spécial d'oisellerie",
          "Attestation Collecteur",
          "Taxe Ramasseur",
          "Licence",
          "Taxe amodiation",
          "Taxe réserve privée",
        ],
        "Total 4"
      );

      recetteMatrixRows.push([
        `Total domanial ${curYear}`,
        ...deptCols.map((c) => domanialByDept.get(c.key) || 0),
        domanialGrandTotal,
      ]);

      const contentieuxByDept = new Map<string, number>();
      let contentieuxGrandTotal = 0;
      for (const c of deptCols) {
        const val = getMatrixAmount("contentieux", "Contentieux", c.key);
        contentieuxByDept.set(c.key, val);
        contentieuxGrandTotal += val;
      }
      recetteMatrixRows.push([
        `Contentieux ${curYear}`,
        ...deptCols.map((c) => contentieuxByDept.get(c.key) || 0),
        contentieuxGrandTotal,
      ]);

      recetteMatrixRows.push([
        `Total RECETTES CHASSES ${curYear}`,
        ...deptCols.map((c) => (domanialByDept.get(c.key) || 0) + (contentieuxByDept.get(c.key) || 0)),
        domanialGrandTotal + contentieuxGrandTotal,
      ]);

      const sheetRecettes: ExcelSheetData = {
        name: "Répartition recettes",
        headers: ["Type permis", ...deptCols.map((c) => c.label), "Total"],
        rows: recetteMatrixRows,
      };

      // 3. Taxes d'abattage (fidèle au CSV taxes)
      const totalTaxQty = taxRows.reduce((acc, r) => acc + Number(r?.quantity || 0), 0);
      const totalTaxAmt = taxRows.reduce((acc, r) => acc + Number(r?.amount || 0), 0);
      const sheetTaxes: ExcelSheetData = {
        name: "Taxes d'abattage",
        headers: [
          "Lieux d'enregistrement",
          "Numéro taxe",
          "Date",
          "Espèce",
          "Quantité",
          "Montant (FCFA)",
          "Numéro reçu",
          "Chasseur",
          "Numéro permis",
          "Catégorie permis",
          "Service",
          "Créé le",
        ],
        rows: [
          ...taxRows.map((r) => [
            String(r?.departement || ""),
            String(r?.taxNumber || ""),
            formatDateCell(r?.issueDate),
            String(r?.animalType || ""),
            Number(r?.quantity || 0),
            Number(r?.amount || 0),
            String(r?.receiptNumber || ""),
            String(r?.hunterNameSnapshot || ""),
            String(r?.permitNumberSnapshot || ""),
            String(r?.permitCategorySnapshot || ""),
            String(r?.issuerServiceSnapshot || ""),
            formatDateCell(r?.createdAt),
          ]),
          ["Total", "", "", "", totalTaxQty, totalTaxAmt, "", "", "", "", "", ""],
        ],
      };

      // Zones amodiées de la région (utilisées pour "Licences et amodiations" et "Touriste")
      const regionalAmodiees = allZones
        .filter((z) => {
          const zType = norm(z?.type);
          const zReg = norm(z?.region);
          const isAmodiee = zType === "amodiee" || zType.includes("amodi");
          const isSameRegion = zReg === targetRegionNorm || zReg.includes(targetRegionNorm) || targetRegionNorm.includes(zReg);
          return isAmodiee && isSameRegion && Boolean(z?.name);
        })
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      // 3b. Licences et Taxes d'amodiation (placé juste après Taxes d'abattage)
      const licenceMerges: string[] = ["A1:A2", "B1:B2", "C1:C2", "D1:E1", "F1:G1"];
      let totalLicenceAmt = 0;
      let totalAmodiationAmt = 0;
      const licenceRows: (string | number)[][] = [
        ["", "", "", "Montant", "N° quittance et date", "Montant", "N° Quittance et date"],
      ];

      for (const z of regionalAmodiees) {
        const licAmt = Number(z?.licence_amount ?? z?.licenceAmount ?? 0);
        const amoAmt = Number(z?.amodiation_amount ?? z?.amodiationAmount ?? 0);
        if (licAmt > 0) totalLicenceAmt += licAmt;
        if (amoAmt > 0) totalAmodiationAmt += amoAmt;
        licenceRows.push([
          String(z?.region || agentRegion),
          String(z?.name || ""),
          String(z?.responsible_name || z?.responsibleName || ""),
          licAmt > 0 ? licAmt : "",
          String(z?.licence_receipt || z?.licenceReceipt || ""),
          amoAmt > 0 ? amoAmt : "",
          String(z?.amodiation_receipt || z?.amodiationReceipt || ""),
        ]);
      }

      const licenceTotalRowIdx = licenceRows.length + 2; // ligne 1 = headers, rows démarrent à ligne 2
      licenceRows.push([
        "Total",
        "",
        "",
        totalLicenceAmt,
        "",
        totalAmodiationAmt,
        "",
      ]);
      licenceMerges.push(`A${licenceTotalRowIdx}:C${licenceTotalRowIdx}`);

      const sheetLicencesAmodiations: ExcelSheetData = {
        name: "Licences et amodiations",
        headers: ["Région", "Zone amodiée", "Amodiataire", "Licence", "", "Taxe d'amodiation", ""],
        rows: licenceRows,
        merges: licenceMerges,
      };

      // 4. Prélèvements (modèle officiel DEFCCS par catégorie de gibier et département de la région)
      const regionalSpecies = allSpeciesHunted.filter((item) => {
        const r = norm(item?.region);
        return r === targetRegionNorm || r.includes(targetRegionNorm) || targetRegionNorm.includes(r);
      });

      const normalizeGameCategory = (rawCat?: string | null): "gibier_eau" | "petite_chasse" | "grande_chasse" => {
        const c = norm(rawCat);
        if (c.includes("gibier") || c.includes("eau") || c.includes("oiseau")) return "gibier_eau";
        if (c.includes("grande")) return "grande_chasse";
        return "petite_chasse";
      };

      const prelevByCat = new Map<
        "gibier_eau" | "petite_chasse" | "grande_chasse",
        Map<string, { name: string; byDept: Map<string, number>; total: number }>
      >([
        ["gibier_eau", new Map()],
        ["petite_chasse", new Map()],
        ["grande_chasse", new Map()],
      ]);

      for (const item of regionalSpecies) {
        const qty = Number(item?.quantity || 0);
        if (qty <= 0) continue;
        const catKey = normalizeGameCategory(item?.category);
        const spName = String(item?.speciesName || item?.speciesId || "Inconnue").trim();
        const spKey = norm(spName);
        const spMap = prelevByCat.get(catKey)!;
        const entry = spMap.get(spKey) || { name: spName, byDept: new Map<string, number>(), total: 0 };
        const dk = resolveDeptKey(item?.departement);
        entry.byDept.set(dk, (entry.byDept.get(dk) || 0) + qty);
        entry.total += qty;
        spMap.set(spKey, entry);
      }

      const prelevPivotRows: (string | number)[][] = [];
      const grandPrelevByDept = new Map<string, number>();
      let grandPrelevTotal = 0;

      const gameSections: Array<{ key: "gibier_eau" | "petite_chasse" | "grande_chasse"; title: string; totalLabel: string }> = [
        { key: "gibier_eau", title: "Gibier d'eau", totalLabel: "Total 1" },
        { key: "petite_chasse", title: "Petite chasse", totalLabel: "Total 2" },
        { key: "grande_chasse", title: "Grande Chasse", totalLabel: "Total 3" },
      ];

      for (const sec of gameSections) {
        prelevPivotRows.push([sec.title, ...deptCols.map(() => ""), ""]);
        const spMap = prelevByCat.get(sec.key)!;
        const secDeptTotals = new Map<string, number>();
        let secTotal = 0;

        const sortedSp = Array.from(spMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const sp of sortedSp) {
          const cells = deptCols.map((c) => {
            const val = sp.byDept.get(c.key) || 0;
            if (val > 0) {
              secDeptTotals.set(c.key, (secDeptTotals.get(c.key) || 0) + val);
              grandPrelevByDept.set(c.key, (grandPrelevByDept.get(c.key) || 0) + val);
            }
            return val > 0 ? val : "";
          });
          secTotal += sp.total;
          grandPrelevTotal += sp.total;
          prelevPivotRows.push([sp.name, ...cells, sp.total]);
        }

        prelevPivotRows.push([
          sec.totalLabel,
          ...deptCols.map((c) => secDeptTotals.get(c.key) ?? 0),
          secTotal,
        ]);
      }

      prelevPivotRows.push([
        `Total ${curYear}`,
        ...deptCols.map((c) => grandPrelevByDept.get(c.key) ?? 0),
        grandPrelevTotal,
      ]);

      const sheetPrelevements: ExcelSheetData = {
        name: "Prélèvements",
        headers: ["Type gibier", ...deptCols.map((c) => c.label), "Total"],
        rows: prelevPivotRows,
      };

      // 5. Catégories de permis délivrés par département de la région (modèle officiel)
      const permitCatByDept = new Map<string, { petite: number; gibier: number; grande: number }>();
      for (const col of deptCols) {
        permitCatByDept.set(col.key, { petite: 0, gibier: 0, grande: 0 });
      }
      for (const p of permitsList) {
        const dk = resolveDeptKey(
          p?.departement || p?.issuerDepartment || p?.zone || hunterDeptById.get(Number(p?.hunterId))
        );
        if (!permitCatByDept.has(dk)) {
          permitCatByDept.set(dk, { petite: 0, gibier: 0, grande: 0 });
        }
        const entry = permitCatByDept.get(dk)!;
        const rawType = norm(p?.type || p?.category || p?.permitType || "");
        if (rawType.includes("gibier") || rawType.includes("eau")) {
          entry.gibier += 1;
        } else if (rawType.includes("grande")) {
          entry.grande += 1;
        } else {
          entry.petite += 1;
        }
      }
      const permitCatRows: (string | number)[][] = deptCols.map((col) => {
        const v = permitCatByDept.get(col.key) || { petite: 0, gibier: 0, grande: 0 };
        const rowTotal = v.petite + v.gibier + v.grande;
        return [col.label.toUpperCase(), v.petite, v.gibier, v.grande, rowTotal];
      });
      const sheetCategoriesPermis: ExcelSheetData = {
        name: "Catégories permis",
        headers: [
          "Département",
          "Permis sportifs petite chasse",
          "Permis sportif gibiers d'eau",
          "Permis sportif grande chasse",
          "Total",
        ],
        rows: [
          ...permitCatRows,
          [
            "Total",
            permitCatRows.reduce((a, r) => a + Number(r[1]), 0),
            permitCatRows.reduce((a, r) => a + Number(r[2]), 0),
            permitCatRows.reduce((a, r) => a + Number(r[3]), 0),
            permitCatRows.reduce((a, r) => a + Number(r[4]), 0),
          ],
        ],
      };

      // 5b. Chasseurs par département de la région (Coutumiers, Résidents, Touristes)
      const huntersByDept = new Map<string, { coutumiers: number; residents: number; touristes: number }>();
      for (const col of deptCols) {
        huntersByDept.set(col.key, { coutumiers: 0, residents: 0, touristes: 0 });
      }
      for (const h of huntersList) {
        const dk = resolveDeptKey(h?.departement || h?.zone);
        if (!huntersByDept.has(dk)) {
          huntersByDept.set(dk, { coutumiers: 0, residents: 0, touristes: 0 });
        }
        const entry = huntersByDept.get(dk)!;
        const cat = norm(h?.category || "");
        if (cat.includes("coutumier")) {
          entry.coutumiers += 1;
        } else if (cat.includes("touriste")) {
          entry.touristes += 1;
        } else {
          entry.residents += 1;
        }
      }
      const hunterCatRows: (string | number)[][] = deptCols.map((col) => {
        const v = huntersByDept.get(col.key) || { coutumiers: 0, residents: 0, touristes: 0 };
        const rowTotal = v.coutumiers + v.residents + v.touristes;
        return [col.label.toUpperCase(), v.coutumiers, v.residents, v.touristes, rowTotal];
      });
      const sheetChasseurs: ExcelSheetData = {
        name: "Chasseurs",
        headers: ["Départements", "Coutumiers", "Résidents", "Touristes", "Totaux"],
        rows: [
          ...hunterCatRows,
          [
            `Total ${curYear}`,
            hunterCatRows.reduce((a, r) => a + Number(r[1]), 0),
            hunterCatRows.reduce((a, r) => a + Number(r[2]), 0),
            hunterCatRows.reduce((a, r) => a + Number(r[3]), 0),
            hunterCatRows.reduce((a, r) => a + Number(r[4]), 0),
          ],
        ],
      };

      // 5c. Onglet "Résident" (Nature permis x Départements de la région + Total)
      const hunterCatById = new Map<number, string>();
      for (const h of huntersList) {
        if (h?.id != null) {
          hunterCatById.set(Number(h.id), norm(h?.category || ""));
        }
      }

      const residentRowLabels = [
        "Permis petite chasse résident",
        "Permis de grande chasse résident",
        "Permis coutumier",
        "Permis spécial de chasse au gibier d'eau",
      ] as const;

      const residentCounts = new Map<string, number>();
      const addResidentCount = (rowLabel: string, deptKey: string) => {
        const k = `${rowLabel}|${deptKey}`;
        residentCounts.set(k, (residentCounts.get(k) || 0) + 1);
      };

      for (const p of permitsList) {
        const rawType = norm(p?.type || p?.category || p?.permitType || "");
        const hunterCat = norm(p?.hunterCategory || p?.hunter?.category || hunterCatById.get(Number(p?.hunterId)) || "");
        const combined = `${rawType} ${hunterCat}`;
        if (combined.includes("touriste")) continue;

        const dk = resolveDeptKey(
          p?.departement || p?.issuerDepartment || p?.zone || hunterDeptById.get(Number(p?.hunterId))
        );

        if (combined.includes("coutumier")) {
          addResidentCount("Permis coutumier", dk);
        } else if (combined.includes("gibier") || combined.includes("eau")) {
          addResidentCount("Permis spécial de chasse au gibier d'eau", dk);
        } else if (combined.includes("grande")) {
          addResidentCount("Permis de grande chasse résident", dk);
        } else {
          addResidentCount("Permis petite chasse résident", dk);
        }
      }

      const residentColTotals = new Map<string, number>();
      let residentGrandTotal = 0;
      const residentRows: (string | number)[][] = residentRowLabels.map((label) => {
        let rowSum = 0;
        const cells = deptCols.map((c) => {
          const val = residentCounts.get(`${label}|${c.key}`) || 0;
          rowSum += val;
          residentColTotals.set(c.key, (residentColTotals.get(c.key) || 0) + val);
          return val > 0 ? val : "";
        });
        residentGrandTotal += rowSum;
        return [label, ...cells, rowSum];
      });
      residentRows.push([
        "Total",
        ...deptCols.map((c) => residentColTotals.get(c.key) || 0),
        residentGrandTotal,
      ]);

      const sheetResident: ExcelSheetData = {
        name: "Résident",
        headers: ["Nature permis", ...deptCols.map((c) => c.label), "Total"],
        rows: residentRows,
      };

      // 5d. Onglet "Touriste" (colonnes = noms des zones amodiées de la région + Total)
      const zoneCols: Array<{ key: string; label: string }> = regionalAmodiees.map((z) => ({
        key: normKey(z.name),
        label: String(z.name).trim(),
      }));
      const knownZoneKeys = new Set(zoneCols.map((c) => c.key));

      if (zoneCols.length === 0) {
        zoneCols.push({ key: "non-precisee", label: "Zone non précisée" });
        knownZoneKeys.add("non-precisee");
      }

      const resolveAmodieeZoneKey = (rawZone?: string | null): string => {
        const k = normKey(rawZone);
        if (!k) return zoneCols[0].key;
        if (knownZoneKeys.has(k)) return k;
        for (const col of zoneCols) {
          if (k.includes(col.key) || col.key.includes(k)) return col.key;
        }
        // Si une zone amodiée supplémentaire apparaît sur un permis touriste
        const extraKey = "autres-zones";
        if (!knownZoneKeys.has(extraKey)) {
          knownZoneKeys.add(extraKey);
          zoneCols.push({ key: extraKey, label: "Autres / Non précisée" });
        }
        return extraKey;
      };

      const detectTouristDuration = (p: any): "1w" | "2w" | "1m" => {
        const text = norm(`${p?.duration || ""} ${p?.type || ""} ${p?.category || ""} ${p?.permitType || ""}`);
        if (text.includes("1 mois") || text.includes("01 mois") || text.includes("mensuel") || text.includes("30")) return "1m";
        if (text.includes("2 semaine") || text.includes("02 semaine") || text.includes("14") || text.includes("15")) return "2w";
        if (text.includes("1 semaine") || text.includes("01 semaine") || text.includes("7")) return "1w";
        if (p?.issueDate && p?.expiryDate) {
          const d1 = new Date(p.issueDate).getTime();
          const d2 = new Date(p.expiryDate).getTime();
          if (!isNaN(d1) && !isNaN(d2) && d2 > d1) {
            const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
            if (days <= 10) return "1w";
            if (days <= 20) return "2w";
            return "1m";
          }
        }
        return "1w";
      };

      const touristCounts = new Map<string, number>();
      const addTouristCount = (rowLabel: string, zoneKey: string) => {
        const k = `${rowLabel}|${zoneKey}`;
        touristCounts.set(k, (touristCounts.get(k) || 0) + 1);
      };

      for (const p of permitsList) {
        const rawType = norm(p?.type || p?.category || p?.permitType || "");
        const hunterCat = norm(p?.hunterCategory || p?.hunter?.category || hunterCatById.get(Number(p?.hunterId)) || "");
        const combined = `${rawType} ${hunterCat}`;
        if (!combined.includes("touriste")) continue;

        const dur = detectTouristDuration(p);
        const zk = resolveAmodieeZoneKey(p?.amodieeZone || p?.huntingZone || p?.zone || p?.area);

        if (combined.includes("gibier") || combined.includes("eau")) {
          const label =
            dur === "1w"
              ? "Permis spécial de chasse au gibier d'eau 01 semaine"
              : dur === "2w"
                ? "Permis spécial de chasse au gibier d'eau 02 semaines"
                : "Permis spécial de chasse au gibier d'eau 01 mois";
          addTouristCount(label, zk);
        } else if (combined.includes("grande")) {
          const label =
            dur === "1w"
              ? "Permis de grande chasse touriste 01 semaine"
              : dur === "2w"
                ? "Permis de grande chasse touriste 02 semaines"
                : "Permis de grande chasse touriste 01 mois";
          addTouristCount(label, zk);
        } else {
          const label =
            dur === "1w"
              ? "Permis petite chasse touriste 01 semaine"
              : dur === "2w"
                ? "Permis petite chasse touriste 02 semaines"
                : "Permis petite chasse touriste 01 mois";
          addTouristCount(label, zk);
        }
      }

      const touristSections: Array<{ title: string; rows: string[]; subTotalLabel: string }> = [
        {
          title: "Petite chasse",
          rows: [
            "Permis petite chasse touriste 01 semaine",
            "Permis petite chasse touriste 02 semaines",
            "Permis petite chasse touriste 01 mois",
          ],
          subTotalLabel: "Sous total 1",
        },
        {
          title: "Chasse au gibier d'eau",
          rows: [
            "Permis spécial de chasse au gibier d'eau 01 semaine",
            "Permis spécial de chasse au gibier d'eau 02 semaines",
            "Permis spécial de chasse au gibier d'eau 01 mois",
          ],
          subTotalLabel: "Sous total 2",
        },
        {
          title: "Grande chasse",
          rows: [
            "Permis de grande chasse touriste 01 semaine",
            "Permis de grande chasse touriste 02 semaines",
            "Permis de grande chasse touriste 01 mois",
          ],
          subTotalLabel: "Sous total 3",
        },
      ];

      const touristRows: (string | number)[][] = [];
      const touristGrandByZone = new Map<string, number>();
      let touristGrandTotal = 0;

      for (const sec of touristSections) {
        touristRows.push([sec.title, ...zoneCols.map(() => ""), ""]);
        const secByZone = new Map<string, number>();
        let secTotal = 0;

        for (const rLabel of sec.rows) {
          let rowSum = 0;
          const cells = zoneCols.map((c) => {
            const val = touristCounts.get(`${rLabel}|${c.key}`) || 0;
            rowSum += val;
            secByZone.set(c.key, (secByZone.get(c.key) || 0) + val);
            touristGrandByZone.set(c.key, (touristGrandByZone.get(c.key) || 0) + val);
            return val > 0 ? val : "";
          });
          secTotal += rowSum;
          touristGrandTotal += rowSum;
          touristRows.push([rLabel, ...cells, rowSum > 0 ? rowSum : ""]);
        }

        touristRows.push([
          sec.subTotalLabel,
          ...zoneCols.map((c) => secByZone.get(c.key) || 0),
          secTotal,
        ]);
      }

      touristRows.push([
        "Total",
        ...zoneCols.map((c) => touristGrandByZone.get(c.key) || 0),
        touristGrandTotal,
      ]);

      const sheetTouriste: ExcelSheetData = {
        name: "Touriste",
        headers: ["Nom des zones amodiées", ...zoneCols.map((c) => c.label), "Total"],
        rows: touristRows,
      };

      // 6. Détails des permis (numéros de permis, chasseurs, catégories, statuts)
      const hunterNameById = new Map<number, string>();
      for (const h of huntersList) {
        if (h?.id != null) {
          hunterNameById.set(Number(h.id), `${h.firstName || ""} ${h.lastName || ""}`.trim());
        }
      }
      const sheetDetailsPermis: ExcelSheetData = {
        name: "Détails permis",
        headers: ["Numéro de permis", "Chasseur", "Catégorie", "Statut", "Date émission", "Date expiration", "Montant (FCFA)"],
        rows: [
          ...permitsList.map((p) => [
            String(p?.permitNumber || ""),
            String(
              p?.hunterName ||
              (p?.hunter ? `${p.hunter.firstName || ""} ${p.hunter.lastName || ""}`.trim() : "") ||
              hunterNameById.get(Number(p?.hunterId)) ||
              ""
            ),
            String(p?.type || p?.category || ""),
            String(p?.status || ""),
            formatDateCell(p?.issueDate || p?.createdAt),
            formatDateCell(p?.expiryDate),
            Number(p?.price || p?.amount || 0),
          ]),
          [
            "Total",
            `${permitsList.length} permis`,
            "",
            "",
            "",
            "",
            permitsList.reduce((acc, p) => acc + Number(p?.price || p?.amount || 0), 0),
          ],
        ],
      };

      // 7. Armes à feu (regroupées par Type + Marque + Calibre sans répétition)
      const weaponsMap = new Map<string, { type: string; brand: string; caliber: string; count: number }>();
      for (const h of huntersList) {
        const wType = String(h?.weaponType || "").trim();
        const wBrand = String(h?.weaponBrand || "").trim();
        const wCaliber = String(h?.weaponCaliber || "").trim();
        if (!wType && !wBrand && !wCaliber) continue;
        const key = `${norm(wType)}|${norm(wBrand)}|${norm(wCaliber)}`;
        const curr = weaponsMap.get(key) || {
          type: wType || "Non spécifié",
          brand: wBrand || "Non spécifiée",
          caliber: wCaliber || "Non spécifié",
          count: 0,
        };
        curr.count += 1;
        weaponsMap.set(key, curr);
      }
      const weaponRows = Array.from(weaponsMap.values())
        .sort((a, b) => b.count - a.count)
        .map((w) => [w.type, w.brand, w.caliber, w.count]);
      const sheetArmes: ExcelSheetData = {
        name: "Armes à feu",
        headers: ["Type d'arme", "Marque", "Calibre", "Nombre"],
        rows: [
          ...weaponRows,
          ["Total", "", "", weaponRows.reduce((acc, r) => acc + Number(r[3]), 0)],
        ],
      };

      // 8. Infractions (modèle officiel Contentieux avec cellules fusionnées, par département)
      const byDeptInf = new Map<
        string,
        {
          deptLabel: string;
          byNature: Map<
            string,
            {
              natureLabel: string;
              nbrPv: number;
              transiges: number;
              montant: number;
              instance: number;
              tribunal: number;
            }
          >;
        }
      >();

      for (const inf of regionalInfractions) {
        const dk = resolveDeptKey(inf?.departement || inf?.lieu || inf?.location);
        const deptLabel =
          (deptCols.find((c) => c.key === dk)?.label || prettyDeptLabel(inf?.departement || agentRegion)).toUpperCase();

        const rawNature = String(
          inf?.nature_infraction || inf?.type || inf?.infractionType || inf?.motif || inf?.description || "Non spécifiée"
        ).trim();
        const natureKey = norm(rawNature) || "non-specifiee";

        const deptEntry = byDeptInf.get(dk) || { deptLabel, byNature: new Map() };
        const natEntry = deptEntry.byNature.get(natureKey) || {
          natureLabel: rawNature || "Non spécifiée",
          nbrPv: 0,
          transiges: 0,
          montant: 0,
          instance: 0,
          tribunal: 0,
        };

        natEntry.nbrPv += 1;

        const montant = Number(inf?.montant_chiffre ?? inf?.fineAmount ?? inf?.amount ?? inf?.montant ?? 0);
        const hasQuittance = Boolean(
          (inf?.numero_quittance && String(inf.numero_quittance).trim()) ||
          (inf?.receiptNumber && String(inf.receiptNumber).trim())
        );
        const obsNorm = norm(`${inf?.observations || ""} ${inf?.status || ""}`);
        const isTribunal =
          obsNorm.includes("tribunal") ||
          obsNorm.includes("justice") ||
          obsNorm.includes("defere") ||
          obsNorm.includes("parquet");

        if (isTribunal) {
          natEntry.tribunal += 1;
        } else if (montant > 0 || hasQuittance) {
          natEntry.transiges += 1;
          natEntry.montant += montant;
        } else {
          natEntry.instance += 1;
        }

        deptEntry.byNature.set(natureKey, natEntry);
        byDeptInf.set(dk, deptEntry);
      }

      const infMerges: string[] = ["A1:A2", "B1:B2", "C1:C2", "D1:F1", "G1:G2"];
      const infSheetRows: (string | number)[][] = [
        ["", "", "", "Transigés", "Montant", "Instance", ""],
      ];

      let totalPv = 0;
      let totalTransiges = 0;
      let totalMontantInf = 0;
      let totalInstance = 0;
      let totalTribunal = 0;
      let currentInfRow = 3;

      const sortedDeptInf = Array.from(byDeptInf.values()).sort((a, b) =>
        a.deptLabel.localeCompare(b.deptLabel)
      );

      for (const dep of sortedDeptInf) {
        const natures = Array.from(dep.byNature.values()).sort((a, b) =>
          a.natureLabel.localeCompare(b.natureLabel)
        );
        const startRow = currentInfRow;
        natures.forEach((nat, idx) => {
          totalPv += nat.nbrPv;
          totalTransiges += nat.transiges;
          totalMontantInf += nat.montant;
          totalInstance += nat.instance;
          totalTribunal += nat.tribunal;

          infSheetRows.push([
            idx === 0 ? dep.deptLabel : "",
            nat.natureLabel,
            nat.nbrPv,
            nat.transiges,
            nat.montant > 0 ? nat.montant : "",
            nat.instance,
            nat.tribunal,
          ]);
          currentInfRow += 1;
        });
        const endRow = currentInfRow - 1;
        if (endRow > startRow) {
          infMerges.push(`A${startRow}:A${endRow}`);
        }
      }

      infSheetRows.push([
        `Total ${curYear}`,
        "",
        totalPv,
        totalTransiges,
        totalMontantInf,
        totalInstance,
        totalTribunal,
      ]);
      infMerges.push(`A${currentInfRow}:B${currentInfRow}`);

      const sheetInfractions: ExcelSheetData = {
        name: "Infractions",
        headers: ["Départements", "Nature infraction", "Nbr P.V", "Transactions", "", "", "Tribunal"],
        rows: infSheetRows,
        merges: infMerges,
      };

      const safeRegionFile = agentRegion.replace(/[^a-zA-Z0-9_-]+/g, "_").toLowerCase();
      exportMultiSheetXlsx(`statistiques_regionales_${safeRegionFile}.xlsx`, [
        sheetSynthese,
        sheetRecettes,
        sheetTaxes,
        sheetLicencesAmodiations,
        sheetPrelevements,
        sheetCategoriesPermis,
        sheetChasseurs,
        sheetResident,
        sheetTouriste,
        sheetDetailsPermis,
        sheetArmes,
        sheetInfractions,
      ]);
    } finally {
      setIsExporting(false);
    }
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportRegionalWorkbook}
            disabled={!agentRegion || isExporting}
            className="gap-2 bg-white hover:bg-emerald-50 border-emerald-200 text-emerald-800 shadow-sm"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? "Export en cours..." : "Exporter Excel"}
          </Button>
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
          </TabsContent>

          <TabsContent value="taxes" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Taxes d'abattage</CardTitle>
                  <CardDescription>
                    Nombre d'animaux prélevés par espèce
                  </CardDescription>
                </div>
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
