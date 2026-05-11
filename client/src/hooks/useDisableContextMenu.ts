import { useEffect } from 'react';

/**
 * Hook pour bloquer le menu contextuel et les raccourcis développeur
 * dans toute l'application React
 * @param isAdmin - Si true, les restrictions ne sont pas appliquées (pour l'administrateur)
 */
export const useDisableContextMenu = (isAdmin: boolean = false) => {
  useEffect(() => {
    // Debug: afficher l'état d'admin dans la console
    console.log('🛡️ Restrictions de sécurité:', isAdmin ? 'DÉSACTIVÉES (Admin)' : 'ACTIVÉES');
    
    // Si l'utilisateur est admin, ne pas appliquer les restrictions
    if (isAdmin) {
      console.log('✅ Accès complet autorisé pour l\'administrateur');
      return;
    }

    // Bloquer le clic droit (menu contextuel)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // Bloquer les raccourcis clavier pour ouvrir les outils de développement
    const handleKeyDown = (e: KeyboardEvent) => {
      // F12 - Outils de développement
      if (e.key === 'F12' || e.keyCode === 123) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+I - Outils de développement
      if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.keyCode === 73)) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+J - Console JavaScript
      if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.keyCode === 74)) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+Shift+C - Inspecteur d'éléments
      if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.keyCode === 67)) {
        e.preventDefault();
        return false;
      }
      
      // Ctrl+U - Afficher le code source
      if (e.ctrlKey && (e.key === 'U' || e.keyCode === 85)) {
        e.preventDefault();
        return false;
      }
      
      // F5 et Ctrl+R - Rafraîchir (décommenté pour bloquer)
      // if (e.key === 'F5' || e.keyCode === 116 || (e.ctrlKey && (e.key === 'R' || e.keyCode === 82))) {
      //   e.preventDefault();
      //   return false;
      // }
    };

    // Bloquer la sélection de texte
    const handleSelectStart = (e: Event) => {
      e.preventDefault();
      return false;
    };

    // Bloquer le copier
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      return false;
    };

    // Ajouter les écouteurs d'événements
    document.addEventListener('contextmenu', handleContextMenu, false);
    document.addEventListener('keydown', handleKeyDown, false);
    document.addEventListener('selectstart', handleSelectStart, false);
    document.addEventListener('copy', handleCopy, false);

    // Nettoyer les écouteurs lors du démontage
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('selectstart', handleSelectStart);
      document.removeEventListener('copy', handleCopy);
    };
  }, [isAdmin]);
};
