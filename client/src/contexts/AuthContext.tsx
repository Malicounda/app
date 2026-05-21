import { afterLoginRefreshAll, afterLogoutClearAll, apiRequest } from "@/lib/queryClient";
import { getHomePage, isUserSuperAdmin } from "@/utils/navigation";
import React from "react";
import { useLocation } from "wouter";
import { setPreference, getPreference, removePreference, clearAllPreferences } from "@/utils/preferences";

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  isSuperAdmin?: boolean;
  isDefaultRole?: boolean;
  isSupervisorRole?: boolean;
  type?: "regional" | "secteur";
  email: string;
  phone: string;
  grade?: string | null;
  genre?: string | null;
  roleMetierCode?: string | null;
  roleMetierLabel?: string | null;
  region?: string;
  zone?: string;
  departement?: string;
  hunterId?: number;
  guideId?: number;
  licenseNumber?: string;
  experience?: number;
  hunter?: {
    id: number;
    firstName: string;
    lastName: string;
    idNumber: string;
    dateOfBirth: string;
    phone: string;
    address: string;
    region: string;
    experience: number;
    profession: string;
    category: string;
    weaponType?: string;
    weaponBrand?: string;
    weaponReference?: string;
    weaponCaliber?: string;
    weaponOtherDetails?: string;
  };
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authInitialized: boolean;
  serverUnavailable: boolean;
  lastSuccessfulAuthSync: string | null;
  login: (identifier: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
}

const defaultContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  authInitialized: false,
  serverUnavailable: false,
  lastSuccessfulAuthSync: null,
  login: async () => { },
  logout: async () => { },
  refreshUser: async () => { },
  error: null,
};

const AuthContext = React.createContext<AuthContextType>(defaultContext);

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Clé pour persister la session minimale
const SESSION_KEY = 'scodi_session';
const SYNC_KEY = 'lastSuccessfulAuthSync';

async function saveSession(u: User) {
  try {
    const sessionData = JSON.stringify({
      id: u.id,
      role: u.role,
      type: u.type,
      isDefaultRole: (u as any).isDefaultRole,
      isSupervisorRole: (u as any).isSupervisorRole,
      isSuperAdmin: (u as any).isSuperAdmin,   // ← CRITIQUE: présence pour le guard au rechargement
      publicId: (u as any).publicId ?? null,   // ← CRITIQUE: présence pour le routage basé UUID
      firstName: u.firstName,
      lastName: u.lastName,
      username: (u as any).username,
    });
    await setPreference(SESSION_KEY, sessionData);
  } catch {}
}
async function clearSession() {
  try {
    await clearAllPreferences([SESSION_KEY, 'token', 'userRole', 'userRegion', SYNC_KEY]);
  } catch {}
}

/**
 * Décode et vérifie si le jeton JWT est expiré localement
 */
function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Décodage base64 résistant pour anciennes WebViews
    let decoded: string = '';
    if (typeof atob === 'function') {
      try {
        decoded = atob(base64);
      } catch (e) {
        console.warn("[Auth JWT] atob a échoué, essai du fallback de secours:", e);
        decoded = decodeBase64Fallback(base64);
      }
    } else {
      console.warn("[Auth JWT] atob non disponible, utilisation du fallback.");
      decoded = decodeBase64Fallback(base64);
    }

    const jsonPayload = decodeURIComponent(
      decoded
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    if (typeof payload.exp === 'number') {
      // Tolérance augmentée à 60 secondes pour éviter les décalages d'horloge mobile
      return Date.now() >= (payload.exp * 1000) - 60000;
    }
  } catch (e) {
    console.error("[Auth JWT] Erreur critique de décodage:", e);
  }
  return false;
}

/**
 * Fallback pure JS robuste de décodage Base64
 */
