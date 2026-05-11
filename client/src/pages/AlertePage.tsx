import React from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, AlertTriangle, Bell, MapPin, Clock, Shield } from 'lucide-react';

export default function AlertePage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50">
      {/* Header */}
      <div className="bg-amber-600 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <button
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-white hover:text-amber-100 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Retour à l'accueil</span>
          </button>
          <div className="flex items-center gap-4">
            <AlertTriangle className="w-12 h-12" />
            <div>
              <h1 className="text-3xl font-bold">Système d'Alerte</h1>
              <p className="text-amber-100">Signalement en temps réel des infractions et incidents</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Signalement et gestion des incidents
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Ce module permet de signaler rapidement les infractions, incidents et 
            situations d'urgence sur le terrain. Les alertes sont géolocalisées et 
            transmises en temps réel aux autorités compétentes.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Feature 1 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Signalement rapide
            </h3>
            <p className="text-gray-600">
              Interface simplifiée pour signaler rapidement tout type d'incident 
              ou infraction.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Géolocalisation
            </h3>
            <p className="text-gray-600">
              Localisation automatique de l'incident avec coordonnées GPS précises.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Temps réel
            </h3>
            <p className="text-gray-600">
              Transmission instantanée des alertes aux agents sur le terrain.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Suivi des interventions
            </h3>
            <p className="text-gray-600">
              Traçabilité complète des alertes et des interventions effectuées.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Types d'incidents
            </h3>
            <p className="text-gray-600">
              Braconnage, feux de brousse, exploitation illégale, et autres infractions.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <Bell className="w-7 h-7 text-amber-600 animate-pulse" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Notifications
            </h3>
            <p className="text-gray-600">
              Système de notifications push pour les agents et autorités.
            </p>
          </div>
        </div>

        {/* Alert Types */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h3 className="text-2xl font-bold text-gray-800 mb-6">Types d'alertes</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Braconnage</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Feux de brousse</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Exploitation illégale</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Déforestation</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-rose-50 rounded-lg border border-rose-200">
              <div className="w-3 h-3 bg-rose-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Trafic d'animaux</span>
            </div>
            <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <span className="font-semibold text-gray-800">Autres incidents</span>
            </div>
          </div>
        </div>

        {/* Demo Notice */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-2xl shadow-xl p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Module en développement</h3>
          <p className="text-amber-50 text-lg mb-6">
            Cette fonctionnalité sera bientôt disponible. Elle permettra un signalement 
            rapide et efficace des incidents avec géolocalisation et suivi en temps réel.
          </p>
          <button
            onClick={() => setLocation('/')}
            className="bg-white text-amber-600 px-8 py-3 rounded-lg font-semibold hover:bg-amber-50 transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
