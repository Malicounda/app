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
  login: (identifier: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
}

const defaultContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
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
        console.log("User set in auth context:", response.user);
        localStorage.setItem("userRole", response.user.role);
        localStorage.setItem("userRegion", response.user.region || "");

        // IMPORTANT: /api/auth/login ne renvoie pas toujours les champs enrichis (ex: grade/genre).
        // On recharge donc l'utilisateur depuis /api/auth/me pour éviter d'avoir à recharger la page.
        try {
          await refreshUser();
        } catch {}

        // Rafraîchir toutes les données (requêtes actives) immédiatement après connexion
        try { await afterLoginRefreshAll(); } catch {}
        // Redirection centralisée via getHomePage
        const isSuperAdmin = isUserSuperAdmin(response.user);

        // Super Admin : on efface tout domaine résiduel
        if (isSuperAdmin) {
          localStorage.removeItem('domain');
        }

        const domain = (localStorage.getItem('domain') || '').toUpperCase();
        let homePage: string;

        if (isSuperAdmin) {
          homePage = '/superadmin/agents';
        } else if ((response.user as any).isSupervisorRole) {
          homePage = '/supervisor';
        } else if ((response.user as any).isDefaultRole) {
          homePage = '/default-home';
        } else if (domain === 'REBOISEMENT') {
          homePage = response.user.role === 'admin' ? '/reboisement/admin' : '/reboisement';
        } else {
          homePage = getHomePage(response.user.role, response.user.type);
        }

        console.log(`[LOGIN] → ${homePage} (role=${response.user.role}, domain=${domain}, superAdmin=${isSuperAdmin})`);
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
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem("token");
      localStorage.removeItem("userRole");
      localStorage.removeItem("userRegion");
      // Nettoyage du domaine reboisement
      try {
        localStorage.removeItem('domain');
        localStorage.removeItem('reforest_species');
      } catch {}
      try { await afterLogoutClearAll(); } catch {}
      setLocation("/");
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
