import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/use-notifications';

/** APK Capacitor « Alerte » (user-agent AlerteAPK ou ?isApk=true). */
export function isAlerteApk(): boolean {
  try {
    if (typeof navigator !== 'undefined' && navigator.userAgent.includes('AlerteAPK')) {
      return true;
    }
    if (typeof window !== 'undefined' && window.location.search.includes('isApk=true')) {
      return true;
    }
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.() && navigator.userAgent.includes('AlerteAPK')) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Notifications natives uniquement dans l'APK Alerte (pas sur le web général). */
export default function AlerteApkNotifications() {
  const { user } = useAuth();
  const uid = user?.id != null ? Number(user.id) : null;
  const enabled = isAlerteApk() && Boolean(user);
  useNotifications(enabled, Number.isFinite(uid) ? uid : null);
  return null;
}
