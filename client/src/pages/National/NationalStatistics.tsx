import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { exportArrayToCsv, exportMultiSheetXlsx } from "@/utils/export";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  BarChart as BarChartIcon,
  FileDown,
  FileText,
  PieChart as PieChartIcon,
  Printer,
  Shield,
  Target,
  TrendingUp,
  Wallet
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line, LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis, YAxis
} from "recharts";

interface NationalAggregates {
  hunterCount: number;
  permitCount: number;
  activePermitCount: number;
  expiredPermitCount: number;
  suspendedPermitCount?: number;
  guidesCount: number;
  taxCount: number;
  revenue: number;
  totalPiecesAbattues: number;
  infractionsCount?: number;
}

interface RegionAggregateRow {
  region: string;
  activePermits: number;
  piecesAbattues: number;
  revenue: number;
  taxAmount?: number;
}

// Interfaces pour les données d'armes
interface WeaponStats {
  totalWeapons: number;
  weaponsByBrand: { brand: string; count: number }[];
  weaponsByCategory: { category: string; count: number }[];
  weaponsByRegion: { region: string; count: number }[];
}

interface PermitExpiration {
  expiring3Months: number;
  expiring6Months: number;
  expiring1Year: number;
  expired: number;
}

interface WeaponByPermitCategory {
  permitCategory: string;
  weaponType: string;
  brand?: string;
  caliber?: string;
  count: number;
}

interface WeaponByRegion {
  region: string;
  brand: string;
  weaponType: string;
  caliber?: string;
  count: number;
}

interface RevenueMonthlyRow {
  monthKey: string;
  permitAmount: number;
  taxAmount: number;
  infractionAmount: number;
}

interface RevenueDepartmentRow {
  region: string;
  departement: string;
  permitAmount: number;
  taxAmount: number;
  infractionAmount: number;
}

type RevenueGroupingRow = {
  key: string;
  region: string;
  departement?: string;
  revenue: number;
};

type RevenueChartRow = RevenueGroupingRow & { label: string };

export interface TerritorialSubZoneRow {
  zone: string;
  hunters: number;
  guides: number;
  activePermits: number;
  pendingRequests: number;
  permitsRevenue: number;
  taxesRevenue: number;
  infractions: number;
  piecesAbattues?: number;
}

export interface TerritorialMonthlyFluxRow {
  monthKey: string;
  label: string;
  huntersCoutumier: number;
  huntersResident: number;
  huntersTouriste: number;
  huntersTotal: number;
  permitsTotal: number;
}

export interface TerritorialStatsScope {
  level: "national" | "regional" | "departemental" | "arrondissement";
  region?: string | null;
  departement?: string | null;
  arrondissement?: string | null;
  commune?: string | null;
  territoryDisplay?: string;
  subZoneHeading?: string;
  subZoneBreakdown?: TerritorialSubZoneRow[];
  monthlyFlux?: TerritorialMonthlyFluxRow[];
}

export interface NationalStatisticsProps {
  embedded?: boolean;
  territorialScope?: TerritorialStatsScope;
  controlledTab?: string;
  hideEmbeddedTabs?: boolean;
  onRegisterExport?: (fn: (() => Promise<void> | void) | null) => void;
}

