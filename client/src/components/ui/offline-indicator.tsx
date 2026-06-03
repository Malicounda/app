import { useState, useEffect } from "react";
import { WifiOff, Hourglass } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { syncPendingRequests, DatabaseManager } from "@/lib/pwaUtils";
import { useAuth } from "@/contexts/AuthContext";

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { serverUnavailable } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Vérifier le nombre de requêtes en attente
  const checkPendingSyncs = async () => {
    try {
      const database = await DatabaseManager.getDB();
      try {
        const transaction = database.transaction('pendingSync', 'readonly');
        const store = transaction.objectStore('pendingSync');
        const countRequest = store.count();
        countRequest.onsuccess = () => {
          setPendingSyncs(countRequest.result);
        };
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
        setPendingSyncs(0);
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des synchronisations en attente:', error);
    }
  };

  // Lancer la synchronisation
  const handleSync = async () => {
    if (navigator.onLine && !isSyncing) {
      setIsSyncing(true);
      try {
        await syncPendingRequests();
        await checkPendingSyncs();
      } catch (error) {
        console.error('Erreur lors de la synchronisation:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  // Mettre à jour l'état en ligne/hors ligne et vérifier les tâches
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (navigator.onLine) {
        checkPendingSyncs();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    checkPendingSyncs();
    
    const checkInterval = setInterval(checkPendingSyncs, 3000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(checkInterval);
    };
  }, []);

  // Déclencher la synchronisation automatiquement dès que possible
  useEffect(() => {
    if (isOnline && !serverUnavailable && pendingSyncs > 0) {
      handleSync();
    }
  }, [isOnline, serverUnavailable, pendingSyncs]);

  const showOffline = !isOnline || serverUnavailable;
  const showSyncing = isOnline && !serverUnavailable && (pendingSyncs > 0 || isSyncing);

  if (!showOffline && !showSyncing) {
    return null;
  }

  return (
    <div className={`fixed top-20 md:top-24 right-4 md:right-8 z-[900] ${className}`}>
      {showOffline ? (
        <Alert variant="destructive" className="w-64 shadow-lg bg-red-50 border-red-200 text-red-900 [&>svg]:text-red-600">
          <div className="flex items-center gap-2">
            <WifiOff className="h-4 w-4 text-red-600 shrink-0" />
            <span className="font-bold text-sm">Hors ligne</span>
          </div>
        </Alert>
      ) : (
        <Alert className="w-64 shadow-lg border-blue-200 bg-blue-50 text-blue-900 [&>svg]:text-blue-600">
          <div className="flex items-start gap-2">
            <Hourglass className="h-4 w-4 mt-1 text-blue-600 animate-spin shrink-0" />
            <div className="flex-grow">
              <AlertTitle className="font-bold text-sm">Connecté</AlertTitle>
              <AlertDescription className="text-xs text-blue-700 font-medium">
                Synchronisation en cours...
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
