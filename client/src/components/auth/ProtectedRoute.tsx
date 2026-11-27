import { useAuth } from "@/contexts/AuthContext";
import { getHomePage, getUserSubType, isSectorSubRole, isUserSuperAdmin } from "@/utils/navigation";
import { ReactNode, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { getLoginRoute } from "@/utils/getLoginRoute";

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
  allowSuperAdmin?: boolean;
  allowAlerteRoles?: boolean;
  requireSupervisor?: boolean;
  requireDefaultRole?: boolean;
  hunterOnly?: boolean;
  huntingGuideOnly?: boolean;
}

function resolveUserHomePath(user: any): string {
  const isSA = isUserSuperAdmin(user);
  let homePath = getHomePage(
    user.role,
    user.type,
    isSA,
    !!user?.isDefaultRole,
    !!user?.isSupervisorRole,
    user
  );
  if (user?.publicId) {
    const isUUIDInUrl = window.location.pathname.split('/')[1]?.length === 36;
    if (!isUUIDInUrl) {
      homePath = `/${user.publicId}${homePath}`;
    }
  }
  return homePath;
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
  allowSuperAdmin,
  allowAlerteRoles,
  requireSupervisor,
  requireDefaultRole,
  hunterOnly,
  huntingGuideOnly
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const checkUserPermission = (): boolean => {
    if (!user) return false;

    const isSA = isUserSuperAdmin(user);

    // Isolation stricte du Super Administrateur :
    // Il ne peut accéder qu'aux routes explicitement marquées superAdminOnly ou allowSuperAdmin.
    // Cela empêche toute apparition de pages métier parasites (/sms, /admin, /hunters, etc.) dans son compte.
    if (isSA) {
      return Boolean(superAdminOnly || allowSuperAdmin);
    }

    // Les utilisateurs non-SuperAdmin ne peuvent jamais accéder aux routes superAdminOnly
    if (superAdminOnly) {
      return false;
    }

    const isDefaultRole = Boolean((user as any)?.isDefaultRole);
    const isSupervisorRole = Boolean((user as any)?.isSupervisorRole);

    if (requireSupervisor) {
      return isSupervisorRole;
    }

    if (requireDefaultRole) {
      return isDefaultRole;
    }

    // Si la route autorise explicitement les rôles Alerte (défaut / superviseur)
    if (allowAlerteRoles && (isDefaultRole || isSupervisorRole)) {
      return true;
    }

    // Vérification des rôles autorisés (priorité aux nouveaux paramètres)
    const rolesToCheck = allowedRoles || roles;
    if (rolesToCheck) {
      const allowedRolesArray = Array.isArray(rolesToCheck) ? rolesToCheck : [rolesToCheck];
      let roleMatch = allowedRolesArray.includes(user.role);
      if (!roleMatch && user.role === 'sub-agent') {
        const subType = getUserSubType(user);
        roleMatch = allowedRolesArray.includes(subType);
      }
      if (!roleMatch) return false;
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
    if (hunterOnly && user.role !== "hunter") return false;
    if (huntingGuideOnly && user.role !== "hunting-guide") return false;

    return true;
  };

  const hasPermission = !isLoading && isAuthenticated && user ? checkUserPermission() : false;

  useEffect(() => {
    // Security Check: Vérifier public_id dans l'URL pour les routes protégées
    if (user && (user as any).publicId) {
      const parts = window.location.pathname.split('/');
      if (parts.length > 1) {
        const urlPublicId = parts[1];
        if (urlPublicId.length === 36 && urlPublicId !== (user as any).publicId) {
          console.warn('Accès refusé: public_id ne correspond pas', { urlPublicId, userPublicId: (user as any).publicId });
          window.location.href = getLoginRoute();
          return;
        }
      }
    }

    if (!isLoading && isAuthenticated && user && !hasPermission) {
      const homePath = resolveUserHomePath(user);
      if (location !== homePath) {
        setLocation(homePath);
      }
    }
  }, [
    isLoading,
    isAuthenticated,
    user,
    hasPermission,
    location,
    setLocation,
  ]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to={getLoginRoute()} replace />;
  }

  // Ne jamais rendre la page si l'utilisateur n'a pas la permission (évite tout flash ou appel API parasite)
  if (!hasPermission) {
    return null;
  }

  return <>{children}</>;
}
