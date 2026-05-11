import { useAuth } from "@/contexts/AuthContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, MessageSquare, User } from "lucide-react";
import { useLocation } from "wouter";

export default function AgentDefaultPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
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

  const localisation = [(user as any)?.region, (user as any)?.departement].filter(Boolean).join(" — ") || null;

  // Rôle métier en majuscules
  const roleUpper = (s?: string | null) => (s || "").toUpperCase();

  // Initiales de l'utilisateur pour l'avatar
  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "A";

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
            <p className="text-xs text-emerald-200 break-words mt-1 font-semibold">{roleUpper(user?.roleMetierLabel) || "AGENT"}</p>
            {localisation && (
              <p className="text-[10px] text-emerald-300 mt-1">{localisation}</p>
            )}
          </div>
        </div>

        {/* Cartes statistiques */}
        <div className="grid grid-cols-2 gap-2.5 mt-auto">
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
        <button onClick={() => setLocation("/sms")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
          <div className="relative">
            <MessageSquare className="h-5 w-5 text-gray-500" />
            {unreadMsg > 0 && (
              <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[7px] font-bold rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center">{unreadMsg}</span>
            )}
          </div>
          <span className="text-[9px] text-gray-500 font-medium">Messages</span>
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
