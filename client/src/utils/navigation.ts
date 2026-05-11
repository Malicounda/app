// Fonction utilitaire robuste pour vérifier si un utilisateur est super admin
export const isUserSuperAdmin = (user?: any): boolean => {
  if (!user) return false;
  // Gère les cas où isSuperAdmin est un booléen, une chaîne "true" ou un nombre 1
  return user.isSuperAdmin === true || String(user.isSuperAdmin).toLowerCase() === 'true' || user.isSuperAdmin === 1;
};

// Fonction centralisée pour déterminer la page d'accueil selon le rôle
export const getHomePage = (role?: string, type?: string, isSuperAdmin?: boolean | string | number, isDefaultRole?: boolean, isSupervisorRole?: boolean): string => {
  if (!role) return '/login';

  const superAdminFlag = isSuperAdmin === true || String(isSuperAdmin).toLowerCase() === 'true' || isSuperAdmin === 1;

  if (superAdminFlag) {
    return '/superadmin/agents';
  }

  if (isSupervisorRole) {
    return '/supervisor';
  }

  if (isDefaultRole) {
    return '/default-home';
  }

  // Sous-rôles secteur avec leur page d'accueil dédiée
  const subRoleHomePages: Record<string, string> = {
    'sub-agent': '/sector-agents',
    'brigade': '/brigade',
    'triage': '/triage',
    'poste-control': '/poste-control',
    'sous-secteur': '/sous-secteur',
  };

  switch (role) {
    case 'admin':
      return '/admin';
    case 'agent':
      return type === 'secteur' ? '/sector' : '/regional';
    case 'hunter':
      return '/hunter';
    case 'hunting-guide':
      return '/guide';
    default:
      if (subRoleHomePages[role]) return subRoleHomePages[role];
      return '/login';
  }
};

// Vérifie si un rôle est un sous-rôle secteur (sub-agent ou ses déclinaisons)
export const isSectorSubRole = (role?: string): boolean => {
  if (!role) return false;
  return ['sub-agent', 'brigade', 'triage', 'poste-control', 'sous-secteur'].includes(role);
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
