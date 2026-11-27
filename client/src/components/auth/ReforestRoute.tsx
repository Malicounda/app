import { useAuth } from '@/contexts/AuthContext';
import { getHomePage, isUserSuperAdmin } from '@/utils/navigation';
import { getLoginRoute } from '@/utils/getLoginRoute';
import { ReactNode, useEffect } from 'react';
import { Redirect, useLocation } from 'wouter';

interface ReforestRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  allowedTypes?: string[];
}

/**
 * Garde-route pour le domaine REBOISEMENT.
 * - Super Admin : redirigé immédiatement vers /superadmin/agents
 * - Autres : vérifie que le domaine est REBOISEMENT et le rôle autorisé, sinon redirige vers leur accueil
 */
export default function ReforestRoute({ children, allowedRoles, allowedTypes }: ReforestRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [location, setLocation] = useLocation();

  const isSA = isUserSuperAdmin(user);
  const isReforestDomain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase() === 'REBOISEMENT';
  const roleAllowed = !allowedRoles || (user && allowedRoles.includes(user.role));
  const typeAllowed = !allowedTypes || !user || user.role !== 'agent' || allowedTypes.includes((user as any)?.agentType);
  const isAllowed = isAuthenticated && !isSA && isReforestDomain && Boolean(roleAllowed) && Boolean(typeAllowed);

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

  if (!isAllowed) return null;

  return <>{children}</>;
}
