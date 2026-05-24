function isNativeCapacitor(): boolean {
  const cap =
    typeof window !== "undefined"
      ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      : undefined;
  return Boolean(cap?.isNativePlatform?.());
}

/** Met à jour le badge sur l’icône de l’app (APK / launchers compatibles ShortcutBadger). */
export async function syncLauncherBadge(count: number): Promise<void> {
  if (!isNativeCapacitor()) return;
  try {
    const { Badge } = await import("@capawesome/capacitor-badge");
    const { isSupported } = await Badge.isSupported();
    if (!isSupported) return;

    const perm = await Badge.checkPermissions();
    if (perm.display !== "granted") {
      const req = await Badge.requestPermissions();
      if (req.display !== "granted") return;
    }

    if (count <= 0) {
      await Badge.clear();
    } else {
      await Badge.set({ count: Math.min(99, Math.floor(count)) });
    }
  } catch (e) {
    console.warn("[launcherBadge] sync:", e);
  }
}
