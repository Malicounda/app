import React from 'react';
import { getAppLogo } from '@/utils/environment';

interface SplashScreenProps {
  message?: string;
}

export function SplashScreen({ message = "Chargement..." }: SplashScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center justify-center space-y-6 max-w-sm w-full px-6 text-center">
        {/* Logo de l'application */}
        <div className="relative">
          <div className="absolute inset-0 bg-green-500 rounded-full blur-xl opacity-20 animate-pulse"></div>
          <img 
            src="/assets/logoprojets/Sans fond_Scodi/android-chrome-192x192.png" 
            alt="SCoDi Logo" 
            className="w-24 h-24 object-contain relative z-10"
            onError={(e) => {
              // Fallback si le logo n'est pas trouvé
              (e.target as HTMLImageElement).src = getAppLogo();
            }}
          />
        </div>

        {/* Spinner et message */}
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-t-2 border-green-600"></div>
          <p className="text-sm font-semibold text-slate-600 tracking-wide">{message}</p>
        </div>

        {/* Pied de page (optionnel, pour renforcer l'aspect professionnel) */}
        <div className="absolute bottom-8 w-full left-0 flex flex-col items-center">
          <div className="flex items-center gap-3 opacity-60">
            <img src="/icon-blason.svg" alt="Blason" className="h-8 object-contain" />
            <img src={getAppLogo()} alt="Eaux et Forêts" className="h-8 object-contain mix-blend-multiply" />
          </div>
        </div>
      </div>
    </div>
  );
}
