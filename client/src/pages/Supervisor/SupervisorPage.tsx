import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { useLocation } from "wouter";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import SupervisorMapCard from "@/components/alerte/SupervisorMapCard";
import LicenseDialog from "@/components/layout/LicenseDialog";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";
import { buildSupervisorTickerParts } from "@/utils/alertZoneScope";

function renderTickerItem(n: any) {
  const { grade, fullName, zoneSummary, title, gpsLocation } = buildSupervisorTickerParts(n);
  const sep = <span className="text-amber-600/50 mx-1.5">•</span>;

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

export default function SupervisorPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showLicense, setShowLicense] = useState(false);

  const { data: unreadData } = useUnreadNotificationsCount();
  const unreadAlerts = unreadData?.count ?? 0;

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-supervisor-home"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: 3_000, // Actualisation presque instantanée de la carte SMS
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
      } catch {
        return [];
      }
    },
    enabled: !!user,
    refetchInterval: 3_000, // Actualisation presque instantanée de la carte Alertes
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
            Système de Contrôle et de Digitalisation
          </p>
        </div>

        {/* Mobile / APK : Alertes + Messages côte à côte, puis Carte (masqués du header sur /supervisor) */}
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
                      } catch {
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
                    {/* Dupliquer les éléments pour un défilement continu plus fluide si nécessaire, mais le CSS gère le retour */}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-[85px] right-6 z-50 flex flex-col items-center">
        <span className="mb-1 select-none text-[9px] font-bold leading-none text-gray-300">
          V1.0
        </span>
        <button
          type="button"
          onClick={() => setShowLicense(true)}
          className="text-blue-500 transition-all hover:text-blue-700 active:scale-90"
          title="Licence SCoDi"
        >
          <Info className="h-5 w-5" />
        </button>
      </div>

      <LicenseDialog isOpen={showLicense} onClose={() => setShowLicense(false)} />
    </div>
  );
}
