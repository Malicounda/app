import { useAuth } from '@/contexts/AuthContext';
import { isUserSuperAdmin } from '@/utils/navigation';
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

    let target = '/login';

    // ──────────────────────────────────────────────
    // 1. SUPER ADMIN — pas de domaine, accès global
    // ──────────────────────────────────────────────
    if (isSuperAdmin) {
      // On efface tout domaine résiduel pour éviter les conflits
      localStorage.removeItem('domain');
      target = '/superadmin/agents';

    // ──────────────────────────────────────────────
    // 2. DOMAINE REBOISEMENT
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
        case 'brigade':
        case 'triage':
        case 'poste-control':
        case 'sous-secteur':
          target = '/reboisement/departement';
          break;
        default:
          target = '/reboisement';
      }

    // ──────────────────────────────────────────────
    // 3. DOMAINE CHASSE (ou par défaut)
    // ──────────────────────────────────────────────
    } else {
      switch (user.role) {
        case 'admin':
          target = '/admin';
          break;
        case 'agent':
          target = user.type === 'secteur' ? '/sector' : '/regional';
          break;
        case 'sub-agent':
          target = '/sector-agents';
          break;
        case 'brigade':
          target = '/brigade';
          break;
        case 'triage':
          target = '/triage';
          break;
        case 'poste-control':
          target = '/poste-control';
          break;
        case 'sous-secteur':
          target = '/sous-secteur';
          break;
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
