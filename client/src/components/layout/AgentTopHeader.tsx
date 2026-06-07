import { useAuth } from "@/contexts/AuthContext";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { useQuery } from "@tanstack/react-query";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import { Bell, MessageSquare, User as UserIcon } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";

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
        const res = await authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  return { total: 0  }; }
    },
    enabled: !!user,
    refetchInterval: 5_000,
  });
  const unreadMsg = unreadMsgCount?.total ?? 0;

  const localisation = [(user as any)?.region, (user as any)?.departement].filter(Boolean).join(" — ") || null;
  const roleUpper = (s?: string | null) => (s || "").toUpperCase();

  const _domain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  const isAlerteDomain = _domain === 'ALERTE' ||
    ((_domain !== 'CHASSE' && _domain !== 'REBOISEMENT') &&
      ((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole));
  const isSupervisorRole = !!(user as any)?.isSupervisorRole;

  const isChromelessHome =
    location === "/supervisor" || location === "/default-home" || location === "/profile" || location.startsWith("/hunter") || location.startsWith("/guide") || location.includes("/hunting-declarations") || location.includes("/demande-permis-special");

  /** Accueil plein écran (fixed) : décalage sous barre République. Profil : le parent MainLayout compense déjà — pas de double marge. */
  const headerPaddingTop = isChromelessHome
    ? "calc(4rem + env(safe-area-inset-top, 24px))"
    : "1.25rem";

  return (
    <div className="shrink-0 flex flex-col">
      {/* En-tête vert foncé style dashboard */}
      <div
        className="bg-gradient-to-br from-green-800 to-emerald-900 px-5 pb-1 md:pb-4 text-white"
        style={{ paddingTop: headerPaddingTop }}
      >
        {/* Ligne du haut : avatar + nom + (desktop: onglets inline) */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar style contact téléphone */}
            <div className="w-12 h-12 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shrink-0 border-2 border-white/40">
              <UserIcon className="w-6 h-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">
                {user?.firstName || ""} {user?.lastName || ""}
              </h1>
              <p className="text-xs text-emerald-200 break-words mt-1 font-semibold">
                {user?.role === 'hunter' 
                  ? 'CHASSEUR' 
                  : user?.role === 'hunting-guide' 
                    ? 'GUIDE DE CHASSE' 
                    : (roleUpper((user as any)?.roleMetierLabel) || "AGENT")
                }
              </p>
              {localisation && (
                <p className="text-[10px] text-emerald-300 mt-1">{localisation}</p>
              )}
            </div>
          </div>

          {isAlerteDomain && (
            <>
              {/* Desktop : onglets inline dans le header — Masqué sur la page profil */}
              {location !== '/profile' && !isChromelessHome && (
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
                        <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-sm animate-pulse">{unreadMsg}</span>
                      )}
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
                !isChromelessHome && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 shadow-sm backdrop-blur shrink-0">
                    <button
                      onClick={() => {
                        if (user?.role === 'hunter') setLocation('/hunter');
                        else if (user?.role === 'hunting-guide') setLocation('/guide');
                        else setLocation((user as any)?.isSupervisorRole ? "/supervisor" : "/default-home");
                      }}
                      className="flex items-center gap-1.5 text-xs text-emerald-100 hover:text-white font-medium transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      <span className="uppercase tracking-wider font-bold hidden sm:block">Accueil</span>
                    </button>
                    {!isChromelessHome && (
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

      {/* Cartes statistiques — Mobile uniquement — Masqué sur la page profil et sur default-home */}
      {isAlerteDomain && location !== '/profile' && !isChromelessHome && (
        <div className="mx-auto w-full max-w-md px-4 md:hidden">
          <div className="relative z-10 grid grid-cols-2 gap-3 pb-1 pt-3">
            <AlerteDomainActionCard
              variant="alerts"
              size="compact"
              onClick={() => setLocation("/alerts")}
              badge={unread}
              subtitle={
                isSupervisorRole
                  ? "Consulter les alertes et notifications"
                  : undefined
              }
            />
            <AlerteDomainActionCard
              variant="messages"
              size="compact"
              onClick={() => setLocation("/sms")}
              badge={unreadMsg}
              subtitle={
                isSupervisorRole
                  ? "Consulter vos messages et discussions"
                  : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
