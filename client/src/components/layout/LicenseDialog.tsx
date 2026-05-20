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
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-5 text-xs text-slate-600 leading-relaxed font-sans whitespace-pre-wrap select-text selection:bg-blue-100">
{`Système de Contrôle et de Digitalisation (SCoDi)
Copyright © 2025 Abdoulaye SENE – Ingénieur des Travaux des Eaux et Forêts

Tous droits réservés.

Toute reproduction, distribution, modification ou utilisation non autorisée de cette application est strictement interdite.

Contact :
Email : bisnetprofit@gmail.com

═══════════════════

CONTRAT DE LICENCE D’UTILISATION DE L’APPLICATION (CLUF)

Cette application ainsi que toute sa documentation associée sont protégées par les lois relatives au droit d’auteur et à la propriété intellectuelle.

L’installation, l’accès ou l’utilisation de cette application implique l’acceptation complète des conditions définies dans la présente licence.

1. DROITS D’UTILISATION

* L’utilisateur bénéficie d’un droit d’utilisation limité, non exclusif et non transférable.
* L’utilisation de l’application est strictement limitée aux usages autorisés par l’auteur.
* Chaque installation de l’application nécessite une licence valide délivrée par l’auteur.
* Une copie de sauvegarde peut être réalisée uniquement à des fins de sécurité et de restauration.

2. RESTRICTIONS

Sauf autorisation écrite préalable de l’auteur, il est strictement interdit de :

* reproduire, copier ou dupliquer tout ou partie de l’application ;
* modifier, adapter ou altérer l’application ;
* distribuer, vendre, louer ou céder l’application à des tiers ;
* utiliser l’application à des fins commerciales non autorisées ;
* effectuer de la rétro-ingénierie, décompiler ou tenter d’extraire le code source de l’application ;
* supprimer ou modifier les mentions de propriété intellectuelle présentes dans l’application.

3. GARANTIE ET RESPONSABILITÉ

* Cette application est fournie « telle quelle », sans garantie expresse ou implicite.
* L’auteur ne garantit pas que l’application sera exempte d’erreurs, d’interruptions ou de dysfonctionnements.
* L’auteur ne pourra être tenu responsable des dommages directs ou indirects résultant de l’utilisation ou de l’impossibilité d’utiliser l’application.

4. PROPRIÉTÉ INTELLECTUELLE

* Tous les droits de propriété intellectuelle relatifs à l’application demeurent la propriété exclusive de l’auteur.
* Les noms, logos, marques et éléments graphiques associés à l’application sont protégés.
* Aucun droit de propriété sur le code source ou les composants internes de l’application n’est transféré à l’utilisateur.

5. CONFIDENTIALITÉ ET DONNÉES

* L’utilisateur s’engage à respecter la confidentialité des données traitées par l’application.
* Toute utilisation des données doit être conforme aux lois et réglementations en vigueur.

6. SUPPORT ET MISES À JOUR

* Le support technique est fourni selon les modalités définies par l’auteur.
* Les mises à jour, améliorations ou correctifs peuvent être fournis à la discrétion exclusive de l’auteur.

7. RÉSILIATION

* Cette licence peut être suspendue ou résiliée immédiatement en cas de non-respect des présentes conditions.
* En cas de résiliation, l’utilisateur doit cesser immédiatement toute utilisation de l’application et supprimer toutes les copies en sa possession.

8. LOI APPLICABLE ET JURIDICTION

* La présente licence est régie par les lois de la République du Sénégal.
* Tout litige relatif à l’interprétation ou à l’exécution de cette licence sera soumis aux juridictions compétentes du Sénégal.

════════════════
Pour toute demande d’autorisation, d’information ou d’acquisition de licence :

Abdoulaye SENE
Ingénieur des Travaux des Eaux et Forêts

Email : bisnetprofit@gmail.com

════════════════

Version 1.0.0 – 2025

Cette licence entre en vigueur dès l’installation ou l’utilisation de l’application.`}
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