function decodeBase64Fallback(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const buffer = str.replace(/=+$/, '');
  let output = '';
  
  if (buffer.length % 4 === 1) {
    throw new Error("Longueur de chaine base64 invalide pour le décodage");
  }
  
  for (let bc = 0, bs = 0, idx = 0; idx < buffer.length; idx++) {
    const char = buffer.charAt(idx);
    const charCode = chars.indexOf(char);
    if (charCode === -1) continue;
    
    bs = bc % 4 ? bs * 64 + charCode : charCode;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & bs >> (-2 * bc & 6));
    }
  }
  return output;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [authInitialized, setAuthInitialized] = React.useState(false);
  const [serverUnavailable, setServerUnavailable] = React.useState(false);
  const [lastSuccessfulAuthSync, setLastSuccessfulAuthSync] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [, setLocation] = useLocation();

  const retryDelayRef = React.useRef<number>(10000);
  const retryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshUser = async () => {
    const response = await apiRequest<User>({
      url: "/api/auth/me",
      method: "GET",
    });
    if (response) {
      setUser(response);
      setIsAuthenticated(true);
      await saveSession(response);
      
      const nowStr = new Date().toISOString();
      setLastSuccessfulAuthSync(nowStr);
      await setPreference(SYNC_KEY, nowStr);
    }
  };

  const loadHunterInfo = async (userId: number | undefined, hunterId?: number | undefined) => {
    if (!userId) return null;
    try {
      console.log(`[DEBUG] Loading hunter info for userId: ${userId}, hunterId: ${hunterId}`);

      const response = await apiRequest<any>({
        url: '/api/hunters/me',
        method: 'GET'
      });

      console.log(`[DEBUG] Hunter data loaded:`, response);
      return response;
    } catch (err: any) {
      console.error(`Erreur lors du chargement des données du chasseur pour l'ID ${userId}:`, err);
      const msg = String(err?.message || '').toLowerCase();
      const isNotFound = err?.status === 404 || msg.includes('chasseur non trouv') || msg.includes('route non trouv') || msg.includes('not found') || msg.includes('aucun profil chasseur');
      if (isNotFound) {
        console.log(`[DEBUG] Hunter profile not found, returning null`);
        return null;
      }
      throw err;
    }
  };

  const login = async (identifier: string, password?: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiRequest<{ user: User; token: string }>({
        url: "/api/auth/login",
        method: "POST",
        data: { identifier, password, domain: localStorage.getItem('domain') || undefined },
      });

      if (response?.user) {
        if (response.token) {
          await setPreference("token", response.token);
        }
        if (response.user.role === "hunter" && response.user.hunterId) {
          const hunterInfo = await loadHunterInfo(response.user.id, response.user.hunterId);
          if (hunterInfo) {
            response.user.hunter = hunterInfo;
          }
        }

        setUser(response.user);
        setIsAuthenticated(true);
        setAuthInitialized(true);
        await saveSession(response.user);
        console.log("User set in auth context:", response.user);
        await setPreference("userRole", response.user.role);
        await setPreference("userRegion", response.user.region || "");

        let enrichedUser = response.user;
        try {
          const meData = await apiRequest<User>({ url: "/api/auth/me", method: "GET" });
          if (meData) {
            enrichedUser = { ...response.user, ...meData };
            setUser(enrichedUser);
            setIsAuthenticated(true);
            await saveSession(enrichedUser);

            const nowStr = new Date().toISOString();
            setLastSuccessfulAuthSync(nowStr);
            await setPreference(SYNC_KEY, nowStr);
          }
        } catch {}

        try { await afterLoginRefreshAll(); } catch {}
        const isSuperAdmin = isUserSuperAdmin(enrichedUser);

        const domain = (localStorage.getItem('domain') || '').toUpperCase();
        let homePage: string;

        if (domain === 'ALERTE' || (enrichedUser as any).isSupervisorRole || (enrichedUser as any).isDefaultRole) {
          if (isSuperAdmin || (enrichedUser as any).isSupervisorRole) {
            homePage = '/supervisor';
          } else {
            homePage = '/default-home';
          }
        } else if (isSuperAdmin) {
          await removePreference('domain');
          homePage = '/superadmin/agents';
        } else if (domain === 'REBOISEMENT') {
          homePage = enrichedUser.role === 'admin' ? '/reboisement/admin' : '/reboisement';
        } else {
          homePage = getHomePage(enrichedUser.role, enrichedUser.type);
        }

        if ((enrichedUser as any).publicId) {
          const pubId = (enrichedUser as any).publicId;
          homePage = homePage.startsWith('/') ? `/${pubId}${homePage}` : `/${pubId}/${homePage}`;
        }
        console.log(`[LOGIN] → ${homePage} (role=${enrichedUser.role}, domain=${domain}, superAdmin=${isSuperAdmin})`);
        setLocation(homePage);
      } else {
        throw new Error("La réponse ne contient pas d'informations utilisateur");
      }
    } catch (err: any) {
      console.error("Erreur lors de la connexion:", err);
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);

    try {
      await apiRequest({
        url: "/api/auth/logout",
        method: "POST",
      });
    } catch (err: any) {
      console.error("Erreur lors de la déconnexion réseau (ignorée) :", err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      await clearSession();
      
      let prevDomain = "";
      try {
        prevDomain = localStorage.getItem('domain') || "";
        await removePreference('domain');
        await removePreference('reforest_species');
      } catch {}
      try { await afterLogoutClearAll(); } catch {}
      
      setIsLoading(false);
      if (prevDomain === "ALERTE") {
        setLocation("/alerte-login");
      } else if (prevDomain === "REBOISEMENT") {
        setLocation("/reboisement/login");
      } else {
        setLocation("/");
      }
    }
  };

  React.useEffect(() => {
    let isMounted = true;

    const initAndCheckAuth = async () => {
      if (isMounted) {
        setIsLoading(true);
        setError(null);
      }

      try {
        let token = await getPreference('token');
        let cachedSessionStr = await getPreference(SESSION_KEY);
        let cachedSync = await getPreference(SYNC_KEY);

        if (!isMounted) return;

        // Si le jeton est expiré localement, nettoyer la session locale immédiatement
        if (token && isJwtExpired(token)) {
          console.log("[Auth] Jeton JWT expiré localement. Nettoyage de la session.");
          await clearSession();
          token = null;
          cachedSessionStr = null;
          cachedSync = null;
          if (isMounted) {
            setUser(null);
            setIsAuthenticated(false);
          }
        } else if (token && cachedSessionStr) {
          try {
            const cachedUser = JSON.parse(cachedSessionStr);
            if (isMounted) {
              setUser(cachedUser as User);
              setIsAuthenticated(true);
            }
            console.log("[Auth] Session restaurée depuis le cachePreferences:", cachedUser);
          } catch (e) {
            console.error("[Auth] Erreur de parsing de session en cache:", e);
          }
        }

        if (cachedSync && isMounted) {
          setLastSuccessfulAuthSync(cachedSync);
        }

        // Marquer l'initialisation comme terminée pour afficher les composants immédiatement
        if (isMounted) {
          setAuthInitialized(true);
        }

        // Lancer la synchronisation avec le serveur
        await checkAuthServer();
      } catch (e) {
        console.error("[Auth] Erreur d'initialisation de session:", e);
        if (isMounted) {
          setAuthInitialized(true);
          setIsLoading(false);
        }
      }
    };

    const checkAuthServer = async () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }

      if (!isMounted) return;

      const currentToken = await getPreference('token');
      if (!currentToken) {
        if (isMounted) {
          setIsLoading(false);
        }
        return;
      }

      if (isJwtExpired(currentToken)) {
        console.log("[Auth] JWT expiré localement avant la requête. Déconnexion.");
        await clearSession();
        if (isMounted) {
          setUser(null);
          setIsAuthenticated(false);
          setServerUnavailable(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await apiRequest<User>({
          url: "/api/auth/me",
          method: "GET",
        });

        if (!isMounted) return;

        if (response && response.id && response.role) {
          if (response.role === "hunter" && response.hunterId) {
            const hunterInfo = await loadHunterInfo(response.id, response.hunterId);
            if (hunterInfo && isMounted) {
              (response as any).hunter = hunterInfo;
            }
          }

          if (isMounted) {
            setUser(response);
            setIsAuthenticated(true);
          }
          await saveSession(response);

          const nowStr = new Date().toISOString();
          if (isMounted) {
            setLastSuccessfulAuthSync(nowStr);
          }
          await setPreference(SYNC_KEY, nowStr);

          if (isUserSuperAdmin(response)) {
            await removePreference('domain');
          }
          console.log("User retrieved from session sync:", response);
          await setPreference("userRole", response.role);
          await setPreference("userRegion", response.region || "");
          
          if (isMounted) {
            setServerUnavailable(false);
          }
          retryDelayRef.current = 10000; // Réinitialiser le backoff
        } else {
          console.warn("[Auth] Réponse serveur '/me' invalide ou vide. Session locale conservée.");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.warn("[Auth] Échec de la vérification de session avec le serveur:", err);

        const isAuthError = err?.status === 401;
        const offline = typeof navigator !== "undefined" && navigator && navigator.onLine === false;
        const serverDown = 
          (typeof err?.message === "string" && (
            err.message.includes("Impossible de se connecter au serveur") || 
            err.message.includes("Failed to fetch") ||
            err.message.includes("NetworkError") ||
            err.message.includes("timeout")
          )) ||
          (err?.status && err.status >= 500);

        if (isAuthError && !offline && !serverDown) {
          console.log("Session invalide (401). Nettoyage de la session.");
          await clearSession();
          if (isMounted) {
            setUser(null);
            setIsAuthenticated(false);
            setServerUnavailable(false);
          }
        } else {
          // Erreurs techniques, réseau ou 403: préserver la session cache
          console.log("Problème serveur/réseau détecté (ou 403). Préservation de la session cache.");
          if (isMounted) {
            setServerUnavailable(true);
          }

          // Planifier un retry progressif (exponential backoff)
          const currentDelay = retryDelayRef.current;
          let nextDelay = 10000;
          if (currentDelay === 10000) nextDelay = 30000;
          else if (currentDelay === 30000) nextDelay = 60000;
          else nextDelay = Math.min(currentDelay * 2, 300000); // Max 5 min
          
          retryDelayRef.current = nextDelay;
          console.log(`[Auth] Retry de synchronisation planifié dans ${currentDelay / 1000}s`);

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            checkAuthServer();
          }, currentDelay);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAndCheckAuth();

    return () => {
      isMounted = false;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    authInitialized,
    serverUnavailable,
    lastSuccessfulAuthSync,
    login,
    logout,
    refreshUser,
    error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
