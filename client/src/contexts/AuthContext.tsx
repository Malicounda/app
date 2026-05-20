import { afterLoginRefreshAll, afterLogoutClearAll, apiRequest } from "@/lib/queryClient";
import { getHomePage, isUserSuperAdmin } from "@/utils/navigation";
import React from "react";
import { useLocation } from "wouter";

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
  loadingMessage?: string;
  login: (identifier: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
}

const defaultContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  loadingMessage: "Chargement...",
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

// Clé localStorage pour persister la session minimale
const SESSION_KEY = 'scodi_session';

function saveSession(u: User) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
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
    }));
  } catch {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}
function loadSession(): Partial<User> | null {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Initialiser depuis la session persistée: si token + session existent, on est a priori authentifié
  const hasToken = typeof window !== 'undefined' && !!localStorage.getItem('token');
  const cachedSession = typeof window !== 'undefined' ? loadSession() : null;
  const [user, setUser] = React.useState<User | null>(cachedSession && hasToken ? cachedSession as User : null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(hasToken && !!cachedSession);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadingMessage, setLoadingMessage] = React.useState<string>("Chargement...");
  const [error, setError] = React.useState<string | null>(null);
  const [, setLocation] = useLocation();
  // Session-expired dialog disabled intentionally

  const refreshUser = async () => {
    const response = await apiRequest<User>({
      url: "/api/auth/me",
      method: "GET",
    });
    if (response) {
      setUser(response);
      setIsAuthenticated(true);
    }
  };

  const loadHunterInfo = async (userId: number | undefined, hunterId?: number | undefined) => {
    if (!userId) return null;
    try {
      // Always use /api/hunters/me for authenticated users instead of direct ID lookup
      // This ensures we use the proper authentication middleware
      console.log(`[DEBUG] Loading hunter info for userId: ${userId}, hunterId: ${hunterId}`);

      const response = await apiRequest<any>({
        url: '/api/hunters/me',
        method: 'GET'
      });

      console.log(`[DEBUG] Hunter data loaded:`, response);
      return response;
    } catch (err: any) {
      console.error(`Erreur lors du chargement des données du chasseur pour l'ID ${userId}:`, err);
      // Treat not-found errors (404 or messages) as "no profile" instead of throwing
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
    setLoadingMessage("Connexion en cours...");
    setIsLoading(true);

    try {
      const response = await apiRequest<{ user: User; token: string }>({
        url: "/api/auth/login",
        method: "POST",
        data: { identifier, password, domain: localStorage.getItem('domain') || undefined },
      });

      if (response?.user) {
        // Stocker le token JWT pour les prochaines requêtes
        if (response.token) {
          localStorage.setItem("token", response.token);
        }
        if (response.user.role === "hunter" && response.user.hunterId) {
          const hunterInfo = await loadHunterInfo(response.user.id, response.user.hunterId);
          if (hunterInfo) {
            response.user.hunter = hunterInfo;
          }
        }

        setUser(response.user);
        setIsAuthenticated(true);
        saveSession(response.user); // Persister la session pour éviter le flash login
        console.log("User set in auth context:", response.user);
        localStorage.setItem("userRole", response.user.role);
        localStorage.setItem("userRegion", response.user.region || "");

        // IMPORTANT: /api/auth/login ne renvoie pas toujours les champs enrichis (ex: grade/genre).
        // On recharge depuis /api/auth/me puis on re-persiste la session AVEC isSuperAdmin + publicId.
        let enrichedUser = response.user;
        try {
          const meData = await apiRequest<User>({ url: "/api/auth/me", method: "GET" });
          if (meData) {
            enrichedUser = { ...response.user, ...meData };
            setUser(enrichedUser);
            setIsAuthenticated(true);
            // Re-persister : isSuperAdmin et publicId maintenant inclus
            saveSession(enrichedUser);
          }
        } catch {}

        // Rafraîchir toutes les données (requêtes actives) immédiatement après connexion
        try { await afterLoginRefreshAll(); } catch {}
        // Redirection centralisée — on utilise enrichedUser (isSuperAdmin garanti)
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
          // Super Admin hors domaine spécifique : accès global CHASSE
          localStorage.removeItem('domain');
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
    setLoadingMessage("Déconnexion en cours...");
    setIsLoading(true);

    try {
      await apiRequest({
        url: "/api/auth/logout",
        method: "POST",
      });
      setUser(null);
      setIsAuthenticated(false);
      clearSession(); // Effacer la session persistée
      localStorage.removeItem("token");
      localStorage.removeItem("userRole");
      localStorage.removeItem("userRegion");
      let prevDomain = "";
      try {
        prevDomain = localStorage.getItem('domain') || "";
        localStorage.removeItem('domain');
        localStorage.removeItem('reforest_species');
      } catch {}
      try { await afterLogoutClearAll(); } catch {}
      
      if (prevDomain === "ALERTE") {
        setLocation("/alerte-login");
      } else if (prevDomain === "REBOISEMENT") {
        setLocation("/reboisement/login");
      } else {
        setLocation("/");
      }
    } catch (err: any) {
      console.error("Erreur lors de la déconnexion:", err);
      setError(err.message || "Erreur lors de la déconnexion");
    } finally {
      setIsLoading(false);
    }
  };

  // Disabled global apiRefusal 401 dialog listener to avoid showing a session-expired modal

  React.useEffect(() => {
    const checkAuth = async () => {
      setLoadingMessage("Chargement...");
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiRequest<User>({
          url: "/api/auth/me",
          method: "GET",
        });

        if (response) {
          if (response.role === "hunter" && response.hunterId) {
            const hunterInfo = await loadHunterInfo(response.id, response.hunterId);
            if (hunterInfo) {
              (response as any).hunter = hunterInfo;
            }
          }

          setUser(response);
          setIsAuthenticated(true);
          saveSession(response); // Mettre à jour la session persistée

          // Super Admin : effacer le domaine résiduel (la redirection est gérée par DashboardRedirector)
          if (isUserSuperAdmin(response)) {
            localStorage.removeItem('domain');
          }
        console.log("User retrieved from session:", response);
        localStorage.setItem("userRole", response.role);
        localStorage.setItem("userRegion", response.region || "");
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err: any) {
      // Ne pas afficher de message technique; ouvrir le dialogue si non hors-ligne/serveur down
      // Si on est hors-ligne ou que le serveur est indisponible, ne pas déconnecter l'utilisateur
      const offline = typeof navigator !== "undefined" && navigator && navigator.onLine === false;
      const serverDown = typeof err?.message === "string" && err.message.includes("Impossible de se connecter au serveur");
      if (!offline && !serverDown) {
        // Session invalide côté serveur: nettoyer tout
        clearSession();
        setUser(null);
        setIsAuthenticated(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  checkAuth();
  }, []);

  const value = {
    user,
    isAuthenticated,
    isLoading,
    loadingMessage,
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
