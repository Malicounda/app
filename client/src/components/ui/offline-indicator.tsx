import { useState, useEffect } from "react";
import { AlertCircle, Wifi, WifiOff, ChevronDown, ChevronUp } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { syncPendingRequests } from "@/lib/pwaUtils";
import { useAuth } from "@/contexts/AuthContext";

interface OfflineIndicatorProps {
  className?: string;
}

export function OfflineIndicator({ className }: OfflineIndicatorProps) {
  const { serverUnavailable, lastSuccessfulAuthSync } = useAuth();
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
  
  // État de rafraîchissement temporel (tick toutes les 30s pour mettre à jour le temps "il y a X min")
  const [tick, setTick] = useState(0);

  // Formater la date de dernière synchronisation de façon lisible
  const formatLastSync = (isoString: string | null) => {
    if (!isoString) return "Aucune synchronisation";
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 1) return "à l'instant";
      if (diffMins < 60) return `il y a ${diffMins} min`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `il y a ${diffHours} h`;
      
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return "Inconnue";
    }
  };

  // Vérifier le nombre de requêtes en attente
  const checkPendingSyncs = async () => {
    try {
      const DB_NAME = 'permis-chasse-offline-db';
      const DB_VERSION = 2;
      
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('pendingSync')) {
          db.createObjectStore('pendingSync', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (event) => {
        const database = (event.target as IDBOpenDBRequest).result;
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
          setPendingSyncs(0);
          database.close();
        }
      };
      request.onerror = () => {
        console.error('Erreur lors de l\'ouverture de la base IndexedDB:', request.error);
      };
    } catch (error) {
      console.error('Erreur lors de la vérification des synchronisations en attente:', error);
    }
  };

  // Mettre à jour l'état en ligne/hors ligne et les tick de temps
  useEffect(() => {
    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
      if (!collapsed) setShowAlert(true);
      
      setTimeout(() => {
        setShowAlert(false);
      }, 5000);
      
      if (navigator.onLine) {
        checkPendingSyncs();
      }
    };

    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);
    
    checkPendingSyncs();
    
    const checkInterval = setInterval(checkPendingSyncs, 30000);
    const tickInterval = setInterval(() => {
      setTick(t => t + 1);
    }, 30000);

    return () => {
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
      clearInterval(checkInterval);
      clearInterval(tickInterval);
    };
  }, [collapsed]);

  // Persister l'état réduit
  useEffect(() => {
    try {
      localStorage.setItem('offlineIndicatorCollapsed', collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);

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
  if (isOnline && !serverUnavailable && pendingSyncs === 0) {
    return null;
  }

  // Vue compacte (réduite)
  if (collapsed) {
    let bgColor = "bg-white border-gray-200 text-gray-700";
    let icon = <Wifi className="h-4 w-4 text-blue-600" />;
    let text = "Connecté";
    
    if (!isOnline) {
      bgColor = "bg-red-50 border-red-200 text-red-700";
      icon = <WifiOff className="h-4 w-4 text-red-600" />;
      text = "Hors ligne";
    } else if (serverUnavailable) {
      bgColor = "bg-amber-50 border-amber-200 text-amber-700 animate-pulse";
      icon = <AlertCircle className="h-4 w-4 text-amber-600" />;
      text = "Connexion limitée";
    } else if (pendingSyncs > 0) {
      bgColor = "bg-blue-50 border-blue-200 text-blue-700";
      icon = <Wifi className="h-4 w-4 text-blue-600" />;
      text = "Synchro requise";
    }

    return (
      <div className={`fixed bottom-[72px] md:bottom-4 left-8 z-[900] ${className}`}>
        <button
          onClick={() => setCollapsed(false)}
          className={`flex items-center gap-2 rounded-full px-3 py-2 shadow-md border text-sm ${bgColor} hover:opacity-90 transition-all`}
          title={text}
        >
          {icon}
          <span className="font-semibold text-xs">{text}</span>
          {pendingSyncs > 0 && (
            <span className="ml-1 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 min-w-[18px]">
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
    <div className={`fixed bottom-[72px] md:bottom-4 left-8 z-[900] transition-opacity ${showAlert || !isOnline || serverUnavailable || pendingSyncs > 0 ? 'opacity-100' : 'opacity-0'} ${className}`}>
      {!isOnline ? (
        <Alert variant="destructive" className="w-80 shadow-lg bg-red-50 border-red-200 text-red-900 [&>svg]:text-red-600">
          <div className="flex items-start gap-2">
            <WifiOff className="h-4 w-4 mt-1" />
            <div className="flex-1">
              <AlertTitle className="font-bold">Mode hors ligne</AlertTitle>
              <AlertDescription className="mt-2 text-xs text-red-700 leading-relaxed">
                Vous êtes actuellement hors ligne. Vos modifications sont sauvegardées localement.
                <div className="mt-1 font-semibold">
                  Dernière synchro : {formatLastSync(lastSuccessfulAuthSync)}
                </div>
              </AlertDescription>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(true)}
                  className="text-xs h-7 px-2 hover:bg-red-100 text-red-800"
                >
                  Réduire
                </Button>
              </div>
            </div>
          </div>
        </Alert>
      ) : serverUnavailable ? (
        <Alert className="w-80 shadow-lg border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 mt-1" />
            <div className="flex-1">
              <AlertTitle className="font-bold">Connexion limitée</AlertTitle>
              <AlertDescription className="mt-2 text-xs text-amber-700 leading-relaxed">
                Le serveur est inaccessible. L'application utilise les données du cache local.
                <div className="mt-1 font-semibold">
                  Dernière synchro : {formatLastSync(lastSuccessfulAuthSync)}
                </div>
              </AlertDescription>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(true)}
                  className="text-xs h-7 px-2 hover:bg-amber-100 text-amber-800"
                >
                  Réduire
                </Button>
              </div>
            </div>
          </div>
        </Alert>
      ) : (
        <Alert className="w-80 shadow-lg border-blue-200 bg-blue-50 text-blue-900 [&>svg]:text-blue-600">
          <div className="flex items-start gap-2">
            <Wifi className="h-4 w-4 mt-1" />
            <div className="flex-1">
              <AlertTitle className="font-bold">Connecté</AlertTitle>
              <AlertDescription className="mt-2 text-xs text-blue-700 leading-relaxed">
                Votre connexion est active.
                {pendingSyncs > 0 && (
                  <span className="block mt-1">
                    {pendingSyncs} donnée{pendingSyncs > 1 ? 's' : ''} en attente de synchronisation.
                  </span>
                )}
                <div className="mt-1 font-semibold">
                  Dernière synchro : {formatLastSync(lastSuccessfulAuthSync)}
                </div>
              </AlertDescription>
              <div className="mt-2 flex items-center gap-2">
                {pendingSyncs > 0 && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleSync}
                    className="text-xs h-7 px-2 bg-white border-blue-300 hover:bg-blue-100 text-blue-800 font-semibold"
                  >
                    Synchroniser maintenant
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCollapsed(true)}
                  className="text-xs h-7 px-2 hover:bg-blue-100 text-blue-800"
                >
                  Réduire
                </Button>
              </div>
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
