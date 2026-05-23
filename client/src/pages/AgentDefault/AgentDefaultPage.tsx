import React, { useState } from "react";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import { Info } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import LicenseDialog from "@/components/layout/LicenseDialog";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";

export default function AgentDefaultPage() {
  const [, setLocation] = useLocation();
  const [showLicense, setShowLicense] = useState(false);

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-main"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    refetchInterval: 30000,
  });
  const msgUnread = unreadMsgCount?.total || 0;

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />

      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain px-4 pb-20 pt-4 space-y-4">
        <div className="relative z-10 mx-auto grid w-full max-w-[280px] grid-cols-2 gap-2">
          <AlerteDomainActionCard
            variant="alerts"
            alertsTone="orange"
            size="compact"
            onClick={() => setLocation("/alerts")}
          />
          <AlerteDomainActionCard
            variant="messages"
            size="compact"
            onClick={() => setLocation("/sms")}
            badge={msgUnread}
          />
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
              alt="Eaux et Forêts"
              className="h-20 object-contain mix-blend-multiply"
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

      <LicenseDialog isOpen={showLicense} onClose={() => setShowLicense(false)} />
    </div>
  );
}
