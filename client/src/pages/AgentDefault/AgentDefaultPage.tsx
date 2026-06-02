import React, { useState, useEffect } from "react";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import { AlertTriangle, Info, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LicenseDialog from "@/components/layout/LicenseDialog";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { apiRequest } from "@/lib/api";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
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

export default function AgentDefaultPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showLicense, setShowLicense] = useState(false);
  const [outOfZone, setOutOfZone] = useState(false);

  const { data: unreadData } = useUnreadNotificationsCount();
  const unreadAlerts = unreadData?.count ?? 0;

  const { data: recentNotifs } = useQuery({
    queryKey: ["agent-recent-notifs"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any[]>("GET", `/alerts/received/${user?.id}`);
        if (!res.ok) return [];
        const notifs = res.data as any[];
        return notifs.filter((n: any) => !n.is_read && n.alert).slice(0, 10);
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        return [];
       }
    },
    enabled: !!user,
    refetchInterval: 3000,
    staleTime: 1000,
  });

  // Heartbeat SANS GPS (test stabilité APK)
  useEffect(() => {
    const sendHeartbeat = async () => {
      try {
        const res = await authenticatedFetch('/api/auth/heartbeat-gps', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        if (res.ok) {
          const data = await res.json();
          setOutOfZone(!!data.outOfZone);
        }
      } catch (err) {
        console.error("Erreur heartbeat:", err);
      }
    };
  }, []);

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-main"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        return { total: 0  };
      }
    },
    refetchInterval: 3000,
  });

  const msgUnread = unreadMsgCount?.total || 0;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#2d6a4f]">
      <AgentTopHeader />

      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar flex flex-col items-center justify-center px-4 py-8 relative">

        {/* Main Centered Modal / Pop-up */}
        <div className="w-full max-w-sm bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl shadow-black/20 border border-white/50 p-7 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 relative z-10">

          {/* Header - Logo & Title */}
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="h-[72px] w-[72px] bg-slate-50/50 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 mb-1">
              <img
                src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png"
                alt="ScoDi"
                className="h-12 object-contain"
              />
            </div>

            <h2 className="text-[17px] font-extrabold text-slate-800 tracking-tight">
              SCoDi Mobile
            </h2>

            <p className="text-center text-[10px] font-bold leading-relaxed text-slate-500 uppercase tracking-widest max-w-[200px]">
              Système de Contrôle et de Digitalisation
            </p>
          </div>

          {/* Action Cards Grid */}
          <div className="w-full grid grid-cols-2 gap-3">

            <AlerteDomainActionCard
              variant="alerts"
              alertsTone="orange"
              size="compact"
              onClick={() => {
                if (outOfZone) {
                  alert("Action bloquée : Vous êtes hors zone.");
                  return;
                }
                setLocation("/alerts");
              }}
              badge={unreadAlerts}
              className={`shadow-sm transition-shadow duration-200 border border-orange-100/30 ${outOfZone
                ? 'opacity-50 grayscale cursor-not-allowed'
                : 'hover:shadow-md'
                }`}
            />

            <AlerteDomainActionCard
              variant="messages"
              size="compact"
              onClick={() => {
                let smsPath = "/sms";
                if (user?.type === "secteur" || user?.role === "sub-agent") {
                  smsPath = "/sector-sms";
                }
                setLocation(smsPath);
              }}
              badge={msgUnread}
              className="shadow-sm hover:shadow-md transition-shadow duration-200 border border-green-100/30"
            />
          </div>

          {recentNotifs && recentNotifs.length > 0 && (
            <div className="mt-6 w-full">
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
                        queryClient.invalidateQueries({ queryKey: ["agent-recent-notifs"] });
                        queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
                      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer - Blasons */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-8 w-full">
            <img
              src="/icon-blason.svg"
              alt="Blason"
              className="h-[46px] object-contain opacity-70"
            />

            <img
              src="/logo_forets.png"
              alt="Eaux et Forêts"
              className="h-[46px] object-contain mix-blend-multiply opacity-70"
            />
          </div>
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

      <LicenseDialog
        isOpen={showLicense}
        onClose={() => setShowLicense(false)}
      />
    </div>
  );
}