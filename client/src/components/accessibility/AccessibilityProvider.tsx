import React, { createContext, useContext, useEffect, useState } from 'react';

interface AccessibilityContextType {
  // Préférences utilisateur
  prefersReducedMotion: boolean;
  prefersHighContrast: boolean;
  prefersDarkMode: boolean;
  
  // État de l'accessibilité
  isKeyboardNavigation: boolean;
  isScreenReader: boolean;
  fontSize: 'small' | 'medium' | 'large';
  
  // Actions
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
  toggleHighContrast: () => void;
  announceToScreenReader: (message: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};

interface AccessibilityProviderProps {
  children: React.ReactNode;
}

export const AccessibilityProvider: React.FC<AccessibilityProviderProps> = ({ children }) => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);
  const [prefersDarkMode, setPrefersDarkMode] = useState(false);
  const [isKeyboardNavigation, setIsKeyboardNavigation] = useState(false);
  const [isScreenReader, setIsScreenReader] = useState(false);
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium');

  // Détection des préférences système
  useEffect(() => {
    // Détection du mouvement réduit
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(motionQuery.matches);
    
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };
    motionQuery.addEventListener('change', handleMotionChange);

    // Détection du contraste élevé
    const contrastQuery = window.matchMedia('(prefers-contrast: high)');
    setPrefersHighContrast(contrastQuery.matches);
    
    const handleContrastChange = (e: MediaQueryListEvent) => {
      setPrefersHighContrast(e.matches);
    };
    contrastQuery.addEventListener('change', handleContrastChange);

    // Détection du mode sombre
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setPrefersDarkMode(darkQuery.matches);
    
    const handleDarkChange = (e: MediaQueryListEvent) => {
      setPrefersDarkMode(e.matches);
    };
    darkQuery.addEventListener('change', handleDarkChange);

    // Détection de la navigation au clavier
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        setIsKeyboardNavigation(true);
      }
    };

    const handleMouseDown = () => {
      setIsKeyboardNavigation(false);
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    // Détection des lecteurs d'écran
    const detectScreenReader = () => {
      // Vérification de la présence d'aria-live regions
      const liveRegions = document.querySelectorAll('[aria-live]');
      const hasScreenReader: boolean =
        liveRegions.length > 0 ||
        !!(window as any).speechSynthesis ||
        navigator.userAgent.includes('NVDA') ||
        navigator.userAgent.includes('JAWS') ||
        navigator.userAgent.includes('VoiceOver');

      setIsScreenReader(!!hasScreenReader);
    };

    detectScreenReader();

    // Récupération des préférences sauvegardées
    const savedFontSize = localStorage.getItem('accessibility-font-size') as 'small' | 'medium' | 'large';
    if (savedFontSize) {
      setFontSize(savedFontSize);
    }

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange);
      contrastQuery.removeEventListener('change', handleContrastChange);
      darkQuery.removeEventListener('change', handleDarkChange);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // Application des préférences de taille de police
  useEffect(() => {
    const root = document.documentElement;
    const fontSizes = {
      small: '14px',
      medium: '16px',
      large: '18px'
    };
    
    root.style.setProperty('--font-size-base', fontSizes[fontSize]);
    localStorage.setItem('accessibility-font-size', fontSize);
  }, [fontSize]);

  // Application des préférences de contraste
  useEffect(() => {
    const root = document.documentElement;
    if (prefersHighContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }
  }, [prefersHighContrast]);

  // Application des préférences de mouvement
  useEffect(() => {
    const root = document.documentElement;
    if (prefersReducedMotion) {
      root.style.setProperty('--animation-duration', '0.01ms');
      root.style.setProperty('--transition-duration', '0.01ms');
    } else {
      root.style.removeProperty('--animation-duration');
      root.style.removeProperty('--transition-duration');
    }
  }, [prefersReducedMotion]);

  const toggleHighContrast = () => {
    setPrefersHighContrast(!prefersHighContrast);
  };

  const announceToScreenReader = (message: string) => {
    if (isScreenReader) {
      // Créer un élément temporaire pour l'annonce
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.setAttribute('aria-atomic', 'true');
      announcement.className = 'sr-only';
      announcement.textContent = message;
      
      document.body.appendChild(announcement);
      
      // Supprimer l'élément après l'annonce
      setTimeout(() => {
        document.body.removeChild(announcement);
      }, 1000);
    }
  };

  const value: AccessibilityContextType = {
    prefersReducedMotion,
    prefersHighContrast,
    prefersDarkMode,
    isKeyboardNavigation,
    isScreenReader,
    fontSize,
    setFontSize,
    toggleHighContrast,
    announceToScreenReader
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

// Composant pour les annonces aux lecteurs d'écran
export const ScreenReaderAnnouncement: React.FC<{ message: string }> = ({ message }) => {
  const { announceToScreenReader } = useAccessibility();
  
  useEffect(() => {
    if (message) {
      announceToScreenReader(message);
    }
  }, [message, announceToScreenReader]);
  
  return null;
};

// Hook pour les styles d'accessibilité
export const useAccessibilityStyles = () => {
  const { isKeyboardNavigation, prefersHighContrast, fontSize } = useAccessibility();
  
  return {
    focus: isKeyboardNavigation ? 'focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none' : '',
    contrast: prefersHighContrast ? 'border-2 border-black' : '',
    textSize: fontSize === 'large' ? 'text-lg' : fontSize === 'small' ? 'text-sm' : 'text-base'
  };
};

export default AccessibilityProvider;
