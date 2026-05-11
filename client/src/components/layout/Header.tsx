import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PawPrint, RefreshCw, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { MdLogout, MdMenu, MdPerson } from 'react-icons/md';

export default function Header() {
  const { logout, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showRefresh, setShowRefresh] = useState<boolean>(true);
  const [showLogout, setShowLogout] = useState<boolean>(true);

  const isSuperAdmin = (user as any)?.isSuperAdmin === true;

  // Écouter les événements globaux pour masquer/afficher le bouton Actualiser
  useEffect(() => {
    const hide = () => setShowRefresh(false);
    const show = () => setShowRefresh(true);
    window.addEventListener('hide-refresh', hide as EventListener);
    window.addEventListener('show-refresh', show as EventListener);
    return () => {
      window.removeEventListener('hide-refresh', hide as EventListener);
      window.removeEventListener('show-refresh', show as EventListener);
    };
  }, []);

  // Écouter les événements globaux pour masquer/afficher le bouton Déconnexion
  useEffect(() => {
    const hide = () => setShowLogout(false);
    const show = () => setShowLogout(true);
    window.addEventListener('hide-logout', hide as EventListener);
    window.addEventListener('show-logout', show as EventListener);
    return () => {
      window.removeEventListener('hide-logout', hide as EventListener);
      window.removeEventListener('show-logout', show as EventListener);
    };
  }, []);

  // Fonction pour rafraîchir toutes les données
  const handleRefreshAll = async () => {
    // Animation de chargement
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
      refreshButton.classList.add('animate-spin');
    }

    try {
      // Rafraîchir toutes les requêtes
      await queryClient.refetchQueries();

      window.dispatchEvent(new CustomEvent('refresh-map-data'));

      toast({
        title: "Actualisation réussie",
        description: "Toutes les données ont été mises à jour",
        variant: "default",
      });
    } catch (error) {
      toast({
        title: "Erreur d'actualisation",
        description: "Impossible de mettre à jour les données",
        variant: "destructive",
      });
    } finally {
      // Arrêter l'animation
      if (refreshButton) {
        refreshButton.classList.remove('animate-spin');
      }
    }
  };

  // Fonction pour ouvrir/fermer la sidebar depuis le header
  const toggleSidebar = () => {
    // On émet un événement personnalisé pour communiquer avec MainLayout
    window.dispatchEvent(new CustomEvent('toggle-sidebar'));
  };

  return (
    <header id="app-header" className="bg-[#0b6b3a] text-white px-2 sm:px-3 py-0 sm:py-0.5 flex justify-between items-center fixed w-full z-[100] top-0">
      <div className="flex items-center">
        {/* Bouton hamburger pour mobile uniquement */}
        <button
          className="md:hidden text-white bg-white/15 hover:bg-white/25 rounded-t-sm rounded-b-md p-0.5 mr-1 flex items-center justify-center transition-colors shadow-sm"
          onClick={toggleSidebar}
          aria-label="Menu"
        >
          <MdMenu className="text-lg leading-none" />
        </button>

        {/* Drapeau visible en mode mobile (à côté du menu) - non cliquable */}
        <div className="flex md:hidden items-center mr-1" aria-hidden>
          <img
            src="/assets/Flag_of_Senegal.svg"
            alt="Drapeau du Sénégal"
            width="24"
            height="16"
            className="block"
            draggable={false}
          />
        </div>

        {/* Bouton avec le drapeau du Sénégal pour desktop (ne doit pas ouvrir la sidebar) */}
        <button
          className="hidden md:flex text-white bg-transparent border-none cursor-default mr-2 items-center"
          onClick={(e) => e.stopPropagation()}
          aria-label="Drapeau du Sénégal"
          type="button"
        >
          <img src="/assets/Flag_of_Senegal.svg" alt="Drapeau du Sénégal" width="30" height="24" className="mr-2" />
        </button>

        <div className="leading-3 sm:leading-tight">
          <h1 className="uppercase text-[8px] sm:text-xs font-semibold">République du Sénégal</h1>
          <p className="uppercase text-[7px] sm:text-[10px] whitespace-normal break-words">
            Ministère de l'Environnement
            <br className="md:hidden" />
            et de la Transition Écologique
          </p>
          <p className="uppercase text-[9px] hidden sm:block">Direction des Eaux et Forêts, Chasse et Conservation des Sols</p>
        </div>
      </div>

      {/* Titre centré dynamique selon le rôle */}
      <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center pointer-events-none">
        <div className="flex items-center gap-2 bg-black/20 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-sm">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
            {isSuperAdmin ? (
              <Settings className="w-4 h-4 text-white" />
            ) : (
              <PawPrint className="w-4 h-4 text-white" />
            )}
          </div>
          <div className="leading-tight">
            <div className="font-bold text-[10px] sm:text-[11px] tracking-wide uppercase">
              {isSuperAdmin ? "Super-Administrateur Central" : "Gestion de la Faune"}
            </div>
            <div className="text-[8px] sm:text-[9px] text-green-100 opacity-90 font-medium">
              {isSuperAdmin ? "SCoDiPP - Accès élargi" : "Division FAUNE"}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 z-[101] relative">
        {showRefresh && (
          <Button
            variant="outline"
            size="sm"
            className="flex items-center bg-white text-[#0b6b3a] hover:bg-gray-100 px-2 sm:px-3"
            onClick={handleRefreshAll}
          >
            <RefreshCw id="refresh-button" className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Actualiser</span>
          </Button>
        )}
        {/* Nom de l'utilisateur entre Actualiser et Déconnexion */}
        {user && !isSuperAdmin && (
          <div className="hidden sm:inline-flex items-center text-green-700 text-sm font-semibold bg-green-50 px-2 sm:px-3 py-0.5 rounded-md whitespace-nowrap">
            <MdPerson className="text-base mr-1" aria-hidden />
            <span>{`${user.firstName ?? ''} ${typeof user.lastName === 'string' ? user.lastName.toUpperCase() : ''}`.trim()}</span>
          </div>
        )}

        {showLogout && (
          <Button
            variant="destructive"
            size="sm"
            className="flex items-center px-2 sm:px-3"
            onClick={logout}
          >
            <MdLogout className="text-sm mr-1" />
            <span className="hidden sm:inline">Déconnexion</span>
          </Button>
        )}
      </div>
    </header>
  );
}
