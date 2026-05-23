import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { useLocation } from "wouter";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import SupervisorMapCard from "@/components/alerte/SupervisorMapCard";
import LicenseDialog from "@/components/layout/LicenseDialog";
import { buildSupervisorTickerParts } from "@/utils/alertZoneScope";

function renderTickerItem(n: any) {
  const { grade, fullName, zoneSummary, title, gpsLocation } = buildSupervisorTickerParts(n);
  const sep = <span className="text-amber-600 mx-0.5">—</span>;

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900">
      <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
      <span className="whitespace-nowrap font-bold">
        {grade ? `${grade} ` : ""}
        {fullName}
      </span>
      {grade ? (
        <>
          {sep}
          <span className="whitespace-nowrap">{grade}</span>
        </>
      ) : null}
      {zoneSummary ? (
        <>
          {sep}
          <span className="whitespace-nowrap text-amber-800">{zoneSummary}</span>
        </>
      ) : null}
      {sep}
      <span className="whitespace-nowrap">{title}</span>
      {sep}
      <span className="whitespace-nowrap font-medium text-amber-700">{gpsLocation}</span>
      <span className="mx-3 text-amber-300">◆</span>
    </span>
  );
}

export default function SupervisorPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [showLicense, setShowLicense] = useState(false);

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
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />

      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain px-4 pb-20 pt-4">
        {/* Carte Map — taille d’origine (max 280px), design maquette uniquement */}
        <div className="relative z-10 mx-auto w-full max-w-[280px] pt-2">
          <SupervisorMapCard onClick={() => setLocation("/map")} />
        </div>

        <div className="flex flex-col items-center gap-4 pb-2 pt-4">
          <img
            src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png"
            alt="ScoDi"
            className="h-20 object-contain"
          />
          <p className="max-w-xs text-center text-[11px] font-bold leading-tight text-gray-700">
            Système de Contrôle et de Digitalisation
          </p>
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

                <div
                  className="relative cursor-pointer overflow-hidden"
                  onClick={() => setLocation("/alerts")}
                  style={{ height: "32px" }}
                >
                  <style>{`
                    @keyframes supervisor-ticker {
                      0%   { transform: translateX(0); }
                      100% { transform: translateX(-50%); }
                    }
                    .supervisor-ticker-inner { animation: supervisor-ticker linear infinite; }
                  `}</style>
                  <div
                    className="supervisor-ticker-inner absolute left-0 top-0 flex h-full items-center gap-6 whitespace-nowrap px-4"
                    style={{ animationDuration: `${Math.max(25, recentNotifs.length * 14)}s` }}
                  >
                    {recentNotifs.map((n: any) => (
                      <React.Fragment key={n.id}>{renderTickerItem(n)}</React.Fragment>
                    ))}
                    {recentNotifs.map((n: any) => (
                      <React.Fragment key={`dup-${n.id}`}>{renderTickerItem(n)}</React.Fragment>
                    ))}
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
