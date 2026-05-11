import senegalFlagUrl from "@assets/Flag_of_Senegal.svg.png?url";
import forestryLogoUrl from "@assets/EAUX ET FORETS.png?url";

export default function OfficialHeader() {
  return (
    <div className="bg-gradient-to-r from-green-800 to-green-600 text-white py-2 shadow-md border-4 border-red-500">
      <div className="container mx-auto px-4">
        <div className="flex flex-row items-center justify-between">
          {/* Logos et drapeaux */}
          {/* Logo du Sénégal à gauche */}
          <div className="flex items-center">
            <img src={senegalFlagUrl} alt="Drapeau du Sénégal" className="h-8 bg-white p-0.5 rounded shadow-sm" />
          </div>
          
          {/* Texte officiel centré */}
          <div className="text-center">
            <a 
              href="https://www.presidence.sn/fr/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block hover:underline hover:text-green-100 transition-colors duration-200"
            >
              <h1 className="text-lg font-bold text-white tracking-wide text-center">RÉPUBLIQUE DU SÉNÉGAL</h1>
            </a>
            <p className="text-xs text-white tracking-wide">MINISTÈRE DE L'ENVIRONNEMENT ET DE LA TRANSITION ÉCOLOGIQUE</p>
          </div>
          
          {/* Direction et Logo Eaux et Forêts à droite */}
          <div className="flex items-center">
            <div className="text-right mr-3 hidden md:block">
              <p className="text-xs text-white font-medium">Direction des Eaux et Forêts, Chasses et Conservation des Sols</p>
            </div>
            <img src={forestryLogoUrl} alt="Logo Eaux et Forêts" className="h-10 bg-white p-0.5 rounded shadow-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}