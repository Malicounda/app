import React from "react";
import { Info, X } from "lucide-react";

interface LicenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LicenseDialog({ isOpen, onClose }: LicenseDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 text-blue-600 font-bold">
            <Info className="h-5 w-5 text-blue-500" />
            <span className="text-slate-800 text-base">Licence SCoDi</span>
          </div>
          <button 
            onClick={onClose}
            className="h-8 w-8 rounded-full hover:bg-slate-200 flex items-center justify-center transition-colors text-slate-400 hover:text-slate-600"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-6 py-5 text-xs text-slate-600 leading-relaxed font-sans whitespace-pre-wrap select-text selection:bg-blue-100">
{`Système de Contrôle et de Digitalisation (SCoDi)
SCoDi est une application de gestion forestière destinée à la digitalisation et au contrôle des activités des Eaux et Forêts au Sénégal.
Elle permet la traçabilité des opérations, le suivi des activités forestières et l'amélioration de la réponse face aux menaces (braconnage, coupe de bois, feux de brousse).

CONDITIONS D'UTILISATION
En utilisant cette application, vous acceptez les conditions suivantes :
Usage strictement professionnel et autorisé uniquement
Interdiction de copie, modification ou distribution
Interdiction de rétro-ingénierie
Protection des données et confidentialité obligatoire
L'application reste la propriété exclusive de son auteur

LIMITATION DE RESPONSABILITÉ
L'application est fournie « en l'état », sans garantie. L'auteur ne peut être tenu responsable des dommages liés à son utilisation.

APPUI 
Lt-Col Elhadji Malick JOHN
Lt-Col Daniel MANGA

VALIDATION
En installant ou utilisant SCoDi, vous acceptez automatiquement cette licence.
VERSION
v1.0.0 — 2025-00-491
© Abdoulaye SENE — Tous droits réservés
Contact : bisnetprofit@gmail.com`}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-100 transition-all active:scale-95"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
