import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, FileText, Coins } from "lucide-react";
import RevenueDetailsModal from "../modals/RevenueDetailsModal";
import { useLocation } from "wouter";

interface StatsCardsProps {
  hunterCount: number;
  permitCount: number;
  revenue: number;
}

export default function StatsCards({ hunterCount, permitCount, revenue }: StatsCardsProps) {
  const [showRevenueDetails, setShowRevenueDetails] = useState(false);
  const [, navigate] = useLocation();

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-6 md:mb-8">
        {/* Carte Chasseurs */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm md:shadow-md overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer" onClick={() => navigate("/hunters")}>
          <div className="p-4 md:p-6 flex items-start">
            <div className="flex-shrink-0 p-2 md:p-3 rounded-lg bg-amber-50 group-hover:bg-amber-100 transition-colors">
              <Users className="h-6 w-6 md:h-8 md:w-8 text-amber-600" />
            </div>
            
            <div className="ml-3 md:ml-5">
              <h3 className="text-sm md:text-base font-medium text-gray-700 mb-1 group-hover:text-amber-700 transition-colors">Total Chasseurs</h3>
              <div className="flex items-end gap-1 md:gap-2">
                <span className="text-xl md:text-3xl font-bold text-gray-900">{hunterCount}</span>
                <span className="text-xs md:text-sm text-gray-500 pb-1">enregistrés</span>
              </div>
              <div className="mt-1 md:mt-2 flex items-center text-amber-600 group-hover:translate-x-1 transition-transform">
                <span className="text-xs md:text-sm font-medium">Voir tous</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 md:h-4 md:w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Carte Permis */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm md:shadow-md overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer" onClick={() => navigate("/permits")}>
          <div className="p-4 md:p-6 flex items-start">
            <div className="flex-shrink-0 p-2 md:p-3 rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
              <FileText className="h-6 w-6 md:h-8 md:w-8 text-blue-600" />
            </div>
            
            <div className="ml-3 md:ml-5">
              <h3 className="text-sm md:text-base font-medium text-gray-700 mb-1 group-hover:text-blue-700 transition-colors">Total Permis</h3>
              <div className="flex items-end gap-1 md:gap-2">
                <span className="text-xl md:text-3xl font-bold text-gray-900">{permitCount}</span>
                <span className="text-xs md:text-sm text-gray-500 pb-1">délivrés</span>
              </div>
              <div className="mt-1 md:mt-2 flex items-center text-blue-600 group-hover:translate-x-1 transition-transform">
                <span className="text-xs md:text-sm font-medium">Voir tous</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 md:h-4 md:w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        
        {/* Carte Recettes */}
        <div className="bg-white rounded-lg md:rounded-xl shadow-sm md:shadow-md overflow-hidden hover:shadow-lg transition-all duration-300 group cursor-pointer sm:col-span-2 md:col-span-1" onClick={() => setShowRevenueDetails(true)}>
          <div className="p-4 md:p-6 flex items-start">
            <div className="flex-shrink-0 p-2 md:p-3 rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
              <Coins className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            
            <div className="ml-3 md:ml-5">
              <h3 className="text-sm md:text-base font-medium text-gray-700 mb-1 group-hover:text-green-700 transition-colors">Recettes</h3>
              <div className="flex items-end gap-1 md:gap-2">
                <span className="text-xl md:text-3xl font-bold text-gray-900">{revenue.toLocaleString()}</span>
                <span className="text-xs md:text-sm text-gray-500 pb-1 flex items-center">
                  FCFA
                </span>
              </div>
              <div className="mt-1 md:mt-2 flex items-center text-green-600 group-hover:translate-x-1 transition-transform">
                <span className="text-xs md:text-sm font-medium">Voir détails</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 md:h-4 md:w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RevenueDetailsModal 
        open={showRevenueDetails} 
        onClose={() => setShowRevenueDetails(false)} 
        revenue={revenue}
      />
    </>
  );
}
