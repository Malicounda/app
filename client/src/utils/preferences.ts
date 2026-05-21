import { Preferences } from '@capacitor/preferences';

const isCapacitor = typeof window !== 'undefined' && !!(window as any).Capacitor;

/**
 * Enregistre une valeur dans localStorage et dans Capacitor Preferences (si disponible)
 */
export async function setPreference(key: string, value: string): Promise<void> {
  try {
    localStorage.setItem(key, value);
    if (isCapacitor) {
      await Preferences.set({ key, value });
    }
  } catch (e) {
    console.error(`[Preferences] Erreur lors de l'enregistrement de ${key}:`, e);
  }
}

/**
 * Récupère une valeur. Vérifie d'abord localStorage de manière synchrone pour la vitesse de rendu,
 * puis interroge Capacitor Preferences s'il est manquant localement.
 */
export async function getPreference(key: string): Promise<string | null> {
  try {
    const localVal = localStorage.getItem(key);
    if (localVal !== null) {
      return localVal;
    }

    if (isCapacitor) {
      const { value } = await Preferences.get({ key });
      if (value !== null) {
        // Synchroniser vers localStorage pour les accès rapides ultérieurs
        localStorage.setItem(key, value);
        return value;
      }
    }
  } catch (e) {
    console.error(`[Preferences] Erreur lors de la lecture de ${key}:`, e);
  }
  return null;
}

/**
 * Supprime une clé du localStorage et de Capacitor Preferences
 */
export async function removePreference(key: string): Promise<void> {
  try {
    localStorage.removeItem(key);
    if (isCapacitor) {
      await Preferences.remove({ key });
    }
  } catch (e) {
    console.error(`[Preferences] Erreur lors de la suppression de ${key}:`, e);
  }
}

/**
 * Supprime plusieurs clés du stockage
 */
export async function clearAllPreferences(keysToClear: string[]): Promise<void> {
  try {
    for (const key of keysToClear) {
      localStorage.removeItem(key);
      if (isCapacitor) {
        await Preferences.remove({ key });
      }
    }
  } catch (e) {
    console.error('[Preferences] Erreur lors du nettoyage global:', e);
  }
}
