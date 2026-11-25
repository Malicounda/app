/**
 * Indicateur de chargement discret façon application native / bancaire :
 * - Barre de progression fine en haut de la zone de contenu (sans pulsation agressive ni saut de mise en page)
 * - Hauteur minimale stable pour éviter tout décalage visuel
 */
export default function PageLoader() {
  return (
    <div
      className="relative w-full min-h-[70vh] flex flex-col items-center justify-center"
      role="status"
      aria-label="Chargement de la page"
    >
      <div className="fixed top-0 left-0 right-0 z-[9990] h-0.5 bg-emerald-100 overflow-hidden pointer-events-none">
        <div className="h-full w-1/3 bg-emerald-600 animate-[scodi-progress_1s_ease-in-out_infinite]" />
      </div>
      <div className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/90 shadow-sm">
        <div className="h-4 w-4 rounded-full border-2 border-emerald-200 border-t-emerald-600 animate-spin" />
        <span className="text-xs font-medium text-slate-600">Chargement...</span>
      </div>
    </div>
  );
}
