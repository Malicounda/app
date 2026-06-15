import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info, BookOpen, X, BarChart3, MapPin, HelpCircle } from "lucide-react";
import { NatureIcon, FireIcon, PoachingIcon, WoodTrafficIcon } from "@/components/icons/AlertNatureIcons";
import { useLocation } from "wouter";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import SupervisorMapCard from "@/components/alerte/SupervisorMapCard";
import LicenseDialog from "@/components/layout/LicenseDialog";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";
import { buildSupervisorTickerParts, filterAlertsForSupervisor } from "@/utils/alertZoneScope";
import { departmentsByRegion } from "@/lib/constants";

function renderTickerItem(n: any) {
  const { grade, fullName, zoneSummary, title, gpsLocation } = buildSupervisorTickerParts(n);
  const sep = <span className="text-amber-600/50 mx-1.5">&bull;</span>;

  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold text-amber-900 group-hover:text-amber-950 transition-colors">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
      <div className="flex items-center gap-x-1 whitespace-nowrap">
        <span className="font-bold">
          {grade ? `${grade} ` : ""}
          {fullName}
        </span>
        {zoneSummary ? (
          <>
            {sep}
            <span className="text-amber-800">{zoneSummary}</span>
          </>
        ) : null}
        {sep}
        <span>{title}</span>
        {sep}
        <span className="font-medium text-amber-700">{gpsLocation}</span>
      </div>
    </div>
  );
}

// All known alert types in the system
const ALL_ALERT_TYPES = ['Feux de brousse', 'Braconnage', 'Coupe de bois', 'Autre'];

// Color palette for alert type badges
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Feux de brousse': { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  'Braconnage': { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  'Coupe de bois': { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  'Autre': { bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' },
};

const MONTH_NAMES = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

// Map type name to its SVG icon component
const TypeIcon: React.FC<{ name: string; size?: number }> = ({ name, size = 18 }) => {
  const n = name.toLowerCase();
  if (n.includes('feu') || n.includes('brousse')) return <FireIcon size={size} />;
  if (n.includes('braconn')) return <PoachingIcon size={size} />;
  if (n.includes('coupe') || n.includes('bois') || n.includes('trafic')) return <WoodTrafficIcon size={size} />;
  return <HelpCircle className="h-4 w-4 text-slate-400" />;
};

