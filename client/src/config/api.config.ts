// Configuration de l'API
export const API_CONFIG = {
  // URL de base de l'API (sera remplacée par les variables d'environnement en production)
  BASE_URL: (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
    ? `${import.meta.env.VITE_API_URL}`
    : '/api',
  
  // Timeout des requêtes en millisecondes
  TIMEOUT: 30000, // 30 secondes
  
  // Configuration des en-têtes par défaut
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  
  // Configuration des types MIME autorisés pour les téléchargements
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/jpg',
  ],
  
  // Taille maximale des fichiers (5MB)
  MAX_FILE_SIZE: 5 * 1024 * 1024,
  
  // Chemins des endpoints
  ENDPOINTS: {
    // Authentification
    AUTH: {
      LOGIN: '/auth/login',
      REFRESH_TOKEN: '/auth/refresh-token',
      PROFILE: '/auth/me',
    },
    
    // Pièces jointes par chasseur (BLOB en base, 1 ligne par chasseur)
    ATTACHMENTS: {
      // Statut synthétique des pièces jointes d'un chasseur
      STATUS: (hunterId: string | number) => `/attachments/${hunterId}`,

      // Uploader/mettre à jour une pièce jointe d'un type pour un chasseur
      // Champ fichier: 'file', body: { documentType }
      UPLOAD: (hunterId: string | number) => `/attachments/${hunterId}`,

      // Télécharger/Afficher une pièce jointe
      DOWNLOAD: (hunterId: string | number, documentType: string) => `/attachments/${hunterId}/${documentType}`,

      // Supprimer une pièce jointe pour un type
      DELETE: (hunterId: string | number, documentType: string) => `/attachments/${hunterId}/${documentType}`,
    },
    
    // Autres endpoints...
  },
  
  // Messages d'erreur génériques
  ERROR_MESSAGES: {
    NETWORK_ERROR: 'Erreur de connexion au serveur. Veuillez vérifier votre connexion internet.',
    SERVER_ERROR: 'Erreur serveur. Veuillez réessayer ultérieurement.',
    UNAUTHORIZED: 'Session expirée. Veuillez vous reconnecter.',
    FORBIDDEN: 'Accès refusé. Vous n\'avez pas les droits nécessaires.',
    NOT_FOUND: 'Ressource non trouvée.',
    VALIDATION_ERROR: 'Erreur de validation des données.',
    UNKNOWN_ERROR: 'Une erreur inconnue est survenue.',
  },
} as const;

// Types pour les documents
export type DocumentType = 
  | 'id_card'          // Pièce d'identité
  | 'weapon_permit'    // Permis de port d'arme
  | 'hunter_photo'     // Photo du chasseur
  | 'treasury_stamp'   // Timbre impôt
  | 'weapon_receipt'   // Quittance de l'arme par le trésor
  | 'insurance'        // Assurance
  | 'moral_certificate' // Certificat de bonne conduite (optionnel)
  | 'other';           // Autre type de document

// Statuts des documents
export type DocumentStatus = 
  | 'pending'   // En attente de validation
  | 'approved'  // Approuvé
  | 'rejected'  // Rejeté
  | 'expired';  // Expiré

// Interface pour un document
export interface Document {
  id: string;
  hunterId: string;
  type: DocumentType;
  status: DocumentStatus;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  validatedBy?: string;
  validatedAt?: string;
  rejectionReason?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

// Interface pour la réponse de l'API
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}
