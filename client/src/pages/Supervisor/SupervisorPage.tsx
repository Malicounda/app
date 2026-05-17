import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, LogOut, Map, MessageSquare, User } from "lucide-react";
import { useLocation } from "wouter";
import AgentTopHeader from "@/components/layout/AgentTopHeader";

export default function SupervisorPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
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

      {/* Contenu scrollable */}
      <div className="flex-1 px-4 pb-20 space-y-4 overflow-y-auto overscroll-contain">
        {/* Cartes statistiques (Carte Map) */}
        <div className="grid grid-cols-1 gap-3 relative z-10 pt-2">
          <button
            onClick={() => setLocation("/map")}
            className="bg-white shadow-md border border-slate-100 rounded-2xl p-3 text-center active:scale-95 transition-transform flex flex-col items-center justify-center"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1 relative">
              <Map className="h-5 w-5 text-blue-500" />
            </div>
            <p className="text-[11px] text-slate-600 font-bold uppercase tracking-wide mt-1">Carte</p>
          </button>
        </div>
        {/* Logos partenaires */}
        <div className="flex flex-col items-center gap-4 pt-4 pb-2">
          <div className="flex items-center justify-center">
          </div>
          <img src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png" alt="ScoDi" className="h-20 object-contain" />
          <p className="text-[11px] text-gray-700 text-center max-w-xs leading-tight font-bold">Système de Contrôle et de Digitalisation</p>
          <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />

          {/* Bandeau défilant des nouvelles alertes */}
          {recentNotifs && recentNotifs.length > 0 && (
            <div className="w-full mt-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 border-b border-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Nouvelles alertes ({recentNotifs.length})</span>
                </div>
                <div className="max-h-32 overflow-y-auto">
                  {recentNotifs.map((n: any) => {
                    const sender = n.alert?.sender;
                    const grade = sender?.grade || "";
                    const fullName = [sender?.first_name, sender?.last_name].filter(Boolean).join(" ") || "Agent inconnu";
                    const title = n.alert?.title || n.message || "Alerte";
                    return (
                      <button
                        key={n.id}
                        onClick={() => setLocation("/alerts")}
                        className="w-full text-left px-3 py-2 border-b border-amber-100 last:border-b-0 hover:bg-amber-100/50 active:bg-amber-200/50 transition-colors flex items-start gap-2"
                      >
                        <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold text-gray-800 truncate">
                            {grade ? `${grade} ` : ""}{fullName}
                          </p>
                          <p className="text-[9px] text-gray-500 truncate">{title}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setLocation("/alerts")}
                  className="w-full text-center py-1.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  Voir la boîte de réception →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center pb-20">
        <img src="/logo_forets.png" alt="Eaux et Forêts" className="h-24 object-contain" />
      </div>


      <p className="text-center text-[9px] text-gray-300 py-1">V1.0</p>
    </div>
  );
}