export default function SupervisorPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [timePeriod, setTimePeriod] = useState<'week' | 'month' | 'year' | 'all'>('all');

  // Fetch all alerts in the system for complete stats, filtered by the supervisor's zone
  const { data: allReceivedAlerts } = useQuery({
    queryKey: ["supervisor-all-alerts", user?.id],
    queryFn: async () => {
      try {
        const res = await apiRequest<any[]>("GET", `/alerts/map`);
        if (!res.ok) return [];
        const allAlerts = res.data as any[];
        // Filter alerts using the shared helper so we see exactly what falls in the supervisor's area
        return filterAlertsForSupervisor(allAlerts, user || {});
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: 10_000,
  });

  // Fetch administrative divisions
  const { data: departementsGeoJSON } = useQuery({
    queryKey: ["/api/departements"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any>("GET", "/departements");
        return res.ok ? res.data : null;
      } catch (e) {
        return null;
      }
    },
    enabled: !!user,
  });

  const { data: arrondissementsGeoJSON } = useQuery({
    queryKey: ["/api/arrondissements"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any>("GET", "/arrondissements");
        return res.ok ? res.data : null;
      } catch (e) {
        return null;
      }
    },
    enabled: !!user,
  });

  const { data: communesGeoJSON } = useQuery({
    queryKey: ["/api/communes-with-arr"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any>("GET", "/communes?withArrondissement=true");
        return res.ok ? res.data : null;
      } catch (e) {
        return null;
      }
    },
    enabled: !!user,
  });

  const adminScope = useMemo(() => {
    if (user?.commune) return { level: 'commune', name: user.commune };
    if (user?.arrondissement) return { level: 'arrondissement', name: user.arrondissement };
    if (user?.departement) return { level: 'departement', name: user.departement };
    if (user?.region) return { level: 'region', name: user.region };
    return { level: 'none', name: '' };
  }, [user]);

  const normEqual = (a: string | null | undefined, b: string | null | undefined) => {
    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return norm(a || "") === norm(b || "");
  };

  const periodLabel = useMemo(() => {
    let parts: string[] = [];
    if (monthFilter === 'current') {
      parts.push("Mois en cours");
    } else if (monthFilter !== 'all') {
      const idx = parseInt(monthFilter, 10);
      parts.push(MONTH_NAMES[idx] || "");
    } else {
      parts.push("Tout l'historique");
    }

    if (timePeriod === 'week') parts.push("Semaine");
    else if (timePeriod === 'month') parts.push("Mois");
    else if (timePeriod === 'year') parts.push("Année");

    return parts.join(" & ");
  }, [monthFilter, timePeriod]);

  const subEntityTitle = useMemo(() => {
    switch (adminScope.level) {
      case 'region':
        return "Alertes par Departement";
      case 'departement':
        return "Alertes par Arrondissement & Commune";
      case 'arrondissement':
        return "Alertes par Commune";
      case 'commune':
        return "Alertes par Localité";
      default:
        return "Alertes par Zone";
    }
  }, [adminScope.level]);

  const subtitleLabel = useMemo(() => {
    const levelName = adminScope.level === 'region' ? 'Région' :
      adminScope.level === 'departement' ? 'Département' :
        adminScope.level === 'arrondissement' ? 'Arrondissement' :
          adminScope.level === 'commune' ? 'Commune' : 'Zone';
    return `${levelName} ${adminScope.name || "administrative"} — ${periodLabel}`;
  }, [adminScope, periodLabel]);

  const filteredAlerts = useMemo(() => {
    let list = allReceivedAlerts || [];

    // 1. Apply month filter (from the dropdown)
    if (monthFilter !== 'all') {
      const now = new Date();
      const currentYear = now.getFullYear();

      list = list.filter((a: any) => {
        if (!a.created_at) return false;
        const d = new Date(a.created_at);
        if (isNaN(d.getTime())) return false;
        const y = d.getFullYear();
        const m = d.getMonth();

        if (monthFilter === 'current') {
          return y === currentYear && m === now.getMonth();
        }

        // Match specific month index of the current year
        const targetMonthIdx = parseInt(monthFilter, 10);
        return y === currentYear && m === targetMonthIdx;
      });
    }

    // 2. Apply time period filter (from the bottom navigation tabs)
    if (timePeriod !== 'all') {
      const now = new Date();
      list = list.filter((a: any) => {
        if (!a.created_at) return false;
        const d = new Date(a.created_at);
        if (isNaN(d.getTime())) return false;

        const diffTime = Math.abs(now.getTime() - d.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (timePeriod === 'week') {
          return diffDays <= 7;
        }
        if (timePeriod === 'month') {
          return diffDays <= 30;
        }
        if (timePeriod === 'year') {
          return diffDays <= 365;
        }
        return true;
      });
    }

    return list;
  }, [allReceivedAlerts, monthFilter, timePeriod]);

  const stats = useMemo(() => {
    const alerts = filteredAlerts || [];

    // Normalize a nature string to match known types
    const normalizeNature = (nat: string) => {
      let cleaned = (nat || 'autre').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      if (cleaned.toLowerCase().includes('trafic') || cleaned.toLowerCase() === 'trafic bois') {
        cleaned = 'Coupe de bois';
      }
      return ALL_ALERT_TYPES.find(t => t.toLowerCase() === cleaned.toLowerCase()) || cleaned;
    };

    // 1. Count per type - always include all known types, even if 0
    const typeCounts: Record<string, number> = {};
    ALL_ALERT_TYPES.forEach(t => { typeCounts[t] = 0; });
    alerts.forEach((a: any) => {
      const key = normalizeNature(a.nature);
      typeCounts[key] = (typeCounts[key] || 0) + 1;
    });
    const typeStats = ALL_ALERT_TYPES.map(name => ({ name, count: typeCounts[name] || 0 }));
    // Add any extra types not in the known list
    Object.entries(typeCounts).forEach(([name, count]) => {
      if (!ALL_ALERT_TYPES.includes(name) && count > 0) {
        typeStats.push({ name, count });
      }
    });

    // 2. Dynamic sub-entities list according to administrative scope
    let subEntities: { key: string; label: string; type: string }[] = [];
    const level = adminScope.level;
    const name = adminScope.name;

    if (level === 'region') {
      const normRegionKey = (name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const regionDepts = departmentsByRegion[normRegionKey as keyof typeof departmentsByRegion] || [];
      subEntities = regionDepts.map(d => ({
        key: d.value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        label: d.value.toUpperCase(),
        type: 'Département'
      }));
    } else if (level === 'departement') {
      const deptFeature = departementsGeoJSON?.features?.find((f: any) => normEqual(f.properties?.nom, name));
      const deptId = deptFeature?.properties?.id;

      if (deptId !== undefined) {
        const subArr = (arrondissementsGeoJSON?.features || [])
          .filter((f: any) => Number(f.properties?.departement_id) === Number(deptId))
          .map((f: any) => ({
            key: (f.properties?.nom || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
            label: (f.properties?.nom || "").toUpperCase() + " (Arr.)",
            type: 'Arrondissement'
          }));

        const subCom = (communesGeoJSON?.features || [])
          .filter((f: any) => Number(f.properties?.departement_id) === Number(deptId))
          .map((f: any) => ({
            key: (f.properties?.nom || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
            label: (f.properties?.nom || "").toUpperCase() + " (Com.)",
            type: 'Commune'
          }));

        subEntities = [...subArr, ...subCom];
      }
    } else if (level === 'arrondissement') {
      const subCom = (communesGeoJSON?.features || [])
        .filter((f: any) => normEqual(f.properties?.arrondissement_nom, name))
        .map((f: any) => ({
          key: (f.properties?.nom || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
          label: (f.properties?.nom || "").toUpperCase(),
          type: 'Commune'
        }));
      subEntities = subCom;
    } else if (level === 'commune') {
      const subLoc = Array.from(new Set(
        alerts
          .filter((a: any) => normEqual(a.commune, name) && a.localite)
          .map((a: any) => a.localite.toUpperCase())
      )).map(locName => ({
        key: locName.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        label: locName,
        type: 'Localité'
      }));
      subEntities = subLoc;
    }

    const subEntityData: Record<string, { label: string; type: string; count: number; types: Record<string, number> }> = {};

    // Initialize all resolved sub-entities with 0 counts
    subEntities.forEach(ent => {
      subEntityData[ent.key] = {
        label: ent.label,
        type: ent.type,
        count: 0,
        types: {}
      };
      ALL_ALERT_TYPES.forEach(t => { subEntityData[ent.key].types[t] = 0; });
    });

    // Populate data from alerts
    alerts.forEach((a: any) => {
      let entKey = '';
      let entLabel = '';
      let entType = '';

      if (level === 'region') {
        const rawDept = a.departement || 'Non defini';
        entKey = rawDept.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        entLabel = rawDept.toUpperCase();
        entType = 'Département';
      } else if (level === 'departement') {
        const rawArr = a.arrondissement;
        const rawCom = a.commune;

        if (rawCom) {
          entKey = rawCom.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          entLabel = rawCom.toUpperCase() + " (Com.)";
          entType = 'Commune';
        } else if (rawArr) {
          entKey = rawArr.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          entLabel = rawArr.toUpperCase() + " (Arr.)";
          entType = 'Arrondissement';
        } else {
          entKey = 'NON_DEFINI';
          entLabel = 'Non défini';
          entType = 'Inconnu';
        }
      } else if (level === 'arrondissement') {
        const rawCom = a.commune || 'Non defini';
        entKey = rawCom.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        entLabel = rawCom.toUpperCase();
        entType = 'Commune';
      } else if (level === 'commune') {
        const rawLoc = a.localite || 'Non defini';
        entKey = rawLoc.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        entLabel = rawLoc;
        entType = 'Localité';
      }

      if (entKey) {
        if (!subEntityData[entKey]) {
          subEntityData[entKey] = {
            label: entLabel,
            type: entType,
            count: 0,
            types: {}
          };
          ALL_ALERT_TYPES.forEach(t => { subEntityData[entKey].types[t] = 0; });
        }
        subEntityData[entKey].count += 1;
        const natureKey = normalizeNature(a.nature);
        subEntityData[entKey].types[natureKey] = (subEntityData[entKey].types[natureKey] || 0) + 1;
      }
    });

    const subEntityStats = Object.entries(subEntityData)
      .map(([key, data]) => ({
        key,
        name: data.label,
        type: data.type,
        count: data.count,
        types: ALL_ALERT_TYPES.map(t => ({ name: t, count: data.types[t] || 0 }))
      }))
      .sort((a, b) => b.count - a.count);

    return {
      typeStats,
      subEntityStats,
      totalAlerts: alerts.length
    };
  }, [filteredAlerts, adminScope, departementsGeoJSON, arrondissementsGeoJSON, communesGeoJSON]);

  const { data: unreadData } = useUnreadNotificationsCount();
  const unreadAlerts = unreadData?.count ?? 0;

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-supervisor-home"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        return { total: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: 3_000, // Actualisation presque instantanee de la carte SMS
    refetchOnWindowFocus: true,
  });
  const unreadMessages = unreadMsgCount?.total ?? 0;

  const { data: recentNotifs } = useQuery({
    queryKey: ["supervisor-recent-notifs"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any[]>("GET", `/alerts/received/${user?.id}`);
        if (!res.ok) return [];
        const notifs = res.data as any[];
        return notifs.filter((n: any) => !n.is_read && n.alert).slice(0, 10);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: 3_000, // Actualisation presque instantanee de la carte Alertes
    refetchOnWindowFocus: true,
    staleTime: 1_000,
  });

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />

      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain px-4 pb-20 pt-4">
        <div className="flex flex-col items-center gap-3 pb-2 pt-2">
          <img
            src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png"
            alt="ScoDi"
            className="h-16 object-contain"
          />
          <p className="max-w-xs text-center text-[11px] font-bold leading-tight text-gray-700">
            Systeme de Controle et de Digitalisation
          </p>
        </div>

        {/* Mobile / APK : Alertes + Messages cote a cote, puis Carte (masques du header sur /supervisor) */}
        <div className="relative z-10 mx-auto w-full max-w-[280px] space-y-2.5 pt-2">
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <AlerteDomainActionCard
              variant="alerts"
              alertsTone="orange"
              size="supervisor"
              onClick={() => setLocation("/alerts")}
              badge={unreadAlerts}
              subtitle="Consulter les alertes et notifications"
            />
            <AlerteDomainActionCard
              variant="messages"
              size="supervisor"
              onClick={() => setLocation("/sms")}
              badge={unreadMessages}
              subtitle="Consulter vos messages et discussions"
            />
          </div>
          <SupervisorMapCard onClick={() => setLocation("/map")} />
        </div>

        <div className="flex flex-col items-center gap-4 pb-2 pt-4">
          <div className="mt-2 flex items-center justify-center gap-6">
            <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />
            <img
              src="/logo_forets.png"
              alt="Eaux et Forets"
              className="h-20 object-contain mix-blend-multiply"
            />
          </div>

          {recentNotifs && recentNotifs.length > 0 && (
            <div className="mt-4 w-full">
              <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50">
                <div className="flex items-center justify-between gap-1.5 border-b border-amber-200 bg-amber-100 px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Nouvelle alerte{recentNotifs.length > 1 ? `s (${recentNotifs.length})` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiRequest("PATCH", `/alerts/user/${user?.id}/read-all`);
                        queryClient.invalidateQueries({ queryKey: ["supervisor-recent-notifs"] });
                        queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
                      } catch (e) {
                        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
                        /* ignore */
                      }
                    }}
                    className="text-[9px] font-bold text-amber-700 underline transition-colors hover:text-amber-900"
                  >
                    Tout marquer lu
                  </button>
                </div>

                {/* Section bande d'annonce scrollable (Ticker) */}
                <div className="relative flex h-10 items-center overflow-hidden whitespace-nowrap bg-amber-50">
                  <div className="animate-marquee flex items-center gap-8 pl-4">
                    {recentNotifs.map((n: any) => (
                      <div
                        key={n.id}
                        className="group flex cursor-pointer items-center rounded-full bg-amber-100/50 px-3 py-1 transition-colors hover:bg-amber-200/50"
                        onClick={() => setLocation("/alerts")}
                      >
                        {renderTickerItem(n)}
                      </div>
                    ))}
                    {/* Dupliquer les elements pour un defilement continu plus fluide si necessaire, mais le CSS gere le retour */}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-[85px] right-6 z-50 flex flex-col items-end">
        <span className="mb-1 select-none text-[9px] font-bold leading-none text-gray-300 mr-1.5">
          V1.0
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowStatsModal(true)}
            className="text-emerald-600 transition-all hover:text-emerald-800 active:scale-90"
            title="Carnet de suivi de la region"
          >
            <BookOpen className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setShowLicense(true)}
            className="text-blue-500 transition-all hover:text-blue-700 active:scale-90"
            title="Licence SCoDi"
          >
            <Info className="h-5 w-5" />
          </button>
        </div>
      </div>

      <LicenseDialog isOpen={showLicense} onClose={() => setShowLicense(false)} />

      {showStatsModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 pt-10 pb-16 backdrop-blur-sm">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl">
            {/* Header */}
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-emerald-600" />
                  Carnet de Suivi des Alertes
                </h3>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
                  {subtitleLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowStatsModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* LINE 1: Region total + all types on same line */}
            <div className="mb-5 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100/30 border border-emerald-200 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-emerald-900">{stats.totalAlerts}</span>
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Alertes</span>
                </div>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer transition-all"
                >
                  <option value="all">Tout l'historique</option>
                  <option value="current">Mois en cours</option>
                  {MONTH_NAMES.map((name, idx) => (
                    <option key={idx} value={String(idx)}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.typeStats.map((item, idx) => {
                  const colors = TYPE_COLORS[item.name] || TYPE_COLORS['Autre'];
                  return (
                    <div key={idx} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${colors.bg} ${colors.border}`}>
                      <TypeIcon name={item.name} size={16} />
                      <span className={`text-[11px] font-bold ${colors.text}`}>{item.name}</span>
                      <span className={`text-sm font-black ${colors.text}`}>{item.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section: Departments */}
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                {subEntityTitle}
              </h4>
              {stats.subEntityStats.length === 0 ? (
                <p className="text-[11px] text-slate-500 italic py-2">Aucune subdivision administrative identifiée</p>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {stats.subEntityStats.map((d, idx) => {
                    const isTop = idx === 0 && d.count > 0;
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl p-3 border transition-all ${isTop
                          ? 'bg-amber-50/40 border-amber-200'
                          : 'bg-white border-slate-100'
                          }`}
                      >
                        {/* Department name + total */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-black text-slate-800 capitalize flex items-center gap-1.5">
                            {d.name}
                            {isTop && (
                              <span className="text-[8px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                #1
                              </span>
                            )}
                          </span>
                          <span className="text-sm font-black text-slate-950 bg-slate-100 px-2.5 py-0.5 rounded-lg">
                            {d.count}
                          </span>
                        </div>
                        {/* Per-type breakdown on same line */}
                        <div className="flex flex-wrap gap-1.5">
                          {d.types.map((t, tIdx) => {
                            const colors = TYPE_COLORS[t.name] || TYPE_COLORS['Autre'];
                            return (
                              <span
                                key={tIdx}
                                className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border flex items-center gap-1 ${colors.bg} ${colors.border} ${colors.text}`}
                              >
                                <TypeIcon name={t.name} size={13} />
                                {t.name}: <strong>{t.count}</strong>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Navigation filter tabs (Week, Month, Year, All) */}
            <div className="flex border-t border-slate-100 pt-4 mt-5 justify-center">
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setTimePeriod('week')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timePeriod === 'week' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Semaine
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('month')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timePeriod === 'month' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Mois
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('year')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timePeriod === 'year' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Année
                </button>
                <button
                  type="button"
                  onClick={() => setTimePeriod('all')}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${timePeriod === 'all' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Tout
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
