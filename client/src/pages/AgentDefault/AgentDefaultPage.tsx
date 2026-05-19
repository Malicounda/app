import { useAuth } from "@/contexts/AuthContext";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import { Bell, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

export default function AgentDefaultPage() {
  const [, setLocation] = useLocation();

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-main"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/messages/unread-count`, { credentials: "include" });
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    refetchInterval: 30000
  });
  const msgUnread = unreadMsgCount?.total || 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      <AgentTopHeader />

      {/* Contenu scrollable avec padding pour le header global */}
      <div 
        className="flex-1 px-4 pb-20 space-y-4 overflow-y-auto overscroll-contain"
        style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 24px))' }}
      >
        {/* Cartes d'actions côte à côte */}
        <div className="relative z-10 pt-6 px-4 max-w-[340px] sm:max-w-[420px] mx-auto w-full grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocation("/alerts")}
            className="bg-white shadow-sm hover:shadow-md border border-slate-100 rounded-[24px] p-4 text-center active:scale-95 transition-all flex flex-col items-center gap-3 w-full"
          >
            <div className="h-[80px] w-[80px] shrink-0 rounded-2xl bg-red-50 flex items-center justify-center relative">
              <Bell className="h-[44px] w-[44px] text-red-500" strokeWidth={2} />
            </div>
            <div className="flex flex-col items-center justify-center">
              <p className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Alertes</p>
              <p className="text-[8px] text-slate-400 leading-[1.3] mt-1 line-clamp-2">Signaler ou suivre vos alertes</p>
            </div>
          </button>

          <button
            onClick={() => setLocation("/sms")}
            className="bg-white shadow-sm hover:shadow-md border border-slate-100 rounded-[24px] p-4 text-center active:scale-95 transition-all flex flex-col items-center gap-3 w-full relative"
          >
            {msgUnread > 0 && (
              <div className="absolute top-3 right-3 h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse shadow-sm">
                {msgUnread}
              </div>
            )}
            <div className="h-[80px] w-[80px] shrink-0 rounded-2xl bg-emerald-50 flex items-center justify-center relative">
              <MessageSquare className="h-[44px] w-[44px] text-emerald-500" strokeWidth={2} />
            </div>
            <div className="flex flex-col items-center justify-center">
              <p className="text-[12px] font-black text-slate-800 uppercase tracking-wide">Messages</p>
              <p className="text-[8px] text-slate-400 leading-[1.3] mt-1 line-clamp-2">Messagerie SMS interne</p>
            </div>
          </button>
        </div>

        {/* Logos partenaires */}
        <div className="flex flex-col items-center gap-4 pt-4 pb-2">
          <div className="flex items-center justify-center">
            {/* Logo Eaux et Forêts supprimé d'ici pour être mis en bas */}
          </div>
          <img src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png" alt="ScoDi" className="h-20 object-contain" />
          <p className="text-[11px] text-gray-700 text-center max-w-xs leading-tight font-bold">Système de Contrôle et de Digitalisation</p>
          <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />
        </div>

        <div className="flex flex-col items-center pt-2 pb-2">
          <img src="/logo_forets.png" alt="Eaux et Forêts" className="h-24 object-contain" />
        </div>
        <p className="text-center text-[9px] text-gray-300 pb-2">V1.0</p>
      </div>
    </div>
  );
}
