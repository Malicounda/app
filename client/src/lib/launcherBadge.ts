/**
 * Détecte si on est dans l'APK Alerte de manière fiable.
 * User-agent « AlerteAPK » en premier (toujours injecté par le natif Android),
 * puis le bridge Capacitor en fallback.
 */
function isInAlerteApk(): boolean {
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("AlerteAPK")) {
    return true;
  }
  const cap =
    typeof window !== "undefined"
      ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      : undefined;
  return Boolean(cap?.isNativePlatform?.());
}

/** Met à jour le badge sur l'icône de l'app (APK / launchers compatibles ShortcutBadger). */
export async function syncLauncherBadge(count: number): Promise<void> {
  if (!isInAlerteApk()) return;
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    const { isSupported } = await Badge.isSupported();
    if (!isSupported) {
      console.log("[launcherBadge] Badge not supported on this device");
      return;
    }

    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") {
      const req = await Badge.requestPermissions();
      if (req.display !== "granted") {
        console.log("[launcherBadge] Badge permission denied");
        return;
      }
    }

    if (count <= 0) {
      await Badge.clear();
      console.log("[launcherBadge] Badge cleared");
    } else {
      const badgeCount = Math.min(99, Math.floor(count));
      await Badge.set({ count: badgeCount });
      console.log("[launcherBadge] Badge set to", badgeCount);
    }
  } catch (e) {
    console.warn("[launcherBadge] sync:", e);
  }
}
