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

  // ✅ IMPORTANT FIX TS2339
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
    password?: string,
    lat?: number,
    lon?: number
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

  const [, setLocation] = useLocation();

  /* ========================= */
  const refreshUser = async () => {
    const response = await apiRequest<User>({
      url: "/api/auth/me",
      method: "GET",
    });

    if (response) {
      setUser(response);
      setIsAuthenticated(true);
      await saveSession(response);
    }
  };

  /* ========================= */
  const login = async (
    identifier: string,
    password?: string,
    lat?: number,
    lon?: number
  ) => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await apiRequest<{ user: User; token: string }>({
        url: "/api/auth/login",
        method: "POST",
        data: {
          identifier,
          password,
          lat,
          lon, // ✅ GPS FIX CONSERVÉ
          domain: localStorage.getItem("domain") || undefined,
        },
      });

      if (!response?.user) throw new Error("Utilisateur invalide");

      if (response.token) {
        localStorage.setItem("token", response.token);
        await setPreference("token", response.token);
      }

      setUser(response.user);
      setIsAuthenticated(true);
      setAuthInitialized(true);

      await saveSession(response.user);

      const isSuperAdmin = isUserSuperAdmin(response.user);

      const domain = (localStorage.getItem("domain") || "").toUpperCase();

      let homePage: string;

      if (isSuperAdmin) {
        await removePreference("domain");
        homePage = "/superadmin/agents";
      } else {
        homePage = getHomePage(response.user.role, response.user.type);
      }

      setLocation(homePage);
    } catch (err: any) {
      setError(err.message || "Erreur connexion");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  /* ========================= */
  const logout = async () => {
    try {
      await apiRequest({
        url: "/api/auth/logout",
        method: "POST",
      });
    } catch { }

    setUser(null);
    setIsAuthenticated(false);

    await clearSession();

    setLocation("/");
  };

  /* ========================= */
  React.useEffect(() => {
    const init = async () => {
      try {
        const token = await getPreference("token");

        if (token) {
          await refreshUser();
        }
      } finally {
        setAuthInitialized(true);
        setIsLoading(false);
      }
    };

    init();
  }, []);

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