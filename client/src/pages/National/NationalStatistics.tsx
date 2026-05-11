import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
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
  count: number;
}

interface WeaponByRegion {
  region: string;
  brand: string;
  weaponType: string;
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

export default function NationalStatistics() {
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
      'AlerteID','DateAlerte','Nature','RegionAlerte','DepartementAlerte',
      'DestinataireID','Nom','Prenom','Role','RegionService','DepartementService','Lu','DateNotification'
    ];
    const lines: string[] = [];
    for (const a of data) {
      for (const rec of (a.recipients || [])) {
        const last = rec.user?.last_name || '';
        const first = rec.user?.first_name || '';
        const row = [
          a.alert_id,
          a.created_at ? new Date(a.created_at).toLocaleString('fr-FR') : '',
          a.nature || '',
          prettyRegion(a.region || ''),
          a.departement || '',
          rec.user?.id ?? '',
          last,
          first,
          rec.user?.role || '',
          rec.user?.region || '',
          rec.user?.departement || '',
          rec.is_read ? 'OUI' : 'NON',
          rec.created_at ? new Date(rec.created_at).toLocaleString('fr-FR') : ''
        ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
        lines.push(row);
      }
    }
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const durl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = durl;
    link.download = `alertes_destinataires_${alertPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(durl);
  };
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedRegion, setSelectedRegion] = useState("toutes");
  // Filtres Recettes
  const [revenueGroupBy, setRevenueGroupBy] = useState<'region'|'departement'>('region');
  const [revenueRegion, setRevenueRegion] = useState<string>('toutes');
  const [revenueView, setRevenueView] = useState<'table' | 'chart'>('table');

  // Filtres Armes
  const [weaponRegionFilter, setWeaponRegionFilter] = useState<string>('toutes');
  const [weaponBrandFilter, setWeaponBrandFilter] = useState<string>('toutes');
  const [weaponCategoryFilter, setWeaponCategoryFilter] = useState<string>('toutes');
  // Normalisation/affichage des régions - Chargées dynamiquement depuis l'API
  // Les libellés et l'ordre sont maintenant récupérés depuis la base de données
  const REGION_LABELS: Record<string, string> = {}; // Vide - sera rempli dynamiquement
  const REGION_ORDER: string[] = []; // Vide - sera rempli dynamiquement
  const removeDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const canonicalRegionKey = (raw?: string) => {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) return 'nondefini';
    return removeDiacritics(key).replace(/[^a-z0-9]+/g, '');
  };

  const prettyRegion = (raw?: string) => {
    const key = String(raw || 'non défini').trim().toLowerCase();
    const label = REGION_LABELS[key];
    if (label) return label;
    // Title-case simple par défaut
    return key
      .split(/\s+/)
      .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ');
  };
  const prettyDepartment = (raw?: string) => {
    const value = String(raw || 'non défini').trim();
    if (!value) return 'Non défini';
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
    speciesId: string;
    speciesName?: string;
    scientificName?: string;
    quantity: number;
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
  const infraGrouped = useMemo(() => {
    const key = infraGroupBy;
    const map = new Map<string, { label: string; count: number; amount: number }>();
    for (const inf of (infractionsData || [])) {
      const label = prettyRegion(key === 'region' ? (inf.region || 'non défini') : (inf.departement || 'non défini'));
      const cur = map.get(label) || { label, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(inf.montant_chiffre || 0);
      map.set(label, cur);
    }
    return Array.from(map.values()).sort((a,b)=> b.count - a.count || b.amount - a.amount);
  }, [infractionsData, infraGroupBy]);

  const infractionsMonthlyData = useMemo(() => {
    if (!infractionsData || infractionsData.length === 0) return [] as Array<{ monthKey: string; label: string; infractions: number; contrevenants: number }>;
    const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });
    const monthlyMap = new Map<string, { label: string; infractions: number; contrevenants: number }>();

    for (const row of infractionsData) {
      if (!row?.date_infraction) continue;
      const date = new Date(row.date_infraction);
      if (Number.isNaN(date.getTime())) continue;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) || {
        label: monthFormatter.format(date),
        infractions: 0,
        contrevenants: 0,
      };
      existing.infractions += 1;
      const contrevenants = Array.isArray((row as any)?.contrevenants) ? (row as any).contrevenants.length : 0;
      existing.contrevenants += contrevenants;
      monthlyMap.set(monthKey, existing);
    }

    return Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, value]) => ({ monthKey, ...value }));
  }, [infractionsData]);

  const revenueMonthlyData = useMemo(() => {
    if (!revenueByMonth || revenueByMonth.length === 0) {
      return [] as Array<{ monthKey: string; label: string; permitTax: number; infractions: number }>;
    }
    const monthFormatter = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' });

    return revenueByMonth
      .map((row): { monthKey: string; label: string; permitTax: number; infractions: number } => {
        const [yearStr, monthStr] = String(row.monthKey || '').split('-');
        const year = Number(yearStr);
        const monthIndex = Number(monthStr) - 1;
        const hasValidDate = Number.isFinite(year) && Number.isFinite(monthIndex) && monthIndex >= 0;
        const date = hasValidDate ? new Date(year, monthIndex, 1) : null;
        const label = date ? monthFormatter.format(date) : String(row.monthKey || '');
        const permitAmount = Number(row.permitAmount || 0);
        const taxAmount = Number(row.taxAmount || 0);
        const infractionAmount = Number(row.infractionAmount || 0);
        const permitTax = permitAmount + taxAmount;
        return {
          monthKey: String(row.monthKey || ''),
          label,
          permitTax,
          infractions: infractionAmount,
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [revenueByMonth]);

  const revenueDepartmentSorted = useMemo(() => {
    return (revenueByDepartment || []).slice().sort((a, b) => {
      const regCompare = (a.region || '').localeCompare(b.region || '');
      if (regCompare !== 0) return regCompare;
      return (a.departement || '').localeCompare(b.departement || '');
    });
  }, [revenueByDepartment]);

  const revenueRegionRows = useMemo<RevenueGroupingRow[]>(() => {
    return (byRegion || []).map((row) => ({
      key: `region:${row.region || 'non défini'}`,
      region: prettyRegion(row.region),
      revenue: Number(row.revenue || 0),
    }));
  }, [byRegion]);

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
    if (revenueRegion === 'toutes') return revenueDepartmentRows;
    return revenueDepartmentRows.filter((row) => row.region === revenueRegion);
  }, [revenueGroupBy, revenueRegion, revenueRegionRows, revenueDepartmentRows]);

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
    } catch {}
    return null;
  };

  // Nouveaux endpoints pour l'onglet Catégories de permis
  type HuntersByCategory = { category: string; count: number };
  type PermitsByCategoryByRegion = { region: string; categoryId: string; count: number; avgDurationDays: number };

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

  // Export CSV Recettes (par région)
  const exportRevenueCsv = () => {
    const rows = (byRegion || []).map(r => ({
      region: prettyRegion(r.region),
      revenue: Number(r.revenue || 0),
      activePermits: Number((r as any).activePermits || 0),
      piecesAbattues: Number((r as any).piecesAbattues || 0),
    }));
    const header = ['Region','Recette(FCFA)','PermisActifs','PiecesAbattues'];
    const lines = rows
      .sort((a,b)=> b.revenue - a.revenue)
      .map(x => [x.region, x.revenue, x.activePermits, x.piecesAbattues]
        .map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recettes_par_region.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const groupedAlerts = useMemo(() => {
    // nature -> regionLabel -> count
    const byNature = new Map<string, Map<string, number>>();
    const regionsSet = new Set<string>();
    (mapAlerts || []).forEach(a => {
      const nat = (a.nature || 'non défini').toString();
      const reg = prettyRegion(a.region || 'non défini');
      regionsSet.add(reg);
      const inner = byNature.get(nat) || new Map<string, number>();
      inner.set(reg, (inner.get(reg) || 0) + 1);
      byNature.set(nat, inner);
    });
    const regions = sortRegions(Array.from(regionsSet));
    const rows = Array.from(byNature.entries()).map(([nature, map]) => {
      const obj: Record<string, any> = { nature };
      let total = 0;
      regions.forEach(r => { const v = map.get(r) || 0; obj[r] = v; total += v; });
      obj.total = total;
      return obj;
    }).sort((a,b)=> a.nature.localeCompare(b.nature));
    return { regions, rows } as { regions: string[]; rows: Array<Record<string, any>> };
  }, [mapAlerts]);

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

    return {
      regions: ['toutes', ...Array.from(regions).sort()],
      brands: ['toutes', ...Array.from(brands).sort()],
      categories: ['toutes', ...Array.from(categories).sort()]
    };
  }, [weaponStats, weaponsByRegion]);

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
      'Expéditeur', 'Rôle expéditeur', 'Région expéditeur', 'Département expéditeur',
      'Latitude', 'Longitude'
    ];
    const lines = (mapAlerts || []).map(a => {
      const senderName = [a.sender?.first_name || '', a.sender?.last_name || ''].filter(Boolean).join(' ').trim();
      return [
        a.created_at ? new Date(a.created_at as any).toLocaleString('fr-FR') : '',
        a.nature || '',
        prettyRegion(a.region || ''),
        a.departement || '',
        a.title || '',
        (a.message || '').replace(/\s+/g,' ').trim(),
        senderName,
        a.sender?.role || '',
        a.sender?.region || '',
        a.sender?.departement || '',
        String(a.lat ?? ''),
        String(a.lon ?? '')
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
    });
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `alertes_${alertPeriod}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export CSV pour les armes
  const exportWeaponsCsv = () => {
    const header = ['Région', 'Marque', 'Type d\'arme', 'Nombre'];
    const lines = (filteredWeaponsByRegion || []).map(w => [
      prettyRegion(w.region),
      w.brand || 'Non spécifié',
      w.weaponType || 'Non spécifié',
      String(w.count)
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'armes_statistiques.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Élargir le conteneur parent (page-frame-inner) pour ce tableau de bord
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current?.closest('.page-frame-inner');
    if (el) el.classList.add('page-frame-wide');
    return () => { if (el) el.classList.remove('page-frame-wide'); };
  }, []);

  return (
    <div ref={rootRef} className="w-full py-6" id="national-print">
        <div className="flex flex-col space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Tableau de Bord National de la Chasse</h1>
              <p className="text-sm text-muted-foreground">
                Vue d'ensemble des activités de chasse au niveau national
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end print:hidden">
              <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm" onClick={handlePrint}>
                <Printer className="w-4 h-4" />
                Imprimer
              </Button>
              <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm">
                <FileDown className="w-4 h-4" />
                Exporter
              </Button>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="overflow-x-auto">
            <TabsList className="border rounded-lg bg-white shadow-sm p-1 inline-grid grid-flow-col auto-cols-max min-w-[640px]">
              <TabsTrigger
                value="overview"
                className="text-slate-600 data-[state=active]:bg-slate-50 data-[state=active]:text-slate-700"
              >
                Vue d'ensemble
              </TabsTrigger>
              <TabsTrigger
                value="regions"
                className="text-emerald-600 data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700"
              >
                Par région
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
                    <CardTitle className="text-sm font-medium">Pièces abattues</CardTitle>
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
                        {/* Pièces abattues: rouge clair */}
                        <Bar xAxisId="count" dataKey="piecesAbattues" name="Pièces abattues" fill="#f00002" />
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start sm:self-auto"
                    onClick={() => setInfractionsView((prev) => (prev === 'table' ? 'chart' : 'table'))}
                  >
                    {infractionsView === 'table' ? 'Voir évolution mensuelle' : 'Voir la liste détaillée'}
                  </Button>
                </CardHeader>
                <CardContent>
                  {infractionsLoading ? (
                    <div>Chargement...</div>
                  ) : infractionsView === 'chart' ? (
                    infractionsMonthlyData.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Aucune donnée mensuelle disponible.</div>
                    ) : (
                      <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={infractionsMonthlyData} margin={{ top: 16, right: 24, left: 8, bottom: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="label" tick={{ fontSize: 12 }} angle={-15} textAnchor="end" height={60} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                            <Tooltip formatter={(value: number) => value.toLocaleString('fr-FR')} />
                            <Legend />
                            <Line type="monotone" dataKey="infractions" name="Infractions" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            <Line type="monotone" dataKey="contrevenants" name="Contrevenants" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )
                  ) : (infractionsData.length === 0 ? (
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
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Département</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {(infractionsData || []).map((row: any) => (
                            <tr key={row.id}>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.date_infraction ? new Date(row.date_infraction).toLocaleDateString('fr-FR') : ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.nature || ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.code || ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.article_code || ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{[row.agent_prenom, row.agent_nom].filter(Boolean).join(' ')}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.region || ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">{row.departement || ''}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-sm">
                                <Button size="sm" variant="outline" onClick={()=> setViewInfraction(row)}>Voir</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
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
                    const fullPrimary = primary ? (allContrevenants as any[]).find(x=> x.id === primary.id) : null;
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
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5" /> Recettes
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start sm:self-auto"
                    onClick={() => setRevenueView((prev) => (prev === 'table' ? 'chart' : 'table'))}
                  >
                    {revenueView === 'table' ? 'Voir évolution mensuelle' : 'Voir la vue détaillée'}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-6">
                  {revenueView === 'table' && (
                    <div className="flex flex-wrap items-end gap-3 print:hidden">
                      <div className="flex flex-col">
                        <Label>Grouper par</Label>
                        <Select value={revenueGroupBy} onValueChange={(v)=> setRevenueGroupBy(v as any)}>
                          <SelectTrigger className="w-[220px]"><SelectValue placeholder="Groupe" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="region">Région</SelectItem>
                            <SelectItem value="departement">Département</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col">
                        <Label>Région</Label>
                        <Select value={revenueRegion} onValueChange={setRevenueRegion} disabled={revenueGroupBy !== 'region'}>
                          <SelectTrigger className="w-[240px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="toutes">Toutes</SelectItem>
                            {Array.from(new Set((byRegion || []).map(r => prettyRegion(r.region))))
                              .sort((a,b)=> a.localeCompare(b))
                              .map(r => (<SelectItem key={r} value={r}>{r}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1" />
                      <Button variant="outline" className="flex items-center gap-2" onClick={exportRevenueCsv}>
                        <FileDown className="w-4 h-4" /> Exporter Excel
                      </Button>
                      <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
                        <Printer className="w-4 h-4" /> Imprimer
                      </Button>
                    </div>
                  )}
                  {revenueView === 'chart' ? (
                    revenueByMonthLoading ? (
                      <div>Chargement des données mensuelles...</div>
                    ) : (revenueMonthlyData.length === 0 ? (
                      <div className="text-sm text-muted-foreground">Aucune donnée mensuelle disponible pour les recettes.</div>
                    ) : (
                      <div className="bg-white rounded-lg border p-4 h-[360px]">
                        <h4 className="text-sm font-semibold mb-2">Évolution mensuelle des recettes</h4>
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
                    ))
                  ) : (
                    <>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Total (Permis + Taxes + Infractions)</p>
                          <div className="text-2xl font-bold">{
                            ((aggregates?.revenue ?? 0) + Number(infraStats?.montant_total ?? 0)).toLocaleString('fr-FR')
                          } FCFA</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Permis + Taxes</p>
                          <div className="text-2xl font-bold">{(aggregates?.revenue ?? 0).toLocaleString('fr-FR')} FCFA</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg border">
                          <p className="text-sm text-muted-foreground">Infractions</p>
                          <div className="text-2xl font-bold">{Number(infraStats?.montant_total ?? 0).toLocaleString('fr-FR')} FCFA</div>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="bg-white rounded-lg border p-4 h-[320px]">
                          <h4 className="text-sm font-semibold mb-2">{revenueGroupBy === 'region' ? 'Recettes par région' : 'Recettes par département'}</h4>
                          {revenueGroupBy === 'departement' && revenueByDepartmentLoading ? (
                            <div>Chargement des données par département...</div>
                          ) : filteredRevenueRows.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Aucune donnée disponible.</div>
                          ) : (
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={revenueChartData}
                                layout="vertical"
                                margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" allowDecimals={false} tickFormatter={(v)=> Number(v).toLocaleString('fr-FR')} />
                                <YAxis dataKey="label" type="category" width={180} />
                                <Tooltip formatter={(v:any)=> Number(v).toLocaleString('fr-FR') + ' FCFA'} />
                                <Legend />
                                <Bar dataKey="revenue" name="Recette (FCFA)" fill="#7c3aed" />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>

                        <div className="bg-white rounded-lg border p-4 overflow-x-auto">
                          <h4 className="text-sm font-semibold mb-2">Détails {revenueGroupBy === 'region' ? 'par région' : 'par département'}</h4>
                          {revenueGroupBy === 'departement' && revenueByDepartmentLoading ? (
                            <div>Chargement des données par département...</div>
                          ) : revenueTableRows.length === 0 ? (
                            <div className="text-sm text-muted-foreground">Aucune donnée disponible.</div>
                          ) : (
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                                  {revenueGroupBy === 'departement' && (
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Département</th>
                                  )}
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Recette (FCFA)</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {revenueTableRows.map((row) => (
                                  <tr key={row.key}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm">{row.region}</td>
                                    {revenueGroupBy === 'departement' && (
                                      <td className="px-4 py-2 whitespace-nowrap text-sm">{row.departement || 'Non défini'}</td>
                                    )}
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right">{row.revenue.toLocaleString('fr-FR')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="alertes" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" /> Alertes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-end gap-3 print:hidden">
                    <div className="flex flex-col">
                      <Label>Période</Label>
                      <Select value={alertPeriod} onValueChange={(v)=> setAlertPeriod(v as any)}>
                        <SelectTrigger className="w-[180px]"><SelectValue placeholder="Période" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="week">Semaine en cours</SelectItem>
                          <SelectItem value="month">Mois en cours</SelectItem>
                          <SelectItem value="year">Année en cours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col">
                      <Label>Nature</Label>
                      <Select value={alertNature} onValueChange={setAlertNature}>
                        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Nature" /></SelectTrigger>
                        <SelectContent>
                          {alertNatures.map(n => (
                            <SelectItem key={n} value={n}>{n.toUpperCase()}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1" />
                    <Button variant="outline" className="flex items-center gap-2" onClick={exportAlertsCsv}>
                      <FileDown className="w-4 h-4" /> Exporter CSV
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2" onClick={exportAlertsWithRecipientsCsv}>
                      <FileDown className="w-4 h-4" /> Exporter destinataires
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
                      <Printer className="w-4 h-4" /> Imprimer
                    </Button>
                  </div>

                  {alertsLoading ? (
                    <div>Chargement...</div>
                  ) : (mapAlerts.length === 0 ? (
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
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Département</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expéditeur</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rôle</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lieu de service</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(mapAlerts || []).map((a) => {
                              const senderName = [a.sender?.first_name || '', a.sender?.last_name || ''].filter(Boolean).join(' ').trim();
                              const service = a.sender?.role === 'agent' || a.sender?.role === 'sub-agent'
                                ? [a.sender?.region, a.sender?.departement].filter(Boolean).join(' / ')
                                : (a.sender?.region || a.sender?.departement || '')
                              return (
                                <tr key={a.id}>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{a.created_at ? new Date(a.created_at as any).toLocaleString('fr-FR') : ''}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{(a.nature || '').toUpperCase()}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{prettyRegion(a.region || '')}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{a.departement || ''}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{senderName}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-sm">{a.sender?.role || ''}</td>
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
            <TabsContent value="categories">
              <div className="grid gap-4 md:grid-cols-2">
                {/* Tableau 1: Chasseurs par catégorie (national) */}
                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle>Chasseurs par catégorie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {hbcLoading ? (
                      <div>Chargement...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(huntersByCategory || []).map((row) => (
                              <tr key={row.category}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{Number(row.count || 0).toLocaleString('fr-FR')}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{String(row.category || '').toUpperCase()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Tableau 2: Permis par région et catégorie avec durée moyenne */}
                <Card className="col-span-1">
                  <CardHeader>
                    <CardTitle>Permis par région et catégorie</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pcbrLoading ? (
                      <div>Chargement...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-normal break-words">Catégorie de permis</th>
                              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {(permitsCatByRegion || []).map((row) => (
                              <tr key={`${row.region}-${row.categoryId}`}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{prettyRegion(row.region)}</td>
                                <td className="px-6 py-4 whitespace-normal break-words text-sm text-gray-700">{String(row.categoryId || 'non défini').toUpperCase()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">{Number(row.count || 0).toLocaleString('fr-FR')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="regions">
              <Card>
                <CardHeader>
                  <CardTitle>Statistiques par région</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Région</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Permis actifs</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pièces abattues</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxe d'abattage</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recette</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {(byRegion || []).map((r) => (
                          <tr key={r.region}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{(r.region || '').toUpperCase()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.activePermits ?? 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.piecesAbattues ?? 0}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{Number((r as any).taxAmount || 0).toLocaleString('fr-FR')} FCFA</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(r.revenue ?? 0).toLocaleString('fr-FR')} FCFA</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="especes">
              <Card>
                <CardHeader>
                  <CardTitle>Pièces abattues par espèce et par région</CardTitle>
                </CardHeader>
                <CardContent>
                  {sbrLoading ? (
                    <div>Chargement...</div>
                  ) : (
                    (() => {
                      const rows = speciesByRegion || [];
                      // Construire un mapping clé canonique -> libellé à partir des déclarations présentes
                      const regionKeyToLabel = new Map<string, string>();
                      for (const r of rows) {
                        const key = canonicalRegionKey(r.region);
                        const lbl = REGION_LABELS[key] || prettyRegion(r.region);
                        regionKeyToLabel.set(key, lbl);
                      }
                      const regions = sortRegions(Array.from(regionKeyToLabel.values()));
                      const bySpecies = new Map<string, { id: string; name: string; sci?: string; values: Record<string, number> }>();
                      for (const r of rows) {
                        const id = r.speciesId || 'unknown';
                        const key = canonicalRegionKey(r.region);
                        const label = regionKeyToLabel.get(key) || prettyRegion(r.region);
                        const entry = bySpecies.get(id) || { id, name: r.speciesName || id, sci: r.scientificName, values: {} };
                        entry.values[label] = (entry.values[label] || 0) + (Number(r.quantity) || 0);
                        bySpecies.set(id, entry);
                      }
                      const speciesList = Array.from(bySpecies.values()).sort((a,b) => a.name.localeCompare(b.name));
                      const totalByRegion: Record<string, number> = {};
                      const grandTotal = speciesList.reduce((sum, sp) => {
                        return sum + regions.reduce((s, reg) => s + (sp.values[reg] || 0), 0);
                      }, 0);

                      return (
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Espèce</th>
                                {regions.map((reg) => (
                                  <th key={reg} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">{reg}</th>
                                ))}
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {speciesList.map(sp => {
                                const rowTotal = regions.reduce((s, reg) => s + (sp.values[reg] || 0), 0);
                                regions.forEach(reg => { totalByRegion[reg] = (totalByRegion[reg] || 0) + (sp.values[reg] || 0); });
                                return (
                                  <tr key={sp.id}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
                                      <div className="flex flex-col">
                                        <span className="font-medium">{sp.name}</span>
                                        {sp.sci && <span className="text-xs italic text-gray-500">{sp.sci}</span>}
                                      </div>
                                    </td>
                                    {regions.map(reg => (
                                      <td key={reg} className="px-4 py-2 whitespace-nowrap text-sm text-right">{(sp.values[reg] || 0).toLocaleString('fr-FR')}</td>
                                    ))}
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-right font-semibold">{rowTotal.toLocaleString('fr-FR')}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-gray-50">
                              <tr>
                                <td className="px-4 py-2 text-sm font-semibold">Total par région</td>
                                {regions.map(reg => (
                                  <td key={reg} className="px-4 py-2 text-sm text-right font-semibold">{(totalByRegion[reg] || 0).toLocaleString('fr-FR')}</td>
                                ))}
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
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" /> Statistiques des Armes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Filtres et actions */}
                  <div className="flex flex-wrap items-end gap-3 print:hidden">
                    <div className="flex flex-col">
                      <Label>Région</Label>
                      <Select value={weaponRegionFilter} onValueChange={setWeaponRegionFilter}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.regions.map(r => (
                            <SelectItem key={r} value={r}>{r === 'toutes' ? 'Toutes les régions' : r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col">
                      <Label>Marque</Label>
                      <Select value={weaponBrandFilter} onValueChange={setWeaponBrandFilter}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.brands.map(b => (
                            <SelectItem key={b} value={b}>{b === 'toutes' ? 'Toutes les marques' : b}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col">
                      <Label>Catégorie</Label>
                      <Select value={weaponCategoryFilter} onValueChange={setWeaponCategoryFilter}>
                        <SelectTrigger className="w-[200px]"><SelectValue placeholder="Toutes" /></SelectTrigger>
                        <SelectContent>
                          {weaponFilterOptions.categories.map(c => (
                            <SelectItem key={c} value={c}>{c === 'toutes' ? 'Toutes les catégories' : c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1" />
                    <Button variant="outline" className="flex items-center gap-2" onClick={exportWeaponsCsv}>
                      <FileDown className="w-4 h-4" /> Exporter Excel
                    </Button>
                    <Button variant="outline" className="flex items-center gap-2" onClick={handlePrint}>
                      <Printer className="w-4 h-4" /> Imprimer
                    </Button>
                  </div>

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
                          <CardHeader>
                            <CardTitle className="text-lg">Expiration des permis de port d'arme</CardTitle>
                          </CardHeader>
                          <CardContent className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={expirationData}
                                  cx="50%"
                                  cy="50%"
                                  labelLine={false}
                                  outerRadius={80}
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
                          <CardHeader>
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
                          <CardHeader>
                            <CardTitle className="text-lg">Répartition par marque</CardTitle>
                          </CardHeader>
                          <CardContent className="h-[300px]">
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
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Marque</th>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type d'arme</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {filteredWeaponsByRegion.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{prettyRegion(item.region)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.brand || 'Non spécifié'}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.weaponType || 'Non spécifié'}</td>
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
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {(weaponsByPermitCategory || []).map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{item.permitCategory}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-700">{item.weaponType}</td>
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
