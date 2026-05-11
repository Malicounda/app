import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { getHomePage } from '@/utils/navigation';
import HomePage from '@/pages/HomePage';

/**
 * Composant wrapper pour la page d'accueil qui redirige automatiquement
 * les utilisateurs connectés vers leur tableau de bord approprié
 */
export default function HomePageWrapper() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Si l'utilisateur est connecté, le rediriger vers son tableau de bord
    if (isAuthenticated && user && !isLoading) {
      // Nouveau flux: ne plus rediriger vers la route d'inscription forcée.
      // Le tableau de bord chasseur gère lui-même l'affichage de la complétion de profil si nécessaire (mode embarqué/modal).
      const homePage = getHomePage(user.role, user.type);
      setLocation(homePage);
    }
  }, [isAuthenticated, user, isLoading, setLocation]);

  // Renforcer de manière persistante le blocage retour/avant sur la Home quand non authentifié
  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) return;
    if (typeof window === 'undefined' || typeof history === 'undefined') return;
    try {
      // Écraser l'entrée précédente (ex: /register), puis pousser une sentinelle
      window.history.replaceState({ noBack: true }, '', window.location.pathname + window.location.search);
      window.history.pushState({ noBack: true }, '', window.location.pathname + window.location.search);
    } catch {}
    const onPop = (e: PopStateEvent) => {
      e.preventDefault?.();
      try { window.history.forward(); } catch {}
      try { window.history.replaceState({ noBack: true }, '', window.location.pathname + window.location.search); } catch {}
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [isAuthenticated, isLoading]);

  // Si l'utilisateur est en cours de chargement, afficher un indicateur
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center">
        <div className="text-white text-xl">Chargement...</div>
      </div>
    );
  }

  // Si l'utilisateur n'est pas connecté, afficher la page d'accueil
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 z-[100] bg-white overflow-auto">
        <HomePage />
      </div>
    );
  }

  // Si l'utilisateur est connecté, afficher un écran de chargement plein écran pendant la redirection
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent" />
    </div>
  );
}
