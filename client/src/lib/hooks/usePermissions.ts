import { useAuth } from "@/contexts/AuthContext";

export interface Permissions {
  // Permissions liées aux chasseurs
  canViewHunters: boolean;
  canCreateHunter: boolean;
  canEditHunter: boolean;
  canSuspendHunter: boolean;
  canReactivateHunter: boolean;
  canDeleteHunter: boolean;
  canRequestHunterDeletion: boolean;

  // Permissions liées aux permis
  canViewPermits: boolean;
  canCreatePermit: boolean;
  canEditPermit: boolean;
  canSuspendPermit: boolean;
  canReactivatePermit: boolean;
  canDeletePermit: boolean;

  // Permissions liées aux comptes utilisateurs
  canViewUsers: boolean;
  canCreateUser: boolean;
  canEditUser: boolean;
  canSuspendUser: boolean;
  canReactivateUser: boolean;
  canDeleteUser: boolean;
}

export function usePermissions(): Permissions {
  const { user } = useAuth();
  const role = user?.role || "";

  // Par défaut, aucune permission
  const defaultPermissions: Permissions = {
    canViewHunters: false,
    canCreateHunter: false,
    canEditHunter: false,
    canSuspendHunter: false,
    canReactivateHunter: false,
    canDeleteHunter: false,
    canRequestHunterDeletion: false,

    canViewPermits: false,
    canCreatePermit: false,
    canEditPermit: false,
    canSuspendPermit: false,
    canReactivatePermit: false,
    canDeletePermit: false,

    canViewUsers: false,
    canCreateUser: false,
    canEditUser: false,
    canSuspendUser: false,
    canReactivateUser: false,
    canDeleteUser: false,
  };

  // Définition des permissions en fonction du rôle
  if (role === "admin") {
    // Administrateur: toutes les permissions
    return {
      canViewHunters: true,
      canCreateHunter: true,
      canEditHunter: true,
      canSuspendHunter: true,
      canReactivateHunter: true,
      canDeleteHunter: true,
      canRequestHunterDeletion: true,

      canViewPermits: true,
      canCreatePermit: true,
      canEditPermit: true,
      canSuspendPermit: true,
      canReactivatePermit: true,
      canDeletePermit: true,

      canViewUsers: true,
      canCreateUser: true,
      canEditUser: true,
      canSuspendUser: true,
      canReactivateUser: true,
      canDeleteUser: true,
    };
  } else if (role === "agent") {
    // Agent: peut tout faire sauf supprimer des comptes/chasseurs
    return {
      canViewHunters: true,
      canCreateHunter: true,
      canEditHunter: true,
      canSuspendHunter: true,
      canReactivateHunter: true,
      canDeleteHunter: false,
      canRequestHunterDeletion: true,

      canViewPermits: true,
      canCreatePermit: true,
      canEditPermit: true,
      canSuspendPermit: true,
      canReactivatePermit: true,
      canDeletePermit: false,

      canViewUsers: true,
      canCreateUser: true,
      canEditUser: true,
      canSuspendUser: true,
      canReactivateUser: true,
      canDeleteUser: false,
    };
  } else if (role === "sub-agent") {
    // Agent secteur: permissions similaires à l'agent mais plus limitées
    return {
      canViewHunters: true,
      canCreateHunter: true,
      canEditHunter: true,
      canSuspendHunter: true,
      canReactivateHunter: true,
      canDeleteHunter: false,
      canRequestHunterDeletion: true,

      canViewPermits: true,
      canCreatePermit: true,
      canEditPermit: true,
      canSuspendPermit: true,
      canReactivatePermit: true,
      canDeletePermit: false,

      canViewUsers: false,
      canCreateUser: false,
      canEditUser: false,
      canSuspendUser: false,
      canReactivateUser: false,
      canDeleteUser: false,
    };
  } else if (role === "hunter") {
    // Chasseur: permissions limitées
    return {
      canViewHunters: false,
      canCreateHunter: false,
      canEditHunter: false,
      canSuspendHunter: false,
      canReactivateHunter: false,
      canDeleteHunter: false,
      canRequestHunterDeletion: false,

      canViewPermits: true,
      canCreatePermit: false,
      canEditPermit: false,
      canSuspendPermit: false,
      canReactivatePermit: false,
      canDeletePermit: false,

      canViewUsers: false,
      canCreateUser: false,
      canEditUser: false,
      canSuspendUser: false,
      canReactivateUser: false,
      canDeleteUser: false,
    };
  } else if (role === "guide") {
    // Guide de chasse: permissions très limitées, ne sont pas des agents
    return {
      canViewHunters: false,
      canCreateHunter: false,
      canEditHunter: false,
      canSuspendHunter: false,
      canReactivateHunter: false,
      canDeleteHunter: false,
      canRequestHunterDeletion: false,

      canViewPermits: true,
      canCreatePermit: false,
      canEditPermit: false,
      canSuspendPermit: false,
      canReactivatePermit: false,
      canDeletePermit: false,

      canViewUsers: false,
      canCreateUser: false,
      canEditUser: false,
      canSuspendUser: false,
      canReactivateUser: false,
      canDeleteUser: false,
    };
  }

  return defaultPermissions;
}