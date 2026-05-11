// Schémas partagés entre le client et le serveur

// Types de base
export * from './types/common.js';
export * from './types/auth.js';

// Types spécifiques
// Export sélectif pour éviter les doublons
import * as huntingTypes from './types/hunting.js';
export { huntingTypes };

export * from './types/geo.js';

// Utilitaires
export * from './utils.js';

// Constantes
export * from './constants.js';

// Ré-exporter les types non exportés par les imports précédents
export type { HuntingPermit, HuntingZone, HuntingQuota, HuntingReport, Species } from './types/hunting.js';
