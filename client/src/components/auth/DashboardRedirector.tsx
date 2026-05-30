import { useAuth } from '@/contexts/AuthContext';
import { getUserSubType, isUserSuperAdmin } from '@/utils/navigation';
import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * ═══════════════════════════════════════════════════════════════════
 * DashboardRedirector — Source UNIQUE de vérité pour la redirection
 * ═══════════════════════════════════════════════════════════════════
 *
 * Priorité de redirection :
 *   1. Super Admin → /agents  (aucun domaine, accès transversal)
 *   2. Domaine REBOISEMENT → /reboisement/admin ou /reboisement
 *   3. Domaine CHASSE (ou par défaut) → /admin, /regional, /sector, /hunter, /guide
 */
export default function DashboardRedirector() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading || !user) return;

    const isSuperAdmin = isUserSuperAdmin(user);
    const domain = (localStorage.getItem('domain') || '').toUpperCase();

    // ──────────────────────────────────────────────────────────────────
    // Normalisation de la location : retirer le préfixe public_id (UUID)
    // pour comparer avec les chemins de route "purs"
    // ──────────────────────────────────────────────────────────────────
    const rawPath = window.location.pathname;
    const parts = rawPath.split('/');
    const firstSegment = parts.length > 1 ? parts[1] : '';
    const isUUID = firstSegment.length === 36;
    const normalizedPath = isUUID
      ? '/' + parts.slice(2).join('/')
      : rawPath;

    // ──────────────────────────────────────────────────────────────────
    // GARDE PRINCIPALE : Si l'utilisateur est déjà sur une route valide
    // (différente de '/' ou '/dashboard'), on ne redirige pas. Cela
    // évite l'écrasement de la page courante après un simple rechargement.
    // ──────────────────────────────────────────────────────────────────
    const nonRedirectPaths = ['/', '/dashboard', ''];
    if (!nonRedirectPaths.includes(normalizedPath)) {
      console.log(`[DashboardRedirector] Déjà sur une route valide (${normalizedPath}), pas de redirection.`);
      return;
    }

    let target = '/login';

    // ──────────────────────────────────────────────
    // 1. SUPER ADMIN — priorité absolue
    // ──────────────────────────────────────────────
    if (isSuperAdmin) {
      localStorage.removeItem('domain');
      target = '/superadmin/agents';

      // ──────────────────────────────────────────────
      // 2. DOMAINE ALERTE ou Rôles Alerte
      // ──────────────────────────────────────────────
    } else if (domain === 'ALERTE' || ((domain !== 'CHASSE' && domain !== 'REBOISEMENT') && ((user as any)?.isSupervisorRole || (user as any)?.isDefaultRole))) {
      if ((user as any)?.isSupervisorRole) {
        target = '/supervisor';
      } else {
        target = '/default-home';
      }

      // ──────────────────────────────────────────────
      // 3. DOMAINE REBOISEMENT
      // ──────────────────────────────────────────────
    } else if (domain === 'REBOISEMENT') {
      switch (user.role) {
        case 'admin':
          target = '/reboisement/admin';
          break;
        case 'agent':
          target = '/reboisement/regional';
          break;
        case 'sub-agent':
          target = '/reboisement/departement';
          break;
        default:
          target = '/reboisement';
      }

      // ──────────────────────────────────────────────
      // 4. DOMAINE CHASSE (ou par défaut)
      // ──────────────────────────────────────────────
    } else {
      switch (user.role) {
        case 'admin':
          target = '/admin';
          break;
        case 'agent':
          target = user.type === 'secteur' ? '/sector' : '/regional';
          break;
        case 'sub-agent': {
          // Déterminer la page selon le sous-type (serviceLocation)
          const subType = getUserSubType(user);
          const subTypeRoutes: Record<string, string> = {
            'sous-secteur': '/sous-secteur',
            'brigade': '/brigade',
            'triage': '/triage',
            'poste-control': '/poste-control',
          };
          target = subTypeRoutes[subType] || '/sector-agents';
          break;
        }
        case 'hunter':
          target = '/hunter';
          break;
        case 'hunting-guide':
          target = '/guide';
          break;
        default:
          target = '/login';
      }
    }

    // Préfixer avec le public_id si disponible
    if ((user as any).publicId) {
      const pubId = (user as any).publicId;
      target = `/${pubId}${target}`;
    }

    console.log(`[DashboardRedirector] → ${target} (role=${user.role}, domain=${domain}, superAdmin=${isSuperAdmin})`);
    setLocation(target);
  }, [user, isLoading, setLocation]);

  // Indicateur de chargement pendant la redirection
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-600 mb-4"></div>
      <p className="text-gray-500">Redirection en cours...</p>
    </div>
  );
}
