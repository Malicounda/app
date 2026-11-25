import { Wifi, WifiOff, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Pilule réseau flottante en bas au centre (façon app bancaire / Gmail / WhatsApp) :
 * - Ne recouvre jamais l'en-tête ni les boutons Actualiser / Déconnexion
 * - Apparaît uniquement lors d'une coupure réseau (avec bouton de fermeture discret)
 * - Affiche brièvement "Connexion Internet rétablie" au retour du réseau puis disparaît
 */
export default function NetworkStatusBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleOffline = () => {
      if (timer) clearTimeout(timer);
      setShowReconnected(false);
      setDismissed(false);
      setIsOnline(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setDismissed(false);
      setShowReconnected(true);
      timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if ((isOnline && !showReconnected) || (!isOnline && dismissed)) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-1/2 -translate-x-1/2 z-[9998] max-w-[92vw] pointer-events-auto"
    >
      <div
        className={`flex items-center gap-2.5 rounded-full px-4 py-2 text-xs sm:text-sm font-medium shadow-lg backdrop-blur-md transition-all duration-300 ${
          !isOnline
            ? "bg-slate-900/95 text-white border border-amber-500/40"
            : "bg-emerald-600/95 text-white border border-emerald-400/40"
        }`}
      >
        {!isOnline ? (
          <>
            <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
            <span className="whitespace-nowrap">Mode hors-ligne — Connexion perdue</span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              aria-label="Masquer la notification hors-ligne"
              className="ml-1 rounded-full p-0.5 text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <Wifi className="h-4 w-4 shrink-0 text-emerald-100" />
            <span className="whitespace-nowrap">Connexion Internet rétablie</span>
          </>
        )}
      </div>
    </div>
  );
}
