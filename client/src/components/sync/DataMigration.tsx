// Composant de migration des données pour Android
import { AlertCircle, CheckCircle, Database, Download, Upload } from 'lucide-react';
import React, { useState } from 'react';
import { DataMigrationService } from '../../services/dataMigrationService';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

export const DataMigrationComponent: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [jsonData, setJsonData] = useState('');

  const migrationService = new DataMigrationService();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setJsonData(content);
      };
      reader.readAsText(file);
    }
  };

  const handleImport = async () => {
    if (!jsonData.trim()) {
      setMessage('Veuillez sélectionner un fichier JSON ou coller les données');
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const data = JSON.parse(jsonData);
      const result = await migrationService.migrateFromServer(data);

      if (result.success) {
        setMessage('Données importées avec succès !');
        setIsSuccess(true);
        setJsonData('');
      } else {
        setMessage(result.error || 'Erreur lors de l\'import');
        setIsSuccess(false);
      }
    } catch (error) {
      setMessage('Erreur de format JSON ou lors de l\'import');
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const data = await migrationService.exportData();
      const jsonString = JSON.stringify(data, null, 2);

      // Créer et télécharger le fichier
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scodipp-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage('Données exportées avec succès !');
      setIsSuccess(true);
    } catch (error) {
      setMessage('Erreur lors de l\'export');
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Migration des données
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="file-upload">Importer des données (JSON)</Label>
            <Input
              id="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="json-data">Ou coller les données JSON</Label>
            <textarea
              id="json-data"
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder="Collez ici les données JSON à importer..."
              className="w-full h-32 p-2 border border-gray-300 rounded-md mt-1"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleImport}
              disabled={isLoading || !jsonData.trim()}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Upload className="h-4 w-4 mr-2 animate-spin" />
                  Import...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Importer
                </>
              )}
            </Button>

            <Button
              onClick={handleExport}
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <Download className="h-4 w-4 mr-2 animate-spin" />
                  Export...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exporter
                </>
              )}
            </Button>
          </div>

          {message && (
            <div className={`p-3 rounded-md flex items-center gap-2 ${
              isSuccess
                ? 'bg-green-50 border border-green-200 text-green-600'
                : 'bg-red-50 border border-red-200 text-red-600'
            }`}>
              {isSuccess ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span className="text-sm">{message}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>1. <strong>Import :</strong> Sélectionnez un fichier JSON ou collez les données de votre base de données existante</p>
          <p>2. <strong>Export :</strong> Téléchargez les données actuelles pour sauvegarde</p>
          <p>3. <strong>Format :</strong> Le fichier JSON doit contenir les tables : users, permis, regions, zones, especes</p>
          <p>4. <strong>Sauvegarde :</strong> Faites toujours un export avant d'importer de nouvelles données</p>
        </CardContent>
      </Card>
    </div>
  );
};
