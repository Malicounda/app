import { useAuth } from "@/contexts/AuthContext";
import { getHomePage, isSectorSubRole, isUserSuperAdmin } from "@/utils/navigation";
import { ReactNode, useEffect } from "react";
import { useLocation } from "wouter";

interface ProtectedRouteProps {
  children: ReactNode;
  // Nouveaux paramètres
  allowedRoles?: string | string[];
  allowedTypes?: string | string[];
  // Anciens paramètres (maintenus pour la rétrocompatibilité)
  roles?: string | string[];
  type?: string | string[];
  adminOnly?: boolean;
  agentOnly?: boolean;
  subAgentOnly?: boolean;
  adminOrAgentOnly?: boolean;
  adminOrAgentOrSubAgentOnly?: boolean;
  superAdminOnly?: boolean;
  hunterOnly?: boolean;
  huntingGuideOnly?: boolean;
}

export function ProtectedRoute({
  children,
  // Nouveaux paramètres
  allowedRoles,
  allowedTypes,
  // Anciens paramètres (maintenus pour la rétrocompatibilité)
  roles,
  type,
  adminOnly,
  agentOnly,
  subAgentOnly,
  adminOrAgentOnly,
  adminOrAgentOrSubAgentOnly,
  superAdminOnly,
  hunterOnly,
  huntingGuideOnly
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Vérification de la session
    if (!isLoading && !isAuthenticated && location !== "/login") {
      setLocation("/login");
      return;
    }

    // Vérifier si l'utilisateur a le rôle requis
    const checkUserRole = () => {
      if (!user) return false;

      // Vérification des rôles autorisés (priorité aux nouveaux paramètres)
      const rolesToCheck = allowedRoles || roles;
      if (rolesToCheck) {
        const allowedRolesArray = Array.isArray(rolesToCheck) ? rolesToCheck : [rolesToCheck];
        if (!allowedRolesArray.includes(user.role)) return false;
      }

      // Vérification des types autorisés (priorité aux nouveaux paramètres)
      const typesToCheck = allowedTypes || type;
      if (typesToCheck && user.type) {
        const allowedTypesArray = Array.isArray(typesToCheck) ? typesToCheck : [typesToCheck];
        if (!allowedTypesArray.includes(user.type)) return false;
      }

      // Vérifications pour la compatibilité avec l'ancien système
      if (adminOnly && user.role !== "admin") return false;
      if (agentOnly && user.role !== "agent") return false;
      if (subAgentOnly && !isSectorSubRole(user.role)) return false;
      if (adminOrAgentOnly && user.role !== "admin" && user.role !== "agent") return false;
      if (adminOrAgentOrSubAgentOnly && user.role !== "admin" && user.role !== "agent" && !isSectorSubRole(user.role)) return false;
      if (superAdminOnly && !isUserSuperAdmin(user)) return false;
      if (hunterOnly && user.role !== "hunter") return false;
      if (huntingGuideOnly && user.role !== "hunting-guide") return false;

      return true;
    };

    // Vérifier si l'utilisateur a les autorisations nécessaires
    if (!isLoading && isAuthenticated && user) {
      const hasPermission = checkUserRole();

      console.log('[ProtectedRoute] Vérification permissions:', {
        location,
        userRole: user.role,
        userType: user.type,
        adminOrAgentOnly,
        hasPermission
      });

      if (!hasPermission) {
        console.log('[ProtectedRoute] Redirection car pas de permission');
        // Rediriger vers la page d'accueil appropriée pour le rôle de l'utilisateur
        setLocation(getHomePage(user.role, user.type, isUserSuperAdmin(user)));
      }
    }
  }, [isLoading, isAuthenticated, user, adminOnly, agentOnly, subAgentOnly, adminOrAgentOnly, adminOrAgentOrSubAgentOnly, hunterOnly, huntingGuideOnly, setLocation]);

  // Afficher un indicateur de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Si l'utilisateur n'est pas authentifié, ne pas afficher le contenu (la redirection sera gérée par useEffect)
  if (!isAuthenticated) {
    return null;
  }

  // Si adminOnly est défini et que l'utilisateur n'est pas admin, ne pas afficher le contenu
  if (adminOnly && user && user.role !== "admin") {
    return null;
  }

  // Si agentOnly est défini et que l'utilisateur n'est pas agent, ne pas afficher le contenu
  if (agentOnly && user && user.role !== "agent") {
    return null;
  }

  // Si subAgentOnly est défini et que l'utilisateur n'est pas agent secteur, ne pas afficher le contenu
  if (subAgentOnly && user && !isSectorSubRole(user.role)) {
    return null;
  }

  // Si adminOrAgentOnly est défini et que l'utilisateur n'est pas admin ou agent, ne pas afficher le contenu
  if (adminOrAgentOnly && user && user.role !== "admin" && user.role !== "agent") {
    return null;
  }

  // Si adminOrAgentOrSubAgentOnly est défini et que l'utilisateur n'est pas admin, agent ou agent secteur, ne pas afficher le contenu
  if (adminOrAgentOrSubAgentOnly && user && user.role !== "admin" && user.role !== "agent" && !isSectorSubRole(user.role)) {
    return null;
  }

  if (superAdminOnly && user && !isUserSuperAdmin(user)) {
    return null;
  }

  // Si hunterOnly est défini et que l'utilisateur n'est pas chasseur, ne pas afficher le contenu
  if (hunterOnly && user && user.role !== "hunter") {
    return null;
  }

  // Si huntingGuideOnly est défini et que l'utilisateur n'est pas guide de chasse, ne pas afficher le contenu
  if (huntingGuideOnly && user && user.role !== "hunting-guide") {
    return null;
  }

  // Si toutes les vérifications sont passées, afficher le contenu
  return <>{children}</>;
}
