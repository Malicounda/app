// Contexte d'authentification pour Android avec SQLite
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthService, User } from '../services/authService';
import { DataMigrationService } from '../services/dataMigrationService';
import { SyncService } from '../services/syncService';
import { initializeDatabase } from '../utils/database';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authInitialized: boolean;
  serverUnavailable: boolean;
  lastSuccessfulAuthSync: string | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [lastSuccessfulAuthSync, setLastSuccessfulAuthSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const authService = AuthService.getInstance();
  const migrationService = new DataMigrationService();
  const syncService = new SyncService();

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Initialiser la base de données
      await initializeDatabase();

      // Initialiser les services de migration et de synchronisation
      await migrationService.initDatabase();
      await syncService.initSettings();

      // Vérifier si l'utilisateur est déjà connecté
      const currentUser = authService.getCurrentUser();
      if (currentUser && authService.isAuthenticated()) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setLastSuccessfulAuthSync(new Date().toISOString());
      }
    } catch (error) {
      console.error('Erreur lors de l\'initialisation:', error);
      setError('Erreur lors de l\'initialisation de l\'application');
    } finally {
      setIsLoading(false);
      setAuthInitialized(true);
    }
  };

  const refreshUser = async () => {
    // Implémentation optionnelle pour Android / SQLite local
    const currentUser = authService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  };

  const login = async (identifier: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await authService.login({
        email: identifier,
        password: password
      });

      if (result.success && result.user) {
        setUser(result.user);
        setIsAuthenticated(true);
        setLastSuccessfulAuthSync(new Date().toISOString());
      } else {
        throw new Error(result.error || 'Erreur de connexion');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur de connexion';
      setError(errorMessage);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setIsAuthenticated(false);
      setError(null);
      setLastSuccessfulAuthSync(null);
    } catch (error) {
      console.error('Erreur lors de la déconnexion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isAuthenticated,
    isLoading,
    authInitialized,
    serverUnavailable,
    lastSuccessfulAuthSync,
    login,
    logout,
    refreshUser,
    error
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
