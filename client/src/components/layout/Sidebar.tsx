import {
    AccountManagementIcon,
    AffectationsIcon,
    AgentIcon,
    AlertsIcon,
    DashboardIcon,
    DomainesIcon,
    GuideDeclarationsIcon,
    GuidesIcon,
    HistoryIcon,
    HomeIcon,
    HuntersIcon,
    HuntingActivitiesIcon,
    HuntingReportsIcon,
    InfractionsIcon,
    MapIcon,
    MessagingIcon,
    PermitRequestsIcon,
    PermitsIcon,
    ProfileChangeIcon,
    RegionsZonesIcon,
    RolesMetierIcon,
    SettingsIcon,
    StatsIcon,
    TaxesIcon,
    ThemeIcon,
    UserProfileIcon,
    WildlifeIcon,
} from '@/components/icons/CustomIcons';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { useUnreadNotificationsCount } from '@/lib/hooks/useUnreadNotifications';
import { cn } from '@/lib/utils';
import { isUserSuperAdmin } from '@/utils/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
}

export default function Sidebar({ isOpen = true, onClose = () => {}, collapsed = false }: SidebarProps) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const isSuperAdminNav = isUserSuperAdmin(user);

  // Fermer les sections au changement de page
  useEffect(() => {
    setActiveSection(null);
  }, [location]);

  // Fonction pour gérer le clic sur une section
  const toggleSection = (section: string) => {
    setActiveSection(activeSection === section ? null : section);
  };

  // Fonction pour fermer le menu sur mobile après un clic
  const handleLinkClick = () => {
    if (window.innerWidth < 768) {
      onClose();
    }
  };

  // Définir les couleurs par rôle (pour hover et active)
  const getRoleColors = () => {
    if (isSuperAdminNav) {
      return {
        hover: 'hover:bg-blue-50 hover:text-blue-800',
        active: 'bg-blue-100 text-blue-800',
      };
    }

    switch (user?.role) {
      case 'admin':
        return {
          hover: 'hover:bg-blue-50 hover:text-blue-700',
          active: 'bg-blue-100 text-blue-700',
        };
      case 'agent':
        return {
          hover: 'hover:bg-green-50 hover:text-green-700',
          active: 'bg-green-100 text-green-700',
        };
      case 'sub-agent':
      case 'brigade':
      case 'triage':
      case 'poste-control':
      case 'sous-secteur':
        return {
          hover: 'hover:bg-teal-50 hover:text-teal-700',
          active: 'bg-teal-100 text-teal-700',
        };
      case 'hunter':
        return {
          hover: 'hover:bg-amber-50 hover:text-amber-700',
          active: 'bg-amber-100 text-amber-700',
        };
      case 'hunting-guide':
        return {
          hover: 'hover:bg-orange-50 hover:text-orange-700',
          active: 'bg-orange-100 text-orange-700',
        };
      default:
        return {
          hover: 'hover:bg-gray-50 hover:text-gray-700',
          active: 'bg-gray-100 text-gray-700',
        };
    }
  };

  const colors = getRoleColors();

  // Taille des icônes : identique en mode déplié et replié et non réductible (shrink-0)
  const iconSize = 'h-6 w-6 shrink-0';

  // Style commun pour les liens
  const linkStyle = cn(
    'flex items-center p-2 text-gray-700 rounded-md transition-all duration-300 ease-in-out',
    colors.hover,
    isSuperAdminNav ? 'border-l-4 border-transparent rounded-l-none' : '',
    collapsed ? 'justify-center px-2 overflow-visible whitespace-nowrap' : ''
  );
  const activeLinkStyle = cn(
    'flex items-center p-2 rounded-md font-medium transition-all duration-300 ease-in-out',
    colors.active,
    isSuperAdminNav ? 'border-l-4 border-blue-600 rounded-l-none' : '',
    collapsed ? 'justify-center px-2 overflow-visible whitespace-nowrap' : ''
  );

  // Style pour les sections
  const sectionStyle = cn('flex items-center justify-between p-2 text-gray-700 hover:bg-gray-100 rounded-md cursor-pointer transition-all duration-300 ease-in-out', collapsed ? 'px-2' : '');
  const activeSectionStyle = cn('flex items-center justify-between p-2 bg-gray-100 text-gray-800 rounded-md font-medium cursor-pointer transition-all duration-300 ease-in-out', collapsed ? 'px-2' : '');

  // Style pour le conteneur
  const sidebarStyle = cn(
    // Container base + smoother GPU transform
    'h-full overflow-y-auto overflow-x-hidden transform-gpu will-change-transform transition-transform duration-300 ease-in-out',
    // Mobile (default): off-canvas with slide using translateX
    isOpen ? 'translate-x-0' : '-translate-x-full',
    'fixed inset-y-0 left-0 z-40 w-64 p-3',
    // Desktop and up: stay in flow and never slide out, keep collapsed width
    'md:static md:translate-x-0',
    isSuperAdminNav ? 'bg-[#f3f5f8]' : 'bg-white',
    collapsed ? 'md:px-2 md:w-16' : 'md:p-3 md:w-64'
  );

  const labelCls = cn(
    'transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap',
    collapsed ? 'opacity-0 translate-x-2 max-w-0 ml-0' : 'opacity-100 translate-x-0 max-w-[200px] ml-2'
  );

  const iconGap = collapsed ? '' : 'mr-2';

  const iconWrapCls = cn('w-6 shrink-0 flex items-center justify-center', iconGap);

  // Unread alerts count (polling)
  const { data: unreadData } = useUnreadNotificationsCount();
  const unread = unreadData?.count ?? 0;
  const unreadDisplay = unread > 99 ? '99+' : unread;

  // Détecter le domaine actif pour la messagerie
  const currentDomaineId = location.startsWith('/reboisement') || location.startsWith('/reforestation') ? 33 : 1;

  // Unread internal messages count (polling from unread-count endpoint)
  const { data: unreadMsgCount } = useQuery({
    queryKey: ['messages-unread-count', currentDomaineId],
    queryFn: async () => {
      try {
        const res = await fetch(`/api/messages/unread-count?domaineId=${currentDomaineId}`, { credentials: 'include' });
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    enabled: !!user,
    refetchInterval: 5_000, // 5 secondes pour un ressenti instantané
    staleTime: 2_000,
  });
  const unreadMsg = unreadMsgCount?.total ?? 0;
  const unreadMsgDisplay = unreadMsg > 99 ? '99+' : unreadMsg;

  // Vérifier si le chasseur a des permis actifs
  const { data: hunterPermits = [] } = useQuery({
    queryKey: ['hunter-permits'],
    queryFn: async () => {
      if (user?.role !== 'hunter') return [];
      const response = await apiRequest('GET', '/api/permits/hunter/my-permits');
      return Array.isArray(response) ? response : (response as any)?.data || [];
    },
    enabled: user?.role === 'hunter' && isOnline,
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const hasActivePermits = Array.isArray(hunterPermits)
    ? hunterPermits.some((permit: any) => permit?.status === 'active')
    : false;

  // Vérifier l'association avec un guide pour les chasseurs
  const { data: guideAssociation } = useQuery({
    queryKey: [`/api/guide-hunter-associations/hunter/${user?.hunterId}`],
    queryFn: () => apiRequest('GET', `/api/guide-hunter-associations/hunter/${user?.hunterId}`),
    enabled: user?.role === 'hunter' && !!user?.hunterId && isOnline,
    retry: false,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const hasActiveGuideAssociation = !!guideAssociation;
  // Déterminer l'onglet courant pour la page unifiée des demandes de permis
  const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
  let currentPermitTab: 'create' | 'list' = 'create';
  try {
    const sp = new URLSearchParams(currentSearch);
    const tab = sp.get('tab');
    if (tab === 'list') currentPermitTab = 'list';
  } catch {}

  const profileHref = (() => {
    const role = user?.role;
    if (role === 'sous-secteur') return '/sous-secteur/profile';
    if (role === 'brigade') return '/brigade/profile';
    if (role === 'triage') return '/triage/profile';
    if (role === 'poste-control') return '/poste-control/profile';
    return '/profile';
  })();

  return (
    <nav className={cn(sidebarStyle, 'sidebar')}>
      <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
        {/* Zone de navigation scrollable */}
        <div className="flex flex-col space-y-1 pb-4 flex-1 min-h-0">
        {/* Section Profil - commune à tous les utilisateurs (sauf guides de chasse) */}
        {user?.role !== 'hunting-guide' && !isUserSuperAdmin(user) && (
          <Link
            href={profileHref}
            onClick={handleLinkClick}
            className={location === profileHref ? activeLinkStyle : linkStyle}
          >
            <span className={iconWrapCls}>
              <UserProfileIcon className={cn(iconSize, user?.role === 'hunter' ? 'text-amber-500' : 'text-gray-600')} />
            </span>
            <span className={labelCls}>Mon Profil</span>
          </Link>
        )}

        {/* Sections spécifiques aux administrateurs */}
        {user?.role === 'admin' && !isUserSuperAdmin(user) && (
          <>
            <Link
              href="/admin"
              onClick={handleLinkClick}
              className={location === '/admin' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/statistics"
              onClick={handleLinkClick}
              className={location === '/statistics' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <StatsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Statistiques Nationales</span>
            </Link>
            {/* Nouvel ordre demandé */}
            <Link
              href="/agents"
              onClick={handleLinkClick}
              className={location === '/agents' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AgentIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Agents</span>
            </Link>

            <Link
              href="/guides"
              onClick={handleLinkClick}
              className={location === '/guides' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <GuidesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Guides de Chasse</span>
            </Link>

            <Link
              href="/hunters"
              onClick={handleLinkClick}
              className={location === '/hunters' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntersIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Chasseurs</span>
            </Link>

            <Link
              href="/permit-requests-reception"
              onClick={handleLinkClick}
              className={location === '/permit-requests-reception' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitRequestsIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Demandes de Permis</span>
            </Link>

            <Link
              href="/permits"
              onClick={handleLinkClick}
              className={location === '/permits' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Permis</span>
            </Link>

            <Link
              href="/taxes"
              onClick={handleLinkClick}
              className={location === '/taxes' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <TaxesIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Taxes d'Abattage</span>
            </Link>

            <Link
              href="/sms"
              onClick={handleLinkClick}
              className={location === '/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unread > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {!collapsed && unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/map"
              onClick={handleLinkClick}
              className={location === '/map' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Carte</span>
            </Link>

            <Link
              href="/regions-zones"
              onClick={handleLinkClick}
              className={location === '/regions-zones' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <RegionsZonesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Régions et Zones</span>
            </Link>

            <Link
              href="/especes-fauniques"
              onClick={handleLinkClick}
              className={location === '/especes-fauniques' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <WildlifeIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Espèces Fauniques</span>
            </Link>

            <Link
              href="/infractions"
              onClick={handleLinkClick}
              className={location === '/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>

            <Link
              href="/changeprofil"
              onClick={handleLinkClick}
              className={location === '/changeprofil' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <ProfileChangeIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Changement Profil</span>
            </Link>

            {/* Placer Historique avant Paramètres pour qu'il soit visible en bas de viewport */}
            {isUserSuperAdmin(user) && (
              <Link
                href="/admin/history"
                onClick={handleLinkClick}
                className={location === '/admin/history' ? activeLinkStyle : linkStyle}
              >
                <span className={iconWrapCls}>
                  <HistoryIcon className={cn('text-amber-500', iconSize)} />
                </span>
                <span className={labelCls}>Historique</span>
              </Link>
            )}
          </>
        )}

        {user?.role === 'admin' && isUserSuperAdmin(user) && (
          <>
            <Link
              href="/superadmin/agents"
              onClick={handleLinkClick}
              className={location === '/superadmin/agents' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AgentIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Agents</span>
            </Link>

            <Link
              href="/superadmin/affectations"
              onClick={handleLinkClick}
              className={location === '/superadmin/affectations' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AffectationsIcon className={cn('', iconSize)} />
              </span>
              <span className={labelCls}>Affectations</span>
            </Link>

            <Link
              href="/superadmin/domaines"
              onClick={handleLinkClick}
              className={location === '/superadmin/domaines' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DomainesIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Domaines</span>
            </Link>

            <Link
              href="/superadmin/roles-metier"
              onClick={handleLinkClick}
              className={location === '/superadmin/roles-metier' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <RolesMetierIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Rôles métier</span>
            </Link>

            <Link
              href="/accounts"
              onClick={handleLinkClick}
              className={location === '/accounts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AccountManagementIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Gestion des Comptes</span>
            </Link>

            <Link
              href="/settings"
              onClick={handleLinkClick}
              className={location === '/settings' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <SettingsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Paramètres</span>
            </Link>

            <Link
              href="/superadmin/theme"
              onClick={handleLinkClick}
              className={location === '/superadmin/theme' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <ThemeIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Thème</span>
            </Link>

            {!collapsed && (
              <div className="mt-3 rounded-lg border bg-white/70 p-2 shadow-sm">
                <div className="text-xs font-semibold text-gray-700 mb-2">Super-Admin Tools</div>
                <div className="grid grid-cols-1 gap-2">
                  <Link
                    href="/admin/history"
                    onClick={handleLinkClick}
                    className="rounded-md border bg-white hover:bg-gray-50 p-2 flex flex-col items-center justify-center text-center"
                  >
                    <FileText className="h-5 w-5 text-gray-700" />
                    <div className="mt-1 text-[10px] leading-tight text-gray-700">Audit System Log (Détaillé)</div>
                  </Link>
                </div>
              </div>
            )}
          </>
        )}

        {/* Sections spécifiques aux agents régionaux */}
        {user?.role === 'agent' && user?.type !== 'secteur' && (
          <>
            <Link
              href="/regional"
              onClick={handleLinkClick}
              className={location === '/regional' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/regional-stats"
              onClick={handleLinkClick}
              className={location === '/regional-stats' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <StatsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Statistiques régionales</span>
            </Link>

            <Link
              href="/subaccounts"
              onClick={handleLinkClick}
              className={location === '/subaccounts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AgentIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Agents Secteur</span>
            </Link>

            <Link
              href="/regional-guides"
              onClick={handleLinkClick}
              className={location === '/regional-guides' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <GuidesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Guides de Chasse</span>
            </Link>

            <Link
              href="/hunters"
              onClick={handleLinkClick}
              className={location === '/hunters' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntersIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Chasseurs</span>
            </Link>

            <Link
              href="/permit-requests-reception"
              onClick={handleLinkClick}
              className={location === '/permit-requests-reception' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitRequestsIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Demandes de Permis</span>
            </Link>

            <Link
              href="/permits"
              onClick={handleLinkClick}
              className={location === '/permits' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Permis</span>
            </Link>

            <Link
              href="/taxes"
              onClick={handleLinkClick}
              className={location === '/taxes' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <TaxesIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Taxes d'Abattage</span>
            </Link>

            <Link
              href="/regional-sms"
              onClick={handleLinkClick}
              className={location === '/regional-sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unread}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/map"
              onClick={handleLinkClick}
              className={location === '/map' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Carte</span>
            </Link>

            <Link
              href="/regions-zones"
              onClick={handleLinkClick}
              className={location === '/regions-zones' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <RegionsZonesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Zones Région</span>
            </Link>

            <Link
              href="/infractions"
              onClick={handleLinkClick}
              className={location === '/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>

            <Link
              href="/history"
              onClick={handleLinkClick}
              className={location === '/history' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HistoryIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Historique</span>
            </Link>
          </>
        )}

        {/* ═══ Sections spécifiques aux agents secteur (sub-agent + agent secteur) ═══ */}
        {((user?.role === 'sub-agent') || (user?.role === 'agent' && user?.type === 'secteur')) && (
          <>
            <Link
              href="/sector"
              onClick={handleLinkClick}
              className={location === '/sector' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/sector-agents"
              onClick={handleLinkClick}
              className={location === '/sector-agents' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AgentIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Agents</span>
            </Link>

            <Link
              href="/sector-guides"
              onClick={handleLinkClick}
              className={location === '/sector-guides' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <GuidesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Guides de Chasse</span>
            </Link>

            <Link
              href="/sector-hunters"
              onClick={handleLinkClick}
              className={location === '/sector-hunters' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntersIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Chasseurs</span>
            </Link>

            <Link
              href="/sector-requests"
              onClick={handleLinkClick}
              className={location === '/sector-requests' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitRequestsIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Demandes</span>
            </Link>

            <Link
              href="/sector-permits"
              onClick={handleLinkClick}
              className={location === '/sector-permits' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <PermitsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Permis</span>
            </Link>

            <Link
              href="/taxes"
              onClick={handleLinkClick}
              className={location === '/taxes' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <TaxesIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Taxes d'Abattage</span>
            </Link>

            <Link
              href="/sector-sms"
              onClick={handleLinkClick}
              className={location === '/sector-sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unread}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/map"
              onClick={handleLinkClick}
              className={location === '/map' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Carte</span>
            </Link>

            <Link
              href="/regions-zones"
              onClick={handleLinkClick}
              className={location === '/regions-zones' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <RegionsZonesIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Zones</span>
            </Link>

            <Link
              href="/infractions"
              onClick={handleLinkClick}
              className={location === '/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>
          </>
        )}

        {/* ═══ Sous-Secteur ═══ */}
        {user?.role === 'sous-secteur' && (
          <>
            <Link
              href="/sous-secteur"
              onClick={handleLinkClick}
              className={location === '/sous-secteur' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/sous-secteur/sms"
              onClick={handleLinkClick}
              className={location === '/sous-secteur/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/sous-secteur/infractions"
              onClick={handleLinkClick}
              className={location === '/sous-secteur/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>

            <Link
              href="/sous-secteur/carte"
              onClick={handleLinkClick}
              className={location === '/sous-secteur/carte' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Carte</span>
            </Link>

            <Link
              href="/sous-secteur/alertes"
              onClick={handleLinkClick}
              className={location === '/sous-secteur/alertes' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unread}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/sous-secteur/statistiques"
              onClick={handleLinkClick}
              className={location === '/sous-secteur/statistiques' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <StatsIcon className={cn('text-teal-600', iconSize)} />
              </span>
              <span className={labelCls}>Statistiques</span>
            </Link>
          </>
        )}

        {/* ═══ Brigade ═══ */}
        {user?.role === 'brigade' && (
          <>
            <Link
              href="/brigade"
              onClick={handleLinkClick}
              className={location === '/brigade' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/brigade/sms"
              onClick={handleLinkClick}
              className={location === '/brigade/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/brigade/infractions"
              onClick={handleLinkClick}
              className={location === '/brigade/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>
          </>
        )}

        {/* ═══ Triage ═══ */}
        {user?.role === 'triage' && (
          <>
            <Link
              href="/triage"
              onClick={handleLinkClick}
              className={location === '/triage' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/triage/sms"
              onClick={handleLinkClick}
              className={location === '/triage/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/triage/infractions"
              onClick={handleLinkClick}
              className={location === '/triage/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>
          </>
        )}

        {/* ═══ Poste de Contrôle ═══ */}
        {user?.role === 'poste-control' && (
          <>
            <Link
              href="/poste-control"
              onClick={handleLinkClick}
              className={location === '/poste-control' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/poste-control/sms"
              onClick={handleLinkClick}
              className={location === '/poste-control/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/poste-control/infractions"
              onClick={handleLinkClick}
              className={location === '/poste-control/infractions' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <InfractionsIcon className={cn('text-red-600', iconSize)} />
              </span>
              <span className={labelCls}>Infractions</span>
            </Link>
          </>
        )}

        {/* Agent avec rôle métier par défaut : Profil, Alertes, Messages uniquement */}
        {(user as any)?.isDefaultRole && !isUserSuperAdmin(user) && (
          <>
            <Link
              href="/default-home"
              onClick={handleLinkClick}
              className={location === '/default-home' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-amber-600', iconSize)} />
              </span>
              <span className={labelCls}>Mes Alertes</span>
            </Link>

            <Link
              href="/profile"
              onClick={handleLinkClick}
              className={location === '/profile' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <UserProfileIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Mon Profil</span>
            </Link>

            <Link
              href="/sms"
              onClick={handleLinkClick}
              className={location === '/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>
          </>
        )}

        {/* Superviseur : Alertes, Messages, Carte */}
        {(user as any)?.isSupervisorRole && !isUserSuperAdmin(user) && !(user as any)?.isDefaultRole && (
          <>
            <Link
              href="/supervisor"
              onClick={handleLinkClick}
              className={location === '/supervisor' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Espace Superviseur</span>
            </Link>

            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unread > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Alertes
                {!collapsed && unread > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/sms"
              onClick={handleLinkClick}
              className={location === '/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-gray-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-green-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/map"
              onClick={handleLinkClick}
              className={location === '/map' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <MapIcon className={cn('text-green-600', iconSize)} />
              </span>
              <span className={labelCls}>Carte</span>
            </Link>
          </>
        )}

        {/* Sections spécifiques aux chasseurs */}
        {user?.role === 'hunter' && (
          <>
            <Link
              href="/hunter"
              onClick={handleLinkClick}
              className={location === '/hunter' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <DashboardIcon className={cn('text-amber-500', iconSize)} />
              </span>
              <span className={labelCls}>Espace Chasseur</span>
            </Link>

            <Link
              href="/sms"
              onClick={handleLinkClick}
              className={location === '/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-amber-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            {hasActivePermits ? (
              <Link
                href="/hunting-reports"
                onClick={handleLinkClick}
                className={location === '/hunting-reports' ? activeLinkStyle : linkStyle}
              >
                <span className={iconWrapCls}>
                  <HuntingReportsIcon className={cn('text-gray-600', iconSize)} />
                </span>
                <span className={labelCls}>Rapports de Chasse</span>
              </Link>
            ) : (
              <div className={cn(
                "flex items-center px-3 py-2 text-gray-400 cursor-not-allowed opacity-50",
                collapsed ? 'justify-center px-2 overflow-hidden whitespace-nowrap text-[0]' : ''
              )}>
                <span className={iconWrapCls}>
                  <HuntingReportsIcon className={cn('text-gray-400', iconSize)} />
                </span>
                <span className={labelCls}>Rapports de Chasse</span>
              </div>
            )}

            <Link
              href="/hunting-activities"
              onClick={handleLinkClick}
              className={location === '/hunting-activities' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntingActivitiesIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Activités de Chasse</span>
            </Link>

            {hasActiveGuideAssociation ? (
              <Link
                href="/hunting-declarations"
                onClick={handleLinkClick}
                className={location === '/hunting-declarations' ? activeLinkStyle : linkStyle}
              >
                <span className={iconWrapCls}>
                  <GuideDeclarationsIcon className={cn('text-gray-600', iconSize)} />
                </span>
                <span className={labelCls}>Déclarations Guide</span>
              </Link>
            ) : (
              <div className={cn(
                "flex items-center px-3 py-2 text-gray-400 cursor-not-allowed opacity-50",
                collapsed ? 'justify-center px-2 overflow-hidden whitespace-nowrap text-[0]' : ''
              )} title="Aucune association avec un guide de chasse">
                <span className={iconWrapCls}>
                  <GuideDeclarationsIcon className={cn('text-gray-400', iconSize)} />
                </span>
                <span className={labelCls}>Déclarations Guide</span>
              </div>
            )}


            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Alertes</span>
            </Link>
          </>
        )}

        {/* Sections spécifiques aux guides de chasse */}
        {user?.role === 'hunting-guide' && (
          <>
            <Link
              href="/profile"
              onClick={handleLinkClick}
              className={location === '/profile' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <UserProfileIcon className={cn('text-blue-600', iconSize)} />
              </span>
              <span className={labelCls}>Mon Profil</span>
            </Link>

            <Link
              href="/sms"
              onClick={handleLinkClick}
              className={location === '/sms' ? activeLinkStyle : linkStyle}
            >
              <span className={cn(iconWrapCls, collapsed && 'relative')}>
                <MessagingIcon className={cn('text-blue-600', iconSize)} />
                {collapsed && unreadMsg > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
              <span className={cn(labelCls, 'flex items-center gap-2')}>
                Messagerie
                {!collapsed && unreadMsg > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                    {unreadMsgDisplay}
                  </span>
                )}
              </span>
            </Link>

            <Link
              href="/guide"
              onClick={handleLinkClick}
              className={location === '/guide' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HomeIcon className={cn('text-yellow-600', iconSize)} />
              </span>
              <span className={labelCls}>Tableau de Bord</span>
            </Link>

            <Link
              href="/guides/associate-hunters"
              onClick={handleLinkClick}
              className={location === '/guides/associate-hunters' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <GuidesIcon className={cn('text-yellow-600', iconSize)} />
              </span>
              <span className={labelCls}>Associer Chasseurs</span>
            </Link>

            <Link
              href="/hunting-reports"
              onClick={handleLinkClick}
              className={location === '/hunting-reports' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntingReportsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Rapports de Chasse</span>
            </Link>

            <Link
              href="/hunting-activities"
              onClick={handleLinkClick}
              className={location === '/hunting-activities' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <HuntingActivitiesIcon className={cn('text-yellow-600', iconSize)} />
              </span>
              <span className={labelCls}>Activités de Chasse</span>
            </Link>

            <Link
              href="/alerts"
              onClick={handleLinkClick}
              className={location === '/alerts' ? activeLinkStyle : linkStyle}
            >
              <span className={iconWrapCls}>
                <AlertsIcon className={cn('text-gray-600', iconSize)} />
              </span>
              <span className={labelCls}>Alertes</span>
            </Link>
          </>
        )}
        </div>

        {/* Bloc branding SCoDiPP collé en bas */}
        <div className={cn(
          "mt-auto shrink-0 border-t border-gray-200 px-3 py-3",
          collapsed ? 'px-2' : ''
        )}>
          <div className={cn(
            "flex items-center gap-2",
            collapsed ? 'flex-col justify-center' : ''
          )}>
            <img
              src="/images/jub_jubal.png"
              alt="Logo JUB JUBAL"
              className={cn(
                "shrink-0",
                collapsed ? 'w-8 h-8' : 'w-9 h-9'
              )}
            />
            <div className={cn(
              "overflow-hidden whitespace-nowrap",
              collapsed ? 'hidden' : ''
            )}>
              <div className="text-sm font-bold text-gray-800 leading-tight underline">SCoDiPP</div>
              <div className="text-[10px] text-gray-400 leading-tight">v1.0</div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