export default function NationalStatistics({
  embedded = false,
  territorialScope,
  controlledTab,
  hideEmbeddedTabs = false,
  onRegisterExport,
}: NationalStatisticsProps = {}) {
  const handlePrint = () => {
    const style = document.createElement('style');
    style.id = 'print-style-national';
    style.innerHTML = `
      @media print {
        body * { visibility: hidden; }
        #national-print, #national-print * { visibility: visible; }
        .print\\:hidden { display: none !important; }
        #national-print { position: absolute; left: 0; top: 0; width: 100%; }
        table { width: 100%; }
        /* N'afficher que l'onglet actif */
        #national-print [role="tabpanel"] { display: none !important; }
        #national-print [role="tabpanel"][data-state="active"] { display: block !important; }
      }
    `;
    document.head.appendChild(style);

    window.print();

    setTimeout(() => {
      const printStyle = document.getElementById('print-style-national');
      if (printStyle) printStyle.remove();
    }, 1000);
  };

  const exportAlertsWithRecipientsCsv = async () => {
    const params = new URLSearchParams();
    if (fromDateISO) params.set('from', fromDateISO);
    if (toDateISO) params.set('to', toDateISO);
    if (alertNature && alertNature !== 'toutes') params.set('nature', alertNature);
    const url = `/api/alerts/recipients?${params.toString()}`;
    const resp = await apiRequest<any[]>("GET", url);
    if (!(resp as any).ok) {
      console.error("Erreur /api/alerts/recipients:", (resp as any).error);
      return;
    }
    const data = (resp as any).data || [];
    const header = [
      'Date Alerte', 'Nature', 'Région Alerte', 'Département Alerte',
      'Nom', 'Prénom', 'Rôle', 'Région Service', 'Département Service', 'Lu', 'Date Notification'
    ];
    const rows: (string | number)[][] = [];
    for (const a of data) {
      for (const rec of (a.recipients || [])) {
        const last = rec.user?.last_name || '';
        const first = rec.user?.first_name || '';
        rows.push([
          a.created_at ? new Date(a.created_at).toLocaleString('fr-FR') : '',
          a.nature || '',
          prettyRegion(a.region || ''),
          a.departement || '',
          last,
          first,
          rec.user?.role || '',
          rec.user?.region || '',
          rec.user?.departement || '',
          rec.is_read ? 'OUI' : 'NON',
          rec.created_at ? new Date(rec.created_at).toLocaleString('fr-FR') : ''
        ]);
      }
    }
    exportArrayToCsv(`alertes_destinataires_${alertPeriod}.csv`, header, rows);
  };
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState(controlledTab || (embedded ? "regions" : "overview"));

  useEffect(() => {
    if (controlledTab && controlledTab !== activeTab) {
      setActiveTab(controlledTab);
    }
  }, [controlledTab]);
  const [selectedRegion, setSelectedRegion] = useState("toutes");
  // Filtres Recettes
  const [revenueGroupBy, setRevenueGroupBy] = useState<'region'|'departement'>('region');
  const [revenueRegion, setRevenueRegion] = useState<string>('toutes');
  const [revenueView, setRevenueView] = useState<'table' | 'chart'>('table');
  const [hoveredRevenueGroup, setHoveredRevenueGroup] = useState<'domanial' | 'contentieux' | null>(null);

  // Filtres Armes
  const [weaponRegionFilter, setWeaponRegionFilter] = useState<string>('toutes');
  const [weaponBrandFilter, setWeaponBrandFilter] = useState<string>('toutes');
  const [weaponCategoryFilter, setWeaponCategoryFilter] = useState<string>('toutes');

  // Filtres dynamiques Catégorie d'espèce et Région (onglet Espèces chassées)
  const [speciesCategoryFilter, setSpeciesCategoryFilter] = useState<string>('toutes');
  const [speciesRegionFilter, setSpeciesRegionFilter] = useState<string>('toutes');
  const [speciesHunterScope, setSpeciesHunterScope] = useState<'registered' | 'all'>('registered');

  // Filtres Région pour les onglets Par région, Catégories de permis, Infractions et Alertes
  const [statsRegionFilter, setStatsRegionFilter] = useState<string>('toutes');
  const [subZoneStatsFilter, setSubZoneStatsFilter] = useState<string>('toutes');
  const [speciesSubZoneFilter, setSpeciesSubZoneFilter] = useState<string>('toutes');
  const [categoriesRegionFilter, setCategoriesRegionFilter] = useState<string>('toutes');
  const [showCategoriesAnalysis, setShowCategoriesAnalysis] = useState<boolean>(false);
  const [infractionsRegionFilter, setInfractionsRegionFilter] = useState<string>('toutes');
  const [infractionsSubZoneFilter, setInfractionsSubZoneFilter] = useState<string>('toutes');
  const [alertRegionFilter, setAlertRegionFilter] = useState<string>('toutes');
  const [alertSubZoneFilter, setAlertSubZoneFilter] = useState<string>('toutes');
  // Normalisation/affichage des régions - Chargées dynamiquement depuis l'API
  // Les libellés et l'ordre sont maintenant récupérés depuis la base de données
  const REGION_LABELS: Record<string, string> = {
    national: 'DEFCCS',
    defccs: 'DEFCCS',
    dakar: 'DAKAR',
    thies: 'THIÈS',
    saintlouis: 'SAINT-LOUIS',
    louga: 'LOUGA',
    fatick: 'FATICK',
    kaolack: 'KAOLACK',
    kaffrine: 'KAFFRINE',
    matam: 'MATAM',
    tambacounda: 'TAMBACOUNDA',
    kedougou: 'KÉDOUGOU',
    kolda: 'KOLDA',
    sedhiou: 'SÉDHIOU',
    ziguinchor: 'ZIGUINCHOR',
    diourbel: 'DIOURBEL',
    nondefini: 'Non défini',
  };
  const REGION_ORDER: string[] = []; // Vide - sera rempli dynamiquement
  const removeDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const canonicalRegionKey = (raw?: string) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return 'nondefini';
    const cleaned = removeDiacritics(key).replace(/[^a-z0-9]+/g, '');
    if (cleaned === 'defccs') return 'national';
    return cleaned;
  };
  // Pour les fichiers exportés, les émissions de la DEFCCS ('national'/'defccs') sont comptabilisées dans Dakar ('dakar')
  const exportRegionKey = (raw?: string) => {
    const k = canonicalRegionKey(raw);
    return k === 'national' || k === 'defccs' ? 'dakar' : k;
  };

  const prettyRegion = (raw?: string) => {
    const key = canonicalRegionKey(raw);
    const label = REGION_LABELS[key];
    if (label) return label;
    const rawTrimmed = String(raw || 'non défini').trim().toLowerCase();
    // Title-case simple par défaut
    return rawTrimmed
      .split(/\s+/)
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  };

  // Verrouillage territorial optionnel (quand embarqué dans /pilotage pour un cadre Régional / Départemental / Arrondissement)
  const isRegionLocked = Boolean(
    territorialScope && territorialScope.level !== "national" && territorialScope.region
  );
  const lockedRegionKey = isRegionLocked ? canonicalRegionKey(territorialScope?.region || "") : null;
  const lockedRegionLabel = isRegionLocked ? prettyRegion(territorialScope?.region || "") : null;
  const lockedDeptNorm =
    territorialScope &&
    (territorialScope.level === "departemental" || territorialScope.level === "arrondissement") &&
    territorialScope.departement
      ? removeDiacritics(String(territorialScope.departement).trim().toLowerCase())
      : null;
  const matchesLockedDept = (raw?: string | null): boolean => {
    if (!lockedDeptNorm) return true;
    const v = removeDiacritics(String(raw || "").trim().toLowerCase());
    if (!v) return false;
    return v === lockedDeptNorm || v.includes(lockedDeptNorm) || lockedDeptNorm.includes(v);
  };
  const isSubZoneMode = Boolean(territorialScope && territorialScope.level !== "national");
  const geoUnitLabel =
    territorialScope?.level === "regional"
      ? "Département"
      : territorialScope?.level === "departemental"
        ? "Arrondissement"
        : territorialScope?.level === "arrondissement"
          ? "Commune"
          : "Région";
  const geoUnitLower = geoUnitLabel.toLowerCase();
  const geoUnitPlural =
    territorialScope?.level === "regional"
      ? "Tous les départements"
      : territorialScope?.level === "departemental"
        ? "Tous les arrondissements"
        : territorialScope?.level === "arrondissement"
          ? "Toutes les communes"
          : "Toutes les régions";
  const regionsTabLabel = `Par ${geoUnitLower}`;

  const subZoneStatsRows = useMemo(() => {
    const raw = territorialScope?.subZoneBreakdown || [];
    if (subZoneStatsFilter === "toutes") return raw;
    return raw.filter((r) => r.zone === subZoneStatsFilter);
  }, [territorialScope?.subZoneBreakdown, subZoneStatsFilter]);

  const subZoneFilterOptions = useMemo(() => {
    return (territorialScope?.subZoneBreakdown || [])
      .map((r) => r.zone)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "fr"));
  }, [territorialScope?.subZoneBreakdown]);
  const prettyDepartment = (raw?: string | null) => {
    const value = String(raw || '').trim();
    if (!value) return 'Non défini';
    // Ne jamais afficher des coordonnées GPS brutes à la place d'un nom de département
    if (/^gps\s*:/i.test(value) || /^-?\d+(\.\d+)?\s*[,;]\s*-?\d+(\.\d+)?$/.test(value)) {
      return 'Non renseigné';
    }
    return value
      .split(/\s+/)
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ');
  };
  const sortRegions = (regs: string[]) => {
    if (REGION_ORDER.length > 0) {
      const orderMap = new Map(REGION_ORDER.map((r, i) => [r.toLowerCase(), i] as const));
      return [...regs].sort((a, b) => {
        const ai = orderMap.get(a.toLowerCase());
        const bi = orderMap.get(b.toLowerCase());
        if (ai != null && bi != null) return ai - bi;
        if (ai != null) return -1;
        if (bi != null) return 1;
        return a.localeCompare(b);
      });
    }
    return [...regs].sort((a, b) => a.localeCompare(b));
  };

  const { data: revenueByMonth = [], isLoading: revenueByMonthLoading } = useQuery<RevenueMonthlyRow[]>({
    queryKey: ["/api/stats/national/revenue-by-month"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/revenue-by-month");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/revenue-by-month:", (resp as any).error);
        return [] as RevenueMonthlyRow[];
      }
      return ((resp as any).data || []) as RevenueMonthlyRow[];
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const { data: revenueByDepartment = [], isLoading: revenueByDepartmentLoading } = useQuery<RevenueDepartmentRow[]>({
    queryKey: ["/api/stats/national/revenue-by-department"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/revenue-by-department");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/revenue-by-department:", (resp as any).error);
        return [] as RevenueDepartmentRow[];
      }
      return ((resp as any).data || []) as RevenueDepartmentRow[];
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  type RevenueChasseMatrixItem = {
    section: 'petite_chasse' | 'gibier_eau' | 'grande_chasse' | 'licence_taxe' | 'contentieux';
    rowLabel: string;
    regionKey: string;
    regionLabel: string;
    amount: number;
  };

  const { data: revenueChasseMatrix = [] } = useQuery<RevenueChasseMatrixItem[]>({
    queryKey: ["/api/stats/national/revenue-chasse-matrix"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/revenue-chasse-matrix");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/revenue-chasse-matrix:", (resp as any).error);
        return [] as RevenueChasseMatrixItem[];
      }
      return ((resp as any).data || []) as RevenueChasseMatrixItem[];
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  // Récupération des agrégats nationaux (réels)
  const { data: aggregates, isLoading: aggregatesLoading } = useQuery<NationalAggregates>({
    queryKey: ["/api/stats/national/aggregates"],
    enabled: Boolean(user),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
  // Données par région (réelles)
  const { data: byRegion, isLoading: byRegionLoading } = useQuery<RegionAggregateRow[]>({
    queryKey: ["/api/stats/national/by-region"],
    enabled: Boolean(user),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Montant total des infractions (pour additionner à la recette)
  const { data: infraStats } = useQuery<{ montant_total?: number }>({
    queryKey: ["/api/infractions/stats"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/infractions/stats");
      if (!(resp as any).ok) return { montant_total: 0 } as { montant_total: number };
      return ((resp as any).data ?? { montant_total: 0 }) as { montant_total: number };
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  // Nouvelles données: quantités par espèce et par région (déclarations)
  type SpeciesByRegion = {
    region: string;
    departement?: string | null;
    arrondissement?: string | null;
    commune?: string | null;
    speciesId: string;
    speciesName?: string;
    scientificName?: string;
    quantity: number;
    lat?: number | null;
    lon?: number | null;
    permitNumber?: string | null;
    declaredBy?: string | null;
    category?: string | null;
    hunterRegisteredRegion?: string | null;
    hunterRegisteredDepartement?: string | null;
    hunterRegisteredArrondissement?: string | null;
    hunterRegisteredCommune?: string | null;
  };

  // Normalisation et libellé dynamique des catégories de chasse
  const normalizeCategoryKey = (raw?: string | null): string => {
    const s = String(raw || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
    if (!s) return '';
    if (s.includes('gibier') && s.includes('eau')) return 'gibier_eau';
    if (s.includes('petite') && s.includes('chasse')) return 'petite_chasse';
    if (s.includes('grande') && s.includes('chasse')) return 'grande_chasse';
    return s;
  };

  const formatCategoryLabel = (rawKeyOrLabel: string): string => {
    const key = normalizeCategoryKey(rawKeyOrLabel);
    if (key === 'gibier_eau') return "Gibier d'eau";
    if (key === 'petite_chasse') return 'Petite chasse';
    if (key === 'grande_chasse') return 'Grande chasse';
    const cleaned = String(rawKeyOrLabel || '').replace(/[_-]+/g, ' ').trim();
    if (!cleaned) return 'Autre';
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  };

  const { data: permitCategoriesData = [] } = useQuery<any[]>({
    queryKey: ['/api/permit-categories', 'all-for-species-filter'],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>('GET', '/api/permit-categories?activeOnly=false');
      if (!(resp as any).ok) return [];
      return Array.isArray((resp as any).data) ? (resp as any).data : [];
    },
    staleTime: 60_000,
  });

  const { data: allSpeciesCatalog = [] } = useQuery<any[]>({
    queryKey: ['/api/settings/species', 'all-for-species-filter'],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>('GET', '/api/settings/species');
      const serverResp = (resp as any)?.data;
      if ((resp as any)?.ok && serverResp?.ok && Array.isArray(serverResp.data)) {
        return serverResp.data;
      }
      return [];
    },
    staleTime: 60_000,
  });

  // Conversion WGS84 (Latitude, Longitude) -> UTM (X Easting, Y Northing en mètres)
  const wgs84ToUtm = (latRaw?: number | null, lonRaw?: number | null): { x: string; y: string } => {
    if (latRaw == null || lonRaw == null) return { x: '', y: '' };
    const lat = Number(latRaw);
    const lon = Number(lonRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
      return { x: '', y: '' };
    }
    // Si déjà en coordonnées projetées (mètres)
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return { x: String(Math.round(lon)), y: String(Math.round(lat)) };
    }
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const k0 = 0.9996;
    const eSq = 2 * f - f * f;
    const ePrimeSq = eSq / (1 - eSq);

    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180;
    const zoneNumber = Math.floor((lon + 180) / 6) + 1;
    const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3;
    const lonOriginRad = (lonOrigin * Math.PI) / 180;

    const N = a / Math.sqrt(1 - eSq * Math.sin(latRad) * Math.sin(latRad));
    const T = Math.tan(latRad) * Math.tan(latRad);
    const C = ePrimeSq * Math.cos(latRad) * Math.cos(latRad);
    const A = Math.cos(latRad) * (lonRad - lonOriginRad);

    const M =
      a *
      ((1 - eSq / 4 - (3 * eSq * eSq) / 64 - (5 * eSq * eSq * eSq) / 256) * latRad -
        ((3 * eSq) / 8 + (3 * eSq * eSq) / 32 + (45 * eSq * eSq * eSq) / 1024) * Math.sin(2 * latRad) +
        ((15 * eSq * eSq) / 256 + (45 * eSq * eSq * eSq) / 1024) * Math.sin(4 * latRad) -
        ((35 * eSq * eSq * eSq) / 3072) * Math.sin(6 * latRad));

    const easting =
      k0 *
        N *
        (A +
          ((1 - T + C) * Math.pow(A, 3)) / 6 +
          ((5 - 18 * T + T * T + 72 * C - 58 * ePrimeSq) * Math.pow(A, 5)) / 120) +
      500000.0;

    let northing =
      k0 *
      (M +
        N *
          Math.tan(latRad) *
          ((A * A) / 2 +
            ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
            ((61 - 58 * T + T * T + 600 * C - 330 * ePrimeSq) * Math.pow(A, 6)) / 720));

    if (lat < 0) {
      northing += 10000000.0;
    }

    return {
      x: String(Math.round(easting)),
      y: String(Math.round(northing)),
    };
  };
  const { data: speciesByRegion, isLoading: sbrLoading } = useQuery<SpeciesByRegion[]>({
    queryKey: ["/api/stats/national/species-by-region"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<SpeciesByRegion[]>("GET", "/api/stats/national/species-by-region");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/species-by-region:", (resp as any).error);
        return [] as SpeciesByRegion[];
      }
      return (resp as any).data || [];
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Options dynamiques du filtre de catégorie (issues de permit_categories, especes et des déclarations)
  const speciesCategoryOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Catégories de base toujours présentes + dynamiques depuis permit_categories & especes
    ['gibier_eau', 'grande_chasse', 'petite_chasse'].forEach((g) => {
      map.set(normalizeCategoryKey(g), formatCategoryLabel(g));
    });
    (permitCategoriesData || []).forEach((c: any) => {
      if (c?.groupe) {
        const k = normalizeCategoryKey(c.groupe);
        if (k && !map.has(k)) map.set(k, formatCategoryLabel(c.groupe));
      }
    });
    (allSpeciesCatalog || []).forEach((sp: any) => {
      if (sp?.groupe) {
        const k = normalizeCategoryKey(sp.groupe);
        if (k && !map.has(k)) map.set(k, formatCategoryLabel(sp.groupe));
      }
    });
    (speciesByRegion || []).forEach((r) => {
      if (r?.category) {
        const k = normalizeCategoryKey(r.category);
        if (k && !map.has(k)) map.set(k, formatCategoryLabel(r.category));
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [permitCategoriesData, allSpeciesCatalog, speciesByRegion]);

  // Associer chaque espèce déclarée à sa catégorie (via r.category ou le catalogue especes)
  const getRowCategoryKey = (r: SpeciesByRegion): string => {
    if (r.category) {
      const k = normalizeCategoryKey(r.category);
      if (k) return k;
    }
    const foundSp = (allSpeciesCatalog || []).find(
      (sp: any) =>
        String(sp.id) === String(r.speciesId) ||
        (sp.nom && r.speciesName && String(sp.nom).trim().toLowerCase() === String(r.speciesName).trim().toLowerCase())
    );
    if (foundSp?.groupe) {
      return normalizeCategoryKey(foundSp.groupe);
    }
    return '';
  };

  // Options dynamiques du filtre Région en fonction des déclarations existantes
  const speciesRegionOptions = useMemo(() => {
    const map = new Map<string, string>();
    (speciesByRegion || []).forEach((r) => {
      const key = canonicalRegionKey(r.region);
      const label = REGION_LABELS[key] || prettyRegion(r.region);
      if (key && !map.has(key)) {
        map.set(key, label);
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [speciesByRegion]);

  const filteredSpeciesByRegion = useMemo(() => {
    let rows = speciesByRegion || [];
    if (speciesRegionFilter !== 'toutes') {
      rows = rows.filter((r) => canonicalRegionKey(r.region) === speciesRegionFilter);
    }
    if (lockedDeptNorm) {
      rows = rows.filter((r) => matchesLockedDept(r.departement));
    }
    if (isSubZoneMode && speciesHunterScope === 'registered') {
      rows = rows.filter((r: any) => {
        if (lockedRegionKey && canonicalRegionKey(r.hunterRegisteredRegion || '') !== lockedRegionKey) {
          return false;
        }
        if (lockedDeptNorm && !matchesLockedDept(r.hunterRegisteredDepartement)) {
          return false;
        }
        if (territorialScope?.level === 'arrondissement' && territorialScope.arrondissement) {
          const targetArr = removeDiacritics(String(territorialScope.arrondissement).trim().toLowerCase());
          const actualArr = removeDiacritics(String(r.hunterRegisteredArrondissement || '').trim().toLowerCase());
          if (!actualArr || (actualArr !== targetArr && !actualArr.includes(targetArr) && !targetArr.includes(actualArr))) {
            return false;
          }
        }
        return true;
      });
    }
    if (speciesCategoryFilter !== 'toutes') {
      rows = rows.filter((r) => getRowCategoryKey(r) === speciesCategoryFilter);
    }
    return rows;
  }, [
    speciesByRegion,
    speciesRegionFilter,
    speciesCategoryFilter,
    allSpeciesCatalog,
    lockedDeptNorm,
    isSubZoneMode,
    speciesHunterScope,
    lockedRegionKey,
    territorialScope?.level,
    territorialScope?.arrondissement,
  ]);

  const isLoading = aggregatesLoading || byRegionLoading;

  // Données pour les graphiques (réelles)
  const permisData = useMemo(() => {
    const active = aggregates?.activePermitCount || 0;
    const expired = aggregates?.expiredPermitCount || 0;
    const totalPermits = aggregates?.permitCount ?? 0;
    let suspended = aggregates?.suspendedPermitCount as number | undefined;
    if (suspended == null) {
      const derived = totalPermits - active - expired;
      suspended = Math.max(0, Number.isFinite(derived) ? derived : 0);
    }

    console.log('Données permis pour le graphique:', { active, expired, suspended, aggregates });

    const data = [
      { name: 'Permis actifs', value: active },
      { name: 'Permis expirés', value: expired },
      { name: 'Permis suspendus', value: suspended || 0 },
    ];
    if ((suspended || 0) > 0) console.log('Permis suspendus ajoutés au graphique:', suspended);

    console.log('Données finales du graphique permis:', data);
    return data;
  }, [aggregates]);

  const topRegions = useMemo(() => {
    const rows = (byRegion || []).map(r => ({
      region: prettyRegion(r.region), // Utilise seulement la fonction de formatage générique
      piecesAbattues: Number(r.piecesAbattues || 0),
      revenue: Number(r.revenue || 0),
      activePermits: Number((r as any).activePermits || 0),
    }));
    return rows
      .sort((a, b) => (b.piecesAbattues - a.piecesAbattues) || (b.revenue - a.revenue))
      .slice(0, 5);
  }, [byRegion]);

  // Données pour les graphiques


  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  // Couleurs dédiées au camembert des permis: [actifs, expirés, suspendus]
  const PERMIT_COLORS = ['#3b82f6', '#9ca3af', '#f59e0b'];

  // Infractions (liste complète pour regrouper par région/département)
  type InfractionRow = {
    id: number;
    date_infraction: string | null;
    montant_chiffre: number | null;
    region: string | null;
    departement: string | null;
    code?: string | null;
    nature?: string | null;
  };
  const { data: infractionsData = [], isLoading: infractionsLoading } = useQuery<InfractionRow[]>({
    queryKey: ["/api/infractions/infractions"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/infractions/infractions");
      if (!(resp as any).ok) return [] as InfractionRow[];
      return ((resp as any).data || []) as InfractionRow[];
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  const [infraGroupBy, setInfraGroupBy] = useState<'region'|'departement'>('region');
  const [infractionsView, setInfractionsView] = useState<'table' | 'chart'>('table');

  const statsRegionOptions = useMemo(() => {
    const map = new Map<string, string>();
    (byRegion || []).forEach((r) => {
      const key = canonicalRegionKey(r.region);
      const label = REGION_LABELS[key] || prettyRegion(r.region);
      if (key && !map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [byRegion]);

  const filteredByRegion = useMemo(() => {
    const rows = byRegion || [];
    if (statsRegionFilter === 'toutes') return rows;
    return rows.filter((r) => canonicalRegionKey(r.region) === statsRegionFilter);
  }, [byRegion, statsRegionFilter]);

  const infractionsRegionOptions = useMemo(() => {
    const map = new Map<string, string>();
    (infractionsData || []).forEach((inf) => {
      const key = canonicalRegionKey(inf.region || 'non défini');
      const label = REGION_LABELS[key] || prettyRegion(inf.region || 'non défini');
      if (key && !map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [infractionsData]);

  const filteredInfractionsData = useMemo(() => {
    let rows = infractionsData || [];
    if (infractionsRegionFilter !== 'toutes') {
      rows = rows.filter((inf) => canonicalRegionKey(inf.region || 'non défini') === infractionsRegionFilter);
    }
    if (lockedDeptNorm) {
      rows = rows.filter((inf) => matchesLockedDept(inf.departement));
    }
    return rows;
  }, [infractionsData, infractionsRegionFilter, lockedDeptNorm]);

  const infractionsSubZoneOptions = useMemo(() => {
    const map = new Map<string, string>();
    // Inclure d'abord les sous-zones officielles du territoire (ex: départements de la région)
    for (const z of subZoneFilterOptions) {
      const label = prettyDepartment(z);
      const norm = removeDiacritics(label.toLowerCase());
      if (norm && !map.has(norm)) map.set(norm, label);
    }
    // Puis les départements présents dans les infractions chargées
    for (const inf of filteredInfractionsData || []) {
      const label = prettyDepartment(inf.departement || 'Non renseigné');
      const norm = removeDiacritics(label.toLowerCase());
      if (norm && !map.has(norm)) map.set(norm, label);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [subZoneFilterOptions, filteredInfractionsData]);

  const displayedInfractionsData = useMemo(() => {
    if (!isSubZoneMode || infractionsSubZoneFilter === 'toutes') {
      return filteredInfractionsData;
    }
    const targetNorm = removeDiacritics(infractionsSubZoneFilter.trim().toLowerCase());
    return (filteredInfractionsData || []).filter((inf) => {
      const deptNorm = removeDiacritics(prettyDepartment(inf.departement || 'Non renseigné').trim().toLowerCase());
      return deptNorm === targetNorm;
    });
  }, [filteredInfractionsData, isSubZoneMode, infractionsSubZoneFilter]);

  const infraGrouped = useMemo(() => {
    const key = infraGroupBy;
    const map = new Map<string, { label: string; count: number; amount: number }>();
    for (const inf of (displayedInfractionsData || [])) {
      const label = prettyRegion(key === 'region' ? (inf.region || 'non défini') : (inf.departement || 'non défini'));
      const cur = map.get(label) || { label, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(inf.montant_chiffre || 0);
      map.set(label, cur);
    }
    return Array.from(map.values()).sort((a,b)=> b.count - a.count || b.amount - a.amount);
  }, [displayedInfractionsData, infraGroupBy]);

  const INFRACTION_ZONE_COLORS = [
    '#f97316', // orange
    '#2563eb', // bleu
    '#7c3aed', // violet
    '#0891b2', // cyan
    '#e11d48', // rose-rouge
    '#d97706', // ambre
    '#0d9488', // sarcelle
    '#4f46e5', // indigo
    '#db2777', // magenta
    '#65a30d', // vert olive
  ];

  const { infractionsMonthlyData, infractionChartZones } = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
    const monthlyMap = new Map<
      string,
      {
        label: string;
        totalInfractions: number;
        montant: number;
        countsByZone: Record<string, number>;
        amountsByZone: Record<string, number>;
      }
    >();

    // Pré-remplir les 12 mois de l'année en cours pour avoir un axe temporel complet et cohérent
    const currentYear = new Date().getFullYear();
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      const mk = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
      monthlyMap.set(mk, {
        label: monthFormatter.format(d),
        totalInfractions: 0,
        montant: 0,
        countsByZone: {},
        amountsByZone: {},
      });
    }

    const zoneTotals = new Map<string, number>();

    for (const row of displayedInfractionsData || []) {
      if (!row?.date_infraction) continue;
      const date = new Date(row.date_infraction);
      if (Number.isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) || {
        label: monthFormatter.format(date),
        totalInfractions: 0,
        montant: 0,
        countsByZone: {},
        amountsByZone: {},
      };
      const zoneLabel = isSubZoneMode
        ? prettyDepartment(row.departement || 'Non renseigné')
        : prettyRegion(row.region || 'non défini');
      const amount = Number(row.montant_chiffre || 0);

      existing.totalInfractions += 1;
      existing.montant += amount;
      existing.countsByZone[zoneLabel] = (existing.countsByZone[zoneLabel] || 0) + 1;
      existing.amountsByZone[zoneLabel] = (existing.amountsByZone[zoneLabel] || 0) + amount;
      zoneTotals.set(zoneLabel, (zoneTotals.get(zoneLabel) || 0) + 1);
      monthlyMap.set(monthKey, existing);
    }

    const zones = Array.from(zoneTotals.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
      .map(([z]) => z);

    const rows = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, value]) => {
        const entry: Record<string, any> = {
          monthKey,
          label: value.label,
          totalInfractions: value.totalInfractions,
          montant: value.montant,
          amountsByZone: value.amountsByZone,
        };
        for (const z of zones) {
          entry[z] = value.countsByZone[z] || 0;
        }
        return entry;
      });

    return { infractionsMonthlyData: rows, infractionChartZones: zones };
  }, [displayedInfractionsData, isSubZoneMode]);

  const revenueMonthlyData = useMemo(() => {
    const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
    const monthlyMap = new Map<
      string,
      {
        monthKey: string;
        label: string;
        permits: number;
        taxes: number;
        permitTax: number;
        infractions: number;
        total: number;
      }
    >();

    // Pré-remplir les 12 mois de l'année en cours pour un histogramme mensuel complet et lisible
    const currentYear = new Date().getFullYear();
    for (let m = 0; m < 12; m++) {
      const d = new Date(currentYear, m, 1);
      const mk = `${currentYear}-${String(m + 1).padStart(2, '0')}`;
      monthlyMap.set(mk, {
        monthKey: mk,
        label: monthFormatter.format(d),
        permits: 0,
        taxes: 0,
        permitTax: 0,
        infractions: 0,
        total: 0,
      });
    }

    for (const row of revenueByMonth || []) {
      const mk = String(row.monthKey || '');
      if (!mk) continue;
      const [yearStr, monthStr] = mk.split('-');
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;
      const hasValidDate = Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0;
      const date = hasValidDate ? new Date(year, monthIndex, 1) : null;
      const label = date ? monthFormatter.format(date) : mk;
      const permitAmount = Number(row.permitAmount || 0);
      const taxAmount = Number(row.taxAmount || 0);
      const infractionAmount = Number(row.infractionAmount || 0);
      const permitTax = permitAmount + taxAmount;
      monthlyMap.set(mk, {
        monthKey: mk,
        label,
        permits: permitAmount,
        taxes: taxAmount,
        permitTax,
        infractions: infractionAmount,
        total: permitTax + infractionAmount,
      });
    }

    return Array.from(monthlyMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [revenueByMonth]);

  const revenueDepartmentSorted = useMemo(() => {
    return (revenueByDepartment || []).slice().sort((a, b) => {
      const regCompare = (a.region || '').localeCompare(b.region || '');
      if (regCompare !== 0) return regCompare;
      return (a.departement || '').localeCompare(b.departement || '');
    });
  }, [revenueByDepartment]);

  const revenueRegionRows = useMemo<RevenueGroupingRow[]>(() => {
    return (byRegion || []).map((row) => {
      const pAmt = Number((row as any).permitAmount ?? Math.max(0, Number(row.revenue || 0) - Number((row as any).taxAmount || 0)));
      const tAmt = Number((row as any).taxAmount || 0);
      const iAmt = Number((row as any).infractionAmount || 0);
      return {
        key: `region:${row.region || 'non défini'}`,
        region: prettyRegion(row.region),
        revenue: pAmt + tAmt + iAmt,
      };
    });
  }, [byRegion]);

  // Répartition dynamique (Permis, Taxes d'abattage, Infractions) selon la région sélectionnée
  const selectedRegionRevenueBreakdown = useMemo(() => {
    const targetKey = revenueRegion === 'toutes' ? null : canonicalRegionKey(revenueRegion);

    // Recettes issues des Licences & Taxes d'amodiation (depuis revenueChasseMatrix)
    let licenceAmodiation = 0;
    for (const item of revenueChasseMatrix || []) {
      if (item.section !== 'licence_taxe') continue;
      const lbl = removeDiacritics(String(item.rowLabel || '')).toLowerCase();
      if (!(lbl === 'licence' || lbl.includes('amodiation'))) continue;
      if (targetKey && canonicalRegionKey(item.regionKey || item.regionLabel) !== targetKey) continue;
      licenceAmodiation += Number(item.amount || 0);
    }

    if (!targetKey) {
      let totalPermits = 0;
      let totalTaxes = 0;
      for (const r of byRegion || []) {
        const tAmt = Number((r as any).taxAmount || 0);
        const pAmt = Number((r as any).permitAmount ?? Math.max(0, Number(r.revenue || 0) - tAmt));
        totalPermits += pAmt;
        totalTaxes += tAmt;
      }
      const permitTax = aggregates?.revenue ?? (totalPermits + totalTaxes);
      if (totalPermits + totalTaxes === 0 && permitTax > 0) {
        totalPermits = permitTax;
      }
      const infractions = Number(infraStats?.montant_total ?? 0);
      return {
        permits: totalPermits,
        taxes: totalTaxes,
        permitTax,
        licenceAmodiation,
        infractions,
        total: permitTax + licenceAmodiation + infractions,
      };
    }

    let permits = 0;
    let taxes = 0;
    let infractions = 0;

    for (const r of byRegion || []) {
      if (canonicalRegionKey(r.region) === targetKey) {
        const tAmt = Number((r as any).taxAmount || 0);
        const pAmt = Number((r as any).permitAmount ?? Math.max(0, Number(r.revenue || 0) - tAmt));
        permits += pAmt;
        taxes += tAmt;
        infractions += Number((r as any).infractionAmount || 0);
      }
    }

    // Fallback depuis infractionsData si infractionAmount n'est pas encore remonté dans byRegion
    if (infractions === 0 && (infractionsData || []).length > 0) {
      for (const inf of infractionsData || []) {
        if (canonicalRegionKey(inf.region || 'non défini') === targetKey) {
          infractions += Number(inf.montant_chiffre || 0);
        }
      }
    }

    const permitTax = permits + taxes;
    return {
      permits,
      taxes,
      permitTax,
      licenceAmodiation,
      infractions,
      total: permitTax + licenceAmodiation + infractions,
    };
  }, [revenueRegion, byRegion, aggregates, infraStats, infractionsData, revenueChasseMatrix]);

  const selectedRegionPieData = useMemo(() => {
    return [
      { name: 'Permis', value: selectedRegionRevenueBreakdown.permits, color: '#2563eb' },
      { name: "Taxes d'abattage", value: selectedRegionRevenueBreakdown.taxes, color: '#10b981' },
      { name: "Licence + Taxe d'amodiation", value: selectedRegionRevenueBreakdown.licenceAmodiation, color: '#8b5cf6' },
      { name: 'Infractions', value: selectedRegionRevenueBreakdown.infractions, color: '#f97316' },
    ].filter((item) => item.value > 0);
  }, [selectedRegionRevenueBreakdown]);

  const revenueDepartmentRows = useMemo<RevenueGroupingRow[]>(() => {
    return revenueDepartmentSorted.map((row) => ({
      key: `dept:${row.region || 'non défini'}:${row.departement || 'non défini'}`,
      region: prettyRegion(row.region),
      departement: prettyDepartment(row.departement),
      revenue: Number(row.permitAmount || 0) + Number(row.taxAmount || 0) + Number(row.infractionAmount || 0),
    }));
  }, [revenueDepartmentSorted, prettyRegion]);

  const filteredRevenueRows = useMemo(() => {
    if (revenueGroupBy === 'region') {
      if (revenueRegion === 'toutes') return revenueRegionRows;
      return revenueRegionRows.filter((row) => row.region === revenueRegion);
    }
    let rows = revenueDepartmentRows;
    if (revenueRegion !== 'toutes') {
      rows = rows.filter((row) => row.region === revenueRegion);
    }
    if (lockedDeptNorm) {
      rows = rows.filter((row) => matchesLockedDept(row.departement));
    }
    return rows;
  }, [revenueGroupBy, revenueRegion, revenueRegionRows, revenueDepartmentRows, lockedDeptNorm]);

  const revenueChartData = useMemo<RevenueChartRow[]>(() => {
    return filteredRevenueRows.map((row) => ({
      ...row,
      label: revenueGroupBy === 'region' ? row.region : `${row.region} / ${row.departement || 'Non défini'}`,
    }));
  }, [filteredRevenueRows, revenueGroupBy]);

  const revenueTableRows = useMemo(() => {
    return filteredRevenueRows.slice().sort((a, b) => b.revenue - a.revenue);
  }, [filteredRevenueRows]);

  // Détails infraction (dialog)
  const [viewInfraction, setViewInfraction] = useState<InfractionRow | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  type ContrevenantFull = {
    id: number;
    nom?: string;
    prenom?: string;
    filiation?: string | null;
    numero_piece?: string | null;
    type_piece?: string | null;
    photo?: any;
    piece_identite?: any;
    donnees_biometriques?: any;
  };
  const { data: allContrevenants = [], isLoading: contrevenantsLoading } = useQuery<ContrevenantFull[]>({
    queryKey: ["/api/infractions/contrevenants"],
    enabled: Boolean(viewInfraction),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/infractions/contrevenants");
      if (!(resp as any).ok) return [] as ContrevenantFull[];
      return ((resp as any).data || []) as ContrevenantFull[];
    },
    placeholderData: [],
    staleTime: 5_000,
  });

  const getBlobUrl = (data: any) => {
    try {
      if (!data) return null;
      if (typeof data === 'string') {
        const byteChars = atob(data);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/*' });
        return URL.createObjectURL(blob);
      }
      if (data?.type === 'Buffer' && Array.isArray(data?.data)) {
        const blob = new Blob([new Uint8Array(data.data)], { type: 'image/*' });
        return URL.createObjectURL(blob);
      }
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
    return null;
  };

  // Nouveaux endpoints pour l'onglet Catégories de permis
  type HuntersByCategory = { region?: string; category: string; count: number };
  type PermitsByCategoryByRegion = { region: string; categoryId: string; permitType?: string; count: number; avgDurationDays: number };

  const { data: huntersByCategory, isLoading: hbcLoading } = useQuery<HuntersByCategory[]>({
    queryKey: ["/api/stats/national/hunters-by-category"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<HuntersByCategory[]>("GET", "/api/stats/national/hunters-by-category");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/hunters-by-category:", (resp as any).error);
        return [] as HuntersByCategory[];
      }
      return (resp as any).data || [];
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: permitsCatByRegion, isLoading: pcbrLoading } = useQuery<PermitsByCategoryByRegion[]>({
    queryKey: ["/api/stats/national/permits-by-category-by-region"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<PermitsByCategoryByRegion[]>("GET", "/api/stats/national/permits-by-category-by-region");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/permits-by-category-by-region:", (resp as any).error);
        return [] as PermitsByCategoryByRegion[];
      }
      return (resp as any).data || [];
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Options de filtre Région pour l'onglet Catégories de permis
  const categoriesRegionOptions = useMemo(() => {
    const map = new Map<string, string>();
    (huntersByCategory || []).forEach((h) => {
      const key = canonicalRegionKey(h.region || 'non défini');
      const label = REGION_LABELS[key] || prettyRegion(h.region || 'non défini');
      if (key && !map.has(key)) map.set(key, label);
    });
    (permitsCatByRegion || []).forEach((p) => {
      const key = canonicalRegionKey(p.region || 'non défini');
      const label = REGION_LABELS[key] || prettyRegion(p.region || 'non défini');
      if (key && !map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [huntersByCategory, permitsCatByRegion]);

  // Tableau 1 (Capture 2) : Chasseurs par région et catégorie (Coutumiers, Résidents, Touristes, Totaux)
  const huntersPivotTable = useMemo(() => {
    const byReg = new Map<
      string,
      { regionKey: string; regionLabel: string; coutumier: number; resident: number; touristique: number; total: number }
    >();

    for (const h of huntersByCategory || []) {
      const regKey = canonicalRegionKey(h.region || 'non défini');
      if (categoriesRegionFilter !== 'toutes' && regKey !== categoriesRegionFilter) continue;
      const regLabel = REGION_LABELS[regKey] || prettyRegion(h.region || 'non défini');
      const entry = byReg.get(regKey) || {
        regionKey: regKey,
        regionLabel: regLabel,
        coutumier: 0,
        resident: 0,
        touristique: 0,
        total: 0,
      };
      const catNorm = removeDiacritics(String(h.category || '').toLowerCase());
      const cnt = Number(h.count || 0);
      if (catNorm.includes('coutum')) {
        entry.coutumier += cnt;
      } else if (catNorm.includes('touris') || catNorm.includes('passag')) {
        entry.touristique += cnt;
      } else {
        entry.resident += cnt;
      }
      entry.total += cnt;
      byReg.set(regKey, entry);
    }

    const rows = Array.from(byReg.values()).sort((a, b) => a.regionLabel.localeCompare(b.regionLabel));
    const totals = rows.reduce(
      (acc, r) => {
        acc.coutumier += r.coutumier;
        acc.resident += r.resident;
        acc.touristique += r.touristique;
        acc.total += r.total;
        return acc;
      },
      { coutumier: 0, resident: 0, touristique: 0, total: 0 }
    );
    return { rows, totals };
  }, [huntersByCategory, categoriesRegionFilter]);

  // Tableau 2 (Capture 3) : Nombre de permis délivrés par région (Petite chasse, Gibier d'eau, Grande chasse, Total)
  const permitsPivotTable = useMemo(() => {
    const byReg = new Map<
      string,
      {
        regionKey: string;
        regionLabel: string;
        petiteChasse: number;
        gibierEau: number;
        grandeChasse: number;
        total: number;
      }
    >();

    for (const p of permitsCatByRegion || []) {
      const regKey = canonicalRegionKey(p.region || 'non défini');
      if (categoriesRegionFilter !== 'toutes' && regKey !== categoriesRegionFilter) continue;
      const regLabel = REGION_LABELS[regKey] || prettyRegion(p.region || 'non défini');
      const entry = byReg.get(regKey) || {
        regionKey: regKey,
        regionLabel: regLabel,
        petiteChasse: 0,
        gibierEau: 0,
        grandeChasse: 0,
        total: 0,
      };

      const rawCat = removeDiacritics(`${p.categoryId || ''} ${p.permitType || ''}`.toLowerCase());
      const cnt = Number(p.count || 0);
      if (rawCat.includes('eau') || rawCat.includes('waterfowl')) {
        entry.gibierEau += cnt;
      } else if (rawCat.includes('grande')) {
        entry.grandeChasse += cnt;
      } else {
        // Petite chasse (inclut permis sportifs petite chasse / coutumier)
        entry.petiteChasse += cnt;
      }
      entry.total += cnt;
      byReg.set(regKey, entry);
    }

    const rows = Array.from(byReg.values()).sort((a, b) => a.regionLabel.localeCompare(b.regionLabel));
    const totals = rows.reduce(
      (acc, r) => {
        acc.petiteChasse += r.petiteChasse;
        acc.gibierEau += r.gibierEau;
        acc.grandeChasse += r.grandeChasse;
        acc.total += r.total;
        return acc;
      },
      { petiteChasse: 0, gibierEau: 0, grandeChasse: 0, total: 0 }
    );
    return { rows, totals };
  }, [permitsCatByRegion, categoriesRegionFilter]);

  // Données pour l'onglet Armes
  const { data: weaponStats, isLoading: weaponStatsLoading } = useQuery<WeaponStats>({
    queryKey: ["/api/stats/national/weapons"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/weapons");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/weapons:", (resp as any).error);
        return { totalWeapons: 0, weaponsByBrand: [], weaponsByCategory: [], weaponsByRegion: [] } as WeaponStats;
      }
      return (resp as any).data || { totalWeapons: 0, weaponsByBrand: [], weaponsByCategory: [], weaponsByRegion: [] };
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: permitExpirations, isLoading: permitExpirationsLoading } = useQuery<PermitExpiration>({
    queryKey: ["/api/stats/national/permit-expirations"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/permit-expirations");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/permit-expirations:", (resp as any).error);
        return { expiring3Months: 0, expiring6Months: 0, expiring1Year: 0, expired: 0 } as PermitExpiration;
      }
      return (resp as any).data || { expiring3Months: 0, expiring6Months: 0, expiring1Year: 0, expired: 0 };
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: weaponsByPermitCategory, isLoading: weaponsByPermitCategoryLoading } = useQuery<WeaponByPermitCategory[]>({
    queryKey: ["/api/stats/national/weapons-by-permit-category"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/weapons-by-permit-category");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/weapons-by-permit-category:", (resp as any).error);
        return [] as WeaponByPermitCategory[];
      }
      return (resp as any).data || [];
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: weaponsByRegion, isLoading: weaponsByRegionLoading } = useQuery<WeaponByRegion[]>({
    queryKey: ["/api/stats/national/weapons-by-region"],
    enabled: Boolean(user),
    queryFn: async () => {
      const resp = await apiRequest<any>("GET", "/api/stats/national/weapons-by-region");
      if (!(resp as any).ok) {
        console.error("Erreur /api/stats/national/weapons-by-region:", (resp as any).error);
        return [] as WeaponByRegion[];
      }
      return (resp as any).data || [];
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const weaponsLoading = weaponStatsLoading || permitExpirationsLoading || weaponsByPermitCategoryLoading || weaponsByRegionLoading;

  // Données pour l'onglet Alertes
  type MapAlert = {
    id: number;
    title: string | null;
    message: string | null;
    nature: string | null;
    region: string | null;
    departement: string | null;
    lat: number;
    lon: number;
    created_at: string | Date | null;
    sender?: {
      first_name: string | null;
      last_name: string | null;
      role: string | null;
      grade?: string | null;
      roleMetier?: string | null;
      region: string | null;
      departement: string | null;
    } | null;
  };

  const [alertPeriod, setAlertPeriod] = useState<'week' | 'month' | 'year'>('year');

  const [alertNature, setAlertNature] = useState<string>('toutes');

  const { fromDateISO, toDateISO } = useMemo(() => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let start = new Date(end);
    if (alertPeriod === 'week') {
      // 7 derniers jours
      start = new Date(end);
      start.setDate(end.getDate() - 6);
    } else if (alertPeriod === 'month') {
      // 1er jour du mois courant
      start = new Date(end.getFullYear(), end.getMonth(), 1, 0, 0, 0, 0);
    } else {
      // 1er janvier de l'année courante
      start = new Date(end.getFullYear(), 0, 1, 0, 0, 0, 0);
    }
    return { fromDateISO: start.toISOString(), toDateISO: end.toISOString() };
  }, [alertPeriod]);

  const { data: mapAlerts = [], isLoading: alertsLoading } = useQuery<MapAlert[]>({
    queryKey: ["/api/alerts/map", { from: fromDateISO, to: toDateISO, nature: alertNature }],
    enabled: Boolean(user),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDateISO) params.set('from', fromDateISO);
      if (toDateISO) params.set('to', toDateISO);
      if (alertNature && alertNature !== 'toutes') params.set('nature', alertNature);
      const url = `/api/alerts/map?${params.toString()}`;
      const resp = await apiRequest<MapAlert[]>("GET", url);
      if (!(resp as any).ok) {
        console.error("Erreur /api/alerts/map:", (resp as any).error);
        return [] as MapAlert[];
      }
      return (resp as any).data || [];
    },
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const alertNatures = useMemo(() => {
    const set = new Set<string>();
    (mapAlerts || []).forEach(a => { if (a.nature) set.add(String(a.nature)); });
    return ['toutes', ...Array.from(set).sort((a,b)=>a.localeCompare(b))];
  }, [mapAlerts]);

  // Export Excel Recettes (Onglet 1 : Recettes par région/département + Onglet 2 : Recette chasse)
  // Dans les fichiers exportés, DEFCCS ('national'/'defccs') est comptabilisé dans Dakar ('dakar').
  const exportRevenueCsv = async () => {
    const firstSheetName = revenueGroupBy === 'departement' ? 'Recettes par département' : 'Recettes par région';
    const firstSheetHeader =
      revenueGroupBy === 'departement'
        ? ['Région', 'Département', 'Recette (FCFA)']
        : ['Région', 'Recette (FCFA)'];
    let firstSheetRows: (string | number)[][];
    if (revenueGroupBy === 'departement') {
      firstSheetRows = revenueTableRows.map((r) => {
        const expKey = exportRegionKey(r.region);
        return [REGION_LABELS[expKey] || r.region, r.departement || 'Non défini', r.revenue];
      });
    } else {
      const byExpReg = new Map<string, { label: string; revenue: number }>();
      for (const r of revenueTableRows) {
        const expKey = exportRegionKey(r.region);
        const label = REGION_LABELS[expKey] || r.region;
        const cur = byExpReg.get(expKey) || { label, revenue: 0 };
        cur.revenue += Number(r.revenue || 0);
        byExpReg.set(expKey, cur);
      }
      firstSheetRows = Array.from(byExpReg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .map((r) => [r.label, r.revenue]);
    }

    // Onglet 2 : "Recette chasse" (Tableau 11 : Recettes liées à la gestion de la faune)
    const baseRegionCols: { key: string; label: string }[] = [
      { key: 'saintlouis', label: 'Saint-Louis' },
      { key: 'tambacounda', label: 'Tambacounda' },
      { key: 'kedougou', label: 'Kédougou' },
      { key: 'kaffrine', label: 'Kaffrine' },
      { key: 'sedhiou', label: 'Sédhiou' },
      { key: 'fatick', label: 'Fatick' },
      { key: 'kaolack', label: 'Kaolack' },
      { key: 'kolda', label: 'Kolda' },
      { key: 'dakar', label: 'Dakar' },
      { key: 'thies', label: 'Thiès' },
      { key: 'louga', label: 'Louga' },
    ];
    const extraFullLabels: Record<string, string> = {
      ziguinchor: 'Ziguinchor',
      matam: 'Matam',
      diourbel: 'Diourbel',
      nondefini: 'Non défini',
    };

    const regionCols = [...baseRegionCols];
    const knownRegKeys = new Set(regionCols.map((c) => c.key));

    // Filtrer selon la région sélectionnée si un filtre région est actif
    const activeFilterKey =
      revenueGroupBy === 'region' && revenueRegion !== 'toutes' ? canonicalRegionKey(revenueRegion) : null;

    const matrixItems = (revenueChasseMatrix || []).filter((item) => {
      if (!activeFilterKey) return true;
      return canonicalRegionKey(item.regionKey || item.regionLabel) === activeFilterKey;
    });

    // Ajouter dynamiquement toute autre région ou zone présente dans les recettes (DEFCCS est rattaché à Dakar)
    for (const item of matrixItems) {
      const rk = exportRegionKey(item.regionKey || item.regionLabel);
      if (rk && !knownRegKeys.has(rk)) {
        knownRegKeys.add(rk);
        regionCols.push({
          key: rk,
          label: extraFullLabels[rk] || REGION_LABELS[rk] || prettyRegion(item.regionLabel),
        });
      }
    }

    const getCellAmount = (section: RevenueChasseMatrixItem['section'], rowLabel: string, regKey: string): number => {
      let sum = 0;
      for (const item of matrixItems) {
        const rk = exportRegionKey(item.regionKey || item.regionLabel);
        if (item.section === section && item.rowLabel === rowLabel && rk === regKey) {
          sum += Number(item.amount || 0);
        }
      }
      return sum;
    };

    const recetteChasseHeader = ['Type permis', ...regionCols.map((c) => c.label), 'Total'];
    const recetteChasseRows: (string | number)[][] = [];

    const domanialByRegion = new Map<string, number>();
    let domanialGrandTotal = 0;

    const buildSection = (
      sectionKey: RevenueChasseMatrixItem['section'],
      sectionTitle: string,
      defaultRows: string[],
      totalLabel: string
    ) => {
      // Ligne d'en-tête de section (en gras)
      recetteChasseRows.push([sectionTitle, ...regionCols.map(() => ''), '']);

      // Inclure dynamiquement toute ligne supplémentaire présente en base pour cette section
      const rowLabels = [...defaultRows];
      const seenLabels = new Set(rowLabels);
      for (const item of matrixItems) {
        if (item.section === sectionKey && !seenLabels.has(item.rowLabel)) {
          seenLabels.add(item.rowLabel);
          rowLabels.push(item.rowLabel);
        }
      }

      const sectionRegTotals = new Map<string, number>();
      let sectionTotal = 0;

      for (const rLabel of rowLabels) {
        let rowSum = 0;
        const cells = regionCols.map((c) => {
          const val = getCellAmount(sectionKey, rLabel, c.key);
          rowSum += val;
          sectionRegTotals.set(c.key, (sectionRegTotals.get(c.key) || 0) + val);
          domanialByRegion.set(c.key, (domanialByRegion.get(c.key) || 0) + val);
          return val;
        });
        sectionTotal += rowSum;
        domanialGrandTotal += rowSum;
        recetteChasseRows.push([rLabel, ...cells, rowSum]);
      }

      recetteChasseRows.push([
        totalLabel,
        ...regionCols.map((c) => sectionRegTotals.get(c.key) || 0),
        sectionTotal,
      ]);
    };

    // 1. Petite chasse
    buildSection('petite_chasse', 'Petite chasse', ['Coutumier', 'Résident', 'Touriste'], 'Total 1');

    // 2. Gibier d'eau
    buildSection('gibier_eau', "Gibier d'eau", ['Résident', 'Touriste'], 'Total 2');

    // 3. Grande chasse
    buildSection('grande_chasse', 'Grande chasse', ['Résident', 'Touriste'], 'Total 3');

    // 4. Licence, Taxe et Redevances
    buildSection(
      'licence_taxe',
      'Licence, Taxe et Redevances',
      [
        'Taxe phaco',
        'Taxe grande chasse',
        'Attestation pisteur',
        "Permis spécial d'oisellerie",
        'Attestation Collecteur',
        'Taxe Ramasseur',
        'Licence',
        'Taxe amodiation',
        'Taxe réserve privée',
      ],
      'Total 4'
    );

    const curYear = new Date().getFullYear();

    // Total domanial
    recetteChasseRows.push([
      `Total domanial ${curYear}`,
      ...regionCols.map((c) => domanialByRegion.get(c.key) || 0),
      domanialGrandTotal,
    ]);

    // Contentieux (Infractions)
    const contentieuxByRegion = new Map<string, number>();
    let contentieuxGrandTotal = 0;
    for (const c of regionCols) {
      const val = getCellAmount('contentieux', 'Contentieux', c.key);
      contentieuxByRegion.set(c.key, val);
      contentieuxGrandTotal += val;
    }
    recetteChasseRows.push([
      `Contentieux ${curYear}`,
      ...regionCols.map((c) => contentieuxByRegion.get(c.key) || 0),
      contentieuxGrandTotal,
    ]);

    // Total RECETTES CHASSES
    recetteChasseRows.push([
      `Total RECETTES CHASSES ${curYear}`,
      ...regionCols.map((c) => (domanialByRegion.get(c.key) || 0) + (contentieuxByRegion.get(c.key) || 0)),
      domanialGrandTotal + contentieuxGrandTotal,
    ]);

    // 3. Onglet "Licences et amodiations" (zones amodiées au niveau national, filtrées si une région est choisie)
    const zonesRes = await apiRequest<any>('GET', '/api/zones?lite=1').catch(() => ({ ok: false, data: [] }));
    const zonesRaw: any = zonesRes?.data;
    const allZonesArr: any[] = Array.isArray(zonesRaw?.features)
      ? zonesRaw.features.map((f: any) => f?.properties || f)
      : Array.isArray(zonesRaw)
        ? zonesRaw
        : Array.isArray(zonesRaw?.data)
          ? zonesRaw.data
          : Array.isArray(zonesRaw?.zones)
            ? zonesRaw.zones
            : [];

    const filteredAmodiees = allZonesArr
      .filter((z) => {
        const zt = removeDiacritics(String(z?.type || '')).toLowerCase().trim();
        if (!(zt === 'amodiee' || zt.includes('amodi')) || !z?.name) return false;
        if (activeFilterKey) {
          return exportRegionKey(z?.region) === exportRegionKey(activeFilterKey);
        }
        return true;
      })
      .sort((a, b) =>
        prettyRegion(a?.region || '').localeCompare(prettyRegion(b?.region || '')) ||
        String(a?.name || '').localeCompare(String(b?.name || ''))
      );

    const licMerges: string[] = ['A1:A2', 'B1:B2', 'C1:C2', 'D1:E1', 'F1:G1'];
    const licRows: (string | number)[][] = [
      ['', '', '', 'Montant', 'N° quittance et date', 'Montant', 'N° Quittance et date'],
    ];
    let totalLicAmt = 0;
    let totalAmoAmt = 0;
    for (const z of filteredAmodiees) {
      const licAmt = Number(z?.licence_amount ?? z?.licenceAmount ?? 0);
      const amoAmt = Number(z?.amodiation_amount ?? z?.amodiationAmount ?? 0);
      if (licAmt > 0) totalLicAmt += licAmt;
      if (amoAmt > 0) totalAmoAmt += amoAmt;
      licRows.push([
        prettyRegion(z?.region || ''),
        String(z?.name || ''),
        String(z?.responsible_name || z?.responsibleName || ''),
        licAmt > 0 ? licAmt : '',
        String(z?.licence_receipt || z?.licenceReceipt || ''),
        amoAmt > 0 ? amoAmt : '',
        String(z?.amodiation_receipt || z?.amodiationReceipt || ''),
      ]);
    }
    const licTotalRow = licRows.length + 2;
    licRows.push(['Total', '', '', totalLicAmt, '', totalAmoAmt, '']);
    licMerges.push(`A${licTotalRow}:C${licTotalRow}`);

    // 4. Onglet "Transactions" (Recettes des infractions au niveau national, modèle Contentieux)
    const filteredInfractionsForRev = (infractionsData || []).filter((inf) => {
      if (!activeFilterKey) return true;
      return exportRegionKey(inf.region || 'non défini') === exportRegionKey(activeFilterKey);
    });

    const txByRegion = new Map<
      string,
      {
        regionLabel: string;
        byNature: Map<
          string,
          { natureLabel: string; nbrPv: number; transiges: number; montant: number; instance: number; tribunal: number }
        >;
      }
    >();

    for (const row of filteredInfractionsForRev) {
      const rk = exportRegionKey(row.region || 'non défini');
      const regionLabel = REGION_LABELS[rk] || prettyRegion(row.region || 'Non défini');
      const rawNature = String((row as any).nature_infraction || (row as any).infraction_type || 'Non spécifiée').trim();
      const natureKey = removeDiacritics(rawNature).toLowerCase() || 'non-specifiee';

      const regEntry = txByRegion.get(rk) || { regionLabel, byNature: new Map() };
      const natEntry = regEntry.byNature.get(natureKey) || {
        natureLabel: rawNature || 'Non spécifiée',
        nbrPv: 0,
        transiges: 0,
        montant: 0,
        instance: 0,
        tribunal: 0,
      };
      natEntry.nbrPv += 1;

      const montant = Number(row.montant_chiffre || 0);
      const hasQuittance = Boolean((row as any).numero_quittance && String((row as any).numero_quittance).trim());
      const obsNorm = removeDiacritics(String((row as any).observations || '').trim().toLowerCase());
      const isTribunal =
        obsNorm.includes('tribunal') ||
        obsNorm.includes('justice') ||
        obsNorm.includes('defere') ||
        obsNorm.includes('parquet');

      if (isTribunal) {
        natEntry.tribunal += 1;
      } else if (montant > 0 || hasQuittance) {
        natEntry.transiges += 1;
        natEntry.montant += montant;
      } else {
        natEntry.instance += 1;
      }

      regEntry.byNature.set(natureKey, natEntry);
      txByRegion.set(rk, regEntry);
    }

    const txMerges: string[] = ['A1:A2', 'B1:B2', 'C1:C2', 'D1:F1', 'G1:G2'];
    const txRows: (string | number)[][] = [['', '', '', 'Transigés', 'Montant', 'Instance', '']];
    let txTotalPv = 0;
    let txTotalTransiges = 0;
    let txTotalMontant = 0;
    let txTotalInstance = 0;
    let txTotalTribunal = 0;
    let txRowNum = 3;

    const sortedTxRegions = Array.from(txByRegion.values()).sort((a, b) =>
      a.regionLabel.localeCompare(b.regionLabel)
    );
    for (const reg of sortedTxRegions) {
      const natures = Array.from(reg.byNature.values()).sort((a, b) =>
        a.natureLabel.localeCompare(b.natureLabel)
      );
      const startRow = txRowNum;
      natures.forEach((nat, idx) => {
        txTotalPv += nat.nbrPv;
        txTotalTransiges += nat.transiges;
        txTotalMontant += nat.montant;
        txTotalInstance += nat.instance;
        txTotalTribunal += nat.tribunal;
        txRows.push([
          idx === 0 ? reg.regionLabel : '',
          nat.natureLabel,
          nat.nbrPv,
          nat.transiges,
          nat.montant > 0 ? nat.montant : '',
          nat.instance,
          nat.tribunal,
        ]);
        txRowNum += 1;
      });
      const endRow = txRowNum - 1;
      if (endRow > startRow) {
        txMerges.push(`A${startRow}:A${endRow}`);
      }
    }
    txRows.push([`Total ${curYear}`, '', txTotalPv, txTotalTransiges, txTotalMontant, txTotalInstance, txTotalTribunal]);
    txMerges.push(`A${txRowNum}:B${txRowNum}`);

    // 2b. Onglet "Recettes par catégorie" (recettes générées par chaque catégorie de permis)
    const permitCatDefs: Array<{ section: RevenueChasseMatrixItem['section']; rowLabel: string; display: string }> = [
      { section: 'petite_chasse', rowLabel: 'Coutumier', display: 'Petite chasse — Coutumier' },
      { section: 'petite_chasse', rowLabel: 'Résident', display: 'Petite chasse — Résident' },
      { section: 'petite_chasse', rowLabel: 'Touriste', display: 'Petite chasse — Touriste' },
      { section: 'gibier_eau', rowLabel: 'Résident', display: "Gibier d'eau — Résident" },
      { section: 'gibier_eau', rowLabel: 'Touriste', display: "Gibier d'eau — Touriste" },
      { section: 'grande_chasse', rowLabel: 'Résident', display: 'Grande chasse — Résident' },
      { section: 'grande_chasse', rowLabel: 'Touriste', display: 'Grande chasse — Touriste' },
    ];
    const recCatTotals = permitCatDefs.map((def) => {
      const amount = regionCols.reduce((sum, col) => sum + getCellAmount(def.section, def.rowLabel, col.key), 0);
      return { display: def.display, amount };
    });
    const recCatGrandTotal = recCatTotals.reduce((acc, item) => acc + item.amount, 0);
    const recCatRows: (string | number)[][] = [
      ...recCatTotals.map((item) => [
        item.display,
        item.amount,
        recCatGrandTotal > 0 ? `${((item.amount / recCatGrandTotal) * 100).toFixed(1)} %` : '0,0 %',
      ]),
      ['Total', recCatGrandTotal, recCatGrandTotal > 0 ? '100,0 %' : '0,0 %'],
    ];

    exportMultiSheetXlsx('recettes_gestion_faune.xlsx', [
      {
        name: firstSheetName,
        headers: firstSheetHeader,
        rows: firstSheetRows,
      },
      {
        name: 'Recette chasse',
        headers: recetteChasseHeader,
        rows: recetteChasseRows,
      },
      {
        name: 'Recettes par catégorie',
        headers: ['Catégorie de permis', 'Montant (FCFA)', 'Part (%)'],
        rows: recCatRows,
      },
      {
        name: 'Licences et amodiations',
        headers: ['Région', 'Zone amodiée', 'Amodiataire', 'Licence', '', "Taxe d'amodiation", ''],
        rows: licRows,
        merges: licMerges,
      },
      {
        name: 'Transactions',
        headers: ['Régions', 'Nature infraction', 'Nbr P.V', 'Transactions', '', '', 'Tribunal'],
        rows: txRows,
        merges: txMerges,
      },
    ]);
  };

  const alertRegionOptions = useMemo(() => {
    const map = new Map<string, string>();
    (mapAlerts || []).forEach((a) => {
      const key = canonicalRegionKey(a.region || 'non défini');
      const label = REGION_LABELS[key] || prettyRegion(a.region || 'non défini');
      if (key && !map.has(key)) map.set(key, label);
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [mapAlerts]);

  const filteredMapAlerts = useMemo(() => {
    let rows = mapAlerts || [];
    if (alertRegionFilter !== 'toutes') {
      rows = rows.filter((a) => canonicalRegionKey(a.region || 'non défini') === alertRegionFilter);
    }
    if (lockedDeptNorm) {
      rows = rows.filter((a) => matchesLockedDept(a.departement));
    }
    return rows;
  }, [mapAlerts, alertRegionFilter, lockedDeptNorm]);

  const alertSubZoneOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const z of subZoneFilterOptions) {
      const label = prettyDepartment(z);
      const norm = removeDiacritics(label.toLowerCase());
      if (norm && !map.has(norm)) map.set(norm, label);
    }
    for (const a of filteredMapAlerts || []) {
      const label = prettyDepartment(a.departement || 'Non renseigné');
      const norm = removeDiacritics(label.toLowerCase());
      if (norm && !map.has(norm)) map.set(norm, label);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'fr'));
  }, [subZoneFilterOptions, filteredMapAlerts]);

  const displayedMapAlerts = useMemo(() => {
    if (!isSubZoneMode || alertSubZoneFilter === 'toutes') {
      return filteredMapAlerts;
    }
    const targetNorm = removeDiacritics(alertSubZoneFilter.trim().toLowerCase());
    return (filteredMapAlerts || []).filter((a) => {
      const deptNorm = removeDiacritics(prettyDepartment(a.departement || 'Non renseigné').trim().toLowerCase());
      return deptNorm === targetNorm;
    });
  }, [filteredMapAlerts, isSubZoneMode, alertSubZoneFilter]);

  const groupedAlerts = useMemo(() => {
    // nature -> subZoneOrRegionLabel -> count
    const byNature = new Map<string, Map<string, number>>();
    const regionsSet = new Set<string>();
    (displayedMapAlerts || []).forEach(a => {
      const nat = (a.nature || 'non défini').toString();
      const reg = isSubZoneMode
        ? prettyDepartment(a.departement || 'Non renseigné')
        : prettyRegion(a.region || 'non défini');
      regionsSet.add(reg);
      const inner = byNature.get(nat) || new Map<string, number>();
      inner.set(reg, (inner.get(reg) || 0) + 1);
      byNature.set(nat, inner);
    });
    const regions = isSubZoneMode
      ? Array.from(regionsSet).sort((a, b) => a.localeCompare(b, 'fr'))
      : sortRegions(Array.from(regionsSet));
    const rows = Array.from(byNature.entries()).map(([nature, map]) => {
      const obj: Record<string, any> = { nature };
      let total = 0;
      regions.forEach(r => { const v = map.get(r) || 0; obj[r] = v; total += v; });
      obj.total = total;
      return obj;
    }).sort((a,b)=> a.nature.localeCompare(b.nature));
    return { regions, rows } as { regions: string[]; rows: Array<Record<string, any>> };
  }, [displayedMapAlerts, isSubZoneMode]);

  // Données filtrées pour les armes
  const filteredWeaponsByRegion = useMemo(() => {
    return (weaponsByRegion || []).filter(w => {
      const regionMatch = weaponRegionFilter === 'toutes' || prettyRegion(w.region) === weaponRegionFilter;
      const brandMatch = weaponBrandFilter === 'toutes' || (w.brand || 'Non spécifié') === weaponBrandFilter;
      const categoryMatch = weaponCategoryFilter === 'toutes' || (w.weaponType || 'Non spécifié') === weaponCategoryFilter;
      return regionMatch && brandMatch && categoryMatch;
    });
  }, [weaponsByRegion, weaponRegionFilter, weaponBrandFilter, weaponCategoryFilter]);

  // Options pour les filtres d'armes
  const weaponFilterOptions = useMemo(() => {
    const regions = new Set<string>();
    const brands = new Set<string>();
    const categories = new Set<string>();

    // Utiliser weaponStats pour avoir toutes les données disponibles
    if (weaponStats) {
      // Régions depuis weaponsByRegion
      weaponStats.weaponsByRegion?.forEach(w => {
        regions.add(prettyRegion(w.region));
      });

      // Marques depuis weaponsByBrand
      weaponStats.weaponsByBrand?.forEach(w => {
        brands.add(w.brand || 'Non spécifié');
      });

      // Catégories depuis weaponsByCategory
      weaponStats.weaponsByCategory?.forEach(w => {
        categories.add(w.category || 'Non spécifié');
      });
    }

    // Ajouter aussi les données de weaponsByRegion pour compléter
    (weaponsByRegion || []).forEach(w => {
      regions.add(prettyRegion(w.region));
      // Inclure "Non spécifié" pour les marques et catégories nulles/vides
      brands.add(w.brand || 'Non spécifié');
      categories.add(w.weaponType || 'Non spécifié');
    });

    if (lockedRegionLabel) {
      regions.add(lockedRegionLabel);
    }

    return {
      regions: ['toutes', ...Array.from(regions).sort()],
      brands: ['toutes', ...Array.from(brands).sort()],
      categories: ['toutes', ...Array.from(categories).sort()]
    };
  }, [weaponStats, weaponsByRegion, lockedRegionLabel]);

  // Données pour les graphiques d'expiration des permis
  const expirationData = useMemo(() => {
    if (!permitExpirations) return [];
    return [
      { name: 'Expire dans 3 mois', value: permitExpirations.expiring3Months, color: '#ef4444' },
      { name: 'Expire dans 6 mois', value: permitExpirations.expiring6Months, color: '#f97316' },
      { name: 'Expire dans 1 an', value: permitExpirations.expiring1Year, color: '#eab308' },
      { name: 'Déjà expirés', value: permitExpirations.expired, color: '#6b7280' }
    ];
  }, [permitExpirations]);

  const exportAlertsCsv = () => {
    const header = [
      'Date', 'Nature', 'Région', 'Département', 'Titre', 'Message',
      'Expéditeur', 'Grade', 'Région expéditeur', 'Département expéditeur',
      'Latitude', 'Longitude'
    ];
    const rows = (displayedMapAlerts || []).map(a => {
      const senderName = [a.sender?.first_name || '', a.sender?.last_name || ''].filter(Boolean).join(' ').trim();
      return [
        a.created_at ? new Date(a.created_at as any).toLocaleString('fr-FR') : '',
        a.nature || '',
        prettyRegion(a.region || ''),
        a.departement || '',
        a.title || '',
        (a.message || '').replace(/\s+/g, ' ').trim(),
        senderName,
        a.sender?.grade || '',
        a.sender?.region || '',
        a.sender?.departement || '',
        String(a.lat ?? ''),
        String(a.lon ?? '')
      ];
    });
    exportArrayToCsv(`alertes_${alertPeriod}.csv`, header, rows);
  };

  // Export Excel multi-onglets pour les armes (4 onglets correspondant aux 4 sections de la page)
  const exportWeaponsCsv = () => {
    // 1. Expiration des permis de port d'arme
    const exp3 = Number(permitExpirations?.expiring3Months ?? 0);
    const exp6 = Number(permitExpirations?.expiring6Months ?? 0);
    const exp12 = Number(permitExpirations?.expiring1Year ?? 0);
    const expAlready = Number(permitExpirations?.expired ?? 0);
    const expirationHeaders = ["Statut d'expiration", 'Nombre de permis'];
    const expirationRows: (string | number)[][] = [
      ['Expire dans 3 mois', exp3],
      ['Expire dans 6 mois', exp6],
      ['Expire dans 1 an', exp12],
      ['Déjà expirés', expAlready],
      ['Total', exp3 + exp6 + exp12 + expAlready],
    ];

    // 2. Répartition par marque
    const brandsSource = (weaponStats?.weaponsByBrand || []).filter(
      (b) => weaponBrandFilter === 'toutes' || (b.brand || 'Non spécifié') === weaponBrandFilter
    );
    const totalBrandsCount = brandsSource.reduce((acc, b) => acc + Number(b.count || 0), 0);
    const brandHeaders = ['Marque', "Nombre d'armes"];
    const brandRows: (string | number)[][] = [
      ...brandsSource.map((b) => [b.brand || 'Non spécifié', Number(b.count || 0)]),
      ['Total', totalBrandsCount],
    ];

    // Fonction utilitaire pour fusionner verticalement les cellules identiques consécutives sur les colonnes textuelles
    const buildColumnMerges = (
      dataRows: (string | number)[][],
      colLetters: string[]
    ): { rows: (string | number)[][]; merges: string[] } => {
      const merges: string[] = [];
      const cloned = dataRows.map((r) => [...r]);
      const n = cloned.length;

      colLetters.forEach((colLetter, colIdx) => {
        let startIdx = 0;
        while (startIdx < n) {
          const val = String(cloned[startIdx][colIdx] ?? '').trim();
          let endIdx = startIdx;
          while (
            endIdx + 1 < n &&
            String(cloned[endIdx + 1][colIdx] ?? '').trim().toLowerCase() === val.toLowerCase() &&
            // Pour les colonnes > 0, ne fusionner que si la colonne parente à gauche fait partie du même bloc
            (colIdx === 0 ||
              String(dataRows[endIdx + 1][0] ?? '').trim().toLowerCase() ===
                String(dataRows[startIdx][0] ?? '').trim().toLowerCase())
          ) {
            endIdx += 1;
          }
          if (endIdx > startIdx && val.length > 0) {
            // Ligne Excel = index + 2 (car ligne 1 = en-tête)
            merges.push(`${colLetter}${startIdx + 2}:${colLetter}${endIdx + 2}`);
            for (let k = startIdx + 1; k <= endIdx; k++) {
              cloned[k][colIdx] = '';
            }
          }
          startIdx = endIdx + 1;
        }
      });

      return { rows: cloned, merges };
    };

    // 3. Armes par région d'enregistrement (DEFCCS comptabilisé dans Dakar à l'export, avec calibre et fusion)
    const regionWeaponsSource = filteredWeaponsByRegion || [];
    const byExpWeaponReg = new Map<
      string,
      { regionLabel: string; weaponType: string; brand: string; caliber: string; count: number }
    >();
    for (const w of regionWeaponsSource) {
      const expKey = exportRegionKey(w.region);
      const regionLabel = REGION_LABELS[expKey] || prettyRegion(w.region);
      const weaponType = String(w.weaponType || 'Non spécifié').trim() || 'Non spécifié';
      const brand = String(w.brand || 'Non spécifié').trim() || 'Non spécifié';
      const caliber = String(w.caliber || 'Non spécifié').trim() || 'Non spécifié';
      const k = `${expKey}::${weaponType.toLowerCase()}::${brand.toLowerCase()}::${caliber.toLowerCase()}`;
      const cur = byExpWeaponReg.get(k) || { regionLabel, weaponType, brand, caliber, count: 0 };
      cur.count += Number(w.count || 0);
      byExpWeaponReg.set(k, cur);
    }
    const mergedRegionWeapons = Array.from(byExpWeaponReg.values()).sort(
      (a, b) =>
        a.regionLabel.localeCompare(b.regionLabel) ||
        a.weaponType.localeCompare(b.weaponType) ||
        a.brand.localeCompare(b.brand) ||
        a.caliber.localeCompare(b.caliber)
    );
    const totalRegionWeapons = mergedRegionWeapons.reduce((acc, w) => acc + w.count, 0);
    const regionWeaponsHeaders = ['Région', "Type d'arme", 'Marque', 'Calibre', 'Nombre'];
    const rawRegionWeaponRows: (string | number)[][] = mergedRegionWeapons.map((w) => [
      w.regionLabel,
      w.weaponType,
      w.brand,
      w.caliber,
      w.count,
    ]);
    const regionWeaponBuilt = buildColumnMerges(rawRegionWeaponRows, ['A', 'B', 'C', 'D']);
    const regionWeaponsRows: (string | number)[][] = [
      ...regionWeaponBuilt.rows,
      ['Total', '', '', '', totalRegionWeapons],
    ];

    // 4. Armes utilisées selon la catégorie de permis (avec Marque, Calibre, regroupement et fusion)
    const permitCatWeaponsSource = (weaponsByPermitCategory || []).filter((w) => {
      const categoryMatch = weaponCategoryFilter === 'toutes' || (w.weaponType || 'Non spécifié') === weaponCategoryFilter;
      const brandMatch = weaponBrandFilter === 'toutes' || (w.brand || 'Non spécifié') === weaponBrandFilter;
      return categoryMatch && brandMatch;
    });
    const byPermitCatWeapon = new Map<
      string,
      { permitCategory: string; weaponType: string; brand: string; caliber: string; count: number }
    >();
    for (const w of permitCatWeaponsSource) {
      const permitCategory = String(w.permitCategory || 'Non spécifié').trim() || 'Non spécifié';
      const weaponType = String(w.weaponType || 'Non spécifié').trim() || 'Non spécifié';
      const brand = String(w.brand || 'Non spécifié').trim() || 'Non spécifié';
      const caliber = String(w.caliber || 'Non spécifié').trim() || 'Non spécifié';
      const k = `${permitCategory.toLowerCase()}::${weaponType.toLowerCase()}::${brand.toLowerCase()}::${caliber.toLowerCase()}`;
      const cur = byPermitCatWeapon.get(k) || { permitCategory, weaponType, brand, caliber, count: 0 };
      cur.count += Number(w.count || 0);
      byPermitCatWeapon.set(k, cur);
    }
    const mergedPermitCatWeapons = Array.from(byPermitCatWeapon.values()).sort(
      (a, b) =>
        a.permitCategory.localeCompare(b.permitCategory) ||
        a.weaponType.localeCompare(b.weaponType) ||
        a.brand.localeCompare(b.brand) ||
        a.caliber.localeCompare(b.caliber)
    );
    const totalPermitCatWeapons = mergedPermitCatWeapons.reduce((acc, w) => acc + w.count, 0);
    const permitCatHeaders = ['Catégorie de permis', "Type d'arme", 'Marque', 'Calibre', 'Nombre'];
    const rawPermitCatRows: (string | number)[][] = mergedPermitCatWeapons.map((w) => [
      w.permitCategory,
      w.weaponType,
      w.brand,
      w.caliber,
      w.count,
    ]);
    const permitCatBuilt = buildColumnMerges(rawPermitCatRows, ['A', 'B', 'C', 'D']);
    const permitCatRows: (string | number)[][] = [
      ...permitCatBuilt.rows,
      ['Total', '', '', '', totalPermitCatWeapons],
    ];

    exportMultiSheetXlsx('statistiques_armes.xlsx', [
      {
        name: 'Expiration des permis',
        headers: expirationHeaders,
        rows: expirationRows,
      },
      {
        name: 'Répartition par marque',
        headers: brandHeaders,
        rows: brandRows,
      },
      {
        name: 'Armes par région',
        headers: regionWeaponsHeaders,
        rows: regionWeaponsRows,
        merges: regionWeaponBuilt.merges,
      },
      {
        name: 'Armes par catégorie permis',
        headers: permitCatHeaders,
        rows: permitCatRows,
        merges: permitCatBuilt.merges,
      },
    ]);
  };

  // Export unifié pour l'onglet actif (dans les exports, DEFCCS est comptabilisé dans Dakar)
  const handleExportActiveTab = async () => {
    switch (activeTab) {
      case 'overview': {
        const curYear = new Date().getFullYear();

        // Charger permis, chasseurs et zones amodiées en parallèle pour le bilan complet
        const [ovPermitsRes, ovHuntersRes, ovZonesRes] = await Promise.all([
          apiRequest<any>('GET', '/api/permits').catch(() => ({ ok: false, data: [] })),
          apiRequest<any>('GET', '/api/hunters').catch(() => ({ ok: false, data: [] })),
          apiRequest<any>('GET', '/api/zones?lite=1').catch(() => ({ ok: false, data: [] })),
        ]);
        const ovPermitsRaw: any = ovPermitsRes?.data;
        const ovHuntersRaw: any = ovHuntersRes?.data;
        const ovZonesRaw: any = ovZonesRes?.data;
        const ovPermitsList: any[] = Array.isArray(ovPermitsRaw) ? ovPermitsRaw : Array.isArray(ovPermitsRaw?.data) ? ovPermitsRaw.data : [];
        const ovHuntersList: any[] = Array.isArray(ovHuntersRaw) ? ovHuntersRaw : Array.isArray(ovHuntersRaw?.data) ? ovHuntersRaw.data : [];
        const ovZonesList: any[] = Array.isArray(ovZonesRaw?.features)
          ? ovZonesRaw.features.map((f: any) => f?.properties || f)
          : Array.isArray(ovZonesRaw)
            ? ovZonesRaw
            : Array.isArray(ovZonesRaw?.data)
              ? ovZonesRaw.data
              : [];

        const normTxt = (s?: string | null) =>
          String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const normSlug = (s?: string | null) =>
          normTxt(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        // 1. Vue d'ensemble (Top 5 régions) + 2. Par région (toutes les régions)
        const byExpReg = new Map<
          string,
          { region: string; activePermits: number; piecesAbattues: number; taxAmount: number; revenue: number }
        >();
        for (const r of byRegion || []) {
          const expKey = exportRegionKey(r.region);
          const label = (REGION_LABELS[expKey] || prettyRegion(r.region)).toUpperCase();
          const cur = byExpReg.get(expKey) || {
            region: label,
            activePermits: 0,
            piecesAbattues: 0,
            taxAmount: 0,
            revenue: 0,
          };
          cur.activePermits += Number((r as any).activePermits || 0);
          cur.piecesAbattues += Number(r.piecesAbattues || 0);
          cur.taxAmount += Number((r as any).taxAmount || 0);
          cur.revenue += Number(r.revenue || 0);
          byExpReg.set(expKey, cur);
        }
        const allRegList = Array.from(byExpReg.values()).sort(
          (a, b) => b.piecesAbattues - a.piecesAbattues || b.revenue - a.revenue
        );
        const overviewRows: (string | number)[][] = [
          ...allRegList.slice(0, 5).map((r) => [r.region, r.activePermits, r.piecesAbattues, r.revenue]),
        ];
        const parRegionRows: (string | number)[][] = [
          ...allRegList.map((r) => [r.region, r.activePermits, r.piecesAbattues, r.taxAmount, r.revenue]),
          [
            'Total',
            allRegList.reduce((a, r) => a + r.activePermits, 0),
            allRegList.reduce((a, r) => a + r.piecesAbattues, 0),
            allRegList.reduce((a, r) => a + r.taxAmount, 0),
            allRegList.reduce((a, r) => a + r.revenue, 0),
          ],
        ];

        // 3. Chasseurs & 4. Permis délivrés
        const ovHuntersMap = new Map<string, { regionLabel: string; coutumier: number; resident: number; touristique: number; total: number }>();
        for (const r of huntersPivotTable.rows) {
          const expKey = exportRegionKey(r.regionKey);
          const cur = ovHuntersMap.get(expKey) || {
            regionLabel: REGION_LABELS[expKey] || r.regionLabel,
            coutumier: 0,
            resident: 0,
            touristique: 0,
            total: 0,
          };
          cur.coutumier += r.coutumier;
          cur.resident += r.resident;
          cur.touristique += r.touristique;
          cur.total += r.total;
          ovHuntersMap.set(expKey, cur);
        }
        const ovHuntersRows: (string | number)[][] = [
          ...Array.from(ovHuntersMap.values())
            .sort((a, b) => a.regionLabel.localeCompare(b.regionLabel))
            .map((r) => [r.regionLabel, r.coutumier, r.resident, r.touristique, r.total]),
          [
            `Total ${curYear}`,
            huntersPivotTable.totals.coutumier,
            huntersPivotTable.totals.resident,
            huntersPivotTable.totals.touristique,
            huntersPivotTable.totals.total,
          ],
        ];

        const ovPermitsMap = new Map<string, { regionLabel: string; petiteChasse: number; gibierEau: number; grandeChasse: number; total: number }>();
        for (const r of permitsPivotTable.rows) {
          const expKey = exportRegionKey(r.regionKey);
          const cur = ovPermitsMap.get(expKey) || {
            regionLabel: REGION_LABELS[expKey] || r.regionLabel,
            petiteChasse: 0,
            gibierEau: 0,
            grandeChasse: 0,
            total: 0,
          };
          cur.petiteChasse += r.petiteChasse;
          cur.gibierEau += r.gibierEau;
          cur.grandeChasse += r.grandeChasse;
          cur.total += r.total;
          ovPermitsMap.set(expKey, cur);
        }
        const ovPermitsRows: (string | number)[][] = [
          ...Array.from(ovPermitsMap.values())
            .sort((a, b) => a.regionLabel.localeCompare(b.regionLabel))
            .map((r) => [r.regionLabel, r.petiteChasse, r.gibierEau, r.grandeChasse, r.total]),
          [
            'Total',
            permitsPivotTable.totals.petiteChasse,
            permitsPivotTable.totals.gibierEau,
            permitsPivotTable.totals.grandeChasse,
            permitsPivotTable.totals.total,
          ],
        ];

        // 5. Résident & 6. Touriste
        const ovHunterInfo = new Map<number, { category: string; region: string }>();
        for (const h of ovHuntersList) {
          if (h?.id != null) {
            ovHunterInfo.set(Number(h.id), { category: normTxt(h?.category || ''), region: String(h?.region || '') });
          }
        }
        const ovResCols: Array<{ key: string; label: string }> = [
          { key: 'saint-louis', label: 'Saint-Louis' },
          { key: 'louga', label: 'Louga' },
          { key: 'thies', label: 'Thiès' },
          { key: 'fatick', label: 'Fatick' },
          { key: 'kaolack', label: 'Kaolack' },
          { key: 'kaffrine', label: 'Kaffrine' },
          { key: 'tambacounda', label: 'Tambacounda' },
          { key: 'kedougou', label: 'Kédougou' },
          { key: 'kolda', label: 'Kolda' },
          { key: 'sedhiou', label: 'Sédhiou' },
          { key: 'dakar', label: 'Dakar' },
        ];
        const ovKnownRes = new Set(ovResCols.map((c) => c.key));
        const ovResLabels = [
          'Permis petite chasse résident',
          'Permis de grande chasse résident',
          'Permis coutumier',
          "Permis spécial de chasse au gibier d'eau",
        ] as const;
        const ovResCounts = new Map<string, number>();

        const ovAmodiees = ovZonesList
          .filter((z) => {
            const zt = normTxt(z?.type);
            return (zt === 'amodiee' || zt.includes('amodi')) && Boolean(z?.name);
          })
          .sort((a, b) =>
            prettyRegion(a?.region || '').localeCompare(prettyRegion(b?.region || '')) ||
            String(a?.name || '').localeCompare(String(b?.name || ''))
          );
        const ovZoneCols: Array<{ key: string; label: string }> = ovAmodiees.map((z) => ({
          key: normSlug(z.name),
          label: String(z.name).trim(),
        }));
        const ovKnownZones = new Set(ovZoneCols.map((c) => c.key));
        if (ovZoneCols.length === 0) {
          ovZoneCols.push({ key: 'non-precisee', label: 'Zone non précisée' });
          ovKnownZones.add('non-precisee');
        }
        const ovTourCounts = new Map<string, number>();

        for (const p of ovPermitsList) {
          const rawType = normTxt(p?.type || p?.category || p?.permitType || '');
          const hInfo = ovHunterInfo.get(Number(p?.hunterId));
          const hunterCat = normTxt(p?.hunterCategory || p?.hunter?.category || hInfo?.category || '');
          const combined = `${rawType} ${hunterCat}`;
          if (combined.includes('touriste')) {
            const durTxt = normTxt(`${p?.duration || ''} ${p?.type || ''} ${p?.category || ''}`);
            let dur: '1w' | '2w' | '1m' = '1w';
            if (durTxt.includes('1 mois') || durTxt.includes('01 mois') || durTxt.includes('mensuel') || durTxt.includes('30')) dur = '1m';
            else if (durTxt.includes('2 semaine') || durTxt.includes('02 semaine') || durTxt.includes('14') || durTxt.includes('15')) dur = '2w';
            else if (p?.issueDate && p?.expiryDate) {
              const days = Math.round((new Date(p.expiryDate).getTime() - new Date(p.issueDate).getTime()) / 86400000);
              if (days > 20) dur = '1m';
              else if (days > 10) dur = '2w';
            }
            const rawZk = normSlug(p?.amodieeZone || p?.huntingZone || p?.zone || p?.area);
            let zk = ovZoneCols[0].key;
            if (rawZk && ovKnownZones.has(rawZk)) zk = rawZk;
            else if (rawZk) {
              const found = ovZoneCols.find((c) => rawZk.includes(c.key) || c.key.includes(rawZk));
              if (found) zk = found.key;
              else {
                if (!ovKnownZones.has('autres-zones')) {
                  ovKnownZones.add('autres-zones');
                  ovZoneCols.push({ key: 'autres-zones', label: 'Autres / Non précisée' });
                }
                zk = 'autres-zones';
              }
            }
            const lbl =
              combined.includes('gibier') || combined.includes('eau')
                ? dur === '1w'
                  ? "Permis spécial de chasse au gibier d'eau 01 semaine"
                  : dur === '2w'
                    ? "Permis spécial de chasse au gibier d'eau 02 semaines"
                    : "Permis spécial de chasse au gibier d'eau 01 mois"
                : combined.includes('grande')
                  ? dur === '1w'
                    ? 'Permis de grande chasse touriste 01 semaine'
                    : dur === '2w'
                      ? 'Permis de grande chasse touriste 02 semaines'
                      : 'Permis de grande chasse touriste 01 mois'
                  : dur === '1w'
                    ? 'Permis petite chasse touriste 01 semaine'
                    : dur === '2w'
                      ? 'Permis petite chasse touriste 02 semaines'
                      : 'Permis petite chasse touriste 01 mois';
            ovTourCounts.set(`${lbl}|${zk}`, (ovTourCounts.get(`${lbl}|${zk}`) || 0) + 1);
          } else {
            const rk = exportRegionKey(p?.region || p?.issuerRegion || p?.hunter?.region || hInfo?.region || 'dakar');
            if (!ovKnownRes.has(rk)) {
              ovKnownRes.add(rk);
              ovResCols.push({ key: rk, label: REGION_LABELS[rk] || prettyRegion(rk) });
            }
            const lbl = combined.includes('coutumier')
              ? 'Permis coutumier'
              : combined.includes('gibier') || combined.includes('eau')
                ? "Permis spécial de chasse au gibier d'eau"
                : combined.includes('grande')
                  ? 'Permis de grande chasse résident'
                  : 'Permis petite chasse résident';
            ovResCounts.set(`${lbl}|${rk}`, (ovResCounts.get(`${lbl}|${rk}`) || 0) + 1);
          }
        }

        const ovResColTotals = new Map<string, number>();
        let ovResGrand = 0;
        const ovResRows: (string | number)[][] = ovResLabels.map((lbl) => {
          let rowSum = 0;
          const cells = ovResCols.map((c) => {
            const v = ovResCounts.get(`${lbl}|${c.key}`) || 0;
            rowSum += v;
            ovResColTotals.set(c.key, (ovResColTotals.get(c.key) || 0) + v);
            return v > 0 ? v : '';
          });
          ovResGrand += rowSum;
          return [lbl, ...cells, rowSum];
        });
        ovResRows.push(['Total', ...ovResCols.map((c) => ovResColTotals.get(c.key) || 0), ovResGrand]);

        const ovTourSections = [
          {
            title: 'Petite chasse',
            rows: ['Permis petite chasse touriste 01 semaine', 'Permis petite chasse touriste 02 semaines', 'Permis petite chasse touriste 01 mois'],
            sub: 'Sous total 1',
          },
          {
            title: "Chasse au gibier d'eau",
            rows: ["Permis spécial de chasse au gibier d'eau 01 semaine", "Permis spécial de chasse au gibier d'eau 02 semaines", "Permis spécial de chasse au gibier d'eau 01 mois"],
            sub: 'Sous total 2',
          },
          {
            title: 'Grande chasse',
            rows: ['Permis de grande chasse touriste 01 semaine', 'Permis de grande chasse touriste 02 semaines', 'Permis de grande chasse touriste 01 mois'],
            sub: 'Sous total 3',
          },
        ];
        const ovTourRows: (string | number)[][] = [];
        const ovTourGrandByZone = new Map<string, number>();
        let ovTourGrand = 0;
        for (const sec of ovTourSections) {
          ovTourRows.push([sec.title, ...ovZoneCols.map(() => ''), '']);
          const secMap = new Map<string, number>();
          let secTot = 0;
          for (const rLabel of sec.rows) {
            let rowSum = 0;
            const cells = ovZoneCols.map((c) => {
              const v = ovTourCounts.get(`${rLabel}|${c.key}`) || 0;
              rowSum += v;
              secMap.set(c.key, (secMap.get(c.key) || 0) + v);
              ovTourGrandByZone.set(c.key, (ovTourGrandByZone.get(c.key) || 0) + v);
              return v > 0 ? v : '';
            });
            secTot += rowSum;
            ovTourGrand += rowSum;
            ovTourRows.push([rLabel, ...cells, rowSum > 0 ? rowSum : '']);
          }
          ovTourRows.push([sec.sub, ...ovZoneCols.map((c) => secMap.get(c.key) || 0), secTot]);
        }
        ovTourRows.push(['Total', ...ovZoneCols.map((c) => ovTourGrandByZone.get(c.key) || 0), ovTourGrand]);

        // 7. Prélèvements (Espèces x Régions)
        const ovSpRegCols = [...ovResCols];
        const ovSpKnown = new Set(ovSpRegCols.map((c) => c.key));
        const ovByCatSp = new Map<string, Map<string, { name: string; byReg: Map<string, number>; total: number }>>([
          ['gibier_eau', new Map()],
          ['petite_chasse', new Map()],
          ['grande_chasse', new Map()],
        ]);
        for (const r of speciesByRegion || []) {
          const catRaw = normTxt(getRowCategoryKey(r) || r.category || 'petite_chasse');
          const catKey = catRaw.includes('gibier') || catRaw.includes('eau') ? 'gibier_eau' : catRaw.includes('grande') ? 'grande_chasse' : 'petite_chasse';
          const spMap = ovByCatSp.get(catKey)!;
          const spName = (r.speciesName || r.speciesId || 'Inconnue').trim();
          const spKey = spName.toLowerCase();
          const entry = spMap.get(spKey) || { name: spName, byReg: new Map(), total: 0 };
          const rk = exportRegionKey(r.region);
          if (rk && !ovSpKnown.has(rk)) {
            ovSpKnown.add(rk);
            ovSpRegCols.push({ key: rk, label: REGION_LABELS[rk] || prettyRegion(r.region) });
          }
          const qty = Number(r.quantity || 0);
          entry.byReg.set(rk, (entry.byReg.get(rk) || 0) + qty);
          entry.total += qty;
          spMap.set(spKey, entry);
        }
        const ovSpRows: (string | number)[][] = [];
        const ovSpGrandByReg = new Map<string, number>();
        let ovSpGrand = 0;
        const ovSpSecs = [
          { key: 'gibier_eau', title: "Gibier d'eau", tot: 'Total 1' },
          { key: 'petite_chasse', title: 'Petite chasse', tot: 'Total 2' },
          { key: 'grande_chasse', title: 'Grande Chasse', tot: 'Total 3' },
        ];
        for (const s of ovSpSecs) {
          ovSpRows.push([s.title, ...ovSpRegCols.map(() => ''), '']);
          const secByReg = new Map<string, number>();
          let secTot = 0;
          for (const sp of Array.from(ovByCatSp.get(s.key)!.values()).sort((a, b) => a.name.localeCompare(b.name))) {
            const cells = ovSpRegCols.map((c) => {
              const v = sp.byReg.get(c.key) || 0;
              if (v > 0) {
                secByReg.set(c.key, (secByReg.get(c.key) || 0) + v);
                ovSpGrandByReg.set(c.key, (ovSpGrandByReg.get(c.key) || 0) + v);
              }
              return v > 0 ? v : '';
            });
            secTot += sp.total;
            ovSpGrand += sp.total;
            ovSpRows.push([sp.name, ...cells, sp.total]);
          }
          ovSpRows.push([s.tot, ...ovSpRegCols.map((c) => secByReg.get(c.key) || 0), secTot]);
        }
        ovSpRows.push([`Total ${curYear}`, ...ovSpRegCols.map((c) => ovSpGrandByReg.get(c.key) || 0), ovSpGrand]);

        // 8. Recette chasse (matrice officielle DEFCCS)
        const ovRevCols = [...ovResCols];
        const ovRevKnown = new Set(ovRevCols.map((c) => c.key));
        for (const item of revenueChasseMatrix || []) {
          const rk = exportRegionKey(item.regionKey || item.regionLabel);
          if (rk && !ovRevKnown.has(rk)) {
            ovRevKnown.add(rk);
            ovRevCols.push({ key: rk, label: REGION_LABELS[rk] || prettyRegion(item.regionLabel) });
          }
        }
        const getOvMatrixAmt = (section: string, rowLabel: string, rk: string) => {
          let sum = 0;
          for (const it of revenueChasseMatrix || []) {
            if (it.section === section && it.rowLabel === rowLabel && exportRegionKey(it.regionKey || it.regionLabel) === rk) {
              sum += Number(it.amount || 0);
            }
          }
          return sum;
        };
        const ovRevRows: (string | number)[][] = [];
        const ovDomByReg = new Map<string, number>();
        let ovDomGrand = 0;
        const addOvRevSec = (secKey: string, title: string, labels: string[], totLbl: string) => {
          ovRevRows.push([title, ...ovRevCols.map(() => ''), '']);
          const secByReg = new Map<string, number>();
          let secTot = 0;
          for (const rl of labels) {
            let rSum = 0;
            const cells = ovRevCols.map((c) => {
              const v = getOvMatrixAmt(secKey, rl, c.key);
              rSum += v;
              secByReg.set(c.key, (secByReg.get(c.key) || 0) + v);
              ovDomByReg.set(c.key, (ovDomByReg.get(c.key) || 0) + v);
              return v;
            });
            secTot += rSum;
            ovDomGrand += rSum;
            ovRevRows.push([rl, ...cells, rSum]);
          }
          ovRevRows.push([totLbl, ...ovRevCols.map((c) => secByReg.get(c.key) || 0), secTot]);
        };
        addOvRevSec('petite_chasse', 'Petite chasse', ['Coutumier', 'Résident', 'Touriste'], 'Total 1');
        addOvRevSec('gibier_eau', "Gibier d'eau", ['Résident', 'Touriste'], 'Total 2');
        addOvRevSec('grande_chasse', 'Grande chasse', ['Résident', 'Touriste'], 'Total 3');
        addOvRevSec(
          'licence_taxe',
          'Licence, Taxe et Redevances',
          ['Taxe phaco', 'Taxe grande chasse', 'Attestation pisteur', "Permis spécial d'oisellerie", 'Attestation Collecteur', 'Taxe Ramasseur', 'Licence', 'Taxe amodiation', 'Taxe réserve privée'],
          'Total 4'
        );
        ovRevRows.push([`Total domanial ${curYear}`, ...ovRevCols.map((c) => ovDomByReg.get(c.key) || 0), ovDomGrand]);
        const ovContByReg = new Map<string, number>();
        let ovContGrand = 0;
        for (const c of ovRevCols) {
          const v = getOvMatrixAmt('contentieux', 'Contentieux', c.key);
          ovContByReg.set(c.key, v);
          ovContGrand += v;
        }
        ovRevRows.push([`Contentieux ${curYear}`, ...ovRevCols.map((c) => ovContByReg.get(c.key) || 0), ovContGrand]);
        ovRevRows.push([
          `Total RECETTES CHASSES ${curYear}`,
          ...ovRevCols.map((c) => (ovDomByReg.get(c.key) || 0) + (ovContByReg.get(c.key) || 0)),
          ovDomGrand + ovContGrand,
        ]);

        // 9. Licences et amodiations
        const ovLicMerges = ['A1:A2', 'B1:B2', 'C1:C2', 'D1:E1', 'F1:G1'];
        const ovLicRows: (string | number)[][] = [['', '', '', 'Montant', 'N° quittance et date', 'Montant', 'N° Quittance et date']];
        let ovTotLic = 0;
        let ovTotAmo = 0;
        for (const z of ovAmodiees) {
          const la = Number(z?.licence_amount ?? z?.licenceAmount ?? 0);
          const aa = Number(z?.amodiation_amount ?? z?.amodiationAmount ?? 0);
          if (la > 0) ovTotLic += la;
          if (aa > 0) ovTotAmo += aa;
          ovLicRows.push([
            prettyRegion(z?.region || ''),
            String(z?.name || ''),
            String(z?.responsible_name || z?.responsibleName || ''),
            la > 0 ? la : '',
            String(z?.licence_receipt || z?.licenceReceipt || ''),
            aa > 0 ? aa : '',
            String(z?.amodiation_receipt || z?.amodiationReceipt || ''),
          ]);
        }
        const ovLicTotRow = ovLicRows.length + 2;
        ovLicRows.push(['Total', '', '', ovTotLic, '', ovTotAmo, '']);
        ovLicMerges.push(`A${ovLicTotRow}:C${ovLicTotRow}`);

        // 10. Transactions (Contentieux / Infractions)
        const ovTxByReg = new Map<string, { regionLabel: string; byNature: Map<string, { natureLabel: string; nbrPv: number; transiges: number; montant: number; instance: number; tribunal: number }> }>();
        for (const row of infractionsData || []) {
          const rk = exportRegionKey(row.region || 'non défini');
          const regionLabel = REGION_LABELS[rk] || prettyRegion(row.region || 'Non défini');
          const rawNature = String((row as any).nature_infraction || (row as any).infraction_type || 'Non spécifiée').trim();
          const natureKey = normTxt(rawNature) || 'non-specifiee';
          const regEntry = ovTxByReg.get(rk) || { regionLabel, byNature: new Map() };
          const natEntry = regEntry.byNature.get(natureKey) || { natureLabel: rawNature || 'Non spécifiée', nbrPv: 0, transiges: 0, montant: 0, instance: 0, tribunal: 0 };
          natEntry.nbrPv += 1;
          const m = Number(row.montant_chiffre || 0);
          const hasQ = Boolean((row as any).numero_quittance && String((row as any).numero_quittance).trim());
          const obs = normTxt((row as any).observations || '');
          if (obs.includes('tribunal') || obs.includes('justice') || obs.includes('defere') || obs.includes('parquet')) natEntry.tribunal += 1;
          else if (m > 0 || hasQ) { natEntry.transiges += 1; natEntry.montant += m; }
          else natEntry.instance += 1;
          regEntry.byNature.set(natureKey, natEntry);
          ovTxByReg.set(rk, regEntry);
        }
        const ovTxMerges = ['A1:A2', 'B1:B2', 'C1:C2', 'D1:F1', 'G1:G2'];
        const ovTxRows: (string | number)[][] = [['', '', '', 'Transigés', 'Montant', 'Instance', '']];
        let ovPv = 0, ovTr = 0, ovMo = 0, ovIn = 0, ovTb = 0, ovTxRow = 3;
        for (const reg of Array.from(ovTxByReg.values()).sort((a, b) => a.regionLabel.localeCompare(b.regionLabel))) {
          const nats = Array.from(reg.byNature.values()).sort((a, b) => a.natureLabel.localeCompare(b.natureLabel));
          const sr = ovTxRow;
          nats.forEach((nat, idx) => {
            ovPv += nat.nbrPv; ovTr += nat.transiges; ovMo += nat.montant; ovIn += nat.instance; ovTb += nat.tribunal;
            ovTxRows.push([idx === 0 ? reg.regionLabel : '', nat.natureLabel, nat.nbrPv, nat.transiges, nat.montant > 0 ? nat.montant : '', nat.instance, nat.tribunal]);
            ovTxRow += 1;
          });
          if (ovTxRow - 1 > sr) ovTxMerges.push(`A${sr}:A${ovTxRow - 1}`);
        }
        ovTxRows.push([`Total ${curYear}`, '', ovPv, ovTr, ovMo, ovIn, ovTb]);
        ovTxMerges.push(`A${ovTxRow}:B${ovTxRow}`);

        // 11. Alertes
        const ovAlertsHeader = ['Nature', ...(groupedAlerts?.regions || []), 'Total'];
        const ovAlertsRows: (string | number)[][] = (groupedAlerts?.rows || []).map((r) => [
          r.nature,
          ...(groupedAlerts?.regions || []).map((reg) => Number(r[reg] || 0)),
          Number(r.total || 0),
        ]);

        // 12-15. Armes (Expirations, Marques, Régions, Catégories)
        const ovExpRows: (string | number)[][] = [
          ['Expire dans 3 mois', permitExpirations?.expiring3Months || 0],
          ['Expire dans 6 mois', permitExpirations?.expiring6Months || 0],
          ['Expire dans 1 an', permitExpirations?.expiring1Year || 0],
          ['Déjà expirés', permitExpirations?.expired || 0],
          [
            'Total',
            (permitExpirations?.expiring3Months || 0) +
              (permitExpirations?.expiring6Months || 0) +
              (permitExpirations?.expiring1Year || 0) +
              (permitExpirations?.expired || 0),
          ],
        ];
        const ovBrandRows: (string | number)[][] = [
          ...(weaponStats?.weaponsByBrand || []).map((b) => [b.brand || 'Non spécifiée', b.count]),
          ['Total', (weaponStats?.weaponsByBrand || []).reduce((a, b) => a + b.count, 0)],
        ];
        const ovWeaponRegRows: (string | number)[][] = [
          ...(weaponsByRegion || []).map((w) => [
            REGION_LABELS[exportRegionKey(w.region)] || prettyRegion(w.region),
            w.brand || 'Non spécifiée',
            w.weaponType || 'Non spécifié',
            w.caliber || 'Non spécifié',
            w.count,
          ]),
          ['Total', '', '', '', (weaponsByRegion || []).reduce((a, w) => a + w.count, 0)],
        ];
        const ovWeaponCatRows: (string | number)[][] = [
          ...(weaponsByPermitCategory || []).map((w) => [
            w.permitCategory || 'Non spécifiée',
            w.weaponType || 'Non spécifié',
            w.caliber || 'Non spécifié',
            w.count,
          ]),
          ['Total', '', '', (weaponsByPermitCategory || []).reduce((a, w) => a + w.count, 0)],
        ];

        const ovPermitCatDefs = [
          { section: 'petite_chasse', rowLabel: 'Coutumier', display: 'Petite chasse — Coutumier' },
          { section: 'petite_chasse', rowLabel: 'Résident', display: 'Petite chasse — Résident' },
          { section: 'petite_chasse', rowLabel: 'Touriste', display: 'Petite chasse — Touriste' },
          { section: 'gibier_eau', rowLabel: 'Résident', display: "Gibier d'eau — Résident" },
          { section: 'gibier_eau', rowLabel: 'Touriste', display: "Gibier d'eau — Touriste" },
          { section: 'grande_chasse', rowLabel: 'Résident', display: 'Grande chasse — Résident' },
          { section: 'grande_chasse', rowLabel: 'Touriste', display: 'Grande chasse — Touriste' },
        ];
        const ovRecCatItems = ovPermitCatDefs.map((def) => ({
          display: def.display,
          amount: ovRevCols.reduce((sum, col) => sum + getOvMatrixAmt(def.section, def.rowLabel, col.key), 0),
        }));
        const ovRecCatTotal = ovRecCatItems.reduce((a, b) => a + b.amount, 0);
        const ovRecCatRows: (string | number)[][] = [
          ...ovRecCatItems.map((it) => [
            it.display,
            it.amount,
            ovRecCatTotal > 0 ? `${((it.amount / ovRecCatTotal) * 100).toFixed(1)} %` : '0,0 %',
          ]),
          ['Total', ovRecCatTotal, ovRecCatTotal > 0 ? '100,0 %' : '0,0 %'],
        ];

        exportMultiSheetXlsx(`bilan_national_chasse_${curYear}.xlsx`, [
          { name: "Vue d'ensemble", headers: ['Région (Top 5)', 'Permis actifs', 'Prélèvements', 'Recette (FCFA)'], rows: overviewRows },
          { name: 'Par région', headers: ['Région', 'Permis actifs', 'Prélèvements', "Taxe d'abattage (FCFA)", 'Recette (FCFA)'], rows: parRegionRows },
          { name: 'Chasseurs', headers: ['Régions', 'Coutumiers', 'Résidents', 'Touristes', 'Totaux'], rows: ovHuntersRows },
          { name: 'Permis délivrés', headers: ['Région', 'Permis sportifs petite chasse', "Permis sportif gibiers d'eau", 'Permis sportif grande chasse', 'Total'], rows: ovPermitsRows },
          { name: 'Résident', headers: ['Nature permis', ...ovResCols.map((c) => c.label), 'Total'], rows: ovResRows },
          { name: 'Touriste', headers: ['Nom des zones amodiées', ...ovZoneCols.map((c) => c.label), 'Total'], rows: ovTourRows },
          { name: 'Prélèvements', headers: ['Type gibier', ...ovSpRegCols.map((c) => c.label), 'Total'], rows: ovSpRows },
          { name: 'Recette chasse', headers: ['Type permis', ...ovRevCols.map((c) => c.label), 'Total'], rows: ovRevRows },
          { name: 'Recettes par catégorie', headers: ['Catégorie de permis', 'Montant (FCFA)', 'Part (%)'], rows: ovRecCatRows },
          { name: 'Licences et amodiations', headers: ['Région', 'Zone amodiée', 'Amodiataire', 'Licence', '', "Taxe d'amodiation", ''], rows: ovLicRows, merges: ovLicMerges },
          { name: 'Transactions', headers: ['Régions', 'Nature infraction', 'Nbr P.V', 'Transactions', '', '', 'Tribunal'], rows: ovTxRows, merges: ovTxMerges },
          { name: 'Alertes', headers: ovAlertsHeader, rows: ovAlertsRows },
          { name: 'Armes - Expirations', headers: ['Statut expiration', 'Nombre'], rows: ovExpRows },
          { name: 'Armes - Marques', headers: ['Marque', 'Nombre'], rows: ovBrandRows },
          { name: 'Armes - Régions', headers: ['Région', 'Marque', "Type d'arme", 'Calibre', 'Nombre'], rows: ovWeaponRegRows },
          { name: 'Armes - Catégories', headers: ['Catégorie de permis', "Type d'arme", 'Calibre', 'Nombre'], rows: ovWeaponCatRows },
        ]);
        break;
      }
      case 'regions': {
        if (isSubZoneMode) {
          const header = [geoUnitLabel, 'Permis actifs', 'Chasseurs enregistrés', "Taxe d'abattage (FCFA)", 'Recette (FCFA)'];
          const rows = (subZoneStatsRows || []).map((z) => [
            (z.zone || '').toUpperCase(),
            Number(z.activePermits ?? 0),
            Number(z.hunters ?? 0),
            Number(z.taxesRevenue ?? 0),
            Number((z.permitsRevenue ?? 0) + (z.taxesRevenue ?? 0)),
          ]);
          const slug = removeDiacritics(geoUnitLower);
          exportArrayToCsv(`statistiques_par_${slug}.csv`, header, rows);
          break;
        }
        const header = ['Région', 'Permis actifs', 'Prélèvements', "Taxe d'abattage (FCFA)", 'Recette (FCFA)'];
        const byExpReg = new Map<
          string,
          { region: string; activePermits: number; piecesAbattues: number; taxAmount: number; revenue: number }
        >();
        for (const r of filteredByRegion || []) {
          const expKey = exportRegionKey(r.region);
          const label = (REGION_LABELS[expKey] || r.region || '').toUpperCase();
          const cur = byExpReg.get(expKey) || {
            region: label,
            activePermits: 0,
            piecesAbattues: 0,
            taxAmount: 0,
            revenue: 0,
          };
          cur.activePermits += Number(r.activePermits ?? 0);
          cur.piecesAbattues += Number(r.piecesAbattues ?? 0);
          cur.taxAmount += Number((r as any).taxAmount || 0);
          cur.revenue += Number(r.revenue ?? 0);
          byExpReg.set(expKey, cur);
        }
        const rows = Array.from(byExpReg.values()).map((r) => [
          r.region,
          r.activePermits,
          r.piecesAbattues,
          r.taxAmount,
          r.revenue,
        ]);
        exportArrayToCsv('statistiques_par_region.csv', header, rows);
        break;
      }
      case 'categories': {
        const huntersHeaders = ['Régions', 'Coutumiers', 'Résidents', 'Touristes', 'Totaux'];
        const expHuntersMap = new Map<
          string,
          { regionLabel: string; coutumier: number; resident: number; touristique: number; total: number }
        >();
        for (const r of huntersPivotTable.rows) {
          const expKey = exportRegionKey(r.regionKey);
          const label = REGION_LABELS[expKey] || r.regionLabel;
          const cur = expHuntersMap.get(expKey) || {
            regionLabel: label,
            coutumier: 0,
            resident: 0,
            touristique: 0,
            total: 0,
          };
          cur.coutumier += r.coutumier;
          cur.resident += r.resident;
          cur.touristique += r.touristique;
          cur.total += r.total;
          expHuntersMap.set(expKey, cur);
        }
        const expHuntersRows = Array.from(expHuntersMap.values()).sort((a, b) =>
          a.regionLabel.localeCompare(b.regionLabel)
        );
        const huntersRows: (string | number)[][] = [
          ...expHuntersRows.map((r) => [
            r.regionLabel,
            r.coutumier,
            r.resident,
            r.touristique,
            r.total,
          ]),
          [
            `Total ${new Date().getFullYear()}`,
            huntersPivotTable.totals.coutumier,
            huntersPivotTable.totals.resident,
            huntersPivotTable.totals.touristique,
            huntersPivotTable.totals.total,
          ],
        ];

        const permitsHeaders = [
          'Région',
          'Permis sportifs petite chasse',
          "Permis sportif gibiers d'eau",
          'Permis sportif grande chasse',
          'Total',
        ];
        const expPermitsMap = new Map<
          string,
          { regionLabel: string; petiteChasse: number; gibierEau: number; grandeChasse: number; total: number }
        >();
        for (const r of permitsPivotTable.rows) {
          const expKey = exportRegionKey(r.regionKey);
          const label = REGION_LABELS[expKey] || r.regionLabel;
          const cur = expPermitsMap.get(expKey) || {
            regionLabel: label,
            petiteChasse: 0,
            gibierEau: 0,
            grandeChasse: 0,
            total: 0,
          };
          cur.petiteChasse += r.petiteChasse;
          cur.gibierEau += r.gibierEau;
          cur.grandeChasse += r.grandeChasse;
          cur.total += r.total;
          expPermitsMap.set(expKey, cur);
        }
        const expPermitsRows = Array.from(expPermitsMap.values()).sort((a, b) =>
          a.regionLabel.localeCompare(b.regionLabel)
        );
        const permitsRows: (string | number)[][] = [
          ...expPermitsRows.map((r) => [
            r.regionLabel,
            r.petiteChasse,
            r.gibierEau,
            r.grandeChasse,
            r.total,
          ]),
          [
            'Total',
            permitsPivotTable.totals.petiteChasse,
            permitsPivotTable.totals.gibierEau,
            permitsPivotTable.totals.grandeChasse,
            permitsPivotTable.totals.total,
          ],
        ];

        // Charger permis, chasseurs et zones amodiées pour construire les onglets "Résident" et "Touriste"
        const [allPermitsRes, allHuntersRes, allZonesRes] = await Promise.all([
          apiRequest<any>('GET', '/api/permits').catch(() => ({ ok: false, data: [] })),
          apiRequest<any>('GET', '/api/hunters').catch(() => ({ ok: false, data: [] })),
          apiRequest<any>('GET', '/api/zones?lite=1').catch(() => ({ ok: false, data: [] })),
        ]);
        const allPermitsRaw: any = allPermitsRes?.data;
        const allHuntersRaw: any = allHuntersRes?.data;
        const allZonesRaw: any = allZonesRes?.data;
        const allPermitsList: any[] = Array.isArray(allPermitsRaw)
          ? allPermitsRaw
          : Array.isArray(allPermitsRaw?.data)
            ? allPermitsRaw.data
            : [];
        const allHuntersList: any[] = Array.isArray(allHuntersRaw)
          ? allHuntersRaw
          : Array.isArray(allHuntersRaw?.data)
            ? allHuntersRaw.data
            : [];
        const allZonesList: any[] = Array.isArray(allZonesRaw?.features)
          ? allZonesRaw.features.map((f: any) => f?.properties || f)
          : Array.isArray(allZonesRaw)
            ? allZonesRaw
            : Array.isArray(allZonesRaw?.data)
              ? allZonesRaw.data
              : Array.isArray(allZonesRaw?.zones)
                ? allZonesRaw.zones
                : [];

        const normTxt = (s?: string | null) =>
          String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        const normSlug = (s?: string | null) =>
          normTxt(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        const activeCatRegionKey =
          categoriesRegionFilter !== 'toutes' ? exportRegionKey(categoriesRegionFilter) : null;

        const hunterInfoById = new Map<number, { category: string; region: string }>();
        for (const h of allHuntersList) {
          if (h?.id != null) {
            hunterInfoById.set(Number(h.id), {
              category: normTxt(h?.category || ''),
              region: String(h?.region || ''),
            });
          }
        }

        // Onglet 3 : "Résident" (Nature permis x Régions + Total)
        const baseResidentRegionCols: Array<{ key: string; label: string }> = [
          { key: 'saint-louis', label: 'Saint-Louis' },
          { key: 'louga', label: 'Louga' },
          { key: 'thies', label: 'Thiès' },
          { key: 'fatick', label: 'Fatick' },
          { key: 'kaolack', label: 'Kaolack' },
          { key: 'kaffrine', label: 'Kaffrine' },
          { key: 'tambacounda', label: 'Tambacounda' },
          { key: 'kedougou', label: 'Kédougou' },
          { key: 'kolda', label: 'Kolda' },
          { key: 'sedhiou', label: 'Sédhiou' },
          { key: 'dakar', label: 'Dakar' },
        ];
        const resRegionCols = activeCatRegionKey
          ? baseResidentRegionCols.filter((c) => c.key === activeCatRegionKey)
          : [...baseResidentRegionCols];
        const knownResRegKeys = new Set(resRegionCols.map((c) => c.key));
        if (activeCatRegionKey && !knownResRegKeys.has(activeCatRegionKey)) {
          knownResRegKeys.add(activeCatRegionKey);
          resRegionCols.push({
            key: activeCatRegionKey,
            label: REGION_LABELS[activeCatRegionKey] || prettyRegion(categoriesRegionFilter),
          });
        }

        const residentLabels = [
          'Permis petite chasse résident',
          'Permis de grande chasse résident',
          'Permis coutumier',
          "Permis spécial de chasse au gibier d'eau",
        ] as const;
        const residentCounts = new Map<string, number>();

        for (const p of allPermitsList) {
          const rawType = normTxt(p?.type || p?.category || p?.permitType || '');
          const hInfo = hunterInfoById.get(Number(p?.hunterId));
          const hunterCat = normTxt(p?.hunterCategory || p?.hunter?.category || hInfo?.category || '');
          const combined = `${rawType} ${hunterCat}`;
          if (combined.includes('touriste')) continue;

          const rk = exportRegionKey(
            p?.region || p?.issuerRegion || p?.hunter?.region || hInfo?.region || 'dakar'
          );
          if (activeCatRegionKey && rk !== activeCatRegionKey) continue;

          if (!knownResRegKeys.has(rk)) {
            knownResRegKeys.add(rk);
            resRegionCols.push({ key: rk, label: REGION_LABELS[rk] || prettyRegion(rk) });
          }

          let rowLabel: (typeof residentLabels)[number] = 'Permis petite chasse résident';
          if (combined.includes('coutumier')) {
            rowLabel = 'Permis coutumier';
          } else if (combined.includes('gibier') || combined.includes('eau')) {
            rowLabel = "Permis spécial de chasse au gibier d'eau";
          } else if (combined.includes('grande')) {
            rowLabel = 'Permis de grande chasse résident';
          }

          const k = `${rowLabel}|${rk}`;
          residentCounts.set(k, (residentCounts.get(k) || 0) + 1);
        }

        const resColTotals = new Map<string, number>();
        let resGrandTotal = 0;
        const residentSheetRows: (string | number)[][] = residentLabels.map((label) => {
          let rowSum = 0;
          const cells = resRegionCols.map((c) => {
            const val = residentCounts.get(`${label}|${c.key}`) || 0;
            rowSum += val;
            resColTotals.set(c.key, (resColTotals.get(c.key) || 0) + val);
            return val > 0 ? val : '';
          });
          resGrandTotal += rowSum;
          return [label, ...cells, rowSum];
        });
        residentSheetRows.push([
          'Total',
          ...resRegionCols.map((c) => resColTotals.get(c.key) || 0),
          resGrandTotal,
        ]);

        // Onglet 4 : "Touriste" (colonnes = noms réels des zones amodiées + Total)
        const nationalAmodiees = allZonesList
          .filter((z) => {
            const zType = normTxt(z?.type);
            if (!(zType === 'amodiee' || zType.includes('amodi')) || !z?.name) return false;
            if (activeCatRegionKey) {
              return exportRegionKey(z?.region) === activeCatRegionKey;
            }
            return true;
          })
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));

        const touristZoneCols: Array<{ key: string; label: string }> = nationalAmodiees.map((z) => ({
          key: normSlug(z.name),
          label: String(z.name).trim(),
        }));
        const knownTouristZones = new Set(touristZoneCols.map((c) => c.key));
        if (touristZoneCols.length === 0) {
          touristZoneCols.push({ key: 'non-precisee', label: 'Zone non précisée' });
          knownTouristZones.add('non-precisee');
        }

        const resolveNationalZoneKey = (rawZone?: string | null): string => {
          const k = normSlug(rawZone);
          if (!k) return touristZoneCols[0].key;
          if (knownTouristZones.has(k)) return k;
          for (const col of touristZoneCols) {
            if (k.includes(col.key) || col.key.includes(k)) return col.key;
          }
          const extraKey = 'autres-zones';
          if (!knownTouristZones.has(extraKey)) {
            knownTouristZones.add(extraKey);
            touristZoneCols.push({ key: extraKey, label: 'Autres / Non précisée' });
          }
          return extraKey;
        };

        const detectNatTouristDur = (p: any): '1w' | '2w' | '1m' => {
          const text = normTxt(`${p?.duration || ''} ${p?.type || ''} ${p?.category || ''} ${p?.permitType || ''}`);
          if (text.includes('1 mois') || text.includes('01 mois') || text.includes('mensuel') || text.includes('30')) return '1m';
          if (text.includes('2 semaine') || text.includes('02 semaine') || text.includes('14') || text.includes('15')) return '2w';
          if (text.includes('1 semaine') || text.includes('01 semaine') || text.includes('7')) return '1w';
          if (p?.issueDate && p?.expiryDate) {
            const d1 = new Date(p.issueDate).getTime();
            const d2 = new Date(p.expiryDate).getTime();
            if (!isNaN(d1) && !isNaN(d2) && d2 > d1) {
              const days = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
              if (days <= 10) return '1w';
              if (days <= 20) return '2w';
              return '1m';
            }
          }
          return '1w';
        };

        const touristCountsMap = new Map<string, number>();
        for (const p of allPermitsList) {
          const rawType = normTxt(p?.type || p?.category || p?.permitType || '');
          const hInfo = hunterInfoById.get(Number(p?.hunterId));
          const hunterCat = normTxt(p?.hunterCategory || p?.hunter?.category || hInfo?.category || '');
          const combined = `${rawType} ${hunterCat}`;
          if (!combined.includes('touriste')) continue;

          if (activeCatRegionKey) {
            const rk = exportRegionKey(p?.region || p?.issuerRegion || p?.hunter?.region || hInfo?.region || '');
            if (rk !== activeCatRegionKey) continue;
          }

          const dur = detectNatTouristDur(p);
          const zk = resolveNationalZoneKey(p?.amodieeZone || p?.huntingZone || p?.zone || p?.area);
          let label = '';
          if (combined.includes('gibier') || combined.includes('eau')) {
            label =
              dur === '1w'
                ? "Permis spécial de chasse au gibier d'eau 01 semaine"
                : dur === '2w'
                  ? "Permis spécial de chasse au gibier d'eau 02 semaines"
                  : "Permis spécial de chasse au gibier d'eau 01 mois";
          } else if (combined.includes('grande')) {
            label =
              dur === '1w'
                ? 'Permis de grande chasse touriste 01 semaine'
                : dur === '2w'
                  ? 'Permis de grande chasse touriste 02 semaines'
                  : 'Permis de grande chasse touriste 01 mois';
          } else {
            label =
              dur === '1w'
                ? 'Permis petite chasse touriste 01 semaine'
                : dur === '2w'
                  ? 'Permis petite chasse touriste 02 semaines'
                  : 'Permis petite chasse touriste 01 mois';
          }
          const k = `${label}|${zk}`;
          touristCountsMap.set(k, (touristCountsMap.get(k) || 0) + 1);
        }

        const natTouristSections = [
          {
            title: 'Petite chasse',
            rows: [
              'Permis petite chasse touriste 01 semaine',
              'Permis petite chasse touriste 02 semaines',
              'Permis petite chasse touriste 01 mois',
            ],
            subTotalLabel: 'Sous total 1',
          },
          {
            title: "Chasse au gibier d'eau",
            rows: [
              "Permis spécial de chasse au gibier d'eau 01 semaine",
              "Permis spécial de chasse au gibier d'eau 02 semaines",
              "Permis spécial de chasse au gibier d'eau 01 mois",
            ],
            subTotalLabel: 'Sous total 2',
          },
          {
            title: 'Grande chasse',
            rows: [
              'Permis de grande chasse touriste 01 semaine',
              'Permis de grande chasse touriste 02 semaines',
              'Permis de grande chasse touriste 01 mois',
            ],
            subTotalLabel: 'Sous total 3',
          },
        ];

        const touristSheetRows: (string | number)[][] = [];
        const touristGrandByZone = new Map<string, number>();
        let touristGrandTotal = 0;

        for (const sec of natTouristSections) {
          touristSheetRows.push([sec.title, ...touristZoneCols.map(() => ''), '']);
          const secByZone = new Map<string, number>();
          let secTotal = 0;
          for (const rLabel of sec.rows) {
            let rowSum = 0;
            const cells = touristZoneCols.map((c) => {
              const val = touristCountsMap.get(`${rLabel}|${c.key}`) || 0;
              rowSum += val;
              secByZone.set(c.key, (secByZone.get(c.key) || 0) + val);
              touristGrandByZone.set(c.key, (touristGrandByZone.get(c.key) || 0) + val);
              return val > 0 ? val : '';
            });
            secTotal += rowSum;
            touristGrandTotal += rowSum;
            touristSheetRows.push([rLabel, ...cells, rowSum > 0 ? rowSum : '']);
          }
          touristSheetRows.push([
            sec.subTotalLabel,
            ...touristZoneCols.map((c) => secByZone.get(c.key) || 0),
            secTotal,
          ]);
        }
        touristSheetRows.push([
          'Total',
          ...touristZoneCols.map((c) => touristGrandByZone.get(c.key) || 0),
          touristGrandTotal,
        ]);

        exportMultiSheetXlsx('categories_chasseurs_et_permis.xlsx', [
          {
            name: 'Tableau 1 - Chasseurs',
            headers: huntersHeaders,
            rows: huntersRows,
          },
          {
            name: 'Tableau 2 - Permis délivrés',
            headers: permitsHeaders,
            rows: permitsRows,
          },
          {
            name: 'Résident',
            headers: ['Nature permis', ...resRegionCols.map((c) => c.label), 'Total'],
            rows: residentSheetRows,
          },
          {
            name: 'Touriste',
            headers: ['Nom des zones amodiées', ...touristZoneCols.map((c) => c.label), 'Total'],
            rows: touristSheetRows,
          },
        ]);
        break;
      }
      case 'especes': {
        const rowsData = filteredSpeciesByRegion || [];
        const bySpeciesRegion = new Map<
          string,
          {
            id: string;
            name: string;
            sci?: string;
            regionLabel: string;
            categoriesSet: Set<string>;
            quantity: number;
            utmXSet: Set<string>;
            utmYSet: Set<string>;
            permitsSet: Set<string>;
            declarantsSet: Set<string>;
          }
        >();
        for (const r of rowsData) {
          const id = r.speciesId || 'unknown';
          const regKey = exportRegionKey(r.region);
          const regLabel = REGION_LABELS[regKey] || prettyRegion(r.region);
          const groupKey = `${id}::${regKey}`;
          const entry = bySpeciesRegion.get(groupKey) || {
            id,
            name: r.speciesName || id,
            sci: r.scientificName,
            regionLabel: regLabel,
            categoriesSet: new Set<string>(),
            quantity: 0,
            utmXSet: new Set<string>(),
            utmYSet: new Set<string>(),
            permitsSet: new Set<string>(),
            declarantsSet: new Set<string>(),
          };
          entry.quantity += Number(r.quantity) || 0;
          const catKey = getRowCategoryKey(r);
          if (catKey) {
            entry.categoriesSet.add(formatCategoryLabel(catKey));
          } else if (r.category) {
            entry.categoriesSet.add(formatCategoryLabel(r.category));
          }
          const utm = wgs84ToUtm(r.lat, r.lon);
          if (utm.x && utm.y) {
            entry.utmXSet.add(utm.x);
            entry.utmYSet.add(utm.y);
          }
          if (r.permitNumber) entry.permitsSet.add(r.permitNumber);
          if (r.declaredBy) entry.declarantsSet.add(r.declaredBy);
          bySpeciesRegion.set(groupKey, entry);
        }
        const speciesList = Array.from(bySpeciesRegion.values()).sort(
          (a, b) => a.name.localeCompare(b.name) || a.regionLabel.localeCompare(b.regionLabel)
        );
        const totalQuantity = speciesList.reduce((acc, sp) => acc + sp.quantity, 0);
        const prelevementsHeader = [
          'Espèce',
          'Nom scientifique',
          'Catégorie',
          'Région',
          'UTM X',
          'UTM Y',
          'Permis',
          'Déclarant',
          'Total',
        ];
        const prelevementsRows: (string | number)[][] = [
          ...speciesList.map((sp) => [
            sp.name,
            sp.sci || '',
            Array.from(sp.categoriesSet).join(' / ') || 'Non définie',
            sp.regionLabel,
            Array.from(sp.utmXSet).join(' | '),
            Array.from(sp.utmYSet).join(' | '),
            Array.from(sp.permitsSet).join(' | '),
            Array.from(sp.declarantsSet).join(' / ') || 'Chasseur',
            sp.quantity,
          ]),
          ['Total', '', '', '', '', '', '', '', totalQuantity],
        ];

        // Onglet 2 : "Les Espèces" (Tableau croisé Type gibier x Régions avec sous-totaux par catégorie)
        const baseRegionCols: { key: string; label: string }[] = [
          { key: 'thies', label: 'Thiès' },
          { key: 'kedougou', label: 'Kédougou' },
          { key: 'sedhiou', label: 'Sédhiou' },
          { key: 'fatick', label: 'Fatick' },
          { key: 'kaffrine', label: 'Kaffrine' },
          { key: 'kolda', label: 'Kolda' },
          { key: 'saintlouis', label: 'Saint-Louis' },
          { key: 'tambacounda', label: 'Tambacounda' },
          { key: 'kaolack', label: 'Kaolack' },
          { key: 'louga', label: 'Louga' },
        ];
        const extraFullLabels: Record<string, string> = {
          dakar: 'Dakar',
          ziguinchor: 'Ziguinchor',
          matam: 'Matam',
          diourbel: 'Diourbel',
          nondefini: 'Non défini',
        };
        const regionCols = [...baseRegionCols];
        const knownRegKeys = new Set(regionCols.map((c) => c.key));
        // Ajout dynamique de toute autre région ou zone présente dans les déclarations (DEFCCS -> Dakar)
        for (const r of rowsData) {
          const rk = exportRegionKey(r.region);
          if (rk && !knownRegKeys.has(rk)) {
            knownRegKeys.add(rk);
            regionCols.push({
              key: rk,
              label: extraFullLabels[rk] || REGION_LABELS[rk] || prettyRegion(r.region),
            });
          }
        }

        // Regrouper les espèces par catégorie -> espèce -> région -> quantité
        const categoryOrder = ['gibier_eau', 'petite_chasse', 'grande_chasse'];
        const byCatSpecies = new Map<
          string,
          Map<string, { name: string; byReg: Map<string, number>; total: number }>
        >();
        for (const ck of categoryOrder) {
          byCatSpecies.set(ck, new Map());
        }

        for (const r of rowsData) {
          const rawCatKey = getRowCategoryKey(r) || normalizeCategoryKey(r.category) || 'petite_chasse';
          const catKey = byCatSpecies.has(rawCatKey) ? rawCatKey : rawCatKey;
          if (!byCatSpecies.has(catKey)) {
            byCatSpecies.set(catKey, new Map());
          }
          const spMap = byCatSpecies.get(catKey)!;
          const spName = (r.speciesName || r.speciesId || 'Inconnue').trim();
          const spKey = spName.toLowerCase();
          const spEntry = spMap.get(spKey) || {
            name: spName,
            byReg: new Map<string, number>(),
            total: 0,
          };
          const rk = exportRegionKey(r.region);
          const qty = Number(r.quantity) || 0;
          spEntry.byReg.set(rk, (spEntry.byReg.get(rk) || 0) + qty);
          spEntry.total += qty;
          spMap.set(spKey, spEntry);
        }

        const especesPivotHeader = ['Type gibier', ...regionCols.map((c) => c.label), 'Total'];
        const especesPivotRows: (string | number)[][] = [];
        const grandRegionTotals = new Map<string, number>();
        let grandTotal = 0;
        let sectionIndex = 0;

        for (const [catKey, spMap] of Array.from(byCatSpecies.entries())) {
          // Toujours afficher les 3 catégories principales ou toute catégorie ayant des données
          if (spMap.size === 0 && !categoryOrder.includes(catKey)) continue;
          sectionIndex += 1;
          const catTitle =
            catKey === 'gibier_eau'
              ? "Gibier d'eau"
              : catKey === 'petite_chasse'
              ? 'Petite chasse'
              : catKey === 'grande_chasse'
              ? 'Grande Chasse'
              : formatCategoryLabel(catKey);

          // Ligne de titre de catégorie
          especesPivotRows.push([catTitle, ...regionCols.map(() => ''), '']);

          const catRegionTotals = new Map<string, number>();
          let catTotal = 0;

          const sortedSpecies = Array.from(spMap.values()).sort((a, b) => a.name.localeCompare(b.name));
          for (const sp of sortedSpecies) {
            const regCells = regionCols.map((c) => {
              const val = sp.byReg.get(c.key) || 0;
              if (val > 0) {
                catRegionTotals.set(c.key, (catRegionTotals.get(c.key) || 0) + val);
                grandRegionTotals.set(c.key, (grandRegionTotals.get(c.key) || 0) + val);
              }
              return val > 0 ? val : '';
            });
            catTotal += sp.total;
            grandTotal += sp.total;
            especesPivotRows.push([sp.name, ...regCells, sp.total]);
          }

          // Ligne sous-total de la catégorie (Total 1, Total 2, Total 3)
          especesPivotRows.push([
            `Total ${sectionIndex}`,
            ...regionCols.map((c) => catRegionTotals.get(c.key) ?? 0),
            catTotal,
          ]);
        }

        // Ligne Total général en bas
        const curYear = new Date().getFullYear();
        especesPivotRows.push([
          `Total ${curYear}`,
          ...regionCols.map((c) => grandRegionTotals.get(c.key) ?? 0),
          grandTotal,
        ]);

        exportMultiSheetXlsx('prelevements_et_especes.xlsx', [
          {
            name: 'Prélèvements',
            headers: prelevementsHeader,
            rows: prelevementsRows,
          },
          {
            name: 'Les Espèces',
            headers: especesPivotHeader,
            rows: especesPivotRows,
          },
        ]);
        break;
      }
      case 'infractions': {
        const listHeader = [
          'Date',
          'Nature',
          'Code visé',
          'Article',
          'Agent verbalisateur',
          'Région',
          'Département',
          'Montant (FCFA)',
          'N° Quittance',
        ];
        const allInfractions = filteredInfractionsData || [];
        const listRows: (string | number)[][] = allInfractions.map((row: any) => [
          row.date_infraction ? new Date(row.date_infraction).toLocaleDateString('fr-FR') : '',
          row.nature || row.item_nature || '',
          row.code || '',
          row.article_code || row.item_article || '',
          [row.agent_prenom, row.agent_nom].filter(Boolean).join(' '),
          row.region ? REGION_LABELS[exportRegionKey(row.region)] || prettyRegion(row.region) : '',
          row.departement || '',
          Number(row.montant_chiffre || 0),
          row.numero_quittance || '',
        ]);

        const isForestierInfraction = (row: any): boolean => {
          const codeNorm = removeDiacritics(String(row.code || '').toLowerCase());
          const natNorm = removeDiacritics(String(row.nature || row.item_nature || '').toLowerCase());
          if (codeNorm.includes('chasse') || codeNorm.includes('faune')) return false;
          if (codeNorm.includes('forest')) return true;
          if (
            natNorm.includes('chasse') ||
            natNorm.includes('gibier') ||
            natNorm.includes('ivoire') ||
            natNorm.includes('faune') ||
            natNorm.includes('braconn') ||
            natNorm.includes('trophee')
          ) {
            return false;
          }
          if (
            natNorm.includes('arbre') ||
            natNorm.includes('bois') ||
            natNorm.includes('charbon') ||
            natNorm.includes('foret') ||
            natNorm.includes('forest') ||
            natNorm.includes('defrich') ||
            natNorm.includes('coupe') ||
            natNorm.includes('elagage')
          ) {
            return true;
          }
          return false;
        };

        const buildContentieuxSheet = (
          rowsSubset: any[]
        ): { rows: (string | number)[][]; merges: string[] } => {
          // Sous-en-tête (ligne 2) sous Transactions (D1:F1 fusionné) -> D2: Transigés, E2: Montant, F2: Instance
          const sheetRows: (string | number)[][] = [
            ['', '', '', 'Transigés', 'Montant', 'Instance', ''],
          ];
          const merges: string[] = ['A1:A2', 'B1:B2', 'C1:C2', 'D1:F1', 'G1:G2'];

          // Regrouper par Région -> Nature d'infraction
          const byRegion = new Map<
            string,
            {
              regionLabel: string;
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

          for (const row of rowsSubset) {
            const regKey = exportRegionKey(row.region || row.created_by_region || 'non défini');
            const regLabel =
              REGION_LABELS[regKey] ||
              prettyRegion(row.region || row.created_by_region || 'Non défini');
            const natureRaw = String(row.nature || row.item_nature || 'Non spécifiée')
              .replace(/\s+/g, ' ')
              .trim();
            const natureKey = removeDiacritics(natureRaw.toLowerCase())
              .replace(/['’`]+/g, "'")
              .replace(/\s+/g, ' ')
              .trim();

            const regEntry = byRegion.get(regKey) || {
              regionLabel: regLabel,
              byNature: new Map(),
            };
            const natEntry = regEntry.byNature.get(natureKey) || {
              natureLabel: natureRaw,
              nbrPv: 0,
              transiges: 0,
              montant: 0,
              instance: 0,
              tribunal: 0,
            };

            natEntry.nbrPv += 1;

            const montant = Number(row.montant_chiffre || 0);
            const hasQuittance = Boolean(row.numero_quittance && String(row.numero_quittance).trim());
            const obsNorm = removeDiacritics(String(row.observations || '').trim().toLowerCase());
            const isTribunal =
              obsNorm.includes('tribunal') ||
              obsNorm.includes('justice') ||
              obsNorm.includes('defere') ||
              obsNorm.includes('parquet');

            if (isTribunal) {
              natEntry.tribunal += 1;
            } else if (montant > 0 || hasQuittance) {
              natEntry.transiges += 1;
              natEntry.montant += montant;
            } else {
              // Transaction en instance (non encore réglée et non déférée au tribunal)
              natEntry.instance += 1;
            }

            regEntry.byNature.set(natureKey, natEntry);
            byRegion.set(regKey, regEntry);
          }

          let totalPv = 0;
          let totalTransiges = 0;
          let totalMontant = 0;
          let totalInstance = 0;
          let totalTribunal = 0;

          const sortedRegions = Array.from(byRegion.values()).sort((a, b) =>
            a.regionLabel.localeCompare(b.regionLabel)
          );

          // Les lignes de données commencent à la ligne Excel 3 (ligne 1 = headers, ligne 2 = sous-en-tête)
          let currentExcelRow = 3;

          for (const reg of sortedRegions) {
            const natures = Array.from(reg.byNature.values()).sort((a, b) =>
              a.natureLabel.localeCompare(b.natureLabel)
            );
            const startRow = currentExcelRow;
            natures.forEach((nat, idx) => {
              totalPv += nat.nbrPv;
              totalTransiges += nat.transiges;
              totalMontant += nat.montant;
              totalInstance += nat.instance;
              totalTribunal += nat.tribunal;

              sheetRows.push([
                idx === 0 ? reg.regionLabel : '',
                nat.natureLabel,
                nat.nbrPv,
                nat.transiges,
                nat.montant > 0 ? nat.montant : '',
                nat.instance,
                nat.tribunal,
              ]);
              currentExcelRow += 1;
            });
            const endRow = currentExcelRow - 1;
            // Fusionner verticalement la cellule Région (colonne A) si plusieurs natures d'infractions dans la même région
            if (endRow > startRow) {
              merges.push(`A${startRow}:A${endRow}`);
            }
          }

          const curYear = new Date().getFullYear();
          sheetRows.push([
            `Total ${curYear}`,
            '',
            totalPv,
            totalTransiges,
            totalMontant,
            totalInstance,
            totalTribunal,
          ]);
          merges.push(`A${currentExcelRow}:B${currentExcelRow}`);

          return { rows: sheetRows, merges };
        };

        const chasseInfractions = allInfractions.filter((r: any) => !isForestierInfraction(r));
        const forestierInfractions = allInfractions.filter((r: any) => isForestierInfraction(r));

        const contentieuxHeader = [
          'Régions',
          'Nature infraction',
          'Nbr P.V',
          'Transactions',
          '',
          '',
          'Tribunal',
        ];

        const chasseSheet = buildContentieuxSheet(chasseInfractions);
        const forestierSheet = buildContentieuxSheet(forestierInfractions);

        exportMultiSheetXlsx('infractions_national.xlsx', [
          {
            name: 'Liste des infractions',
            headers: listHeader,
            rows: listRows,
          },
          {
            name: 'Contentieux de la chasse',
            headers: contentieuxHeader,
            rows: chasseSheet.rows,
            merges: chasseSheet.merges,
          },
          {
            name: 'Contentieux forestier',
            headers: contentieuxHeader,
            rows: forestierSheet.rows,
            merges: forestierSheet.merges,
          },
        ]);
        break;
      }
      case 'alertes':
        exportAlertsCsv();
        break;
      case 'recette':
        exportRevenueCsv();
        break;
      case 'armes':
        exportWeaponsCsv();
        break;
      default:
        break;
    }
  };

  // Synchroniser automatiquement les filtres territoriaux en mode pilotage embarqué
  useEffect(() => {
    if (!territorialScope) return;
    if (lockedRegionKey && lockedRegionLabel) {
      setStatsRegionFilter(lockedRegionKey);
      setCategoriesRegionFilter(lockedRegionKey);
      setSpeciesRegionFilter(lockedRegionKey);
      setInfractionsRegionFilter(lockedRegionKey);
      setAlertRegionFilter(lockedRegionKey);
      setRevenueRegion(lockedRegionLabel);
      setWeaponRegionFilter(lockedRegionLabel);
      setRevenueGroupBy("departement");
      setInfraGroupBy("departement");
    }
  }, [territorialScope, lockedRegionKey, lockedRegionLabel]);

  // Exposer handleExportActiveTab au parent (/pilotage) pour un bouton unique "Exporter Excel"
  const exportRef = useRef(handleExportActiveTab);
  exportRef.current = handleExportActiveTab;
  useEffect(() => {
    if (!onRegisterExport) return;
    onRegisterExport(() => exportRef.current());
    return () => {
      onRegisterExport(null);
    };
  }, [onRegisterExport]);

  // Élargir le conteneur parent (page-frame-inner) pour ce tableau de bord
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (embedded) return;
    const el = rootRef.current?.closest('.page-frame-inner');
    if (el) el.classList.add('page-frame-wide');
    return () => { if (el) el.classList.remove('page-frame-wide'); };
  }, [embedded]);

  return (
    <div ref={rootRef} className={embedded ? "w-full" : "w-full py-6"} id={embedded ? "pilotage-chasse-stats" : "national-print"}>
        <div className="flex flex-col space-y-4">
          {!embedded && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold">Tableau de Bord National de la Chasse</h1>
                <p className="text-sm text-muted-foreground">
                  Vue d'ensemble des activités de chasse au niveau national
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-end print:hidden">
                <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm" onClick={handleExportActiveTab}>
                  <FileDown className="w-4 h-4" />
                  Exporter
                </Button>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            {!hideEmbeddedTabs && (
            <div className="overflow-x-auto">
            <TabsList className="border rounded-lg bg-white shadow-sm p-1 inline-grid grid-flow-col auto-cols-max min-w-[640px]">
              {!embedded && (
                <TabsTrigger
                  value="overview"
                  className="text-slate-600 data-[state=active]:bg-slate-50 data-[state=active]:text-slate-700"
                >
                  Vue d'ensemble
                </TabsTrigger>
              )}
              <TabsTrigger
                value="regions"
                className="text-emerald-600 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
              >
                {regionsTabLabel}
              </TabsTrigger>
              <TabsTrigger
                value="categories"
                className="text-blue-600 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700"
              >
                Catégories de permis
              </TabsTrigger>
              <TabsTrigger
                value="especes"
                className="text-red-600 data-[state=active]:bg-red-50 data-[state=active]:text-red-700"
              >
                Espèces chassées
              </TabsTrigger>
              <TabsTrigger
                value="infractions"
                className="text-amber-600 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700"
              >
                Infractions
              </TabsTrigger>
              <TabsTrigger
                value="alertes"
                className="text-fuchsia-700 data-[state=active]:bg-fuchsia-50 data-[state=active]:text-fuchsia-800"
              >
                Alertes
              </TabsTrigger>
              <TabsTrigger
                value="recette"
                className="text-purple-700 data-[state=active]:bg-purple-50 data-[state=active]:text-purple-800"
              >
                Recettes
              </TabsTrigger>
              <TabsTrigger
                value="armes"
                className="text-orange-600 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700"
              >
                Armes
              </TabsTrigger>
            </TabsList>
            </div>
            )}

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <Card className="text-center">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Permis actifs</CardTitle>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-4xl font-bold">{aggregates?.activePermitCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Total permis: {aggregates?.permitCount ?? 0}</p>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Taxes</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-4xl font-bold">{aggregates?.taxCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Nombre d'enregistrements</p>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Infractions</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-4xl font-bold">{aggregates?.infractionsCount ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Procès-verbaux enregistrés</p>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Prélèvements</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-4xl font-bold">{aggregates?.totalPiecesAbattues ?? 0}</div>
                    <p className="text-xs text-muted-foreground">Déclarations (à connecter)</p>
                  </CardContent>
                </Card>

                <Card className="text-center">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Recette</CardTitle>
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="text-4xl font-bold">{
                      ((aggregates?.revenue ?? 0) + Number(infraStats?.montant_total ?? 0)).toLocaleString('fr-FR')
                    } FCFA</div>
                    <p className="text-xs text-muted-foreground">Permis + Taxes</p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <PieChartIcon className="h-5 w-5" />
                      Répartition des permis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={permisData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                          {permisData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={PERMIT_COLORS[index] || COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>


                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                      <BarChartIcon className="h-5 w-5" />
                      Activité par région (Top 5)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topRegions}
                        layout="vertical"
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        {/* Axe pour les comptages (pièces, permis) */}
                        <XAxis xAxisId="count" type="number" allowDecimals={false} domain={[0, 'auto']} />
                        {/* Axe séparé pour les montants (recette) pour éviter l'écrasement visuel */}
                        <XAxis xAxisId="money" type="number" orientation="top" hide domain={[0, 'auto']} />
                        <YAxis dataKey="region" type="category" width={100} />
                        <Tooltip />
                        <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ width: '100%', textAlign: 'center' }} />
                        {/* Prélèvements: rouge clair */}
                        <Bar xAxisId="count" dataKey="piecesAbattues" name="Prélèvements" fill="#f00002" />
                        {/* Recette: prendre la couleur actuelle des permis (orange) */}
                        <Bar xAxisId="money" dataKey="revenue" name="Recette (FCFA)" fill="#ffc658" />
                        {/* Permis actifs: en bleu */}
                        <Bar xAxisId="count" dataKey="activePermits" name="Permis actifs" fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            </TabsContent>
            <TabsContent value="infractions" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" /> Liste des infractions
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    {isSubZoneMode ? (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium whitespace-nowrap">{geoUnitLabel} :</Label>
                        <Select value={infractionsSubZoneFilter} onValueChange={setInfractionsSubZoneFilter}>
                          <SelectTrigger className="w-[210px]">
                            <SelectValue placeholder={geoUnitPlural} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">{geoUnitPlural}</SelectItem>
                            {infractionsSubZoneOptions.map((zone) => (
                              <SelectItem key={zone} value={zone}>
                                {zone}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                        <Select value={infractionsRegionFilter} onValueChange={setInfractionsRegionFilter} disabled={isRegionLocked}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Toutes les régions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">Toutes les régions</SelectItem>
                            {infractionsRegionOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {infractionsLoading ? (
                    <div>Chargement...</div>
                  ) : (
                    <>
                      {infractionsMonthlyData.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Aucune donnée mensuelle disponible.</div>
                      ) : (
                        <div className="h-[380px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={infractionsMonthlyData} margin={{ top: 16, right: 28, left: 12, bottom: 16 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                              <YAxis
                                yAxisId="left"
                                allowDecimals={false}
                                tick={{ fontSize: 12 }}
                                label={{
                                  value: "Infractions",
                                  angle: -90,
                                  position: "insideLeft",
                                  offset: 0,
                                  style: { fontSize: 11, fill: "#64748b", textAnchor: "middle" },
                                }}
                              />
                              <YAxis
                                yAxisId="right"
                                orientation="right"
                                tick={{ fontSize: 11, fill: "#059669" }}
                                tickFormatter={(v: number) =>
                                  v >= 1_000_000
                                    ? `${(v / 1_000_000).toFixed(1)}M`
                                    : v >= 1_000
                                      ? `${Math.round(v / 1_000)}k`
                                      : `${v}`
                                }
                                label={{
                                  value: "Montant (FCFA)",
                                  angle: 90,
                                  position: "insideRight",
                                  offset: 0,
                                  style: { fontSize: 11, fill: "#059669", textAnchor: "middle" },
                                }}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (!active || !payload || payload.length === 0) return null;
                                  const row = payload[0]?.payload;
                                  if (!row) return null;
                                  const amountsByZone: Record<string, number> = row.amountsByZone || {};
                                  const activeZones = infractionChartZones.filter((z) => Number(row[z] || 0) > 0);
                                  return (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-md text-xs space-y-1.5 min-w-[210px]">
                                      <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1 capitalize">
                                        {label}
                                      </div>
                                      {activeZones.length > 0 ? (
                                        <div className="space-y-1">
                                          {activeZones.map((zone) => {
                                            const colorIdx = infractionChartZones.indexOf(zone);
                                            const color = INFRACTION_ZONE_COLORS[colorIdx % INFRACTION_ZONE_COLORS.length];
                                            const count = Number(row[zone] || 0);
                                            const amt = Number(amountsByZone[zone] || 0);
                                            return (
                                              <div key={zone} className="flex items-center justify-between gap-4">
                                                <span className="flex items-center gap-1.5 text-slate-700">
                                                  <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                                                  <span className="font-medium">{zone}</span>
                                                </span>
                                                <span className="text-slate-900 tabular-nums">
                                                  <strong>{count}</strong>
                                                  {amt > 0 && (
                                                    <span className="text-emerald-700 ml-1.5">
                                                      ({amt.toLocaleString('fr-FR')} FCFA)
                                                    </span>
                                                  )}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <div className="text-slate-500">Aucune infraction sur ce mois</div>
                                      )}
                                      <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between gap-4 font-semibold text-slate-900">
                                        <span>Total ({Number(row.totalInfractions || 0)} infr.)</span>
                                        <span className="text-emerald-700 tabular-nums">
                                          {Number(row.montant || 0).toLocaleString('fr-FR')} FCFA
                                        </span>
                                      </div>
                                    </div>
                                  );
                                }}
                              />
                              <Legend />
                              {infractionChartZones.length > 0 ? (
                                infractionChartZones.map((zone, idx) => (
                                  <Bar
                                    key={zone}
                                    yAxisId="left"
                                    dataKey={zone}
                                    name={zone}
                                    stackId="infractions"
                                    fill={INFRACTION_ZONE_COLORS[idx % INFRACTION_ZONE_COLORS.length]}
                                    radius={idx === infractionChartZones.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                    maxBarSize={42}
                                  />
                                ))
                              ) : (
                                <Bar
                                  yAxisId="left"
                                  dataKey="totalInfractions"
                                  name={`Infractions (par ${geoUnitLower})`}
                                  fill="#f97316"
                                  radius={[4, 4, 0, 0]}
                                  maxBarSize={42}
                                />
                              )}
                              <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="montant"
                                name="Montant (FCFA)"
                                stroke="#059669"
                                strokeWidth={2.5}
                                dot={{ r: 4, fill: "#059669" }}
                                activeDot={{ r: 6 }}
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      <div className="border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-semibold text-slate-800">
                            Détail des infractions ({displayedInfractionsData.length})
                          </h4>
                        </div>
                        {displayedInfractionsData.length === 0 ? (
                          <div className="text-sm text-muted-foreground">Aucune infraction trouvée.</div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nature</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code visé</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Article</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agent verbalisateur</th>
                                  {!isSubZoneMode && (
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                                  )}
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{geoUnitLabel}</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {(displayedInfractionsData || []).map((row: any) => (
                                  <tr key={row.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{row.date_infraction ? new Date(row.date_infraction).toLocaleDateString('fr-FR') : ''}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{row.nature || ''}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{row.code || ''}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{row.article_code || ''}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{[row.agent_prenom, row.agent_nom].filter(Boolean).join(' ')}</td>
                                    {!isSubZoneMode && (
                                      <td className="px-4 py-2 whitespace-nowrap text-sm">{row.region || ''}</td>
                                    )}
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{prettyDepartment(row.departement)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-medium text-emerald-700">
                                      {Number(row.montant_chiffre || 0).toLocaleString('fr-FR')} FCFA
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">
                                      <Button size="sm" variant="outline" onClick={()=> setViewInfraction(row)}>Voir</Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
              {/* Dialog de détails d'infraction */}
              <Dialog open={!!viewInfraction} onOpenChange={(o)=> !o && setViewInfraction(null)}>
                <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Détails de l'infraction</DialogTitle>
                  </DialogHeader>
                  {viewInfraction && (()=>{
                    const vi: any = viewInfraction;
                    const photoInfractionUrl = getBlobUrl(vi.photo_infraction);
                    const photoQuittanceUrl = getBlobUrl(vi.photo_quittance);
                    const offenders: any[] = Array.isArray(vi.contrevenants) ? vi.contrevenants : [];
                    const primary = offenders[0];
                    const fullPrimary = primary ? (Array.isArray(allContrevenants) ? allContrevenants : []).find((x: any)=> x.id === primary.id) : null;
                    const primaryPhoto = getBlobUrl(fullPrimary?.photo);
                    const primaryPiece = getBlobUrl(fullPrimary?.piece_identite);
                    const primaryBio = getBlobUrl(fullPrimary?.donnees_biometriques);
                    const dateStr = vi.date_infraction ? new Date(vi.date_infraction).toLocaleString('fr-FR') : '—';
                    const createdStr = vi.created_at ? new Date(vi.created_at).toLocaleString('fr-FR') : null;
                    return (
                      <div className="space-y-4">
                        {/* Top responsive layout */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {/* Left: Primary offender card */}
                          <div className="border rounded p-2 space-y-2">
                            <div className="text-xs font-semibold text-center">Contrevenant</div>
                            {contrevenantsLoading ? (
                              <div className="text-xs text-muted-foreground">Chargement...</div>
                            ) : primary ? (
                              <>
                                {/* Large photo with caption */}
                                {primaryPhoto ? (
                                  <div>
                                    <img
                                      src={primaryPhoto}
                                      alt="Photo contrevenant"
                                      className="w-full h-32 object-cover rounded border cursor-zoom-in"
                                      onClick={()=> setImagePreview(primaryPhoto)}
                                    />
                                    <div className="mt-1 text-center text-xs font-medium">{[primary?.prenom, primary?.nom].filter(Boolean).join(' ')}</div>
                                  </div>
                                ) : (
                                  <div className="h-32 w-full rounded border flex items-center justify-center text-xs text-muted-foreground">Aucune photo</div>
                                )}
                                {/* Piece and biometrics as thumbnails */}
                                <div className="flex gap-2 justify-center">
                                  {primaryPiece && (
                                    <img
                                      src={primaryPiece}
                                      alt="Pièce d'identité"
                                      className="h-12 w-12 object-cover rounded border cursor-zoom-in"
                                      onClick={()=> setImagePreview(primaryPiece)}
                                    />
                                  )}
                                  {primaryBio && (
                                    <img
                                      src={primaryBio}
                                      alt="Données biométriques"
                                      className="h-12 w-12 object-cover rounded border cursor-zoom-in"
                                      onClick={()=> setImagePreview(primaryBio)}
                                    />
                                  )}
                                </div>
                                {/* Card-side info */}
                                <div className="text-xs text-muted-foreground text-center">
                                  {fullPrimary?.type_piece || '—'} • {fullPrimary?.numero_piece || primary?.numero_piece || '—'}
                                </div>
                                {fullPrimary?.filiation && (
                                  <div className="text-xs text-center">Filiation: {fullPrimary.filiation}</div>
                                )}
                              </>
                            ) : (
                              <div className="text-xs text-muted-foreground">Aucun contrevenant lié</div>
                            )}
                          </div>

                          {/* Combined Info section */}
                          <div className="border rounded p-3 space-y-3">
                            <div className="text-sm font-semibold text-center">Informations de l'infraction</div>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Nature:</span>
                                <span className="font-medium">{vi.nature || '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Code visé:</span>
                                <span className="font-medium">{vi.code || '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Article:</span>
                                <span className="font-medium">{vi.article_code || '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Agent verbalisateur:</span>
                                <span className="font-medium">{[vi.agent_prenom, vi.agent_nom].filter(Boolean).join(' ') || '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Date infraction:</span>
                                <span className="font-medium">{dateStr}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Enregistré le:</span>
                                <span className="font-medium">{createdStr || '—'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Lieu:</span>
                                <span className="font-medium">{[vi.region, vi.departement, vi.commune].filter(Boolean).join(' / ') || '—'}</span>
                              </div>
                              <hr className="my-2" />
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Montant:</span>
                                <span className="font-semibold text-lg">{Number(vi.montant_chiffre || 0).toLocaleString('fr-FR')} FCFA</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">N° Quittance:</span>
                                <span className="font-semibold">{vi.numero_quittance || '—'}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Bottom media section */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="border rounded p-2">
                            <div className="text-xs font-semibold mb-1 text-center">Photo infraction</div>
                            {photoInfractionUrl ? (
                              <img
                                src={photoInfractionUrl}
                                alt="Infraction"
                                className="w-full h-24 object-cover rounded border cursor-zoom-in"
                                onClick={()=> setImagePreview(photoInfractionUrl)}
                              />
                            ) : (
                              <div className="h-24 rounded border flex items-center justify-center text-xs text-muted-foreground">Aucune image</div>
                            )}
                          </div>
                          <div className="border rounded p-2">
                            <div className="text-xs font-semibold mb-1 text-center">Quittance</div>
                            {photoQuittanceUrl ? (
                              <img
                                src={photoQuittanceUrl}
                                alt="Quittance"
                                className="w-full h-24 object-cover rounded border cursor-zoom-in"
                                onClick={()=> setImagePreview(photoQuittanceUrl)}
                              />
                            ) : (
                              <div className="h-24 rounded border flex items-center justify-center text-xs text-muted-foreground">Aucune image</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  <DialogFooter>
                    <Button variant="secondary" onClick={()=> setViewInfraction(null)}>Fermer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {/* Image Preview Dialog */}
              <Dialog open={!!imagePreview} onOpenChange={(o)=> !o && setImagePreview(null)}>
                <DialogContent className="max-w-4xl">
                  <img src={imagePreview || ''} alt="Aperçu" className="w-full h-auto object-contain rounded" />
                </DialogContent>
              </Dialog>
            </TabsContent>
            <TabsContent value="recette" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pb-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <CardTitle className="flex items-center gap-2 shrink-0">
                      <Wallet className="h-5 w-5" /> Recettes
                    </CardTitle>
                    {revenueView === 'table' && (
                      <div className="flex flex-wrap items-center gap-3 print:hidden">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium whitespace-nowrap">Grouper par :</Label>
                          <Select value={revenueGroupBy} onValueChange={(v)=> setRevenueGroupBy(v as any)}>
                            <SelectTrigger className="h-9 w-[165px]"><SelectValue placeholder="Groupe" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="region">Région</SelectItem>
                              <SelectItem value="departement">Département</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                          <Select value={revenueRegion} onValueChange={setRevenueRegion} disabled={isRegionLocked}>
                            <SelectTrigger className="h-9 w-[185px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="toutes">Toutes</SelectItem>
                              {Array.from(
                                new Set([
                                  ...(byRegion || []).map((r) => prettyRegion(r.region)),
                                  ...(infractionsData || [])
                                    .filter((inf) => Number(inf.montant_chiffre || 0) > 0 && inf.region)
                                    .map((inf) => prettyRegion(inf.region || '')),
                                ].filter(Boolean))
                              )
                                .sort((a, b) => a.localeCompare(b))
                                .map((r) => (
                                  <SelectItem key={r} value={r}>
                                    {r}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start lg:self-auto shrink-0"
                    onClick={() => setRevenueView((prev) => (prev === 'table' ? 'chart' : 'table'))}
                  >
                    {revenueView === 'table' ? 'Voir évolution mensuelle' : 'Voir la vue détaillée'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {revenueView === 'chart' ? (
                    revenueByMonthLoading ? (
                      <div>Chargement des données mensuelles...</div>
                    ) : (revenueMonthlyData.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Aucune donnée mensuelle disponible pour les recettes.</div>
                    ) : (
                      <div className="bg-white rounded-lg border p-4 h-[460px]">
                        <h4 className="text-sm font-semibold mb-3">Évolution mensuelle des recettes (FCFA)</h4>
                        <ResponsiveContainer width="100%" height="92%">
                          <BarChart data={revenueMonthlyData} margin={{ top: 12, right: 24, left: 12, bottom: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                            <YAxis
                              allowDecimals={false}
                              tick={{ fontSize: 12 }}
                              tickFormatter={(value) => Number(value).toLocaleString('fr-FR')}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const visibleItems = payload.filter((entry: any) => {
                                  const val = Number(entry?.value || 0);
                                  if (val <= 0) return false;
                                  if (hoveredRevenueGroup === 'contentieux') {
                                    return entry.dataKey === 'infractions';
                                  }
                                  if (hoveredRevenueGroup === 'domanial') {
                                    return entry.dataKey === 'permits' || entry.dataKey === 'taxes';
                                  }
                                  return true;
                                });
                                if (visibleItems.length === 0) return null;
                                return (
                                  <div className="bg-white border border-gray-200 rounded-md shadow-md px-3 py-2 text-sm">
                                    <div className="font-medium text-gray-900 mb-1">{label}</div>
                                    {visibleItems.map((entry: any) => (
                                      <div
                                        key={entry.dataKey}
                                        className="py-0.5 font-medium"
                                        style={{ color: entry.color || entry.fill }}
                                      >
                                        {entry.name} : {Number(entry.value || 0).toLocaleString('fr-FR')} FCFA
                                      </div>
                                    ))}
                                  </div>
                                );
                              }}
                            />
                            <Legend />
                            <Bar
                              dataKey="permits"
                              name="Permis"
                              fill="#2563eb"
                              radius={[4, 4, 0, 0]}
                              onMouseEnter={() => setHoveredRevenueGroup('domanial')}
                              onMouseLeave={() => setHoveredRevenueGroup(null)}
                            />
                            <Bar
                              dataKey="taxes"
                              name="Taxes d'abattage"
                              fill="#10b981"
                              radius={[4, 4, 0, 0]}
                              onMouseEnter={() => setHoveredRevenueGroup('domanial')}
                              onMouseLeave={() => setHoveredRevenueGroup(null)}
                            />
                            <Bar
                              dataKey="infractions"
                              name="Contentieux (Infractions)"
                              fill="#f97316"
                              radius={[4, 4, 0, 0]}
                              onMouseEnter={() => setHoveredRevenueGroup('contentieux')}
                              onMouseLeave={() => setHoveredRevenueGroup(null)}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">
                            Total (Permis + Taxes + Licences + Infractions){revenueRegion !== 'toutes' ? ` — ${revenueRegion}` : ''}
                          </p>
                          <div className="text-2xl font-bold">
                            {selectedRegionRevenueBreakdown.total.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">
                            Permis + Taxe d'abattage{revenueRegion !== 'toutes' ? ` — ${revenueRegion}` : ''}
                          </p>
                          <div className="text-2xl font-bold">
                            {selectedRegionRevenueBreakdown.permitTax.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">
                            Licence + Taxe d'amodiation{revenueRegion !== 'toutes' ? ` — ${revenueRegion}` : ''}
                          </p>
                          <div className="text-2xl font-bold">
                            {selectedRegionRevenueBreakdown.licenceAmodiation.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">
                            Infractions{revenueRegion !== 'toutes' ? ` — ${revenueRegion}` : ''}
                          </p>
                          <div className="text-2xl font-bold">
                            {selectedRegionRevenueBreakdown.infractions.toLocaleString('fr-FR')} FCFA
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg border p-4 h-[460px]">
                        <h4 className="text-sm font-semibold mb-2">
                          {revenueGroupBy === 'region' && revenueRegion !== 'toutes'
                            ? `Répartition des recettes pour ${revenueRegion} (Permis, Taxes, Licences/Amodiations et Infractions)`
                            : revenueGroupBy === 'region'
                            ? 'Répartition des recettes par région'
                            : `Répartition des recettes par département${revenueRegion !== 'toutes' ? ` (${revenueRegion})` : ''}`}
                        </h4>
                        {revenueGroupBy === 'departement' && revenueByDepartmentLoading ? (
                          <div>Chargement des données par département...</div>
                        ) : revenueGroupBy === 'region' && revenueRegion !== 'toutes' ? (
                          selectedRegionPieData.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              Aucune recette enregistrée pour {revenueRegion}.
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height="92%">
                              <PieChart>
                                <Pie
                                  data={selectedRegionPieData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={true}
                                  outerRadius={148}
                                  dataKey="value"
                                  nameKey="name"
                                  label={({ name, value, percent }) =>
                                    `${name} : ${Number(value || 0).toLocaleString('fr-FR')} FCFA (${(percent * 100).toFixed(0)}%)`
                                  }
                                >
                                  {selectedRegionPieData.map((entry) => (
                                    <Cell key={`reg-type-${entry.name}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(v: any, name: any) => [
                                    `${Number(v || 0).toLocaleString('fr-FR')} FCFA`,
                                    String(name || 'Montant'),
                                  ]}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          )
                        ) : filteredRevenueRows.filter((r) => Number(r.revenue || 0) > 0).length === 0 ? (
                          <div className="text-sm text-muted-foreground">Aucune donnée disponible.</div>
                        ) : (
                          <ResponsiveContainer width="100%" height="92%">
                            <PieChart>
                              <Pie
                                data={revenueChartData.filter((r) => Number(r.revenue || 0) > 0)}
                                cx="50%"
                                cy="50%"
                                labelLine={true}
                                outerRadius={148}
                                fill="#7c3aed"
                                dataKey="revenue"
                                nameKey="label"
                                label={({ label, revenue, percent }) =>
                                  `${label} : ${Number(revenue || 0).toLocaleString('fr-FR')} FCFA (${(percent * 100).toFixed(0)}%)`
                                }
                              >
                                {revenueChartData
                                  .filter((r) => Number(r.revenue || 0) > 0)
                                  .map((entry, index) => (
                                    <Cell key={`rev-pie-${entry.key || index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                              </Pie>
                              <Tooltip
                                formatter={(v: any, name: any) => [
                                  `${Number(v || 0).toLocaleString('fr-FR')} FCFA`,
                                  String(name || 'Recette'),
                                ]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="alertes" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pb-3">
                  <CardTitle className="flex items-center gap-2 shrink-0">
                    <AlertTriangle className="h-5 w-5" /> Alertes
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Période :</Label>
                      <Select value={alertPeriod} onValueChange={(v)=> setAlertPeriod(v as any)}>
                        <SelectTrigger className="h-9 w-[165px]"><SelectValue placeholder="Période" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week">Semaine en cours</SelectItem>
                          <SelectItem value="month">Mois en cours</SelectItem>
                          <SelectItem value="year">Année en cours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Nature :</Label>
                      <Select value={alertNature} onValueChange={setAlertNature}>
                        <SelectTrigger className="h-9 w-[190px]"><SelectValue placeholder="Nature" /></SelectTrigger>
                        <SelectContent>
                          {alertNatures.map(n => (
                            <SelectItem key={n} value={n}>{n.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {isSubZoneMode ? (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium whitespace-nowrap">{geoUnitLabel} :</Label>
                        <Select value={alertSubZoneFilter} onValueChange={setAlertSubZoneFilter}>
                          <SelectTrigger className="h-9 w-[195px]"><SelectValue placeholder={geoUnitPlural} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">{geoUnitPlural}</SelectItem>
                            {alertSubZoneOptions.map((zone) => (
                              <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                        <Select value={alertRegionFilter} onValueChange={setAlertRegionFilter} disabled={isRegionLocked}>
                          <SelectTrigger className="h-9 w-[185px]"><SelectValue placeholder="Toutes les régions" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">Toutes les régions</SelectItem>
                            {alertRegionOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">

                  {alertsLoading ? (
                    <div>Chargement...</div>
                  ) : (displayedMapAlerts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      Aucune alerte trouvée pour la période sélectionnée.
                      Essayez de passer la période sur « Année en cours » ou retirez le filtre de nature.
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nature</th>
                              {groupedAlerts.regions.map(reg => (
                                <th key={reg} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{reg}</th>
                              ))}
                              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {groupedAlerts.rows.map((row) => (
                              <tr key={row.nature}>
                                <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{String(row.nature || '').toUpperCase()}</td>
                                {groupedAlerts.regions.map(reg => (
                                  <td key={reg} className="px-4 py-2 whitespace-nowrap text-sm text-right">{Number(row[reg] || 0).toLocaleString('fr-FR')}</td>
                                ))}
                                <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold">{Number(row.total || 0).toLocaleString('fr-FR')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 mt-6">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date/Heure</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nature</th>
                              {!isSubZoneMode && (
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                              )}
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{geoUnitLabel}</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expéditeur</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grade</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lieu de service</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(displayedMapAlerts || []).map((a) => {
                              const senderName = [a.sender?.first_name || '', a.sender?.last_name || ''].filter(Boolean).join(' ').trim();
                              const service = a.sender?.role === 'agent' || a.sender?.role === 'sub-agent'
                                ? [a.sender?.region, a.sender?.departement].filter(Boolean).join(' / ')
                                : (a.sender?.region || a.sender?.departement || '')
                              return (
                                <tr key={a.id}>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{a.created_at ? new Date(a.created_at as any).toLocaleString('fr-FR') : ''}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{(a.nature || '').toUpperCase()}</td>
                                  {!isSubZoneMode && (
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{prettyRegion(a.region || '')}</td>
                                  )}
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{prettyDepartment(a.departement)}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{senderName}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{a.sender?.grade || '—'}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{service}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="categories" className="space-y-4">
              {isSubZoneMode ? (
                  <div className="space-y-4">
                    {(() => {
                      const fluxRows = territorialScope?.monthlyFlux || [];
                      const peakResident = fluxRows.reduce<TerritorialMonthlyFluxRow | null>(
                        (best, r) => (r.huntersResident > (best?.huntersResident ?? 0) ? r : best),
                        null
                      );
                      const peakTouriste = fluxRows.reduce<TerritorialMonthlyFluxRow | null>(
                        (best, r) => (r.huntersTouriste > (best?.huntersTouriste ?? 0) ? r : best),
                        null
                      );
                      const peakPermits = fluxRows.reduce<TerritorialMonthlyFluxRow | null>(
                        (best, r) => (r.permitsTotal > (best?.permitsTotal ?? 0) ? r : best),
                        null
                      );
                      const pieEntries = subZoneStatsRows
                        .filter((z) => z.activePermits > 0)
                        .map((z) => ({ key: z.zone, name: z.zone, value: z.activePermits }));
                      const pieTotal = pieEntries.reduce((s, e) => s + e.value, 0) || 1;

                      return (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle>Flux mensuel des Chasseurs enregistrés &amp; Permis délivrés</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Suivi mensuel par catégorie de chasseur et comparaison avec les permis délivrés par {geoUnitLower}
                            </p>
                          </CardHeader>
                          <CardContent className="space-y-5">
                            {/* Bandeau des 3 mois pics */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-xl border border-blue-200 bg-blue-50/50 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Pic Résidents</div>
                                  <div className="text-lg font-extrabold text-blue-950 capitalize mt-0.5">
                                    {peakResident ? peakResident.label : "Aucun"}
                                  </div>
                                </div>
                                <div className="text-2xl font-extrabold text-blue-700 tabular-nums">
                                  {peakResident ? peakResident.huntersResident.toLocaleString("fr-FR") : 0}
                                </div>
                              </div>

                              <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Pic Touristes</div>
                                  <div className="text-lg font-extrabold text-amber-950 capitalize mt-0.5">
                                    {peakTouriste ? peakTouriste.label : "Aucun"}
                                  </div>
                                </div>
                                <div className="text-2xl font-extrabold text-amber-700 tabular-nums">
                                  {peakTouriste ? peakTouriste.huntersTouriste.toLocaleString("fr-FR") : 0}
                                </div>
                              </div>

                              <div className="rounded-xl border border-purple-200 bg-purple-50/50 px-4 py-3 flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-purple-800 uppercase tracking-wide">Pic Permis délivrés</div>
                                  <div className="text-lg font-extrabold text-purple-950 capitalize mt-0.5">
                                    {peakPermits ? peakPermits.label : "Aucun"}
                                  </div>
                                </div>
                                <div className="text-2xl font-extrabold text-purple-700 tabular-nums">
                                  {peakPermits ? peakPermits.permitsTotal.toLocaleString("fr-FR") : 0}
                                </div>
                              </div>
                            </div>

                            {/* Graphique combiné mensuel + Camembert par département */}
                            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
                              <div className="xl:col-span-8 rounded-xl border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-800 mb-3">
                                  Évolution mensuelle : Chasseurs enregistrés (barres) &amp; Permis délivrés (courbe)
                                </h4>
                                <div className="h-[360px]">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={fluxRows} margin={{ top: 12, right: 20, left: 0, bottom: 12 }}>
                                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                      <Tooltip
                                        content={({ active, payload, label }) => {
                                          if (!active || !payload || payload.length === 0) return null;
                                          const row = payload[0]?.payload as TerritorialMonthlyFluxRow | undefined;
                                          if (!row) return null;
                                          return (
                                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-md text-xs space-y-1.5 min-w-[205px]">
                                              <div className="font-semibold text-slate-900 border-b border-slate-100 pb-1 capitalize">
                                                {label}
                                              </div>
                                              <div className="flex items-center justify-between gap-4">
                                                <span className="flex items-center gap-1.5 text-slate-700">
                                                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#10b981]" />
                                                  Coutumiers
                                                </span>
                                                <strong className="tabular-nums">{row.huntersCoutumier}</strong>
                                              </div>
                                              <div className="flex items-center justify-between gap-4">
                                                <span className="flex items-center gap-1.5 text-slate-700">
                                                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2563eb]" />
                                                  Résidents
                                                </span>
                                                <strong className="tabular-nums">{row.huntersResident}</strong>
                                              </div>
                                              <div className="flex items-center justify-between gap-4">
                                                <span className="flex items-center gap-1.5 text-slate-700">
                                                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#f59e0b]" />
                                                  Touristes
                                                </span>
                                                <strong className="tabular-nums">{row.huntersTouriste}</strong>
                                              </div>
                                              <div className="border-t border-slate-100 pt-1 flex items-center justify-between gap-4 font-semibold text-slate-900">
                                                <span>Total chasseurs</span>
                                                <span className="tabular-nums">{row.huntersTotal}</span>
                                              </div>
                                              <div className="flex items-center justify-between gap-4 font-semibold text-purple-700">
                                                <span className="flex items-center gap-1.5">
                                                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#7c3aed]" />
                                                  Permis délivrés
                                                </span>
                                                <span className="tabular-nums">{row.permitsTotal}</span>
                                              </div>
                                            </div>
                                          );
                                        }}
                                      />
                                      <Legend />
                                      <Bar
                                        dataKey="huntersCoutumier"
                                        name="Chasseurs coutumiers"
                                        stackId="hunters"
                                        fill="#10b981"
                                        maxBarSize={36}
                                      />
                                      <Bar
                                        dataKey="huntersResident"
                                        name="Chasseurs résidents"
                                        stackId="hunters"
                                        fill="#2563eb"
                                        maxBarSize={36}
                                      />
                                      <Bar
                                        dataKey="huntersTouriste"
                                        name="Chasseurs touristes"
                                        stackId="hunters"
                                        fill="#f59e0b"
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={36}
                                      />
                                      <Line
                                        type="monotone"
                                        dataKey="permitsTotal"
                                        name="Permis délivrés"
                                        stroke="#7c3aed"
                                        strokeWidth={2.75}
                                        dot={{ r: 4.5, fill: "#7c3aed" }}
                                        activeDot={{ r: 6.5 }}
                                      />
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                              </div>

                              <div className="xl:col-span-4 rounded-xl border border-slate-200 bg-white p-4">
                                <h4 className="text-sm font-semibold text-slate-800 mb-3">
                                  Permis délivrés par {geoUnitLower} (%)
                                </h4>
                                {pieEntries.length === 0 ? (
                                  <div className="flex items-center justify-center h-[360px] text-sm text-muted-foreground">
                                    Aucun permis délivré.
                                  </div>
                                ) : (
                                  <div className="h-[360px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <PieChart>
                                        <defs>
                                          {pieEntries.map((entry, idx) => {
                                            const dotColor = COLORS[idx % COLORS.length];
                                            return (
                                              <pattern
                                                key={`dot-pat-${entry.key}`}
                                                id={`dept-dots-${idx}`}
                                                width="8"
                                                height="8"
                                                patternUnits="userSpaceOnUse"
                                              >
                                                <rect width="8" height="8" fill={dotColor} fillOpacity={0.10} />
                                                <circle cx="2.5" cy="2.5" r="1.3" fill={dotColor} />
                                                <circle cx="6.5" cy="6.5" r="1.3" fill={dotColor} />
                                              </pattern>
                                            );
                                          })}
                                        </defs>
                                        <Pie
                                          data={pieEntries}
                                          cx="50%"
                                          cy="50%"
                                          innerRadius={58}
                                          outerRadius={105}
                                          paddingAngle={3}
                                          dataKey="value"
                                          nameKey="name"
                                          label={({ name, value, percent }) => `${name} : ${value} (${(percent * 100).toFixed(0)}%)`}
                                        >
                                          {pieEntries.map((entry, idx) => {
                                            const dotColor = COLORS[idx % COLORS.length];
                                            return (
                                              <Cell
                                                key={`perm-reg-${entry.key}`}
                                                fill={`url(#dept-dots-${idx})`}
                                                stroke={dotColor}
                                                strokeWidth={2}
                                              />
                                            );
                                          })}
                                        </Pie>
                                        <Tooltip
                                          formatter={(v: any, name: any) => {
                                            const pct = ((Number(v) / pieTotal) * 100).toFixed(1);
                                            return [`${Number(v).toLocaleString('fr-FR')} permis (${pct}%)`, String(name)];
                                          }}
                                        />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                ) : showCategoriesAnalysis ? (
                <Card>
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <CardTitle>Permis délivrés par {geoUnitLower} (%)</CardTitle>
                    <div className="flex flex-wrap items-center gap-2 print:hidden">
                      {!isRegionLocked && (
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                          <Select value={categoriesRegionFilter} onValueChange={setCategoriesRegionFilter}>
                            <SelectTrigger className="w-[200px] bg-white">
                              <SelectValue placeholder="Toutes les régions" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="toutes">Toutes les régions</SelectItem>
                              {categoriesRegionOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setShowCategoriesAnalysis(false)}
                      >
                        Retour aux répartitions
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pcbrLoading ? (
                      <div className="flex items-center justify-center h-[420px] text-sm text-muted-foreground">Chargement...</div>
                    ) : (() => {
                      const pieEntries = isSubZoneMode
                        ? subZoneStatsRows
                            .filter((z) => z.activePermits > 0)
                            .map((z) => ({ key: z.zone, name: z.zone, value: z.activePermits }))
                        : permitsPivotTable.rows
                            .filter((r) => r.total > 0)
                            .map((r) => ({ key: r.regionKey, name: r.regionLabel, value: r.total }));
                      const pieTotal = pieEntries.reduce((s, e) => s + e.value, 0) || 1;
                      if (pieEntries.length === 0) {
                        return (
                          <div className="flex items-center justify-center h-[420px] text-sm text-muted-foreground">
                            Aucun permis délivré.
                          </div>
                        );
                      }
                      return (
                        <div className="h-[420px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieEntries}
                                cx="50%"
                                cy="50%"
                                innerRadius={75}
                                outerRadius={145}
                                paddingAngle={3}
                                dataKey="value"
                                nameKey="name"
                                label={({ name, value, percent }) => `${name} : ${value} (${(percent * 100).toFixed(0)}%)`}
                              >
                                {pieEntries.map((entry, idx) => (
                                  <Cell key={`perm-reg-${entry.key}`} fill={COLORS[idx % COLORS.length]} />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(v: any, name: any) => {
                                  const pct = ((Number(v) / pieTotal) * 100).toFixed(1);
                                  return [`${Number(v).toLocaleString('fr-FR')} permis (${pct}%)`, String(name)];
                                }}
                              />
                              <Legend />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ) : (
              /* Deux diagrammes circulaires (Donuts) côte à côte, agrandis et rapprochés */
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="col-span-1">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle>
                      Total chasseurs enregistrés : {huntersPivotTable.totals.total.toLocaleString('fr-FR')}
                    </CardTitle>
                    {!isRegionLocked && (
                      <div className="flex items-center gap-2 print:hidden">
                        <Label className="text-xs font-medium whitespace-nowrap">Région :</Label>
                        <Select value={categoriesRegionFilter} onValueChange={setCategoriesRegionFilter}>
                          <SelectTrigger className="h-8 w-[180px] bg-white text-xs">
                            <SelectValue placeholder="Toutes les régions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">Toutes les régions</SelectItem>
                            {categoriesRegionOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {hbcLoading ? (
                      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">Chargement...</div>
                    ) : huntersPivotTable.totals.total === 0 ? (
                      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">Aucun chasseur enregistré pour cette sélection.</div>
                    ) : (
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Coutumiers', value: huntersPivotTable.totals.coutumier, color: '#10b981' },
                                { name: 'Résidents', value: huntersPivotTable.totals.resident, color: '#2563eb' },
                                { name: 'Touristes', value: huntersPivotTable.totals.touristique, color: '#f59e0b' },
                              ].filter((d) => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={70}
                              outerRadius={125}
                              paddingAngle={3}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, value, percent }) => `${name} : ${value} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {[
                                { name: 'Coutumiers', value: huntersPivotTable.totals.coutumier, color: '#10b981' },
                                { name: 'Résidents', value: huntersPivotTable.totals.resident, color: '#2563eb' },
                                { name: 'Touristes', value: huntersPivotTable.totals.touristique, color: '#f59e0b' },
                              ]
                                .filter((d) => d.value > 0)
                                .map((entry) => (
                                  <Cell key={`h-cat-${entry.name}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v: any, name: any) => [`${Number(v).toLocaleString('fr-FR')} chasseur(s)`, String(name)]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="col-span-1">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <CardTitle>
                      Total permis délivrés : {permitsPivotTable.totals.total.toLocaleString('fr-FR')}
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="print:hidden border-emerald-300 text-emerald-900 hover:bg-emerald-50 font-semibold"
                      onClick={() => setShowCategoriesAnalysis(true)}
                    >
                      Permis délivrés par {geoUnitLower} (%)
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {pcbrLoading ? (
                      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">Chargement...</div>
                    ) : permitsPivotTable.totals.total === 0 ? (
                      <div className="flex items-center justify-center h-96 text-sm text-muted-foreground">Aucun permis délivré pour cette sélection.</div>
                    ) : (
                      <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Petite chasse', value: permitsPivotTable.totals.petiteChasse, color: '#2563eb' },
                                { name: "Gibiers d'eau", value: permitsPivotTable.totals.gibierEau, color: '#0d9488' },
                                { name: 'Grande chasse', value: permitsPivotTable.totals.grandeChasse, color: '#8b5cf6' },
                              ].filter((d) => d.value > 0)}
                              cx="50%"
                              cy="50%"
                              innerRadius={70}
                              outerRadius={125}
                              paddingAngle={3}
                              dataKey="value"
                              nameKey="name"
                              label={({ name, value, percent }) => `${name} : ${value} (${(percent * 100).toFixed(0)}%)`}
                            >
                              {[
                                { name: 'Petite chasse', value: permitsPivotTable.totals.petiteChasse, color: '#2563eb' },
                                { name: "Gibiers d'eau", value: permitsPivotTable.totals.gibierEau, color: '#0d9488' },
                                { name: 'Grande chasse', value: permitsPivotTable.totals.grandeChasse, color: '#8b5cf6' },
                              ]
                                .filter((d) => d.value > 0)
                                .map((entry) => (
                                  <Cell key={`p-cat-${entry.name}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip formatter={(v: any, name: any) => [`${Number(v).toLocaleString('fr-FR')} permis`, String(name)]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
              )}
            </TabsContent>
            <TabsContent value="regions">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle>Statistiques par {geoUnitLower}</CardTitle>
                  <div className="flex items-center gap-2 print:hidden">
                    {isSubZoneMode ? (
                      <>
                        <Label className="text-sm font-medium whitespace-nowrap">{geoUnitLabel} :</Label>
                        <Select value={subZoneStatsFilter} onValueChange={setSubZoneStatsFilter}>
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder={geoUnitPlural} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">{geoUnitPlural}</SelectItem>
                            {subZoneFilterOptions.map((z) => (
                              <SelectItem key={z} value={z}>
                                {z}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <>
                        <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                        <Select value={statsRegionFilter} onValueChange={setStatsRegionFilter} disabled={isRegionLocked}>
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Toutes les régions" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">Toutes les régions</SelectItem>
                            {statsRegionOptions.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{geoUnitLabel}</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permis actifs</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {isSubZoneMode ? 'Chasseurs enregistrés' : 'Prélèvements'}
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxe d'abattage</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recette</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {isSubZoneMode ? (
                          subZoneStatsRows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                                Aucune donnée enregistrée par {geoUnitLower} sur ce périmètre.
                              </td>
                            </tr>
                          ) : (
                            subZoneStatsRows.map((z) => (
                              <tr key={z.zone}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{(z.zone || '').toUpperCase()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{z.activePermits ?? 0}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{z.hunters ?? 0}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Number(z.taxesRevenue || 0).toLocaleString('fr-FR')} FCFA</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Number((z.permitsRevenue || 0) + (z.taxesRevenue || 0)).toLocaleString('fr-FR')} FCFA</td>
                              </tr>
                            ))
                          )
                        ) : (
                          (filteredByRegion || []).map((r) => (
                            <tr key={r.region}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{(r.region || '').toUpperCase()}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.activePermits ?? 0}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.piecesAbattues ?? 0}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Number((r as any).taxAmount || 0).toLocaleString('fr-FR')} FCFA</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(r.revenue ?? 0).toLocaleString('fr-FR')} FCFA</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="especes">
              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle>Prélèvements par espèce et par {geoUnitLower}</CardTitle>
                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    {isSubZoneMode && (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium whitespace-nowrap">Chasseurs :</Label>
                        <Select value={speciesHunterScope} onValueChange={(v) => setSpeciesHunterScope(v as 'registered' | 'all')}>
                          <SelectTrigger className="w-[195px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="registered">Chasseur enregistré</SelectItem>
                            <SelectItem value="all">Tous</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {isSubZoneMode ? (
                        <>
                          <Label className="text-sm font-medium whitespace-nowrap">{geoUnitLabel} :</Label>
                          <Select value={speciesSubZoneFilter} onValueChange={setSpeciesSubZoneFilter}>
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder={geoUnitPlural} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="toutes">{geoUnitPlural}</SelectItem>
                              {Array.from(
                                new Set(
                                  (filteredSpeciesByRegion || [])
                                    .map((r) => prettyDepartment(r.departement || 'Non renseigné'))
                                    .filter(Boolean)
                                )
                              )
                                .sort((a, b) => a.localeCompare(b, 'fr'))
                                .map((dept) => (
                                  <SelectItem key={dept} value={dept}>
                                    {dept}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </>
                      ) : (
                        <>
                          <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                          <Select value={speciesRegionFilter} onValueChange={setSpeciesRegionFilter} disabled={isRegionLocked}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Toutes les régions" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="toutes">Toutes les régions</SelectItem>
                              {speciesRegionOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Catégorie :</Label>
                      <Select value={speciesCategoryFilter} onValueChange={setSpeciesCategoryFilter}>
                        <SelectTrigger className="w-[220px]">
                          <SelectValue placeholder="Toutes les catégories" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="toutes">Toutes les catégories</SelectItem>
                          {speciesCategoryOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {sbrLoading ? (
                    <div>Chargement...</div>
                  ) : (
                    (() => {
                      const rows = (filteredSpeciesByRegion || []).filter((r) => {
                        if (!isSubZoneMode || speciesSubZoneFilter === 'toutes') return true;
                        return prettyDepartment(r.departement || 'Non renseigné') === speciesSubZoneFilter;
                      });
                      const bySpeciesRegion = new Map<
                        string,
                        {
                          key: string;
                          id: string;
                          name: string;
                          sci?: string;
                          regionLabel: string;
                          categories: Set<string>;
                          quantity: number;
                          utmCoords: Set<string>;
                          permits: Set<string>;
                          declarants: Set<string>;
                        }
                      >();
                      for (const r of rows) {
                        const id = r.speciesId || 'unknown';
                        const regKey = isSubZoneMode
                          ? removeDiacritics(String(r.departement || 'non renseigne').trim().toLowerCase())
                          : canonicalRegionKey(r.region);
                        const regLabel = isSubZoneMode
                          ? prettyDepartment(r.departement || 'Non renseigné')
                          : (REGION_LABELS[regKey] || prettyRegion(r.region));
                        const groupKey = `${id}::${regKey}`;
                        const entry = bySpeciesRegion.get(groupKey) || {
                          key: groupKey,
                          id,
                          name: r.speciesName || id,
                          sci: r.scientificName,
                          regionLabel: regLabel,
                          categories: new Set<string>(),
                          quantity: 0,
                          utmCoords: new Set<string>(),
                          permits: new Set<string>(),
                          declarants: new Set<string>(),
                        };
                        entry.quantity += Number(r.quantity) || 0;
                        const catKey = getRowCategoryKey(r);
                        if (catKey) {
                          entry.categories.add(formatCategoryLabel(catKey));
                        } else if (r.category) {
                          entry.categories.add(formatCategoryLabel(r.category));
                        }
                        const utm = wgs84ToUtm(r.lat, r.lon);
                        if (utm.x && utm.y) {
                          entry.utmCoords.add(`X: ${utm.x} / Y: ${utm.y}`);
                        }
                        if (r.permitNumber) {
                          entry.permits.add(r.permitNumber);
                        }
                        if (r.declaredBy) {
                          entry.declarants.add(r.declaredBy);
                        }
                        bySpeciesRegion.set(groupKey, entry);
                      }
                      const speciesList = Array.from(bySpeciesRegion.values()).sort(
                        (a, b) => a.name.localeCompare(b.name) || a.regionLabel.localeCompare(b.regionLabel)
                      );
                      const grandTotal = speciesList.reduce((sum, sp) => sum + sp.quantity, 0);

                      return (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espèce</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">{geoUnitLabel}</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Coordonnées UTM (X / Y)</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Permis</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Déclarant</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {speciesList.map(sp => {
                                const categoryDisplay = Array.from(sp.categories).join(' / ') || '—';
                                const utmDisplay = Array.from(sp.utmCoords).join(' ; ') || '—';
                                const permitDisplay = Array.from(sp.permits).join(', ') || '—';
                                const declarantDisplay = Array.from(sp.declarants).join(' / ') || 'Chasseur';
                                return (
                                  <tr key={sp.key}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                      <div className="flex flex-col">
                                        <span className="font-medium">{sp.name}</span>
                                        {sp.sci && <span className="text-xs italic text-gray-500">{sp.sci}</span>}
                                      </div>
                                    </td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-center text-gray-700">{categoryDisplay}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-center font-medium text-gray-800">{sp.regionLabel}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-center text-gray-700">{utmDisplay}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-center font-medium text-gray-800">{permitDisplay}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-center text-gray-700">{declarantDisplay}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold">{sp.quantity.toLocaleString('fr-FR')}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td className="px-4 py-2 text-sm font-semibold">Total</td>
                                <td colSpan={5}></td>
                                <td className="px-4 py-2 text-sm text-right font-bold">{grandTotal.toLocaleString('fr-FR')}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      );
                    })()
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="armes" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between pb-3">
                  <CardTitle className="flex items-center gap-2 shrink-0">
                    <Shield className="h-5 w-5" /> Statistiques des Armes
                  </CardTitle>
                  {/* Filtres alignés sur la ligne de titre */}
                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Région :</Label>
                      <Select value={weaponRegionFilter} onValueChange={setWeaponRegionFilter} disabled={isRegionLocked}>
                        <SelectTrigger className="h-9 w-[170px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.regions.map(r => (
                            <SelectItem key={r} value={r}>{r === 'toutes' ? 'Toutes les régions' : r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Marque :</Label>
                      <Select value={weaponBrandFilter} onValueChange={setWeaponBrandFilter}>
                        <SelectTrigger className="h-9 w-[175px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.brands.map(b => (
                            <SelectItem key={b} value={b}>{b === 'toutes' ? 'Toutes les marques' : b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium whitespace-nowrap">Catégorie :</Label>
                      <Select value={weaponCategoryFilter} onValueChange={setWeaponCategoryFilter}>
                        <SelectTrigger className="h-9 w-[185px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.categories.map(c => (
                            <SelectItem key={c} value={c}>{c === 'toutes' ? 'Toutes les catégories' : c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {weaponsLoading ? (
                    <div>Chargement des données d'armes...</div>
                  ) : (
                    <>
                      {/* Statistiques générales */}
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Total des armes</p>
                          <div className="text-2xl font-bold">{weaponStats?.totalWeapons?.toLocaleString('fr-FR') || 0}</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Marques différentes</p>
                          <div className="text-2xl font-bold">{weaponStats?.weaponsByBrand?.length || 0}</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Catégories d'armes</p>
                          <div className="text-2xl font-bold">{weaponStats?.weaponsByCategory?.length || 0}</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Régions actives</p>
                          <div className="text-2xl font-bold">{weaponStats?.weaponsByRegion?.length || 0}</div>
                        </div>
                      </div>

                      {/* Expiration des permis de port d'arme */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Expiration des permis de port d'arme</CardTitle>
                          </CardHeader>
                          <CardContent className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={expirationData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={105}
                                  fill="#8884d8"
                                  dataKey="value"
                                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                >
                                  {expirationData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                              </PieChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Détails des expirations</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-3">
                              <div className="flex justify-between items-center p-3 bg-red-50 rounded">
                                <span className="text-sm font-medium">Expire dans 3 mois</span>
                                <span className="text-lg font-bold text-red-600">{permitExpirations?.expiring3Months?.toLocaleString('fr-FR') || 0}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-orange-50 rounded">
                                <span className="text-sm font-medium">Expire dans 6 mois</span>
                                <span className="text-lg font-bold text-orange-600">{permitExpirations?.expiring6Months?.toLocaleString('fr-FR') || 0}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-yellow-50 rounded">
                                <span className="text-sm font-medium">Expire dans 1 an</span>
                                <span className="text-lg font-bold text-yellow-600">{permitExpirations?.expiring1Year?.toLocaleString('fr-FR') || 0}</span>
                              </div>
                              <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                <span className="text-sm font-medium">Déjà expirés</span>
                                <span className="text-lg font-bold text-gray-600">{permitExpirations?.expired?.toLocaleString('fr-FR') || 0}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Armes par marque */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Répartition par marque</CardTitle>
                          </CardHeader>
                          <CardContent className="h-[340px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={(weaponStats?.weaponsByBrand || []).slice(0, 5)}
                                layout="vertical"
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} />
                                <YAxis dataKey="brand" type="category" width={100} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="count" name="Nombre d'armes" fill="#f97316" />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Top 5 des marques</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marque</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {(weaponStats?.weaponsByBrand || []).slice(0, 5).map((item, index) => (
                                    <tr key={item.brand}>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.brand}</td>
                                      <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{item.count.toLocaleString('fr-FR')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Armes par région d'enregistrement */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Armes par région d'enregistrement</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type d'arme</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marque</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calibre</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {filteredWeaponsByRegion.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{prettyRegion(item.region)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.weaponType || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.brand || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.caliber || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{item.count.toLocaleString('fr-FR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {filteredWeaponsByRegion.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              Aucune donnée trouvée avec les filtres sélectionnés
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Armes par catégorie de permis */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-lg">Armes utilisées selon les catégories de permis</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie de permis</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type d'arme</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marque</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Calibre</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {(weaponsByPermitCategory || []).map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.permitCategory}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.weaponType}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.brand || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.caliber || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{item.count.toLocaleString('fr-FR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
  );
}
