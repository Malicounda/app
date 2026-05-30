// Fonction utilitaire robuste pour vérifier si un utilisateur est super admin
export const isUserSuperAdmin = (user?: any): boolean => {
  if (!user) return false;
  // Gère les cas où isSuperAdmin est un booléen, une chaîne "true" ou un nombre 1
  return user.isSuperAdmin === true || String(user.isSuperAdmin).toLowerCase() === 'true' || user.isSuperAdmin === 1;
};

/**
 * Détermine le sous-type effectif d'un sub-agent à partir de serviceLocation.
 * Hiérarchie : Agent Secteur (sub-agent) → Sous-Secteur → Brigade → Triage → Poste de contrôle
 *
 * @returns 'sous-secteur' | 'brigade' | 'triage' | 'poste-control' | 'sub-agent'
 */
export const getUserSubType = (user?: any): string => {
  if (!user) return 'sub-agent';
  const role = String(user.role || '').toLowerCase();
  if (role !== 'sub-agent') return role; // pas un sub-agent, retourner le rôle tel quel

  const sl = String(user.serviceLocation || user.sousService || '').trim().toLowerCase();
  if (sl.includes('brigade')) return 'brigade';
  if (sl.includes('triage')) return 'triage';
  if (sl.includes('poste') && sl.includes('contr')) return 'poste-control';
  if (sl.includes('sous') && sl.includes('sect')) return 'sous-secteur';
  return 'sub-agent'; // Agent secteur standard (serviceLocation = "Secteur")
};

// Fonction centralisée pour déterminer la page d'accueil selon le rôle
export const getHomePage = (role?: string, type?: string, isSuperAdmin?: boolean | string | number, isDefaultRole?: boolean, isSupervisorRole?: boolean, user?: any): string => {
  if (!role) return '/login';

  const superAdminFlag = isSuperAdmin === true || String(isSuperAdmin).toLowerCase() === 'true' || isSuperAdmin === 1;

  if (superAdminFlag) {
    return '/superadmin/agents';
  }

  let domain = '';
  try {
    domain = (localStorage.getItem('domain') || '').toUpperCase();
  } catch (e) {}

  // Redirection Alerte : uniquement si le domaine est explicitement ALERTE,
  // OU si les flags isDefaultRole/isSupervisorRole sont actifs MAIS que le domaine
  // n'est pas CHASSE ni REBOISEMENT (évite la contamination inter-domaines).
  const isAlerteDomain = domain === 'ALERTE' || ((domain !== 'CHASSE' && domain !== 'REBOISEMENT') && !!(isSupervisorRole || isDefaultRole));
  if (isAlerteDomain) {
    if (isSupervisorRole) {
      return '/supervisor';
    } else {
      return '/default-home';
    }
  }

  if (domain === 'REBOISEMENT') {
    switch (role) {
      case 'admin':
        return '/reboisement/admin';
      case 'agent':
        return '/reboisement/regional';
      case 'sub-agent':
        return '/reboisement/departement';
      default:
        return '/reboisement';
    }
  }

  // Domaine CHASSE ou par défaut
  switch (role) {
    case 'admin':
      return '/admin';
    case 'agent':
      return type === 'secteur' ? '/sector' : '/regional';
    case 'sub-agent': {
      // Déterminer la page selon le sous-type (serviceLocation)
      const subType = getUserSubType(user);
      const subRoleHomePages: Record<string, string> = {
        'sous-secteur': '/sous-secteur',
        'brigade': '/brigade',
        'triage': '/triage',
        'poste-control': '/poste-control',
      };
      return subRoleHomePages[subType] || '/sector-agents';
    }
    case 'hunter':
      return '/hunter';
    case 'hunting-guide':
      return '/guide';
    default:
      return '/login';
  }
};

// Vérifie si un rôle est un sous-rôle secteur (sub-agent ou ses déclinaisons)
export const isSectorSubRole = (role?: string, user?: any): boolean => {
  if (!role) return false;
  if (role === 'sub-agent') return true;
  // Compatibilité : si un ancien code passe encore 'brigade' etc. comme role
  return ['brigade', 'triage', 'poste-control', 'sous-secteur'].includes(role);
};

// Détermine si un utilisateur chasseur doit impérativement compléter son profil (étape 2)
export const needsHunterProfileCompletion = (user?: { role?: string; hunterId?: number | null }): boolean => {
  try {
    if (!user) return false;
    if (user.role !== 'hunter') return false;
    const profileCompleted = localStorage.getItem('profileCompleted') === 'true';
    const hasHunterId = !!user.hunterId;
    return !(profileCompleted && hasHunterId);
  } catch {
    // Par sûreté, si localStorage inaccessible, exiger la complétion
    return !!user && user.role === 'hunter' && !user.hunterId;
  }
};
