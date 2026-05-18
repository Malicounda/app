import { useAuth } from "@/contexts/AuthContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, MessageSquare, User as UserIcon, ChevronRight } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";

export default function AgentTopHeader() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [profileEditMode, setProfileEditMode] = useState(false);

  useEffect(() => {
    const handleEditState = (e: Event) => {
      const customEvent = e as CustomEvent;
      setProfileEditMode(customEvent.detail ?? false);
    };
    window.addEventListener('profile:edit-state', handleEditState);
    return () => window.removeEventListener('profile:edit-state', handleEditState);
  }, []);
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

  const isAlerteDomain = (user as any)?.isDefaultRole || (user as any)?.isSupervisorRole;

  return (
    <div className="shrink-0 flex flex-col">
      {/* En-tête vert foncé style dashboard */}
      <div className="bg-gradient-to-br from-green-800 to-emerald-900 px-5 pt-8 pb-1 md:pb-4 text-white">
        {/* Ligne du haut : avatar + nom + (desktop: onglets inline) */}
        <div className="flex items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar style contact téléphone */}
            <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shrink-0 border-2 border-white/40">
              <UserIcon className="w-6 h-6 text-white" strokeWidth={1.5} />
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

          {isAlerteDomain && (
            <>
              {/* Desktop : onglets inline dans le header — Masqué sur la page profil */}
              {location !== '/profile' && (
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
                    </div>
                    <span className="text-sm font-bold uppercase tracking-wide">Messages</span>
                  </button>
                </div>
              )}

              {/* Bouton Modifier pour le profil OU Fil d'Ariane pour les autres sous-pages */}
              {location === '/profile' ? (
                !profileEditMode && (
                  <button
                    onClick={() => window.dispatchEvent(new Event('profile:edit'))}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 border border-white/20 shadow-sm backdrop-blur text-xs text-white hover:bg-white/20 font-bold transition-all active:scale-95 shrink-0"
                  >
                    <span className="uppercase tracking-wider">Modifier</span>
                  </button>
                )
              ) : (
                location !== '/supervisor' && location !== '/default-home' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 shadow-sm backdrop-blur shrink-0">
                    <button
                      onClick={() => setLocation((user as any)?.isSupervisorRole ? "/supervisor" : "/default-home")}
                      className="flex items-center gap-1.5 text-xs text-emerald-100 hover:text-white font-medium transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="uppercase tracking-wider font-bold hidden sm:block">Accueil</span>
                    </button>
                    {location !== '/supervisor' && location !== '/default-home' && (
                      <>
                        <span className="text-emerald-500 opacity-60">/</span>
                        <span className="text-xs text-white font-bold uppercase tracking-wider hidden sm:block">
                          {location === '/alerts' ? 'Alertes' :
                           location === '/sms' ? 'Messagerie' :
                           location.replace('/', '')}
                        </span>
                      </>
                    )}
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>

      {/* Cartes statistiques — Mobile uniquement — Masqué sur la page profil */}
      {isAlerteDomain && location !== '/profile' && (
        <div className="px-4 md:hidden max-w-md mx-auto w-full">
          <div className="grid grid-cols-2 gap-3 relative z-10 pt-3 pb-1">
            <button
              onClick={() => setLocation("/alerts")}
              className={`bg-white shadow-sm hover:shadow-md border ${location === '/alerts' ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-100'} rounded-[18px] p-3.5 text-left active:scale-95 transition-all flex items-center gap-3 w-full`}
            >
              <div className="h-[46px] w-[46px] shrink-0 rounded-2xl bg-red-50 flex items-center justify-center relative">
                <Bell className={`h-[22px] w-[22px] ${location === '/alerts' ? 'text-red-600' : 'text-red-500'}`} strokeWidth={2.5} />
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow-sm border border-white">{unread}</span>
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide">Alertes</p>
                <p className="text-[9px] text-slate-500 leading-[1.25] mt-0.5 line-clamp-2">Consulter les alertes et notifications</p>
              </div>
            </button>
            
            <button
              onClick={() => setLocation("/sms")}
              className={`bg-white shadow-sm hover:shadow-md border ${location === '/sms' ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'} rounded-[18px] p-3.5 text-left active:scale-95 transition-all flex items-center gap-3 w-full`}
            >
              <div className="h-[46px] w-[46px] shrink-0 rounded-2xl bg-emerald-50 flex items-center justify-center relative">
                <MessageSquare className={`h-[22px] w-[22px] ${location === '/sms' ? 'text-emerald-600' : 'text-emerald-500'}`} strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-[11px] font-black text-slate-800 uppercase tracking-wide">Messages</p>
                <p className="text-[9px] text-slate-500 leading-[1.25] mt-0.5 line-clamp-2">Consulter vos messages et discussions</p>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
