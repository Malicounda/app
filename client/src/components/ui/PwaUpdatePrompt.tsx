import React, { useEffect, useState } from 'react';
import { Button } from './button';
import { RefreshCw, X } from 'lucide-react';

export function PwaUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [newWorker, setNewWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    // Écouter l'événement personnalisé déclenché par pwaUtils.ts
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<ServiceWorker>;
      setNewWorker(customEvent.detail);
      setShowPrompt(true);
    };

    window.addEventListener('pwa-update-available', handleUpdateAvailable);

    return () => {
      window.removeEventListener('pwa-update-available', handleUpdateAvailable);
    };
  }, []);

  const handleUpdate = () => {
    if (newWorker) {
      // Envoyer le message SKIP_WAITING au nouveau service worker
      newWorker.postMessage('SKIP_WAITING');
      setShowPrompt(false);
    }
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-green-500 p-4 animate-in slide-in-from-bottom-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-green-500" />
            Mise à jour disponible
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Une nouvelle version de l'application est disponible. Mettez à jour pour profiter des dernières nouveautés.
          </p>
        </div>
        <button 
          onClick={() => setShowPrompt(false)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowPrompt(false)}>
          Plus tard
        </Button>
        <Button 
          className="bg-green-600 hover:bg-green-700 text-white" 
          size="sm" 
          onClick={handleUpdate}
        >
          Mettre à jour
        </Button>
      </div>
    </div>
  );
}
