import { Calendar, Sprout, Users } from 'lucide-react';
import { useLocation } from 'wouter';

export default function ReforestationDepartementDashboard() {
  const [, setLocation] = useLocation();
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-lime-50">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-900">Espace Agent de Secteur</h1>
          <p className="text-green-700 mt-2">Bienvenue sur votre tableau de bord départemental.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div role="button" onClick={() => setLocation('/reboisement/demandes')} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Sprout className="w-7 h-7 text-green-600" />
            </div>
            <div className="text-xl font-semibold text-gray-800 mb-2">Demandes de plants</div>
            <div className="text-gray-600">Gérer les commandes auprès des pépinières.</div>
          </div>
          <div role="button" onClick={() => setLocation('/reboisement/suivi')} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-7 h-7 text-green-600" />
            </div>
            <div className="text-xl font-semibold text-gray-800 mb-2">Suivi des plantations</div>
            <div className="text-gray-600">Calendrier et avancement.</div>
          </div>
          <div role="button" onClick={() => setLocation('/reboisement/communautes')} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow cursor-pointer">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Users className="w-7 h-7 text-green-600" />
            </div>
            <div className="text-xl font-semibold text-gray-800 mb-2">Communautés</div>
            <div className="text-gray-600">Coordination avec les communautés locales.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
