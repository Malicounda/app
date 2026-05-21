import { useAuth } from '@/contexts/AuthContext';
import { isUserSuperAdmin } from '@/utils/navigation';
import { ReactNode } from 'react';
import { useLocation } from 'wouter';

interface ChasseRouteProps {
  children: ReactNode;
  allowedRoles?: string[];
}

/**
 * Garde-route pour le domaine CHASSE.
 * - Super Admin : passe toujours (pas de domaine)
 * - Autres : vérifie que le domaine est CHASSE
 * - La redirection est déléguée au DashboardRedirector
 */
export default function ChasseRoute({ children, allowedRoles }: ChasseRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) return null;

  // Super Admin — accès global, pas de vérification de domaine
  if (isUserSuperAdmin(user)) return <>{children}</>;

  const domain = (localStorage.getItem('domain') || '').toUpperCase();

  // Agents du domaine Alerte (rôle par défaut ou superviseur) — accès aux pages partagées
  // Note: on vérifie que le domaine est bien ALERTE et pas REBOISEMENT pour éviter la contamination cross-domaine
  const isAlerteDomainUser = domain === 'ALERTE' ||
    ((domain !== 'CHASSE' && domain !== 'REBOISEMENT') &&
      ((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole));
  if (isAlerteDomainUser) return <>{children}</>;

  if (!isAuthenticated) {
    // Le useEffect dans le composant parent s'occupe de la redirection
    return null;
  }

  // Seuls les utilisateurs du domaine CHASSE peuvent voir ce contenu
  if (domain !== 'CHASSE') return null;

  // Vérification des rôles autorisés
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
