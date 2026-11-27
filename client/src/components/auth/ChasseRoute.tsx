import { useAuth } from '@/contexts/AuthContext';
import { getHomePage, isUserSuperAdmin } from '@/utils/navigation';
import { getLoginRoute } from '@/utils/getLoginRoute';
import { ReactNode, useEffect } from 'react';
import { Redirect, useLocation } from 'wouter';

interface ChasseRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

/**
 * Garde-route pour le domaine CHASSE.
 * - Super Admin : passe au ProtectedRoute interne (qui bloque tout ce qui n'est pas superAdminOnly/allowSuperAdmin)
 * - Agents Alerte : accès aux pages partagées (/sms, /alerts, /profile, /map)
 * - Autres : vérifie que le domaine est CHASSE, sinon redirige vers la page d'accueil du domaine actif
 */
export default function ChasseRoute({ children, allowedRoles }: ChasseRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const isSA = isUserSuperAdmin(user);
  const domain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  const isAlerteDomainUser = domain === 'ALERTE' ||
    ((domain !== 'CHASSE' && domain !== 'REBOISEMENT') &&
      (Boolean((user as any)?.isDefaultRole) || Boolean((user as any)?.isSupervisorRole)));

  const isAllowed =
    isSA ||
    isAlerteDomainUser ||
    (isAuthenticated && domain === 'CHASSE' && (!allowedRoles || (user && allowedRoles.includes(user.role))));

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || isAllowed) return;
    const homePath = getHomePage(
      user.role,
      user.type,
      isSA,
      Boolean((user as any)?.isDefaultRole),
      Boolean((user as any)?.isSupervisorRole),
      user
    );
    if (location !== homePath) {
      setLocation(homePath);
    }
  }, [isLoading, isAuthenticated, user, isAllowed, isSA, location, setLocation]);

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Redirect to={getLoginRoute()} replace />;
  }

  if (!isAllowed) return null;

  return <>{children}</>;
}
