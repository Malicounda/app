// Environment detection and dynamic configurations
// Decoupled from static Tauri imports to prevent browser hanging issues

/** Capacitor APK / app native (WebView embarquée). */
export const isCapacitorNative = (): boolean => {
  try {
    const cap = typeof window !== 'undefined'
      ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      : undefined;
    return Boolean(cap?.isNativePlatform?.());
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    return false;
   }
};

// Helper to check if running in Tauri WebView
export const isTauriEnv = (): boolean => {
  return typeof window !== 'undefined' && (
    '__TAURI_INTERNALS__' in window ||
    '__TAURI__' in window ||
    (window as any).__TAURI_METADATA__ !== undefined
  );
};

export const isAndroid = async (): Promise<boolean> => {
  if (!isTauriEnv()) return false;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const appWindow = getCurrentWindow();
    const label = appWindow.label || '';
    return label.toLowerCase().includes('android');
  } catch (error) {
    console.warn('[Environment] Failed to get Tauri window:', error);
    return false;
  }
};

export const isMobile = async (): Promise<boolean> => {
  try {
    const android = await isAndroid();
    if (android) return true;
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
  return typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const getEnvironment = async (): Promise<'android' | 'desktop' | 'web'> => {
  if (!isTauriEnv()) return 'web';
  try {
    const android = await isAndroid();
    if (android) return 'android';

    // Import core tauri APIs dynamically to prevent startup hangs in regular browsers
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('plugin:sql|execute', { db: 'test', query: 'SELECT 1' });
    return 'desktop';
  } catch (error) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
    return 'web';
   }
};

// Centralized robust dynamic API Base URL resolver
export const getApiBaseUrl = (): string => {
  // APK Capacitor : toujours l'API production (hostname localhost sinon → /api invalide)
  if (isCapacitorNative()) {
    return 'https://malicounda-api.onrender.com/api';
  }

  // 1. Check current browser location FIRST to override bundled .env issues
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isProdHost = hostname === 'eforets.pages.dev' || hostname.endsWith('.pages.dev');
  const isDevHost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.');

  if (isProdHost) {
    return 'https://malicounda-api.onrender.com/api';
  }

  // 2. Prioritize explicit environment variables (if not overridden by ProdHost)
  const rawEnv = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL) as string | undefined;

  if (rawEnv) {
    const trimmed = rawEnv.trim().replace(/\/+$/, "");
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
    }
    if (trimmed.startsWith("/")) {
      return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
    }
  }

  // 3. Check build mode
  const isViteProd = import.meta.env.MODE === 'production';

  // Production or preview cloudflare environments
  if (isProdHost || (isViteProd && !isDevHost && hostname)) {
    return 'https://malicounda-api.onrender.com/api';
  }

  // Development in a standard web browser (must use relative proxy to avoid cookie/CORS issues)
  if (isDevHost && hostname && !isTauriEnv()) {
    return '/api';
  }

  // Mobile / Desktop production app (native wrapper)
  if (isViteProd) {
    return 'https://malicounda-api.onrender.com/api';
  }

  // Mobile / Desktop local development
  return 'http://localhost:3000/api';
};

/** Construit l'URL API absolue à partir d'un chemin (/api/... ou /...). */
export function resolveApiUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const apiBaseUrl = getApiBaseUrl();
  let path = endpoint || '';
  if (path.startsWith('/api/')) path = path.slice(4);
  else if (path === '/api') path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  return `${apiBaseUrl}${path}`;
};

// Intelligent logger for application status
export const logEnvironmentInfo = () => {
  try {
    const hostname = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
    const mode = import.meta.env.MODE;
    const isProd = mode === 'production';
    const api = getApiBaseUrl();
    const network = typeof navigator !== 'undefined' && navigator.onLine ? 'ONLINE' : 'OFFLINE';
    const tauri = isTauriEnv() ? 'TAURI' : 'WEB BROWSER';

    console.log(
      `%c[SYSTEM CONFIG]%c\n` +
      `  • Mode: ${isProd ? '🔴 PRODUCTION' : '🟢 DEVELOPMENT'} (${mode})\n` +
      `  • Platform: ${tauri}\n` +
      `  • Host Origin: ${hostname}\n` +
      `  • API Target: ${api}\n` +
      `  • Network Status: ${network}`,
      'color: #00ffcc; font-weight: bold; font-size: 11px;',
      'color: inherit;'
    );
  } catch (err) {
    console.error('Failed to log env info:', err);
  }
};

