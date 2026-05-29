import {
  afterLoginRefreshAll,
  afterLogoutClearAll,
  apiRequest,
} from "@/lib/queryClient";
import { getHomePage, isUserSuperAdmin } from "@/utils/navigation";
import React from "react";
import { useLocation } from "wouter";
import {
  setPreference,
  getPreference,
  removePreference,
  clearAllPreferences,
} from "@/utils/preferences";
import { getLoginRoute } from "@/utils/getLoginRoute";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/* =========================
   USER TYPE (FIX BUILD ERROR)
========================= */
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
  commune?: string;
  arrondissement?: string;

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

/* ========================= */
interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authInitialized: boolean;
  serverUnavailable: boolean;
  lastSuccessfulAuthSync: string | null;

  login: (
    identifier: string,
    password?: string
  ) => Promise<void>;

  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
}

/* ========================= */
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
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/* ========================= */
const SESSION_KEY = "scodi_session";
const SYNC_KEY = "lastSuccessfulAuthSync";

/* ========================= */
async function saveSession(u: User) {
  try {
    await setPreference(
      SESSION_KEY,
      JSON.stringify({
        id: u.id,
        role: u.role,
        type: u.type,
        isSuperAdmin: u.isSuperAdmin,
        isSupervisorRole: u.isSupervisorRole,
        isDefaultRole: u.isDefaultRole,
        firstName: u.firstName,
        lastName: u.lastName,
        username: u.username,
      })
    );
  } catch { }
}

async function clearSession() {
  try {
    await clearAllPreferences([
      SESSION_KEY,
      "token",
      "userRole",
      "userRegion",
      SYNC_KEY,
    ]);
  } catch { }
}

/* ========================= */
export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [authInitialized, setAuthInitialized] = React.useState(false);
  const [serverUnavailable, setServerUnavailable] = React.useState(false);
  const [lastSuccessfulAuthSync, setLastSuccessfulAuthSync] =
    React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isLoggingOutRef = React.useRef(false);

  const [, setLocation] = useLocation();
  const { subscribe: subscribePush } = usePushNotifications();

  /* ========================= */
  const refreshUser = async () => {
    try {
      const response = await apiRequest<User>({
        url: "/api/auth/me",
        method: "GET",
      });

      if (response) {
        setUser(response);
        setIsAuthenticated(true);
        await saveSession(response);
      }
    } catch (e) {
      console.warn("[AuthContext] Erreur lors du refreshUser (ex: token expiré)", e);
    }
  };

  /* ========================= */
  const login = async (
    identifier: string,
    password?: string
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      console.log(`[AuthContext] Envoi POST /api/auth/login, identifier=${identifier}, domain=${localStorage.getItem("domain")}`);
      const response = await apiRequest<{ user: User; token: string }>({
        url: "/api/auth/login",
        method: "POST",
        data: {
          identifier,
          password,
          domain: localStorage.getItem("domain") || undefined,
        },
      });

      console.log("[AuthContext] Backend Response:", { status: 200, data: response });
      if (response?.token) {
        console.log("[AuthContext] Token reçu:", response.token);
      }

      if (!response?.user) throw new Error("Utilisateur invalide");

      if (response.token) {
        localStorage.setItem("token", response.token);
        await setPreference("token", response.token);
      }

      setUser(response.user);
      setIsAuthenticated(true);
      setAuthInitialized(true);

      await saveSession(response.user);

      // S'abonner aux notifications push silencieusement
      subscribePush().catch(err => console.warn('Erreur push auth:', err));

      const isSuperAdmin = isUserSuperAdmin(response.user);

      const domain = (localStorage.getItem("domain") || "").toUpperCase();

      let homePage: string;

      if (isSuperAdmin) {
        await removePreference("domain");
        homePage = "/superadmin/agents";
      } else {
        homePage = getHomePage(
          response.user.role,
          response.user.type,
          (response.user as any)?.isSuperAdmin,
          (response.user as any)?.isDefaultRole,
          (response.user as any)?.isSupervisorRole
        );
      }

      setLocation(homePage);
    } catch (err: any) {
      console.error("[AuthContext] Erreur détaillée backend:", err);
      if (err.response) {
        console.error("[AuthContext] Status HTTP:", err.response.status, err.response.data);
      }
      setError(err.message || "Erreur connexion");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /* ========================= */
  const logout = async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      try {
        await apiRequest({
          url: "/api/auth/logout",
          method: "POST",
        });
      } catch (e) {
        console.warn("Logout API failed (ignored)", e);
        // TODO: analytics / monitoring (ex: Sentry, Datadog)
        // trackEvent("logout_api_failed", { error: e });
      }

      await clearSession();
      await afterLogoutClearAll();

      setUser(null);
      setIsAuthenticated(false);

      setLocation(getLoginRoute(), { replace: true });
    } finally {
      isLoggingOutRef.current = false;
    }
  };

  /* ========================= */
  React.useEffect(() => {
    const init = async () => {
      try {
        const token = await getPreference("token");
        
        if (token) {
          // Optimistic initialization from local session
          try {
            const savedSessionStr = await getPreference(SESSION_KEY);
            if (savedSessionStr) {
              const savedUser = JSON.parse(savedSessionStr);
              setUser(savedUser);
              setIsAuthenticated(true);
            }
          } catch (e) {
            console.warn("Optimistic session load failed", e);
          }
          
          // Refresh in background without awaiting (prevents 50s splash screen on backend cold start)
          refreshUser().catch(console.error);
        }
      } finally {
        setAuthInitialized(true);
        setIsLoading(false);
      }
    };

    init();
  }, []);

  /* === Gestion propre de l'expiration de session (style Facebook) === */
  /* Quand n'importe quelle requête API reçoit un 401, on émet un événement
     'sessionExpired'. Ce listener fait un logout propre au lieu d'afficher
     une page blanche. Debounce pour éviter les redirections multiples. */
  React.useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSessionExpired = () => {
      // Ne pas traiter si déjà en cours de déconnexion
      if (isLoggingOutRef.current) return;

      // Ne pas traiter si l'utilisateur n'est pas connecté (ex: login en cours)
      if (!user) return;

      // Ignorer les routes publiques (login, register, etc.)
      try {
        const currentPath = window.location.pathname;
        const publicPaths = ['/login', '/register', '/produits-forestiers', '/reboisement-login', '/alerte-login'];
        if (currentPath === '/' || publicPaths.some(p => currentPath.startsWith(p))) return;
      } catch {}

      // Debounce: plusieurs requêtes 401 en même temps → un seul logout
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        console.log("[AuthContext] Session expirée détectée → logout propre");

        // Nettoyer le token et la session
        try {
          localStorage.removeItem("token");
        } catch {}
        await clearSession();
        await afterLogoutClearAll();

        setUser(null);
        setIsAuthenticated(false);

        // Stocker un message pour l'afficher sur la page de login
        try {
          localStorage.setItem("sessionExpiredMessage", "Votre session a expiré. Veuillez vous reconnecter.");
        } catch {}

        // Rediriger vers la page de login appropriée
        setLocation(getLoginRoute(), { replace: true });
      }, 300);
    };

    window.addEventListener('sessionExpired', handleSessionExpired);
    return () => {
      window.removeEventListener('sessionExpired', handleSessionExpired);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [user]);

  /* ========================= */
  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}