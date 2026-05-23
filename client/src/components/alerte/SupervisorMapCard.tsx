import { Map } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  onClick: () => void;
  className?: string;
};

/** Carte Carte horizontale — mêmes dimensions qu’avant (64px icône, textes 14/10). */
export default function SupervisorMapCard({ onClick, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-4 rounded-[20px] border border-slate-200/80 bg-slate-100 p-4 text-left shadow-sm transition-transform active:scale-95",
        className
      )}
    >
      <div className="relative flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-50">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-[#1e3a5f] bg-gradient-to-br from-emerald-700 to-teal-700 shadow-sm">
          <Map className="h-[26px] w-[26px] text-white" strokeWidth={2.5} />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="text-[14px] font-black uppercase tracking-wide text-[#1A2B48]">
          Carte
        </p>
        <p className="mt-0.5 line-clamp-2 text-[10px] leading-[1.3] text-[#6ba3c7]">
          Voir la carte interactive et la géolocalisation
        </p>
      </div>
    </button>
  );
}
