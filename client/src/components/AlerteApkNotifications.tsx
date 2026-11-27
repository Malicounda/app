import { useAuth } from '@/contexts/AuthContext';
import { useLauncherBadge } from '@/hooks/useLauncherBadge';
import { useNotifications } from '@/hooks/use-notifications';

/**
 * Détecte de manière fiable si l'app tourne dans l'APK Alerte Capacitor.
 *
 * L'APK charge une URL distante (eforets.pages.dev) dans une WebView Android.
 * Le bridge Capacitor n'est pas toujours disponible immédiatement, mais le
 * user-agent « AlerteAPK » est TOUJOURS injecté par la config native
 * (capacitor.config.ts → android.appendUserAgent).
 *
 * Ordre de détection :
 *  1. User-Agent « AlerteAPK » — le plus fiable, toujours présent
 *  2. Param URL ?isApk=true — présent uniquement sur la page initiale de login
 *  3. Capacitor bridge — peut ne pas être dispo si URL distante
 */
export function isAlerteApk(): boolean {
  try {
    // 1. User-Agent (plus fiable — toujours injecté par le natif Android)
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('AlerteAPK')) {
      return true;
    }
    // 2. Query param (page de login initiale uniquement)
    if (typeof window !== 'undefined' && window.location.search.includes('isApk=true')) {
      return true;
    }
    // 3. Bridge Capacitor (fallback)
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      return true;
    }
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    /* ignore */
   }
  return false;
}

/**
 * Active les notifications temps réel (Socket.io + son Web Audio + notifications navigateur/APK)
 * pour TOUS les utilisateurs connectés (ordinateur, mobile web et APK),
 * et le badge natif launcher uniquement sur APK Android.
 */
export default function AlerteApkNotifications() {
  const { user } = useAuth();
  const uid = user?.id != null ? Number(user.id) : null;
  const isLoggedIn = Boolean(user && Number.isFinite(uid));
  const apkBadgeEnabled = isAlerteApk() && isLoggedIn;
  useNotifications(isLoggedIn, isLoggedIn ? uid : null);
  useLauncherBadge(apkBadgeEnabled);
  return null;
}
