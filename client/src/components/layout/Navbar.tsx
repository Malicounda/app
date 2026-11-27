import { useAuth } from "@/contexts/AuthContext";
import { TaxesIcon } from "@/components/icons/CustomIcons";
import { useUnreadMessagesCount } from "@/lib/hooks/useUnreadMessages";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import {
    Bell, FilePlus2,
    FileText,
    History,
    Home,
    LogOut,
    MessageSquare,
    Settings,
    UserCircle,
    Users
} from "lucide-react";
import { useLocation } from "wouter";

export default function Navbar() {
  const [location, navigate] = useLocation();
  const { logout, user } = useAuth();
  const { data: unreadAlertsData } = useUnreadNotificationsCount();
  const unreadAlerts = unreadAlertsData?.count ?? 0;
  const { data: unreadMessagesData } = useUnreadMessagesCount();
  const unreadMessages = unreadMessagesData?.total ?? 0;

  const isSuperAdmin = (user as any)?.isSuperAdmin === true;

  // Normaliser le rôle utilisateur pour la sélection de menu (insensible à la casse/accents/underscores)
  const normalizedRole = (user?.role || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\s]+/g, '-');

  const isActive = (path: string) => {
    return location === path;
  };

  const handleLogout = async () => {
    await logout();
  };

  const adminNavItems = [
    { path: "/admin", label: "Tableau de Bord", icon: <Home className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/hunters", label: "Chasseurs", icon: <Users className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/permits", label: "Permis", icon: <FileText className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sms", label: "SMS", icon: <MessageSquare className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/history", label: "Historique", icon: <History className="h-5 w-5 md:mr-1 shrink-0" /> },
  ];

  const regionalAgentNavItems = [
    { path: "/regional", label: "Tableau de Bord", icon: <Home className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/hunters", label: "Chasseurs", icon: <Users className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/permits", label: "Permis", icon: <FileText className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/taxes", label: "Taxes d'Abattage", icon: <TaxesIcon className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/regional-sms", label: "SMS", icon: <MessageSquare className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/history", label: "Historique", icon: <History className="h-5 w-5 md:mr-1 shrink-0" /> },
  ];

  const sectorAgentNavItems = [
    { path: "/sector", label: "Tableau de Bord", icon: <Home className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sector-hunters", label: "Chasseurs", icon: <Users className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sector-permits", label: "Permis", icon: <FileText className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/taxes", label: "Taxes d'Abattage", icon: <TaxesIcon className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sector-sms", label: "SMS", icon: <MessageSquare className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/history", label: "Historique", icon: <History className="h-5 w-5 md:mr-1 shrink-0" /> },
  ];

  const hunterNavItems = [
    { path: "/profile", label: "Mon Profil", icon: <UserCircle className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/permit-request", label: "Demande Permis", icon: <FilePlus2 className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sms", label: "Messagerie", icon: <MessageSquare className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5 md:mr-1 shrink-0" /> },
  ];

  // Guide items de navigation (similaires aux chasseurs mais sans tableau de bord)
  const guideNavItems = [
    { path: "/profile", label: "Mon Profil", icon: <UserCircle className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/sms", label: "Messagerie", icon: <MessageSquare className="h-5 w-5 md:mr-1 shrink-0" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5 md:mr-1 shrink-0" /> },
  ];

  // Sélectionner les éléments de navigation en fonction du rôle normalisé
  let navItems;
  if (normalizedRole === "hunter") {
    navItems = hunterNavItems;
  } else if (normalizedRole.includes("guide")) {
    navItems = guideNavItems;
  } else if (
    normalizedRole === "sub-agent" ||
    normalizedRole.includes("agent-secteur") ||
    normalizedRole.includes("secteur") ||
    user?.type === "secteur"
  ) {
    navItems = sectorAgentNavItems;
  } else if (
    normalizedRole === "agent" ||
    normalizedRole.includes("regional") ||
    user?.type === "regional"
  ) {
    navItems = regionalAgentNavItems;
  } else {
    // Par défaut: administrateur ou autres rôles assimilés
    navItems = isSuperAdmin ? [] : adminNavItems;
  }

  return (
    <nav className="bg-green-600 text-white shadow-md sticky top-0 z-50 w-full">
      <div className="w-full max-w-7xl mx-auto px-1.5 sm:px-3">
        <div className="flex justify-between items-center">
          <div className="hidden md:block flex-1"></div>
          <div className="w-full md:w-auto flex-auto overflow-x-auto no-scrollbar py-1.5">
            <ul className="flex w-full md:w-auto justify-around md:justify-center items-center gap-1 md:gap-3">
              {navItems.map((item) => {
                const isAlerts = item.path === "/alerts";
                const isSms = item.path === "/sms" || item.path === "/regional-sms" || item.path === "/sector-sms";
                const badgeCount = isAlerts ? unreadAlerts : isSms ? unreadMessages : 0;
                return (
                <li key={item.path} className="shrink-0">
                  <button
                    className={`relative px-2.5 sm:px-3 md:px-4 py-1.5 md:py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-200
                      ${isActive(item.path)
                        ? "bg-white bg-opacity-20 shadow-inner"
                        : "hover:bg-white hover:bg-opacity-10"}`}
                    onClick={() => navigate(item.path)}
                    title={item.label}
                    aria-label={item.label}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <span className="relative flex items-center">
                        {item.icon}
                        {badgeCount > 0 && (
                          <span className={`md:hidden absolute -top-1.5 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold ${isAlerts ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}>
                            {badgeCount}
                          </span>
                        )}
                      </span>
                      <span className="hidden md:inline-flex items-center gap-2 whitespace-nowrap">
                        {isAlerts && unreadAlerts > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-100/80 text-red-700 border border-red-200/50 text-xs font-semibold">
                            {unreadAlerts}
                          </span>
                        )}
                        {isSms && unreadMessages > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-blue-100/80 text-blue-700 border border-blue-200/50 text-xs font-semibold">
                            {unreadMessages}
                          </span>
                        )}
                        {item.label}
                      </span>
                    </span>
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
          <div className="hidden md:flex flex-1 justify-end items-center gap-2">
            {/* Badge indiquant le rôle de l'utilisateur - version simplifiée sans icône */}
            <div className="hidden md:flex px-3 py-1 bg-white bg-opacity-20 rounded-full text-xs items-center">
              <span>
                {normalizedRole === "admin" && (isSuperAdmin ? "Super Administrateur" : "Administrateur")}
                {normalizedRole === "agent" && "Agent Régional"}
                {(normalizedRole === "sub-agent" || normalizedRole.includes("secteur")) && "Agent Secteur"}
                {normalizedRole === "hunter" && "Chasseur"}
                {normalizedRole.includes("guide") && "Guide de chasse"}
              </span>
            </div>

            {normalizedRole === "admin" && isSuperAdmin && (
              <button
                className={`px-3 py-1.5 text-xs md:text-sm font-medium rounded-full transition-all duration-300
                  ${isActive("/settings")
                    ? "bg-white bg-opacity-20 shadow-inner"
                    : "hover:bg-white hover:bg-opacity-10"}`}
                onClick={() => navigate("/settings")}
              >
                <span className="flex items-center">
                  <Settings className="h-6 w-6" />
                  <span className="hidden md:inline ml-2">Paramètres</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
