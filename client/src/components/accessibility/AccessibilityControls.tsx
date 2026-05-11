import React, { useState } from 'react';
import { MdSettings, MdClose, MdTextFields, MdContrast, MdVolumeOff, MdVolumeUp, MdVisibility } from 'react-icons/md';
import { useAccessibility } from './AccessibilityProvider';
import { Button } from '@/components/ui/button';

export const AccessibilityControls: React.FC = () => {
  const {
    fontSize,
    setFontSize,
    prefersHighContrast,
    toggleHighContrast,
    announceToScreenReader,
    isScreenReader
  } = useAccessibility();
  
  const [isOpen, setIsOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const handleFontSizeChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
    announceToScreenReader(`Taille de police changée vers ${size === 'small' ? 'petite' : size === 'large' ? 'grande' : 'moyenne'}`);
  };

  const handleContrastToggle = () => {
    toggleHighContrast();
    announceToScreenReader(`Contraste ${prefersHighContrast ? 'normal' : 'élevé'} activé`);
  };

  const handleMuteToggle = () => {
    setIsMuted(!isMuted);
    announceToScreenReader(`Son ${isMuted ? 'activé' : 'désactivé'}`);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
          aria-label="Ouvrir les paramètres d'accessibilité"
        >
          <MdSettings className="text-xl" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-white rounded-lg shadow-xl border p-4 w-80 max-w-[calc(100vw-2rem)]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          Paramètres d'accessibilité
        </h3>
        <Button
          onClick={() => setIsOpen(false)}
          variant="ghost"
          size="sm"
          aria-label="Fermer les paramètres d'accessibilité"
        >
          <MdClose className="text-sm" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Contrôle de la taille de police */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MdTextFields className="text-sm inline mr-2" />
            Taille de police
          </label>
          <div className="flex space-x-2">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <Button
                key={size}
                onClick={() => handleFontSizeChange(size)}
                variant={fontSize === size ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                aria-pressed={fontSize === size}
              >
                {size === 'small' ? 'A' : size === 'medium' ? 'A' : 'A'}
                <span className="ml-1 text-xs">
                  {size === 'small' ? 'Petite' : size === 'medium' ? 'Moyenne' : 'Grande'}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Contrôle du contraste */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MdContrast className="text-sm inline mr-2" />
            Contraste élevé
          </label>
          <Button
            onClick={handleContrastToggle}
            variant={prefersHighContrast ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            aria-pressed={prefersHighContrast}
          >
            {prefersHighContrast ? 'Désactiver' : 'Activer'} le contraste élevé
          </Button>
        </div>

        {/* Contrôle du son */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isMuted ? (
              <MdVolumeOff className="text-sm inline mr-2" />
            ) : (
              <MdVolumeUp className="text-sm inline mr-2" />
            )}
            Son des notifications
          </label>
          <Button
            onClick={handleMuteToggle}
            variant={isMuted ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            aria-pressed={isMuted}
          >
            {isMuted ? 'Activer' : 'Désactiver'} le son
          </Button>
        </div>

        {/* Informations sur le lecteur d'écran */}
        {isScreenReader && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <div className="flex items-center">
              <MdVisibility className="text-sm text-blue-600 mr-2" />
              <span className="text-sm text-blue-800">
                Lecteur d'écran détecté
              </span>
            </div>
          </div>
        )}

        {/* Raccourcis clavier */}
        <div className="border-t pt-3">
          <h4 className="text-sm font-medium text-gray-700 mb-2">
            Raccourcis clavier
          </h4>
          <div className="text-xs text-gray-600 space-y-1">
            <div><kbd className="bg-gray-100 px-1 rounded">Tab</kbd> Navigation</div>
            <div><kbd className="bg-gray-100 px-1 rounded">Entrée</kbd> Activer</div>
            <div><kbd className="bg-gray-100 px-1 rounded">Échap</kbd> Fermer</div>
            <div><kbd className="bg-gray-100 px-1 rounded">Alt + A</kbd> Accessibilité</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook pour les raccourcis clavier d'accessibilité
export const useAccessibilityKeyboard = () => {
  const { announceToScreenReader } = useAccessibility();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + A pour ouvrir les paramètres d'accessibilité
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        announceToScreenReader('Paramètres d\'accessibilité ouverts');
        // Ici vous pourriez déclencher l'ouverture des contrôles
      }

      // Échap pour fermer les modales
      if (e.key === 'Escape') {
        const activeModal = document.querySelector('[role="dialog"]');
        if (activeModal) {
          const closeButton = activeModal.querySelector('[aria-label*="fermer"], [aria-label*="close"]');
          if (closeButton) {
            (closeButton as HTMLElement).click();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [announceToScreenReader]);
};

export default AccessibilityControls;
