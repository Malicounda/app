import { Map, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onClick: () => void;
  className?: string;
};

/** Carte horizontale — stylisée selon la nouvelle maquette (Capture 2) */
export default function SupervisorMapCard({ onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[28px] bg-[#f5f4ef] px-5 pt-5 pb-2 shadow-[0_8px_20px_rgba(0,0,0,0.08),inset_0_2px_4px_rgba(255,255,255,1)] border border-[#e8e6e0] transition-transform active:scale-95",
        className
      )}
    >
      <div className="flex w-full items-center gap-5">
        <div className="relative shrink-0">
          {/* Effet de lueur verte (Glow) en dessous de l'icône */}
          <div className="absolute -bottom-2 -left-1 -right-1 top-2 rounded-[20px] bg-[#49b673] blur-[12px] opacity-60"></div>
          {/* Conteneur de l'icône */}
          <div className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[20px] border-[3px] border-[#0a1b35] bg-gradient-to-br from-[#43a968] to-[#226740]">
            <Map className="h-9 w-9 text-white" strokeWidth={2.5} />
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-center text-left">
          <p className="text-[24px] font-black uppercase tracking-tight text-[#0a1b35] leading-none mb-1.5">
            Carte
          </p>
          <p className="text-[13px] leading-[1.3] text-[#5b87a3] font-medium pr-2">
            Voir la carte interactive et la géolocalisation
          </p>
        </div>
      </div>
      {/* Petit chevron pointant vers le bas */}
      <div className="mt-3 flex w-full justify-center">
        <ChevronDown className="h-5 w-5 text-[#c2c1ba]" strokeWidth={3} />
      </div>
    </button>
  );
}
