import { useState, useEffect } from "react";
import { AlertCircle, Wifi, WifiOff, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { syncPendingRequests } from "@/lib/pwaUtils";

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingSyncs, setPendingSyncs] = useState<number>(0);
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('offlineIndicatorCollapsed') === '1';
    } catch {
      return false;
    }
  });

  // Vérifier le nombre de requêtes en attente
  const checkPendingSyncs = async () => {
    try {
      // Utiliser la même version que dans pwaUtils.ts
      const DB_NAME = 'permis-chasse-offline-db';
      const DB_VERSION = 2; // Même version que dans pwaUtils.ts
      
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('pendingSync')) {
          db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
        let count = 0;
        try {
          const transaction = database.transaction('pendingSync', 'readonly');
          const store = transaction.objectStore('pendingSync');
          const countRequest = store.count();
          countRequest.onsuccess = () => {
            setPendingSyncs(countRequest.result);
          };
          transaction.oncomplete = () => {
            database.close();
          };
        } catch (err) {
          // Object store n'existe pas encore
          setPendingSyncs(0);
          database.close();
        }
      };
      request.onerror = (event) => {
        console.error('Erreur lors de l\'ouverture de la base IndexedDB:', request.error);
      };
    } catch (error) {
      console.error('Erreur lors de la vérification des synchronisations en attente:', error);
    }
  };


  // Mettre à jour l'état en ligne/hors ligne
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      // Ne forcer l'affichage que si non réduit
      if (!collapsed) setShowAlert(true);
      
      // Masquer l'alerte après 5 secondes
      setTimeout(() => {
        setShowAlert(false);
      }, 5000);
      
      // Si on revient en ligne, vérifier les syncs en attente
      if (navigator.onLine) {
        checkPendingSyncs();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    // Vérifier initialement
    checkPendingSyncs();
    
    // Vérifier périodiquement
    const interval = setInterval(checkPendingSyncs, 30000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(interval);
    };
  }, [collapsed]);

  // Persister l'état réduit
  useEffect(() => {
    try {
      localStorage.setItem('offlineIndicatorCollapsed', collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);

  // Si en ligne et pas de syncs en attente, ne rien afficher
  if (isOnline && pendingSyncs === 0) {
    return null;
  }

  // Forcer la synchronisation
  const handleSync = async () => {
    if (navigator.onLine) {
      try {
        await syncPendingRequests();
        await checkPendingSyncs();
      } catch (error) {
        console.error('Erreur lors de la synchronisation:', error);
      }
    }
  };

  // Si tout est OK, ne rien afficher
  if (isOnline && pendingSyncs === 0) {
    return null;
  }

  // Vue compacte (réduite)
  if (collapsed) {
    return (
      <div className={`fixed bottom-4 left-8 z-50 ${className}`}>
        <button
          onClick={() => setCollapsed(false)}
          className={`flex items-center gap-2 rounded-full px-3 py-2 shadow-md border text-sm ${isOnline ? 'bg-white' : 'bg-red-50 border-red-200'} hover:opacity-90`}
          title={isOnline ? 'Connecté' : 'Hors ligne'}
        >
          {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4 text-red-600" />}
          <span className="font-medium">{isOnline ? 'Connecté' : 'Hors ligne'}</span>
          {pendingSyncs > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-xs px-2 py-0.5">
              {pendingSyncs}
            </span>
          )}
          <ChevronUp className="h-4 w-4 opacity-70" />
        </button>
      </div>
    );
  }

  // Vue étendue
  return (
    <div className={`fixed bottom-4 left-8 z-50 transition-opacity ${showAlert || !isOnline || pendingSyncs > 0 ? 'opacity-100' : 'opacity-0'} ${className}`}>
      <Alert variant={isOnline ? "default" : "destructive"} className="w-80 shadow-lg">
        {isOnline ? (
          <>
            <div className="flex items-start gap-2">
              <Wifi className="h-4 w-4 mt-1" />
              <div className="flex-1">
                <AlertTitle>Connecté</AlertTitle>
                {pendingSyncs > 0 && (
                  <AlertDescription className="mt-2">
                    {pendingSyncs} modification{pendingSyncs > 1 ? 's' : ''} en attente de synchronisation
                  </AlertDescription>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {pendingSyncs > 0 && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleSync}
                    >
                      Synchroniser maintenant
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCollapsed(true)}
                  >
                    Réduire
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start gap-2">
              <WifiOff className="h-4 w-4 mt-1" />
              <div className="flex-1">
                <AlertTitle>Mode hors ligne</AlertTitle>
                <AlertDescription className="mt-2">
                  Vous êtes actuellement hors ligne. Vos modifications seront synchronisées automatiquement lorsque la connexion sera rétablie.
                </AlertDescription>
                <div className="mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCollapsed(true)}
                  >
                    Réduire
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Alert>
    </div>
  );
}
