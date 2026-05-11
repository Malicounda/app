// Configuration pour détecter l'environnement Android
import { getCurrentWindow } from '@tauri-apps/api/window';

export const isAndroid = async (): Promise<boolean> => {
  try {
    // Vérifier si nous sommes dans un environnement Tauri Android
    const appWindow = getCurrentWindow();
    const label = appWindow.label;

    // Sur Android, le label de la fenêtre contient généralement "android"
    return label.includes('android') || label.includes('Android');
  } catch (error) {
    // Si getCurrentWindow() échoue, nous ne sommes probablement pas dans Tauri
    return false;
  }
};

export const isMobile = async (): Promise<boolean> => {
  try {
    const android = await isAndroid();
    return android || /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  } catch (error) {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }
};

export const getEnvironment = async (): Promise<'android' | 'desktop' | 'web'> => {
  try {
    const android = await isAndroid();
    if (android) return 'android';

    // Vérifier si nous sommes dans Tauri (desktop)
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:sql|execute', { db: 'test', query: 'SELECT 1' });
    return 'desktop';
  } catch (error) {
    return 'web';
  }
};
