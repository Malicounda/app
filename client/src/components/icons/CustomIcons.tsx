import React from 'react';
import {
    MdArrowDownward,
    MdArrowUpward,
    MdAssignmentTurnedIn,
    MdBarChart,
    MdCompareArrows,
    MdDashboard,
    MdDescription,
    MdGavel,
    MdGpsFixed,
    MdHistory,
    MdHome,
    MdLayers,
    MdMail,
    MdManageAccounts,
    MdMap,
    MdNotifications,
    MdPalette,
    MdPerson,
    MdPersonSearch,
    MdPets,
    MdReceipt,
    MdSettings,
    MdSms,
    MdSupervisorAccount,
    MdWork
} from 'react-icons/md';

interface IconProps { className?: string; size?: number }

// Icône Profil Utilisateur
export const UserProfileIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdPerson className={className} size={size} />
);

// Icône Tableau de Bord
export const DashboardIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdDashboard className={className} size={size} />
);

// Icône Statistiques
export const StatsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdBarChart className={className} size={size} />
);

// Icône Agent
export const AgentIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdPerson className={className} size={size} />
);

// Icône Guides de Chasse
export const GuidesIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdSupervisorAccount className={className} size={size} />
);

// Icône Chasseurs
export const HuntersIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdPersonSearch className={className} size={size} />
);

// Icône Demandes de Permis
export const PermitRequestsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdMail className={className} size={size} />
);

// Icône Permis
export const PermitsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdDescription className={className} size={size} />
);

// Icône Taxes d'Abattage
export const TaxesIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdReceipt className={className} size={size} />
);

// Icône Messagerie
export const MessagingIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdSms className={className} size={size} />
);

// Icône Alertes
export const AlertsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdNotifications className={className} size={size} />
);

// Icône Carte
export const MapIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdMap className={className} size={size} />
);

// Icône Régions & Zones
export const RegionsZonesIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdLayers className={className} size={size} />
);

// Icône Espèces Fauniques
export const WildlifeIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdPets className={className} size={size} />
);

// Icône Changement Profil
export const ProfileChangeIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdCompareArrows className={className} size={size} />
);

// Icône Gestion des Comptes
export const AccountManagementIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdManageAccounts className={className} size={size} />
);

// Icône Historique
export const HistoryIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdHistory className={className} size={size} />
);

// Icône Paramètres
export const SettingsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdSettings className={className} size={size} />
);

// Icône Thème
export const ThemeIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdPalette className={className} size={size} />
);

// Icône Rapports de Chasse
export const HuntingReportsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdGpsFixed className={className} size={size} />
);

// Icône Activités de Chasse
export const HuntingActivitiesIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdDescription className={className} size={size} />
);

// Icône Déclarations Guide
export const GuideDeclarationsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdAssignmentTurnedIn className={className} size={size} />
);

// Icône Accueil/Home
export const HomeIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdHome className={className} size={size} />
);

// Icône Infractions
export const InfractionsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdGavel className={className} size={size} />
);

// Icône Domaines (SuperAdmin)
export const DomainesIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdLayers className={className} size={size} />
);

// Icône Rôles métier (SuperAdmin)
export const RolesMetierIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <MdWork className={className} size={size} />
);

export const AffectationsIcon: React.FC<IconProps> = ({ className = "", size = 24 }) => (
  <span
    className={className}
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1 }}
  >
    <MdArrowUpward size={Math.max(10, Math.round(size * 0.7))} color="#16a34a" />
    <MdArrowDownward size={Math.max(10, Math.round(size * 0.7))} color="#2563eb" />
  </span>
);
