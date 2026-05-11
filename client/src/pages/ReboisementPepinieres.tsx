import { ArrowLeft, Calendar, MapPin, Sprout, Users } from 'lucide-react';
import { useLocation } from 'wouter';

export default function ReboisementPepinieres() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50">
      {/* Header */}
      <div className="bg-green-600 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <button
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-white hover:text-green-100 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Retour à l'accueil</span>
          </button>
          <div className="flex items-center gap-4">
            <Sprout className="w-12 h-12" />
            <div>
              <h1 className="text-3xl font-bold">Reboisement et Pépinières</h1>
              <p className="text-green-100">Demande et suivi des plants</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Gestion des programmes de reboisement
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Ce module facilite la gestion des demandes de plants, le suivi des
            pépinières et la coordination des programmes de reboisement à travers
            le territoire national.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Feature 1 */}
          <div
            onClick={() => setLocation('/reboisement-login')}
            role="button"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Sprout className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Demande de plants
            </h3>
            <p className="text-gray-600">
              Formulaire simplifié pour commander des plants auprès des pépinières.
            </p>
          </div>

          {/* Feature 2 */}
          <div
            onClick={() => setLocation('/reboisement-login')}
            role="button"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <MapPin className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Localisation
            </h3>
            <p className="text-gray-600">
              Carte interactive des pépinières et zones de reboisement.
            </p>
          </div>

          {/* Feature 3 */}
          <div
            onClick={() => setLocation('/reboisement-login')}
            role="button"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Suivi des plantations
            </h3>
            <p className="text-gray-600">
              Calendrier et suivi de l'évolution des plantations effectuées.
            </p>
          </div>

          {/* Feature 4 */}
          <div
            onClick={() => setLocation('/reboisement-login')}
            role="button"
            className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer"
          >
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Communautés
            </h3>
            <p className="text-gray-600">
              Coordination avec les communautés locales pour le reboisement.
            </p>
          </div>
        </div>

        {/* Demo Notice */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl shadow-xl p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Module en développement</h3>
          <p className="text-green-50 text-lg mb-6">
            Cette fonctionnalité sera bientôt disponible. Elle permettra une gestion
            complète des programmes de reboisement et des pépinières forestières.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => setLocation('/reboisement-login')}
              className="bg-white text-green-700 px-8 py-3 rounded-lg font-semibold hover:bg-green-50 transition-colors"
            >
              Accéder au module Reboisement
            </button>
            <button
              onClick={() => setLocation('/')}
              className="bg-white/10 text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
