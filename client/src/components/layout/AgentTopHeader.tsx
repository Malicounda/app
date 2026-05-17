import { useAuth } from "@/contexts/AuthContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, MessageSquare } from "lucide-react";
import { useLocation } from "wouter";

export default function AgentTopHeader() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
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
  const roleUpper = (s?: string | null) => (s || "").toUpperCase();
  const initials = ((user?.firstName?.[0] || "") + (user?.lastName?.[0] || "")).toUpperCase() || "A";



  return (
    <div className="shrink-0 flex flex-col">
      {/* En-tête vert foncé style dashboard */}
      <div className="bg-gradient-to-br from-green-800 to-emerald-900 px-5 pt-8 pb-1 md:pb-4 text-white">
        {/* Ligne du haut : avatar + nom + (desktop: onglets inline) */}
        <div className="flex items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar style contact téléphone */}
            <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shrink-0 border-2 border-white/40">
              <span className="text-lg font-bold text-white">{initials}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">
                {user?.firstName || ""} {user?.lastName || ""}
              </h1>
              <p className="text-xs text-emerald-200 break-words mt-1 font-semibold">{roleUpper((user as any)?.roleMetierLabel) || "AGENT"}</p>
              {localisation && (
                <p className="text-[10px] text-emerald-300 mt-1">{localisation}</p>
              )}
            </div>
          </div>

          {/* Desktop : onglets inline dans le header */}
          <div className="hidden md:flex items-center gap-3 mr-4">
            <button
              onClick={() => setLocation("/alerts")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all ${location === '/alerts' ? 'bg-white text-red-600 shadow-lg' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <div className="relative">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm">{unread}</span>
                )}
              </div>
              <span className="text-sm font-bold uppercase tracking-wide">Alertes</span>
            </button>
            
            <button
              onClick={() => setLocation("/sms")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all ${location === '/sms' ? 'bg-white text-emerald-600 shadow-lg' : 'bg-white/15 text-white hover:bg-white/25'}`}
            >
              <div className="relative">
                <MessageSquare className="h-5 w-5" />
                {unreadMsg > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm">{unreadMsg}</span>
                )}
              </div>
              <span className="text-sm font-bold uppercase tracking-wide">Messages</span>
            </button>
          </div>

          {/* Bouton Déconnexion */}
          <button
            onClick={() => logout()}
            className="flex items-center justify-center gap-1 p-2.5 sm:px-3 sm:py-2 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 transition-all text-white shadow-sm"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden sm:block text-[10px] font-bold uppercase tracking-tighter">Déconnexion</span>
          </button>
        </div>
      </div>

      {/* Cartes statistiques — Mobile uniquement */}
      <div className="px-4 md:hidden">
        <div className="grid grid-cols-2 gap-3 relative z-10 pt-2">
          <button
            onClick={() => setLocation("/alerts")}
            className={`bg-white shadow-md border ${location === '/alerts' ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-100'} rounded-2xl p-3 text-center active:scale-95 transition-transform flex flex-col items-center justify-center`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1 relative">
              <Bell className={`h-5 w-5 ${location === '/alerts' ? 'text-red-600' : 'text-red-500'}`} />
              {unread > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm">{unread}</span>
              )}
            </div>
            <p className={`text-[11px] ${location === '/alerts' ? 'text-red-600' : 'text-slate-600'} font-bold uppercase tracking-wide mt-1`}>Alertes</p>
          </button>
          
          <button
            onClick={() => setLocation("/sms")}
            className={`bg-white shadow-md border ${location === '/sms' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'} rounded-2xl p-3 text-center active:scale-95 transition-transform flex flex-col items-center justify-center`}
          >
            <div className="flex items-center justify-center gap-1.5 mb-1 relative">
              <MessageSquare className={`h-5 w-5 ${location === '/sms' ? 'text-emerald-600' : 'text-emerald-600'}`} />
              {unreadMsg > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm">{unreadMsg}</span>
              )}
            </div>
            <p className={`text-[11px] ${location === '/sms' ? 'text-emerald-600' : 'text-slate-600'} font-bold uppercase tracking-wide mt-1`}>Messages</p>
          </button>
        </div>
      </div>
    </div>
  );
}
