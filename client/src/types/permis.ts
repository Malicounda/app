export enum TypePermisSpecial {
  PETITE_CHASSE_RESIDENT = 'PETITE_CHASSE_RESIDENT',
  PETITE_CHASSE_COUTUMIER = 'PETITE_CHASSE_COUTUMIER',
  GRANDE_CHASSE = 'GRANDE_CHASSE',
  GIBIER_EAU = 'GIBIER_EAU',
  SCIENTIFIQUE = 'SCIENTIFIQUE',
  CAPTURE_COMMERCIALE = 'CAPTURE_COMMERCIALE',
  OISELLERIE = 'OISELLERIE',
}

export type TypeDemande = 
  | 'NOUVELLE'
  | 'RENOUVELLEMENT'
  | 'DUPLICATA'
  | 'MIGRATION_COUTUMIER';

export type StatutDemande = 
  | 'NOUVELLE'
  | 'AFFECTEE'
  | 'RDV_PLANIFIE'
  | 'DOCUMENTS_VERIFIES'
  | 'VALIDEE'
  | 'REJETEE';

export interface DocumentJoint {
  id: string;
  type: string;
  url: string;
  dateDepot: Date;
  name?: string;
}

export interface DemandePermisSpecial {
  id: string;
  chasseurId: string;
  type: TypePermisSpecial;
  typeDemande: TypeDemande;
  statut: StatutDemande;
  dateCreation: string;
  dateModification: string;
  documents: DocumentJoint[];
  commentaires?: string;
  agentId?: string;
  dateValidation?: string;
  pointRecuperation?: PointRecuperation;
  // Pour les demandes de migration
  ancienPermisId?: string;
  motifMigration?: string;
  lieuRetrait?: {
    type: 'REGIONAL' | 'SECTEUR';
    id: string;
    nom: string;
  };
  validePar?: string;
  motifRejet?: string;
}

export interface PointRecuperation {
  id: string;
  type: 'REGIONAL' | 'SECTEUR';
  nom: string;
  adresse: string;
  contact: string;
  horaires: string;
  permisDisponibles: TypePermisSpecial[];
}

// Types pour les Permis Attribués

// Doit correspondre à permitTypeEnum du backend (shared/schema.ts)
export enum TypePermis {
  PETITE_CHASSE_RESIDENT = 'petite_chasse_resident',
  PETITE_CHASSE_COUTUMIER = 'petite_chasse_coutumier',
  GRANDE_CHASSE = 'grande_chasse',
  GIBIER_EAU = 'gibier_eau',
  SCIENTIFIQUE = 'scientifique',
  CAPTURE_COMMERCIALE = 'capture_commerciale',
  OISELLERIE = 'oisellerie',
  PORT_ARME = 'port_arme', // Ajout par rapport à TypePermisSpecial
}

// Doit correspondre à permitStatusEnum du backend (shared/schema.ts)
export enum PermitStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
  CANCELLED = 'cancelled',
}

export interface Permit {
  id: number;
  hunterId: number;
  status: PermitStatus;
  permitNumber: string;
  type: TypePermis; // Utilise le nouveau TypePermis
  price: string | null;
  issueDate: string; // Devrait être Date si possible, mais string si vient directement du JSON
  expiryDate: string; // Idem
  area: string | null;
  categoryId: number | null;
  receiptNumber: string | null;
  weapons: string | null; // Pourrait être string[] si parsé
  metadata: any | null; // Ou un type plus spécifique si la structure de metadata est connue
  createdAt: string; // Idem pour les dates
  // Ajoutez d'autres champs de la table 'permits' du backend si nécessaire
}

export interface PermitWithHunterInfo extends Permit {
  hunterFirstName?: string | null;
  hunterLastName?: string | null;
}
