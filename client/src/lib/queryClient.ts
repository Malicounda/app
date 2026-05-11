import { getEnvironment } from "@/utils/environment";
import { QueryClient, QueryFunction } from "@tanstack/react-query";

// Toujours utiliser le proxy Vite en développement pour éviter les cookies cross-site
const getApiBaseUrl = () => {
  const mode = import.meta.env.MODE || import.meta.env.NODE_ENV || 'development';
  const rawEnv = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL) as string | undefined;
  // En production, on respecte la variable si fournie
  if (mode === 'production' && rawEnv) {
    const base = rawEnv.replace(/\/+$/, "");
    return base.endsWith("/api") ? base : `${base}/api`;
  }
  // En dev, n'autoriser qu'une valeur relative (commençant par /) sinon forcer /api
  if (rawEnv && rawEnv.startsWith('/')) {
    const base = rawEnv.replace(/\/+$/, "");
    return base.endsWith('/api') ? base : `${base}/api`;
  }
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();
console.log('[API Base URL detected]', API_BASE_URL);

let __envPromise: Promise<'android' | 'desktop' | 'web'> | null = null;
async function getEnvCached() {
  if (!__envPromise) __envPromise = getEnvironment();
  return __envPromise;
}

function createOutboxId() {
  try {
    // Supported in modern runtimes + Tauri
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uuid = (globalThis as any)?.crypto?.randomUUID?.();
    if (uuid) return uuid;
  } catch {}
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function enqueueOutbox(args: { entity: string; action: string; payload: any }) {
  const env = await getEnvCached();
  if (env !== 'android') return null;

  const { invoke } = await import('@tauri-apps/api/core');
  const id = createOutboxId();
  const createdAt = Date.now();

  await invoke('plugin:sql|execute', {
    db: 'scodipp.db',
    query: `
      INSERT INTO outbox (id, created_at, entity, action, payload, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `,
    args: [id, createdAt, args.entity, args.action, JSON.stringify(args.payload)],
  });

  return { id, createdAt };
}

function mapOfflineEntity(method: string, url: string) {
  if (method.toUpperCase() !== 'POST') return null;
  // url can be '/api/alerts' or '/alerts' depending on caller; normalize by includes
  if (url.includes('/alerts')) return { entity: 'alert', action: 'create' };
  if (url.includes('/messages')) return { entity: 'message', action: 'create' };
  if (url.includes('/hunting-reports')) return { entity: 'hunting_report', action: 'create' };
  // declaration-especes has no create route today; hunting-reports handles it.
  return null;
}

async function throwIfResNotOk(res: Response, ctx?: { url?: string; method?: string }) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let body: any = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch (_) {
      body = undefined;
    }

    const baseMessage = res.status === 401 ? "" : body?.message || `${res.status}: ${text}`;
    const error: any = new Error(baseMessage);
    error.status = res.status;
    error.response = res;
    error.body = body;

    try {
      // Émettre un événement global pour afficher une boîte de dialogue utilisateur
      const detail = {
        status: res.status,
        message: baseMessage,
        url: ctx?.url,
        method: ctx?.method,
      } as any;
      // Ne pas afficher la boîte globale pour les doublons d'alerte (409) gérés localement
      const isAlertsEndpoint = typeof detail.url === 'string' && detail.url.includes('/api/alerts');
      const isDuplicateAlert = res.status === 409 && (body?.code === 'ALERT_DUPLICATE' || isAlertsEndpoint);
      if (!isDuplicateAlert) {
        window.dispatchEvent(new CustomEvent('apiRefusal', { detail }));
      }
    } catch {}

    if (res.status === 401) {
      // Silencieusement logger l'erreur 401
      console.log("Session expirée - Redirection vers la page de connexion...");
    }

    throw error;
  }
}

// Parse la réponse en toute sécurité (JSON si possible), gère 204 / corps vide / non-JSON
async function safeParseResponse<T = any>(res: Response): Promise<T | undefined> {
  if (res.status === 204) return undefined as any;
  const contentType = res.headers.get("content-type") || "";

  // Lire en texte d'abord pour éviter les erreurs de JSON sur corps vide
  const raw = await res.text();
  if (!raw) return undefined as any;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw) as T;
    } catch (_) {
      // Si JSON invalide, fallback undefined
      return undefined as any;
    }
  }

  // Non-JSON, retourner le texte brut si besoin
  return raw as any;
}

