import { OfflineIndicator } from "@/components/ui/offline-indicator";
import { useAuth } from "@/contexts/AuthContext";
import { useStats } from "@/lib/hooks/useStats";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import '@/styles/darkSuperAdmin.css';
import '@/styles/pageFrame.css';
import '@/styles/superAdminTheme.css';
import { getHomePage, isSectorSubRole } from "@/utils/navigation";
import { useEffect, useState } from "react";
import { MdDescription, MdGroup, MdNotificationImportant, MdReceipt, MdMessage } from 'react-icons/md';
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Bell, MessageSquare, Map, User, LogOut, Home } from "lucide-react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Navbar from "./Navbar";
import { authenticatedFetch } from "@/lib/authenticatedFetch";

interface MainLayoutProps {
  children: React.ReactNode;
  hideMinistryHeader?: boolean;
}

export default function MainLayout({ children, hideMinistryHeader = false }: MainLayoutProps) {
  const { stats } = useStats();
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, logout, authInitialized, serverUnavailable } = useAuth();
  const { data: unreadData } = useUnreadNotificationsCount();
  const unread = unreadData?.count ?? 0;

  const { data: unreadMsgCount } = useQuery({
    queryKey: ["messages-unread-count-main"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(`/api/messages/unread-count`);
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch { return { total: 0 }; }
    },
    enabled: !!user,
    refetchInterval: 15_000,
  });
  const unreadMsg = unreadMsgCount?.total ?? 0;

  const isSuperAdmin = (user as any)?.isSuperAdmin === true;
  const isAlerteAgent = (typeof window !== 'undefined' && (localStorage.getItem('domain') || '').toUpperCase() === 'ALERTE') ||
    ((() => { const d = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase(); return d !== 'CHASSE' && d !== 'REBOISEMENT'; })() &&
      ((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole));
  const chromeless = isAlerteAgent && !isSuperAdmin;

  const normalizedRole = (user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-');

  const [themeVersion, setThemeVersion] = useState(0);

  useEffect(() => {
    const onThemeUpdated = () => setThemeVersion((v) => v + 1);
    window.addEventListener('theme:superadmin:updated', onThemeUpdated);
    return () => window.removeEventListener('theme:superadmin:updated', onThemeUpdated);
  }, []);

  // Appliquer le thème SuperAdmin (variables CSS) sur <html>
  useEffect(() => {
    const html = document.documentElement;
    if (!isSuperAdmin) {
      html.classList.remove('superadmin-theme');
      html.classList.remove('dark-superadmin');
      html.style.removeProperty('--sa-bg');
      html.style.removeProperty('--sa-text');
      html.style.removeProperty('--sa-sidebar-bg');
      html.style.removeProperty('--sa-header-bg');
      html.style.removeProperty('--sa-surface');
      html.style.removeProperty('--sa-border');
      html.style.removeProperty('--sa-accent');
      return;
    }

    html.classList.add('superadmin-theme');

    let cfg: any = null;
    try {
      const raw = localStorage.getItem('theme:superadmin');
      cfg = raw ? JSON.parse(raw) : null;
    } catch {
      cfg = null;
    }

    const sa = cfg?.superAdmin || {};
    const vars: Record<string, string | undefined> = {
      '--sa-bg': sa.bg,
      '--sa-text': sa.text,
      '--sa-sidebar-bg': sa.sidebarBg,
      '--sa-header-bg': sa.headerBg,
      '--sa-surface': sa.surface,
      '--sa-border': sa.border,
      '--sa-accent': sa.accent,
    };

    for (const [k, v] of Object.entries(vars)) {
      if (v) html.style.setProperty(k, v);
      else html.style.removeProperty(k);
    }

    if (cfg?.superAdmin?.useLegacyDark === true) {
      html.classList.add('dark-superadmin');
    } else {
      html.classList.remove('dark-superadmin');
    }

    return () => {
      html.classList.remove('superadmin-theme');
      html.classList.remove('dark-superadmin');
      for (const k of Object.keys(vars)) html.style.removeProperty(k);
    };
  }, [isSuperAdmin, themeVersion]);

  // Utilisation de la fonction getHomePage centralisée depuis utils/navigation

  // Gestion de la redirection unifiée
  useEffect(() => {
    // Si l'utilisateur n'est pas authentifié et n'est pas sur la page login, redirection vers login
    if (!isAuthenticated) {
      const domain = (localStorage.getItem('domain') || '').toUpperCase();
      let loginTarget = '/login';
      if (domain === 'ALERTE') {
        loginTarget = '/alerte-login';
      } else if (domain === 'REBOISEMENT') {
        loginTarget = '/reboisement-login';
      }
      
      if (location !== loginTarget) {
        setLocation(loginTarget);
      }
      return;
    }

    // Si l'utilisateur est sur la page login ou racine mais qu'il est déjà authentifié
    if (isAuthenticated && (location === '/login' || location === '/')) {
      setLocation(getHomePage(user?.role, user?.type, (user as any)?.isSuperAdmin, !!(user as any)?.isDefaultRole, !!(user as any)?.isSupervisorRole));
      return;
    }

    // Fermer automatiquement la sidebar sur mobile lors du changement de page
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
      document.body.style.overflow = ''; // Réactiver le défilement
    }
  }, [isAuthenticated, location, user]);

  // État pour gérer la visibilité du menu latéral sur mobile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // État pour sidebar rétractée (rail à icônes) sur desktop
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('sidebar:collapsed');
      return v === '1';
    } catch { return false; }
  });

  // Fonction pour gérer le toggle du sidebar
  const toggleSidebar = () => {
    setIsSidebarOpen(prev => {
      const willOpen = !prev;
      // Empêcher le défilement de la page lorsque le menu est ouvert, mais pas la sidebar elle-même
      if (willOpen) {
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
      } else {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }
      return willOpen;
    });
  };

  // Écouter les événements personnalisés d'ouverture/fermeture de la sidebar depuis le header
  useEffect(() => {
    const handleToggleSidebar = () => {
      setIsSidebarOpen(prev => {
        const willOpen = !prev;
        if (willOpen) {
          document.body.style.overflow = 'hidden';
          document.body.style.position = 'fixed';
          document.body.style.width = '100%';
        } else {
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.width = '';
        }
        return willOpen;
      });
    };

    const handleToggleSidebarCollapse = () => {
      setIsSidebarCollapsed((prev) => {
        const next = !prev;
        try { localStorage.setItem('sidebar:collapsed', next ? '1' : '0'); } catch {}
        return next;
      });
    };

    window.addEventListener('toggle-sidebar', handleToggleSidebar);
    window.addEventListener('toggle-sidebar-collapse', handleToggleSidebarCollapse);

    window.addEventListener('toggle-sidebar', handleToggleSidebar);
    window.addEventListener('toggle-sidebar-collapse', handleToggleSidebarCollapse);

    // Nettoyage
    return () => {
      window.removeEventListener('toggle-sidebar', handleToggleSidebar);
      window.removeEventListener('toggle-sidebar-collapse', handleToggleSidebarCollapse);
      document.body.style.overflow = ''; // Réactiver le défilement lors du démontage
    };
  });

  // Ajuster la hauteur du header dynamiquement
  const headerHeight = '60px'; // fallback
  const navHeight = '0px';
  const totalTopSpace = `calc(${headerHeight} + ${navHeight})`;

  // Expose fixed top offset as a CSS variable for pages using fixed overlays
  useEffect(() => {
    const headerEl = document.getElementById('app-header');
    const compute = () => {
      const h = headerEl ? `${headerEl.offsetHeight}px` : headerHeight;
      const fixedTop = hideMinistryHeader ? navHeight : h;
      document.documentElement.style.setProperty('--fixed-top', fixedTop);
    };
    compute();
    let ro: ResizeObserver | null = null;
    if (headerEl && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => compute());
      ro.observe(headerEl);
    }
    window.addEventListener('resize', compute);
    return () => {
      document.documentElement.style.removeProperty('--fixed-top');
      window.removeEventListener('resize', compute);
      ro?.disconnect();
    };
  }, [hideMinistryHeader, navHeight]);

  // Expose sidebar width as a CSS variable for pages needing layout offsets (e.g., MapPage)
  useEffect(() => {
    const width = isSidebarCollapsed ? '4rem' : '16rem'; // 64px or 256px
    document.documentElement.style.setProperty('--sidebar-width', width);
    return () => {
      document.documentElement.style.removeProperty('--sidebar-width');
    };
  }, [isSidebarCollapsed]);

  // Scroll containment is now handled by the layout structure:
  // - Root div: h-screen overflow-hidden (prevents body scroll)
  // - Right column: overflow-hidden (constrains content)
  // - <main>: flex-1 overflow-y-auto (the only scrollable element)
  // No wheel handler needed anymore.

  const showRestrictedAccess =
    authInitialized &&
    !serverUnavailable &&
    chromeless &&
    !!user &&
    !(user as any)?.isDefaultRole &&
    !(user as any)?.isSupervisorRole &&
    location !== '/profile';

  const restrictedContent = (
    <div className="w-full min-h-[75vh] flex flex-col items-center justify-center px-4 bg-[#f8fafc]">
      <div className="text-center max-w-sm">
        <h3 className="text-xl font-bold text-slate-800 tracking-tight">Accès restreint</h3>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          Votre rôle n'est pas autorisé à accéder aux alertes. Veuillez contacter un administrateur ou vous déconnecter.
        </p>
      </div>
    </div>
  );

  return (
    <div className="w-full overflow-hidden flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      {!hideMinistryHeader && !chromeless && <Header />}

      {/* Entête verte plein écran pour les agents Alerte */}
      {chromeless && (
        <nav 
          className="fixed top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-green-900 text-white z-[100] min-h-[52px]"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))' }}
        >
          {/* Gauche : Drapeau + descriptions */}
          <div className="flex items-center gap-2 min-w-0 shrink">
            <img src="/assets/Flag_of_Senegal.svg" alt="Drapeau du Sénégal" width="28" height="19" className="shrink-0" draggable={false} />
            <div className="leading-tight min-w-0">
              <p className="text-[9px] sm:text-[11px] font-semibold uppercase truncate">République du Sénégal</p>
              <p className="text-[7px] sm:text-[9px] text-green-200 uppercase truncate hidden sm:block">Direction des Eaux et Forêts</p>
              <p className="text-[8px] sm:text-[10px] text-green-300 uppercase truncate">Système d'Alerte</p>
            </div>
          </div>

          {/* Droite : Bouton Déconnexion (Permuté) */}
          <div className="flex items-center ml-auto pl-4 shrink-0">
            <button
              onClick={() => logout()}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/90 hover:bg-red-600 active:scale-95 transition-all text-white shadow-sm"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wide">Déconnexion</span>
            </button>
          </div>
        </nav>
      )}

      {/* Spacer to compensate for fixed header with page title */}
      {!hideMinistryHeader && !chromeless && (
        <div style={{ height: 'var(--fixed-top)' }} className="flex items-center justify-center">
          {location === "/sector" && (
            <h2 className="text-responsive-2xl font-bold tracking-tight mt-3 text-green-800">Tableau de bord Agent Secteur</h2>
          )}
          {location === "/sous-secteur" && (
            <h2 className="text-responsive-2xl font-bold tracking-tight mt-3 text-teal-800">Espace Sous-Secteur</h2>
          )}
          {location === "/brigade" && (
            <h2 className="text-responsive-2xl font-bold tracking-tight mt-3 text-orange-800">Espace Brigade</h2>
          )}
          {location === "/triage" && (
            <h2 className="text-responsive-2xl font-bold tracking-tight mt-3 text-indigo-800">Espace Triage</h2>
          )}
          {location === "/poste-control" && (
            <h2 className="text-responsive-2xl font-bold tracking-tight mt-3 text-cyan-800">Espace Poste de Contrôle</h2>
          )}
        </div>
      )}


      {/* Navigation mobile supprimée conformément à la demande */}



      {/* Main Content */}
      <div
        className={chromeless ? `flex flex-1 overflow-hidden ${location === '/sms' ? 'pb-[56px] md:pb-0' : ''}` : "flex flex-1 overflow-hidden md:grid md:grid-cols-[auto,1fr]"}
        style={{ 
          ...(!chromeless ? { height: 'calc(100vh - var(--fixed-top))' } : {}),
          paddingTop: chromeless && location !== '/sms' ? 'calc(52px + env(safe-area-inset-top, 0px))' : undefined
        }}
      >
        {/* Sidebar desktop: FIXED pour une scrollbar toujours visible au-dessus du contenu - MASQUÉ SUR MOBILE */}
        {!chromeless && (
        <div
          className={`sidebar-desktop hidden md:block fixed left-0 ${isSuperAdmin ? 'bg-[#0d1220]' : 'bg-white'} shadow-sm z-[200] ${isSidebarCollapsed ? 'w-16' : 'w-64'} border-r-2 ${isSuperAdmin ? 'border-[#3d4947]' : 'border-gray-300'} transition-all duration-300 ease-in-out`}
          style={{
            top: 'var(--fixed-top)',
            height: 'calc(100vh - var(--fixed-top))',
            borderTop: isSuperAdmin ? '2px solid #29a195' : '2px solid #3b82f6',
            display: 'flex',
            willChange: 'width',
            transform: 'translateZ(0)', // Force GPU acceleration
            backfaceVisibility: 'hidden' // Prevent flickering
          }}
        >
          <Sidebar collapsed={isSidebarCollapsed} />
        </div>
        )}
        {/* Espaceur (colonne fantôme) pour réserver l'espace de la sidebar fixe - MASQUÉ SUR MOBILE */}
        {!chromeless && (
          <div className={`sidebar-desktop hidden md:block ${isSidebarCollapsed ? 'w-16' : 'w-64'} transition-all duration-300 ease-in-out`} style={{ willChange: 'width' }} />
        )}

        {/* Bouton flottant trapèze attaché au volet de navigation (desktop) */}
        {!chromeless && (
        <button
          type="button"
          aria-label={isSidebarCollapsed ? 'Agrandir le menu' : 'Réduire le menu'}
          className={
            'hidden md:flex items-center justify-center fixed z-[190] \
             bg-gradient-to-b from-teal-500 to-teal-600 text-white \
             shadow-lg shadow-teal-200/70 \
             hover:from-teal-600 hover:to-teal-700 transition-all duration-300 ease-in-out'
          }
          style={{
            bottom: '14px',
            transform: 'translateZ(0)',
            left: `calc(${isSidebarCollapsed ? '4rem' : '16rem'} - 14px)`,
            width: '32px',
            height: '48px',
            willChange: 'left, transform',
            backfaceVisibility: 'hidden',
            // Forme trapèze : côté gauche droit, côté droit en biais
            clipPath: 'polygon(0% 0%, 100% 25%, 100% 75%, 0% 100%)',
            borderRadius: 0,
            paddingLeft: '2px',
          }}
          onClick={() => window.dispatchEvent(new Event('toggle-sidebar-collapse'))}
        >
          <svg
            className="w-4 h-4 transition-transform duration-300 ease-in-out"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{
              transform: isSidebarCollapsed ? 'translateZ(0)' : 'rotate(90deg) translateZ(0)',
              transition: 'transform 0.3s ease-in-out'
            }}
          >
            <rect x="7" y="5" width="2.5" height="14" rx="1.25" fill="white"/>
            <rect x="11" y="5" width="2.5" height="14" rx="1.25" fill="white"/>
            <rect x="15" y="5" width="2.5" height="14" rx="1.25" fill="white"/>
          </svg>
        </button>
        )}

        {/* Sidebar mobile avec animation améliorée */}
        {!chromeless && (
        <div
          className={`fixed left-0 ${isSuperAdmin ? 'bg-[#0d1220]' : 'bg-white'} shadow-xl z-[200] w-64 md:hidden overflow-hidden
            ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
            transition-transform duration-300 ease-in-out border-r-2 ${isSuperAdmin ? 'border-[#3d4947]' : 'border-gray-300'}`}
          style={{
            top: 'var(--fixed-top, 60px)',
            bottom: 0,
            height: 'auto',
          }}
          onClick={(e) => e.stopPropagation()} // Empêcher la fermeture lors d'un clic à l'intérieur
        >
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} collapsed={false} />
        </div>
        )}

        {/* Overlay sombre avec animation pour le menu mobile */}
        {!chromeless && (
        <div
          className={`fixed left-0 right-0 bg-black z-[199] md:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-50' : 'opacity-0 pointer-events-none'}`}
          style={{
            top: 'var(--fixed-top, 60px)',
            bottom: 0,
            transition: 'opacity 0.3s ease-in-out',
            willChange: 'opacity',
            backdropFilter: 'blur(2px)'
          }}
          onClick={() => setIsSidebarOpen(false)}
          aria-hidden={!isSidebarOpen}
        />
        )}

        {/* Colonne droite (desktop): sticky nav + main */}
        <div className="min-w-0 w-full flex-1 flex flex-col overflow-hidden">
          {/* Desktop Navigation Bar (masquée pour Alerte, SuperAdmin et la Carte) */}
          {!chromeless && !isSuperAdmin && !location?.startsWith('/map') && <Navbar />}

          {/* Main Section - responsive */}
          <main
            className={[
              "main-content flex-1 overflow-x-hidden transition-all duration-200",
              location && location.includes('sms') ? "overflow-hidden flex flex-col" : "overflow-y-auto",
              location && location.startsWith('/map')
                ? "bg-transparent"
                : chromeless ? "bg-[#f8fafc]" : isSuperAdmin ? "bg-[#0b1326]" : "bg-[#e9edf3]",
            ].join(' ')}
            style={{
              scrollBehavior: 'smooth',
              ...(chromeless ? { WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' } : {})
            }}
          >
            {/* Retour en haut lors des changements de page */}
            {location && location.startsWith('/map') ? (
              <div ref={(el) => { if (el) el && (el as HTMLElement).scrollTop === 0; }} className="container-responsive">
                {showRestrictedAccess ? restrictedContent : children}
              </div>
            ) : chromeless ? (
              <div 
                ref={(el) => { if (el) el.scrollTop = 0; }} 
                className={`w-full ${location && location.includes('sms') ? 'h-full overflow-hidden' : 'min-h-full'} ${location !== '/sms' ? 'pb-20' : ''}`}
                style={chromeless && location !== '/sms' && location !== '/profile' ? { paddingTop: '1.5rem' } : undefined}
              >
                {showRestrictedAccess ? restrictedContent : children}
              </div>
            ) : (
              <div className="page-frame-container">
                <div ref={(el) => { if (el) el.scrollTop = 0; }} className="page-frame-inner">
                  {children}
                </div>
              </div>
            )}
            <OfflineIndicator />
          </main>
        </div>
      </div>

      {/* Navigation mobile unifiée pour agents (chromeless) */}
      {chromeless && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around py-2 z-[250] md:hidden">
          <button
            onClick={() => setLocation((user as any)?.isSupervisorRole ? "/supervisor" : "/default-home")}
            className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform"
          >
            <Home className={`h-5 w-5 ${location === '/supervisor' || location === '/default-home' ? 'text-green-700' : 'text-gray-500'}`} />
            <span className={`text-[9px] font-medium ${location === '/supervisor' || location === '/default-home' ? 'text-green-700' : 'text-gray-500'}`}>Accueil</span>
          </button>
          
          {!(user as any)?.isSupervisorRole && (
            <button onClick={() => setLocation("/sms")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
              <div className="relative">
                <MessageSquare className={`h-5 w-5 ${location === '/sms' ? 'text-green-700' : 'text-gray-500'}`} />
                {unreadMsg > 0 && (
                  <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[7px] font-bold rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center">{unreadMsg}</span>
                )}
              </div>
              <span className={`text-[9px] font-medium ${location === '/sms' ? 'text-green-700' : 'text-gray-500'}`}>Messages</span>
            </button>
          )}

          {(user as any)?.isSupervisorRole && (
            <button onClick={() => setLocation("/map")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
              <Map className={`h-5 w-5 ${location === '/map' ? 'text-green-700' : 'text-gray-500'}`} />
              <span className={`text-[9px] font-medium ${location === '/map' ? 'text-green-700' : 'text-gray-500'}`}>Carte</span>
            </button>
          )}

          <button onClick={() => setLocation("/profile")} className="flex flex-col items-center gap-0.5 px-3 py-1 active:scale-95 transition-transform">
            <User className={`h-5 w-5 ${location === '/profile' ? 'text-green-700' : 'text-gray-500'}`} />
            <span className={`text-[9px] font-medium ${location === '/profile' ? 'text-green-700' : 'text-gray-500'}`}>Profil</span>
          </button>
        </div>
      )}
    </div>
  );
}
