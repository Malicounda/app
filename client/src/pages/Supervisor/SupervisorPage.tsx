import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Map, MessageSquare, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import AgentTopHeader from "@/components/layout/AgentTopHeader";

export default function SupervisorPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const isSupervisorRole = !!(user as any)?.isSupervisorRole;
  const { data: unreadData } = useUnreadNotificationsCount();
  const unread = unreadData?.count ?? 0;

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-alerte"],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/messages/unread-count`, { credentials: "include" });
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch { return { total: 0 }; }
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });
  const unreadMsg = unreadMsgCount?.total ?? 0;

  // Récupérer les notifications non lues avec détails pour le bandeau défilant
  const { data: recentNotifs } = useQuery({
    queryKey: ["supervisor-recent-notifs"],
    queryFn: async () => {
      try {
        const res = await apiRequest<any[]>("GET", `/alerts/received/${user?.id}`);
        if (!res.ok) return [];
        const notifs = res.data as any[];
        return notifs
          .filter((n: any) => !n.is_read && n.alert)
          .slice(0, 10);
      } catch { return []; }
    },
    enabled: !!user,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const localisation = [(user as any)?.region, (user as any)?.departement].filter(Boolean).join(" — ") || null;

  // Rôle métier en majuscules
  const roleUpper = (s?: string | null) => (s || "").toUpperCase();

  // Initiales de l'utilisateur pour l'avatar
  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "S";

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      <AgentTopHeader />

      {/* Contenu scrollable avec padding pour éviter le chevauchement avec le header fixe global */}
      <div 
        className="flex-1 px-4 pb-20 space-y-4 overflow-y-auto overscroll-contain"
        style={{ paddingTop: 'calc(4rem + env(safe-area-inset-top, 24px))' }}
      >
        {/* Cartes statistiques (Carte Map) */}
        <div className="relative z-10 pt-2 px-4 max-w-[280px] mx-auto w-full">
          <button
            onClick={() => setLocation("/map")}
            className="bg-white shadow-sm hover:shadow-md border border-slate-100 rounded-[20px] p-4 text-left active:scale-95 transition-all flex items-center gap-4 w-full"
          >
            <div className="h-[64px] w-[64px] shrink-0 rounded-2xl bg-blue-50 flex items-center justify-center relative">
              <Map className="h-[32px] w-[32px] text-blue-500" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-[14px] font-black text-slate-800 uppercase tracking-wide">Carte</p>
              <p className="text-[10px] text-slate-500 leading-[1.3] mt-0.5 line-clamp-2">Voir la carte interactive et la géolocalisation</p>
            </div>
          </button>
        </div>
        {/* Logos partenaires */}
        <div className="flex flex-col items-center gap-4 pt-4 pb-2">
          <div className="flex items-center justify-center">
          </div>
          <img src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png" alt="ScoDi" className="h-20 object-contain" />
          <p className="text-[11px] text-gray-700 text-center max-w-xs leading-tight font-bold">Système de Contrôle et de Digitalisation</p>
          <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />

          {/* Bandeau ticker défilant style TV — alerte(s) non lues */}
          {recentNotifs && recentNotifs.length > 0 && (
            <div className="w-full mt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                {/* Titre + compteur + bouton tout marquer lu */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border-b border-amber-200 justify-between">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">
                      Nouvelle alerte{recentNotifs.length > 1 ? `s (${recentNotifs.length})` : ''}
                    </span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await apiRequest("PATCH", `/alerts/user/${user?.id}/read-all`);
                        queryClient.invalidateQueries({ queryKey: ["supervisor-recent-notifs"] });
                        queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
                      } catch { }
                    }}
                    className="text-[9px] font-bold text-amber-700 underline hover:text-amber-900 transition-colors"
                  >
                    Tout marquer lu
                  </button>
                </div>

                {/* Ticker défilant une seule ligne */}
                <div
                  className="overflow-hidden cursor-pointer relative"
                  onClick={() => setLocation("/alerts")}
                  style={{ height: '32px' }}
                >
                  <style>{`
                    @keyframes supervisor-ticker {
                      0%   { transform: translateX(0); }
                      100% { transform: translateX(-50%); }
                    }
                    .supervisor-ticker-inner { animation: supervisor-ticker linear infinite; }
                  `}</style>
                  <div
                    className="supervisor-ticker-inner flex items-center gap-6 whitespace-nowrap absolute top-0 left-0 h-full px-4"
                    style={{ animationDuration: `${Math.max(25, recentNotifs.length * 14)}s` }}
                  >
                    {recentNotifs.map((n: any) => {
                      const sender = n.alert?.sender;
                      const grade = sender?.grade || "";
                      const fullName = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ") || "Agent inconnu";
                      const localisationStr = [sender?.departement, sender?.region].filter(Boolean).join(" / ") || "Lieu inconnu";
                      const title = n.alert?.title || n.message || "Alerte";
                      return (
                        <span key={n.id} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="font-bold">{grade ? `${grade} ` : ""}{fullName}</span>
                          <span className="text-amber-700">— {localisationStr} —</span>
                          <span>{title}</span>
                          <span className="text-amber-300 mx-3">◆</span>
                        </span>
                      );
                    })}
                    {/* Doublon pour boucle continue */}
                    {recentNotifs.map((n: any) => {
                      const sender = n.alert?.sender;
                      const grade = sender?.grade || "";
                      const fullName = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ") || "Agent inconnu";
                      const localisationStr = [sender?.departement, sender?.region].filter(Boolean).join(" / ") || "Lieu inconnu";
                      const title = n.alert?.title || n.message || "Alerte";
                      return (
                        <span key={`dup-${n.id}`} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          <span className="font-bold">{grade ? `${grade} ` : ""}{fullName}</span>
                          <span className="text-amber-700">— {localisationStr} —</span>
                          <span>{title}</span>
                          <span className="text-amber-300 mx-3">◆</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center pt-6 pb-2">
          <img src="/logo_forets.png" alt="Eaux et Forêts" className="h-24 object-contain" />
        </div>

        <p className="text-center text-[9px] text-gray-300 py-1">V1.0</p>
      </div>
    </div>
  );
}
