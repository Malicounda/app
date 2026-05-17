import { useAuth } from "@/contexts/AuthContext";
import AgentTopHeader from "@/components/layout/AgentTopHeader";

export default function AgentDefaultPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-50">
      <AgentTopHeader />

      {/* Contenu scrollable */}
      <div className="flex-1 px-4 pb-20 space-y-4 overflow-y-auto overscroll-contain">
        {/* Logos partenaires */}
        <div className="flex flex-col items-center gap-4 pt-4 pb-2">
          <div className="flex items-center justify-center">
            {/* Logo Eaux et Forêts supprimé d'ici pour être mis en bas */}
          </div>
          <img src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png" alt="ScoDi" className="h-20 object-contain" />
          <p className="text-[11px] text-gray-700 text-center max-w-xs leading-tight font-bold">Système de Contrôle et de Digitalisation</p>
          <img src="/icon-blason.svg" alt="Blason" className="h-20 object-contain" />
        </div>

        <div className="flex flex-col items-center pb-20">
          <img src="/logo_forets.png" alt="Eaux et Forêts" className="h-24 object-contain" />
        </div>
      </div>


      <p className="text-center text-[9px] text-gray-300 py-1">V1.0</p>
    </div>
  );
}