export async function apiRequest<T>({
  url,
  method,
  data,
}: {
  url: string;
  method: string;
  data?: unknown;
}): Promise<T> {
  // Construire l'URL complète - utiliser toujours API_BASE_URL (/api)
  // Normaliser l'URL demandée pour éviter un doublon /api
  let path = url || "";
  if (path.startsWith("/api/")) path = path.slice(4);
  else if (path === "/api") path = "/";
  if (!path.startsWith("/")) path = `/${path}`;
  const fullUrl = `${API_BASE_URL}${path}`;

  console.log(`[API Request] ${method} ${fullUrl}`, data);

  // Offline-first (Android only): queue mutations in SQLite outbox when offline
  try {
    const env = await getEnvCached();
    const isOffline = typeof navigator !== 'undefined' && navigator?.onLine === false;
    const offlineMap = mapOfflineEntity(method, fullUrl);
    if (env === 'android' && isOffline && offlineMap && data) {
      const queued = await enqueueOutbox({
        entity: offlineMap.entity,
        action: offlineMap.action,
        payload: data,
      });

      if (queued) {
        // Synthetic response: callers can treat as success; sync will send later
        return ({
          ok: true,
          queued: true,
          mutationId: queued.id,
          createdAt: queued.createdAt,
        } as any) as T;
      }
    }
  } catch (e) {
    // If offline queueing fails, fall back to normal request
    console.warn('[apiRequest] offline queueing failed, falling back to fetch:', e);
  }

  try {
    let headers: HeadersInit = {
      Accept: "application/json",
    };
    // Ajout du token JWT si présent
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    // Propager le domaine courant si défini
    try {
      const domain = localStorage.getItem('domain');
      if (domain) {
        headers['X-Domain'] = domain;
      }
    } catch {}
    let body: BodyInit | undefined;

    if (data instanceof FormData) {
      // Pour FormData, ne pas définir Content-Type, le navigateur s'en charge avec la bonne boundary
      body = data;
    } else if (data) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(data);
    }

    const res = await fetch(fullUrl, {
      method,
      headers,
      body,
      credentials: "include", // Toujours envoyer les cookies de session
    });

    console.log(`[API Response] ${res.status} ${res.statusText}`);

    await throwIfResNotOk(res, { url: fullUrl, method });
    const parsed = await safeParseResponse<T>(res);
    return parsed as T;
  } catch (error: any) {
    console.error("Erreur lors de la requête:", error);
    // Préserver les informations structurées d'erreur si disponibles
    if (error?.response) {
      throw error; // contient status, response, body
    }
    const errorMessage =
      error?.message === "Failed to fetch"
        ? "Impossible de se connecter au serveur. Vérifiez que le serveur est en cours d'exécution sur http://127.0.0.1:3000 et que PostgreSQL est accessible."
        : error?.message || "Une erreur s'est produite lors de la requête.";
    throw new Error(errorMessage);
  }
}

// helper wrapper to treat missing hunter as null for endpoints like /api/hunters/me
export async function apiRequestFallback<T = any>(options: { url: string; method?: string; data?: any }): Promise<T | null> {
  try {
    // assume apiRequest is defined earlier in this file
    // @ts-ignore
    return await apiRequest(options) as T;
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    const url = String(options?.url || '').toLowerCase();
    if ((url.endsWith('/api/hunters/me') || url.includes('/api/hunters/me')) && (msg.includes('chasseur non trouv') || err?.status === 404)) {
      return null;
    }
    throw err;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

export function getQueryFn<T = any>(options: {
  on401: UnauthorizedBehavior;
}): QueryFunction<T> {
  const { on401: unauthorizedBehavior } = options;
  return async ({ queryKey }) => {
    const url = queryKey[0] as string;
    // Normaliser l'URL pour éviter /api/api
    let path = url || "";
    if (path.startsWith("/api/")) path = path.slice(4);
    else if (path === "/api") path = "/";
    if (!path.startsWith("/")) path = `/${path}`;
    const fullUrl = `${API_BASE_URL}${path}`;

    console.log(`[Query Request] GET ${fullUrl}`);

    try {
      // Ajouter le token Authorization pour les requêtes GET également
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        Accept: "application/json",
      };
      if (token) {
        (headers as any)['Authorization'] = `Bearer ${token}`;
      }
      // Propager le domaine courant si défini
      try {
        const domain = localStorage.getItem('domain');
        if (domain) {
          (headers as any)['X-Domain'] = domain;
        }
      } catch {}
      const res = await fetch(fullUrl, {
        credentials: "include", // Toujours envoyer les cookies de session
        headers,
      });

      console.log(`[Query Response] ${res.status} ${res.statusText}`);

      if (res.status === 401) {
        console.log("Session expirée - 401 reçu");
        if (unauthorizedBehavior === "returnNull") return null as any;
        const err: any = new Error("Unauthorized");
        err.status = 401;
        throw err;
      }

      await throwIfResNotOk(res, { url: fullUrl, method: 'GET' });
      const parsed = await safeParseResponse<T>(res);
      return parsed as T;
    } catch (error: any) {
      console.error("Erreur lors de la requête:", error);
      if (error?.response) {
        throw error;
      }
      const errorMessage =
        error?.message === "Failed to fetch"
          ? "Impossible de se connecter au serveur. Vérifiez que le serveur est en cours d'exécution sur http://127.0.0.1:3000 et que PostgreSQL est accessible."
          : error?.message || "Une erreur s'est produite lors de la requête.";
      throw new Error(errorMessage);
    }
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      // Auto-refresh global: toujours rafraîchir au montage, au focus, et à la reconnexion
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Stale court pour favoriser des données fraîches partout
      staleTime: 5 * 60 * 1000,
      refetchInterval: false,
      gcTime: 30 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
      onError: (error: any) => {
        if (error?.status === 401) {
          console.log("Mutation: 401 détecté (pas de redirection automatique)");
        } else {
          console.error("Erreur de mutation:", error);
        }
      },
    },
  },
});

const queryCache = queryClient.getQueryCache();

queryCache.subscribe((event) => {
  if (event && "error" in event) {
    const error = (event as any).error;
    if (error) {
      console.error("Erreur de requête détectée dans le cache:", error);
      if (error.status === 401) {
        console.log("Erreur 401 détectée dans le cache des requêtes");
      }
    }
  }
});

export { queryClient };

// Petites utilitaires globales pour déclencher/vider les caches lors du login/logout
export async function afterLoginRefreshAll() {
  try {
    await queryClient.invalidateQueries();
    // Déclencher immédiatement les requêtes actives
    await queryClient.refetchQueries({ type: 'active' });
  } catch (e) {
    console.warn('afterLoginRefreshAll error:', e);
  }
}

export async function afterLogoutClearAll() {
  try {
    queryClient.clear();
  } catch (e) {
    console.warn('afterLogoutClearAll error:', e);
  }
}
