// Composant de statut de synchronisation pour Android
import { CheckCircle, Clock, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { SyncService, SyncStatus } from '../../services/syncService';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export const SyncStatusComponent: React.FC = () => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSync: null,
    isOnline: false,
    pendingChanges: 0
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncService = new SyncService();

  useEffect(() => {
    loadSyncStatus();
  }, []);

  const loadSyncStatus = async () => {
    try {
      const status = await syncService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Erreur lors du chargement du statut de synchronisation:', error);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncError(null);

    try {
      const result = await syncService.syncWithServer();
      if (result.success) {
        await loadSyncStatus();
      } else {
        setSyncError(result.error || 'Erreur de synchronisation');
      }
    } catch (error) {
      setSyncError('Erreur de synchronisation');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (lastSync: string | null) => {
    if (!lastSync) return 'Jamais';
    const date = new Date(lastSync);
    return date.toLocaleString('fr-FR');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Synchronisation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Statut de connexion</span>
          <Badge variant={syncStatus.isOnline ? "default" : "secondary"}>
            {syncStatus.isOnline ? (
              <>
                <Wifi className="h-3 w-3 mr-1" />
                En ligne
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3 mr-1" />
                Hors ligne
              </>
            )}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Dernière synchronisation</span>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className="text-sm text-muted-foreground">
              {formatLastSync(syncStatus.lastSync)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Changements en attente</span>
          <Badge variant="outline">
            {syncStatus.pendingChanges}
          </Badge>
        </div>

        {syncError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{syncError}</p>
          </div>
        )}

        <Button
          onClick={handleSync}
          disabled={isSyncing || !syncStatus.isOnline}
          className="w-full"
        >
          {isSyncing ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Synchronisation...
            </>
          ) : (
            <>
              <CheckCircle className="h-4 w-4 mr-2" />
              Synchroniser
            </>
          )}
        </Button>

        {!syncStatus.isOnline && (
          <p className="text-xs text-muted-foreground text-center">
            La synchronisation n'est disponible qu'en mode en ligne
          </p>
        )}
      </CardContent>
    </Card>
  );
};
