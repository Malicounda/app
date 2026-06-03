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
    <div className={`fixed top-20 right-4 z-[900] flex flex-col items-end pointer-events-none ${className}`}>
      {showOffline ? (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 backdrop-blur-md shadow-sm pointer-events-auto">
          <WifiOff className="h-4 w-4" />
          <span className="font-bold text-xs">Hors ligne</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20 backdrop-blur-md shadow-sm pointer-events-auto">
          <Hourglass className="h-4 w-4 animate-spin" />
          <div className="flex flex-col">
            <span className="font-bold text-xs leading-none">Connecté</span>
            <span className="text-[10px] leading-none mt-0.5 opacity-90">Synchronisation en cours...</span>
          </div>
        </div>
      )}
    </div>
  );
}
