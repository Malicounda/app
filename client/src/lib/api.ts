type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// Téléchargement de ressources binaires (images, PDF) avec JWT + cookies
export async function apiRequestBlob(
  endpoint: string,
  method: HttpMethod = 'GET'
): Promise<{ ok: boolean; blob?: Blob; error?: string; contentType?: string; fileName?: string }> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    let path = endpoint || '';
    if (path.startsWith('/api/')) path = path.slice(4);
    else if (path === '/api') path = '/';
    if (!path.startsWith('/')) path = `/${path}`;
    const fullUrl = `${apiBaseUrl}${path}`;
    
    // Log de débogage pour le chargement du blob
    console.log(`[apiRequestBlob] Chargement du blob depuis: ${fullUrl}`);

    let token: string | null = null;
    try {
      token = (typeof window !== 'undefined')
        ? (localStorage.getItem('token') || sessionStorage.getItem('token'))
        : null;
    } catch (_) {}

    const headers: Record<string, string> = { 'X-Requested-With': 'fetch' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(fullUrl, {
      method,
      headers,
      credentials: 'include',
    });
    
    console.log(`[apiRequestBlob] Réponse reçue: ${response.status} ${response.statusText}`, {
      ok: response.ok,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });

    if (!response.ok) {
      // Essayer d'extraire un message d'erreur texte
      let msg = response.statusText;
      try { msg = await response.text(); } catch {}
      return { ok: false, error: msg || 'Erreur de téléchargement' };
    }

    const contentType = response.headers.get('content-type') || undefined;
    const dispo = response.headers.get('content-disposition') || '';
    const fileNameMatch = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(dispo || '');
    const fileName = decodeURIComponent(fileNameMatch?.[1] || fileNameMatch?.[2] || '');

    const blob = await response.blob();
    console.log(`[apiRequestBlob] Blob créé:`, {
      size: blob.size,
      type: blob.type,
      url: URL.createObjectURL(blob).substring(0, 50) + '...'
    });
    
    return { ok: true, blob, contentType, fileName };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Une erreur est survenue' };
  }
}

// Détection automatique de l'URL de l'API basée sur l'URL actuelle
const getApiBaseUrl = () => {
  const mode = import.meta.env.MODE || import.meta.env.NODE_ENV || 'development';
  const rawEnv = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL) as string | undefined;

  // 1) En production, respecter la variable si fournie (URL absolue ou relative)
  if (mode === 'production' && rawEnv) {
    const base = rawEnv.replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }

  // 2) En développement: accepter une valeur relative commençant par '/'
  if (rawEnv && rawEnv.startsWith('/')) {
    const base = rawEnv.replace(/\/+$/, '');
    return base.endsWith('/api') ? base : `${base}/api`;
  }

  // 3) Contexte d'exécution en développement (Vite dev server)
  // IMPORTANT: Ne jamais forcer "localhost" quand on est sur le port 5173, car
  // en accès LAN (ex: 192.168.x.x:5173) sur mobile, "localhost" pointerait sur
  // le téléphone et casserait toutes les requêtes.
  // On utilise le proxy Vite via le chemin relatif "/api".
  try {
    const loc = typeof window !== 'undefined' ? window.location : undefined;
    if (loc && loc.port === '5173') {
      return '/api';
    }
  } catch (_) {}

  // 4) Par défaut, utiliser le proxy Vite (/api) en dev
  return '/api';
};

// Parse la réponse en toute sécurité (JSON si possible), gère 204 / corps vide / non-JSON
async function safeParseResponse<T = any>(response: Response): Promise<T | undefined> {
  if (response.status === 204) return undefined as any;
  const contentType = response.headers.get('content-type') || '';
  const raw = await response.text();
  if (!raw) return undefined as any;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(raw) as T;
    } catch (_) {
      return undefined as any;
    }
  }
  return raw as any;
}

export async function apiRequest<T>(
  method: HttpMethod,
  endpoint: string,
  body?: any
): Promise<ApiResponse<T>> {
  try {
    const apiBaseUrl = getApiBaseUrl();
    // Normaliser l'endpoint: retirer un éventuel préfixe /api pour éviter /api/api
    let path = endpoint || "";
    if (path.startsWith("/api/")) path = path.slice(4); // retire le premier '/api'
    else if (path === "/api") path = "/";
    // S'assurer d'avoir un slash unique
    if (!path.startsWith("/")) path = `/${path}`;
    // Construire l'URL complète - utiliser toujours apiBaseUrl (/api)
    const fullUrl = `${apiBaseUrl}${path}`;
    // Récupérer le token JWT si présent
    let token: string | null = null;
    try {
      token = (typeof window !== 'undefined')
        ? (localStorage.getItem('token') || sessionStorage.getItem('token'))
        : null;
    } catch (_) {
      // accès storage non disponible
    }

    // Déterminer si le corps est un FormData/Blob (multipart ou binaire)
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const isBlob = typeof Blob !== 'undefined' && body instanceof Blob;

    const headers: Record<string, string> = {
      'X-Requested-With': 'fetch',
    };
    // Ne pas définir Content-Type pour FormData/Blob (le navigateur s'en charge)
    if (!isFormData && !isBlob) {
      headers['Content-Type'] = 'application/json';
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(fullUrl, {
      method,
      headers,
      credentials: 'include', // ← Permet d'envoyer les cookies/session à chaque requête
      body: body == null ? undefined : (isFormData || isBlob ? body : JSON.stringify(body)),
    });

    // Tenter de parser en toute sécurité; peut être undefined (204 ou vide)
    const parsed = await safeParseResponse<T>(response);

    if (response.ok) {
      return {
        ok: true,
        data: parsed as T | undefined,
        status: response.status,
      };
    }

    // En erreur, essayer d'extraire un message des payloads communs
    const errorPayload: any = parsed ?? {};
    const errorMsg = errorPayload?.error || errorPayload?.message || response.statusText || 'Unknown error';

    return {
      ok: false,
      error: errorMsg,
      data: parsed as T | undefined,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue',
    };
  }
}

