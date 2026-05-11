import React from "react";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { getHomePage } from "@/utils/navigation";

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  type?: "regional" | "secteur";
  email: string;
  phone: string;
  region?: string;
  zone?: string;
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
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  error: string | null;
}

const defaultContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
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

  const loadHunterInfo = async (userId: number, hunterId: number | undefined) => {
    if (!hunterId) return null;
    try {
      const hunterData = await apiRequest<User['hunter']>({
        url: `/api/hunters/${hunterId}`,
        method: "GET",
      });
      return hunterData;
    } catch (error) {
      console.error(
        `Erreur lors du chargement des données du chasseur pour l'ID ${hunterId}:`,
        error
      );
      return null;
    }
  };

  const login = async (username: string, password: string) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiRequest<{ user: User }>({
        url: "/api/auth/login",
        method: "POST",
        data: { username, password },
      });

      if (response?.user) {
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

        const homePage = getHomePage(response.user.role, response.user.type);
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
      localStorage.removeItem("userRole");
      localStorage.removeItem("userRegion");
      setLocation("/login");
    } catch (err: any) {
      console.error("Erreur lors de la déconnexion:", err);
      setError(err.message || "Erreur lors de la déconnexion");
    } finally {
      setIsLoading(false);
    }
  };

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
              response.hunter = hunterInfo;
            }
          }

          setUser(response);
          setIsAuthenticated(true);
          console.log("User retrieved from session:", response);
          localStorage.setItem("userRole", response.role);
          localStorage.setItem("userRegion", response.region || "");
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (err: any) {
        console.error("Erreur lors de la vérification de l'authentification:", err);
        setError(err.message);
        setUser(null);
        setIsAuthenticated(false);
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
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}