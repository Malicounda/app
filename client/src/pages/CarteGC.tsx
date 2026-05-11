import { apiRequest } from '@/lib/queryClient';
import React, { useEffect, useState } from 'react';
import Accordion from '../components/Accordion';
import Legend from '../components/Legend';
import MapComponent from '../components/MapComponent';
import TabNavigation from '../components/TabNavigation';

interface Alert {
  id: number;
  title: string | null;
  message: string | null;
  nature: string | null;
  region: string | null;
  lat: number;
  lon: number;
  created_at: string;
  sender?: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    role?: string | null;
    region?: string | null;
    departement?: string | null;
  };
}

const Home: React.FC = () => {
  const [activeTab, setActiveTab] = useState('maps');
  const [alerts, setAlerts] = useState<Alert[]>([]);

  // Charger les alertes au montage du composant
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await apiRequest<Alert[]>({ url: '/api/alerts', method: 'GET' });
        setAlerts(data || []);
      } catch (error) {
        console.error('Erreur lors du chargement des alertes:', error);
        // Aucune donnée de test - utiliser un tableau vide
        setAlerts([]);
      }
    };

    fetchAlerts();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center text-green-800 mb-2">🦌 Réglementation Chasse Sénégal 2024-2025</h1>
      <p className="text-center text-gray-600 mb-8">Statuts officiels des zones et régions de chasse</p>

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'maps' && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <i className="fas fa-map-marked-alt mr-2 text-green-600"></i> Carte Maître des Régions et Zones de Chasse
          </h2>
          <MapComponent
            regionsGeoJSON={null}
            departementsGeoJSON={null}
            ecoZonesGeoJSON={null}
            protectedZonesGeoJSON={null}
            regionStatuses={undefined}
            showRegions={false}
            showZics={false}
            showAmodiees={false}
            showEcoZones={false}
            showProtectedZones={false}
            showRegionalAgents={false}
            showDepartements={false}
            colorizeRegionsByStatus={false}
            showAlerts={true}
            alerts={alerts}
            selectedMarkerType={null}
            onMarkerPlaced={() => {}}
            onMarkerTypeSelected={() => {}}
          />

          <Legend />
        </div>
      )}

      {activeTab === 'regulations' && (
        <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center">
            <i className="fas fa-book mr-2 text-green-600"></i> Statuts Officiels des Zones
          </h2>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Les données de réglementation sont maintenant chargées dynamiquement depuis la base de données.</p>
            <p className="text-sm text-gray-500">Consultez le fichier DONNEES_REGLEMENTATION_CHASSE_2024-2025.txt pour les données de référence.</p>
          </div>
        </div>
      )}

      {activeTab === 'species' && (
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <h2 className="text-xl font-semibold mb-6 flex items-center">
            <i className="fas fa-dove mr-2 text-green-600"></i> Espèces Autorisées par Zone
          </h2>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Les données des espèces et quotas sont maintenant chargées dynamiquement depuis la base de données.</p>
            <p className="text-sm text-gray-500">Consultez le fichier DONNEES_REGLEMENTATION_CHASSE_2024-2025.txt pour les données de référence.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
