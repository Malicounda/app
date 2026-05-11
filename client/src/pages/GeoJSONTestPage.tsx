import React, { useEffect, useState } from 'react';
import MapComponent from '@/components/MapComponent';
import { testGeoJSONLoading, analyzeGeoJSONStructure } from '@/lib/testGeoJSON';

const GeoJSONTestPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [testResults, setTestResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function runTests() {
      try {
        setLoading(true);
        // Exécuter le test de chargement GeoJSON
        const results = await testGeoJSONLoading();
        setTestResults(results);
        
        if (results) {
          // Analyser la structure des données GeoJSON
          analyzeGeoJSONStructure(results);
        }
      } catch (err) {
        console.error('Erreur lors des tests:', err);
        setError(err instanceof Error ? err.message : 'Une erreur inconnue est survenue');
      } finally {
        setLoading(false);
      }
    }

    runTests();
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Test des données GeoJSON</h1>
      
      {loading ? (
        <div className="flex justify-center items-center h-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
          <span className="ml-2">Chargement des données GeoJSON...</span>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Erreur lors du chargement des données</p>
          <p>{error}</p>
        </div>
      ) : (
        <div className="mb-4">
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">Test réussi!</p>
            <p>Les données GeoJSON ont été chargées avec succès.</p>
            <p>Nombre de régions: {testResults?.features?.length || 0}</p>
          </div>
          
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-green-700 mb-2">Aperçu des données</h2>
            <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-60">
              {testResults ? JSON.stringify(testResults.features.slice(0, 2), null, 2) : 'Aucune donnée disponible'}
            </pre>
          </div>
        </div>
      )}
      
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-green-700 mb-2">Carte des régions avec GeoJSON</h2>
        <p className="mb-4">Cette carte utilise les données GeoJSON complètes pour afficher les régions du Sénégal.</p>
      </div>
      
      <MapComponent
        regionsGeoJSON={testResults || null}
        departementsGeoJSON={null}
        ecoZonesGeoJSON={null}
        regionStatuses={undefined}
        showRegions={true}
        showZics={false}
        showAmodiees={false}
        showEcoZones={false}
        showProtectedZones={false}
        showRegionalAgents={false}
        showDepartements={false}
        colorizeRegionsByStatus={false}
        alerts={[]}
        selectedMarkerType={null}
        onMarkerPlaced={() => {}}
        onMarkerTypeSelected={() => {}}
      />
      
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-green-700">Légende</h3>
        <div className="flex flex-wrap mt-2">
          <div className="flex items-center mr-4 mb-2">
            <div className="w-4 h-4 bg-green-500 mr-2"></div>
            <span>Régions ouvertes</span>
          </div>
          <div className="flex items-center mr-4 mb-2">
            <div className="w-4 h-4 bg-yellow-400 mr-2"></div>
            <span>Régions partiellement ouvertes</span>
          </div>
          <div className="flex items-center mr-4 mb-2">
            <div className="w-4 h-4 bg-red-500 mr-2"></div>
            <span>Régions fermées</span>
          </div>
          <div className="flex items-center mr-4 mb-2">
            <div className="w-4 h-4 bg-blue-500 mr-2"></div>
            <span>Zones d'intérêt cynégétique (ZIC)</span>
          </div>
          <div className="flex items-center mb-2">
            <div className="w-4 h-4 bg-pink-400 mr-2"></div>
            <span>Zones amodiées</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeoJSONTestPage;
