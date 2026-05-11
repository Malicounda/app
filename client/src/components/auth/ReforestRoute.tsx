import { useAuth } from '@/contexts/AuthContext';
import { ReactNode } from 'react';

interface ReforestRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
  allowedTypes?: string[];
}

/**
 * Garde-route pour le domaine REBOISEMENT.
 * - Super Admin : retourne null (il ne doit jamais voir les pages reboisement)
 * - Autres : vérifie que le domaine est REBOISEMENT
 * - La redirection est déléguée au DashboardRedirector
 */
export default function ReforestRoute({ children, allowedRoles, allowedTypes }: ReforestRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Super Admin — n'appartient à aucun domaine, ne doit pas voir les pages reboisement
  if ((user as any)?.isSuperAdmin) return null;

  if (!isAuthenticated) return null;

  const isReforestDomain = (localStorage.getItem('domain') || '').toUpperCase() === 'REBOISEMENT';
  if (!isReforestDomain) return null;

  // Vérification des rôles autorisés
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;

  // Vérification des types autorisés
  if (allowedTypes && user && user.role === 'agent' && !allowedTypes.includes((user as any)?.agentType)) return null;

  return <>{children}</>;
}
