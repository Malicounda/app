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

  // Agents avec rôle par défaut ou superviseur (domaine Alerte) — accès aux pages partagées
  if ((user as any)?.isDefaultRole || (user as any)?.isSupervisorRole) return <>{children}</>;

  if (!isAuthenticated) {
    // Le useEffect dans le composant parent s'occupe de la redirection
    return null;
  }

  const domain = (localStorage.getItem('domain') || '').toUpperCase();

  // Seuls les utilisateurs du domaine CHASSE peuvent voir ce contenu
  if (domain !== 'CHASSE') return null;

  // Vérification des rôles autorisés
  if (allowedRoles && user && !allowedRoles.includes(user.role)) return null;

  return <>{children}</>;
}
