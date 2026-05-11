import React from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Trees, FileText, TrendingUp, Package } from 'lucide-react';

export default function ProduitsForestiers() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-teal-100 to-cyan-50">
      {/* Header */}
      <div className="bg-teal-600 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <button
            onClick={() => setLocation('/')}
            className="flex items-center gap-2 text-white hover:text-teal-100 transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Retour à l'accueil</span>
          </button>
          <div className="flex items-center gap-4">
            <Trees className="w-12 h-12" />
            <div>
              <h1 className="text-3xl font-bold">Produits Forestiers</h1>
              <p className="text-teal-100">Circulation des produits forestiers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Gestion de la circulation des produits forestiers
          </h2>
          <p className="text-gray-600 text-lg leading-relaxed">
            Ce module permet de gérer et suivre la circulation des produits forestiers 
            sur le territoire national. Il assure la traçabilité et le contrôle des 
            mouvements de bois et autres produits issus des forêts.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Feature 1 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-teal-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Permis de circulation
            </h3>
            <p className="text-gray-600">
              Délivrance et gestion des permis de circulation pour le transport 
              des produits forestiers.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mb-4">
              <TrendingUp className="w-7 h-7 text-teal-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Suivi en temps réel
            </h3>
            <p className="text-gray-600">
              Traçabilité complète des mouvements de produits forestiers 
              avec géolocalisation.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mb-4">
              <Package className="w-7 h-7 text-teal-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-3">
              Inventaire
            </h3>
            <p className="text-gray-600">
              Gestion des stocks et inventaire des produits forestiers 
              en circulation.
            </p>
          </div>
        </div>

        {/* Demo Notice */}
        <div className="bg-gradient-to-r from-teal-500 to-cyan-500 rounded-2xl shadow-xl p-8 text-white text-center">
          <h3 className="text-2xl font-bold mb-4">Module en développement</h3>
          <p className="text-teal-50 text-lg mb-6">
            Cette fonctionnalité sera bientôt disponible. Elle permettra une gestion 
            complète et digitalisée de la circulation des produits forestiers.
          </p>
          <button
            onClick={() => setLocation('/')}
            className="bg-white text-teal-600 px-8 py-3 rounded-lg font-semibold hover:bg-teal-50 transition-colors"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}
