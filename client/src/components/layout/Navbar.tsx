import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessagesCount } from "@/lib/hooks/useUnreadMessages";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import {
    Bell, FilePlus2,
    FileText,
    History,
    Home,
    LogOut,
    MessageSquare,
    Receipt,
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

  // Différentes listes de navigation en fonction du rôle de l'utilisateur
  const adminNavItems = [
    { path: "/dashboard", label: "Tableau de Bord", icon: <Home className="h-6 w-6 mr-1" /> },
    { path: "/hunters", label: "Chasseurs", icon: <Users className="h-6 w-6 mr-1" /> },
    { path: "/permits", label: "Permis", icon: <FileText className="h-6 w-6 mr-1" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-6 w-6 mr-1" /> },
    { path: "/sms", label: "SMS", icon: <MessageSquare className="h-6 w-6 mr-1" /> },
    { path: "/history", label: "Historique", icon: <History className="h-6 w-6 mr-1" /> },
  ];

  const agentNavItems = [
    { path: "/regional", label: "Tableau de Bord", icon: <Home className="h-6 w-6 mr-1" /> },
    { path: "/hunters", label: "Chasseurs", icon: <Users className="h-6 w-6 mr-1" /> },
    { path: "/permits", label: "Permis", icon: <FileText className="h-6 w-6 mr-1" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-6 w-6 mr-1" /> },
    { path: "/taxes", label: "Taxes d'Abattage", icon: <Receipt className="h-6 w-6 mr-1" /> },
    { path: "/sms", label: "SMS", icon: <MessageSquare className="h-6 w-6 mr-1" /> },
    { path: "/history", label: "Historique", icon: <History className="h-6 w-6 mr-1" /> },
  ];

  const hunterNavItems = [
    { path: "/profile", label: "Mon Profil", icon: <UserCircle className="h-6 w-6 mr-1" /> },
    { path: "/permit-request", label: "Demande Permis", icon: <FilePlus2 className="h-6 w-6 mr-1" /> },
    { path: "/sms", label: "Messagerie", icon: <MessageSquare className="h-6 w-6 mr-1" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-6 w-6 mr-1" /> },
  ];

  // Guide items de navigation (similaires aux chasseurs mais sans tableau de bord)
  const guideNavItems = [
    { path: "/profile", label: "Mon Profil", icon: <UserCircle className="h-6 w-6 mr-1" /> },
    { path: "/sms", label: "Messagerie", icon: <MessageSquare className="h-6 w-6 mr-1" /> },
    { path: "/alerts", label: "Alertes", icon: <Bell className="h-6 w-6 mr-1" /> },
  ];

  // Sélectionner les éléments de navigation en fonction du rôle normalisé
  let navItems;
  if (normalizedRole === "hunter") {
    navItems = hunterNavItems;
  } else if (normalizedRole.includes("guide")) {
    navItems = guideNavItems;
  } else if (
    normalizedRole === "agent" ||
    normalizedRole === "sub-agent" ||
    normalizedRole.includes("agent-secteur") ||
    normalizedRole.includes("secteur") ||
    normalizedRole.includes("regional")
  ) {
    navItems = agentNavItems;
  } else {
    // Par défaut: administrateur ou autres rôles assimilés
    navItems = isSuperAdmin ? [] : adminNavItems;
  }

  return (
    <nav className="bg-green-600 text-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto">
        <div className="flex justify-between items-center">
          <div className="flex-1"></div>
          <div className="flex-auto overflow-x-auto py-1">
            <ul className="flex min-w-full justify-center space-x-1 md:space-x-3">
              {navItems.map((item) => (
                <li key={item.path}>
                  <button
                    className={`px-4 py-2 text-xs md:text-sm font-medium rounded-full transition-all duration-300
                      ${isActive(item.path)
                        ? "bg-white bg-opacity-20 shadow-inner"
                        : "hover:bg-white hover:bg-opacity-10"}`}
                    onClick={() => navigate(item.path)}
                  >
                    <span className="flex items-center gap-1">
                      {item.icon}
                      <span className="hidden md:inline flex items-center gap-2">
                        {item.path === "/alerts" && unreadAlerts > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-red-600 text-white text-xs font-semibold">
                            {unreadAlerts}
                          </span>
                        )}
                        {item.path === "/sms" && unreadMessages > 0 && (
                          <span className="inline-flex items-center justify-center min-w-[18px] h-5 px-1 rounded-full bg-blue-500 text-white text-xs font-semibold">
                            {unreadMessages}
                          </span>
                        )}
                        {item.label}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-1 flex justify-end items-center gap-2">
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
            <button
              className="px-3 py-1.5 text-xs md:text-sm font-medium rounded-full transition-all duration-300 bg-red-500 hover:bg-red-600"
              onClick={handleLogout}
            >
              <span className="flex items-center">
                <LogOut className="h-6 w-6" />
                <span className="hidden md:inline ml-2">Déconnexion</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
