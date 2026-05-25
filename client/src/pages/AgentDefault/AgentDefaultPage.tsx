import React, { useState, useEffect } from "react";
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
  const [outOfZone, setOutOfZone] = useState(false);

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
      } catch {
        return { total: 0 };
      }
    },
    refetchInterval: 30000,
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
              className={`shadow-sm transition-shadow duration-200 border border-orange-100/30 ${outOfZone
                ? 'opacity-50 grayscale cursor-not-allowed'
                : 'hover:shadow-md'
                }`}
            />

            <AlerteDomainActionCard
              variant="messages"
              size="compact"
              onClick={() => setLocation("/sms")}
              badge={msgUnread}
              className="shadow-sm hover:shadow-md transition-shadow duration-200 border border-green-100/30"
            />
          </div>

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