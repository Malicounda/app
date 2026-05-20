// Wrapper pour choisir le bon contexte d'authentification selon l'environnement
import React, { useEffect, useState } from 'react';
import { AuthProvider as AndroidAuthProvider } from '../../contexts/AndroidAuthContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { getEnvironment } from '../../utils/environment';
import { SplashScreen } from '../ui/SplashScreen';

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
        {children}
      </AndroidAuthProvider>
    );
  }

  // Utiliser le contexte desktop/web pour les autres environnements
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
