// Wrapper pour choisir le bon contexte d'authentification selon l'environnement
import React, { useEffect, useState } from 'react';
import { AuthProvider as AndroidAuthProvider, useAuth as useAndroidAuth } from '../../contexts/AndroidAuthContext';
import { AuthProvider, useAuth as useWebAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../hooks/use-notifications';
import { getEnvironment } from '../../utils/environment';
import { SplashScreen } from '../ui/SplashScreen';

function NotificationsBridge({ useAuthHook }: { useAuthHook: () => { user: { id?: number } | null } }) {
  const { user } = useAuthHook();
  const uid = user?.id != null ? Number(user.id) : null;
  useNotifications(Boolean(user), Number.isFinite(uid) ? uid : null);
  return null;
}

interface AuthWrapperProps {
  children: React.ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const [environment, setEnvironment] = useState<'android' | 'desktop' | 'web'>('web');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectEnvironment = async () => {
      try {
        const env = await getEnvironment();
        setEnvironment(env);
      } catch (error) {
        console.error('Erreur lors de la détection de l\'environnement:', error);
        setEnvironment('web');
      } finally {
        setIsLoading(false);
      }
    };

    detectEnvironment();
  }, []);

  if (isLoading) {
    return <SplashScreen message="Initialisation de l'application..." />;
  }

  // Utiliser le contexte Android pour les applications mobiles
  if (environment === 'android') {
    return (
      <AndroidAuthProvider>
        <NotificationsBridge useAuthHook={useAndroidAuth} />
        {children}
      </AndroidAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <NotificationsBridge useAuthHook={useWebAuth} />
      {children}
    </AuthProvider>
  );
}
