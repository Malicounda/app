import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/api";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, LogOut, Map, MessageSquare, User } from "lucide-react";
import { useLocation } from "wouter";

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
      {/* En-tête vert foncé style dashboard */}
      <div className="bg-gradient-to-br from-green-800 to-emerald-900 px-5 pt-8 pb-1 text-white shrink-0 flex flex-col">
        {/* Ligne du haut : avatar + nom */}
        <div className="flex items-center gap-3 pt-6">
          {/* Avatar style contact téléphone */}
          <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shrink-0 border-2 border-white/40">
            <span className="text-lg font-bold text-white">{initials}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">
              {user?.firstName || ""} {user?.lastName || ""}
            </h1>
            <p className="text-xs text-emerald-200 break-words mt-1 font-semibold">{roleUpper(user?.roleMetierLabel) || "SUPERVISEUR"}</p>
            {localisation && (
              <p className="text-[10px] text-emerald-300 mt-1">{localisation}</p>
            )}
          </div>
        </div>

        {/* Cartes statistiques */}
        <div className={`grid ${isSupervisorRole ? 'grid-cols-2' : 'grid-cols-3'} gap-2.5 mt-auto`}>
          <button
            onClick={() => setLocation("/alerts")}
            className="bg-white/15 backdrop-blur rounded-xl p-3 text-center active:scale-95 transition-transform"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Bell className="h-4 w-4 text-red-300" />
              {unread > 0 && (
                <span className="bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unread}</span>
              )}
            </div>
            <p className="text-[10px] text-emerald-100 font-medium">Alertes</p>
          </button>
          {!isSupervisorRole && (
            <button
              onClick={() => setLocation("/sms")}
              className="bg-white/15 backdrop-blur rounded-xl p-3 text-center active:scale-95 transition-transform"
            >
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <MessageSquare className="h-4 w-4 text-emerald-300" />
                {unreadMsg > 0 && (
                  <span className="bg-emerald-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{unreadMsg}</span>
                )}
              </div>
              <p className="text-[10px] text-emerald-100 font-medium">Messages</p>
            </button>
          )}
          <button
            onClick={() => setLocation("/map")}
            className="bg-white/15 backdrop-blur rounded-xl p-3 text-center active:scale-95 transition-transform"
          >
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Map className="h-4 w-4 text-blue-300" />
            </div>
            <p className="text-[10px] text-emerald-100 font-medium">Carte</p>
          </button>
        </div>
      </div>

      {/* Contenu scrollable */}
      <div className="flex-1 -mt-3 px-4 pb-20 space-y-4 overflow-y-auto overscroll-contain">
        {/* Logos partenaires */}
        <div className="flex flex-col items-center gap-4 pt-4 pb-2">
          <div className="flex items-center justify-center gap-6">
            <img src="/images/jub_jubal.png" alt="Jub Jubal" className="h-24 object-contain" />
            <img src="/logo_forets.png" alt="Eaux et Forêts" className="h-24 object-contain" />
          </div>
          <img src="/scodio.png" alt="SCoDiPP" className="h-16 object-contain" />
          <p className="text-[10px] text-gray-500 text-center max-w-xs leading-tight font-medium">Système de Collecte de Données et d'Information pour la Protection et la Préservation</p>
          <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />
          {/* Bouton déconnexion sous le blason */}
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold px-5 py-2 rounded-full active:scale-95 transition-all flex items-center gap-1.5 shadow-md"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Déconnexion</span>
          </button>

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

      {/* Barre de navigation bas style Model */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around py-2 z-50">
        <button onClick={() => setLocation("/alerts")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
          <div className="relative">
            <Bell className="h-5 w-5 text-gray-500" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[7px] font-bold rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center">{unread}</span>
            )}
          </div>
          <span className="text-[9px] text-gray-500 font-medium">Alertes</span>
        </button>
        {!isSupervisorRole && (
          <button onClick={() => setLocation("/sms")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
            <div className="relative">
              <MessageSquare className="h-5 w-5 text-gray-500" />
              {unreadMsg > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[7px] font-bold rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center">{unreadMsg}</span>
              )}
            </div>
            <span className="text-[9px] text-gray-500 font-medium">Messages</span>
          </button>
        )}
        <button onClick={() => setLocation("/map")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
          <Map className="h-5 w-5 text-gray-500" />
          <span className="text-[9px] text-gray-500 font-medium">Carte</span>
        </button>
        <button onClick={() => setLocation("/profile")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
          <User className="h-5 w-5 text-gray-500" />
          <span className="text-[9px] text-gray-500 font-medium">Profil</span>
        </button>
      </div>

      <p className="text-center text-[9px] text-gray-300 py-1">V1.0</p>
    </div>
  );
}
