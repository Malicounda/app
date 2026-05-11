// Page de configuration pour Android
import { Database, Settings, Smartphone, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataMigrationComponent } from '../components/sync/DataMigration';
import { SyncStatusComponent } from '../components/sync/SyncStatus';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { getEnvironment } from '../utils/environment';

export default function AndroidSettings() {
  const [environment, setEnvironment] = useState<'android' | 'desktop' | 'web'>('web');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const detectEnv = async () => {
      const env = await getEnvironment();
      setEnvironment(env);
      setIsLoading(false);
    };
    detectEnv();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (environment !== 'android') {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Configuration Android</h2>
            <p className="text-muted-foreground">
              Cette page est uniquement disponible sur l'application Android.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Configuration Android</h1>
          <p className="text-muted-foreground">
            Gérer la synchronisation et les données de l'application
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto">
          <Smartphone className="h-3 w-3 mr-1" />
          Android
        </Badge>
      </div>

      <Tabs defaultValue="sync" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sync" className="flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            Synchronisation
          </TabsTrigger>
          <TabsTrigger value="data" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Données
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Synchronisation avec le serveur</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Synchronisez vos données avec le serveur principal quand vous êtes connecté à Internet.
              </p>
              <SyncStatusComponent />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mode hors ligne</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  L'application fonctionne en mode autonome avec une base de données SQLite embarquée.
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                  <li>• Toutes les données sont stockées localement</li>
                  <li>• Aucune connexion Internet requise</li>
                  <li>• Synchronisation optionnelle avec le serveur</li>
                  <li>• Données sécurisées et chiffrées</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data" className="space-y-6">
          <DataMigrationComponent />
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Informations de l'application</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Version :</span>
              <span className="ml-2 text-muted-foreground">1.0.0</span>
            </div>
            <div>
              <span className="font-medium">Plateforme :</span>
              <span className="ml-2 text-muted-foreground">Android</span>
            </div>
            <div>
              <span className="font-medium">Base de données :</span>
              <span className="ml-2 text-muted-foreground">SQLite</span>
            </div>
            <div>
              <span className="font-medium">Mode :</span>
              <span className="ml-2 text-muted-foreground">Autonome</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
