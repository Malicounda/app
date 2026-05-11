import { format } from "date-fns";
// Définition locale minimale des types pour éviter la dépendance à @shared/schema
interface Permit {
  permitNumber: string;
  type: string;
  price: string | number;
  issueDate: string;
  createdAt?: string;
  expiryDate: string;
  receiptNumber?: string;
  metadata?: any;
}
interface Hunter {
  firstName: string;
  lastName: string;
  idNumber: string;
  weaponType?: string;
  weaponBrand?: string;
  weaponCaliber?: string;
  weaponReference?: string;
}

interface PermitCardProps {
  permit: Permit;
  hunter: Hunter;
}

export default function PermitCard({ permit, hunter }: PermitCardProps) {
  // URLs directes des images pour éviter les problèmes d'import
  const senegalFlag = "https://upload.wikimedia.org/wikipedia/commons/f/fd/Flag_of_Senegal.svg";
  const eauxForetsLogo = "/logo_forets.png";

  // Format des données QR avec informations dynamiques basées sur les vraies données
  // Récupération des données de renouvellement depuis les métadonnées du permis
  const renewalCount = (permit.metadata as any)?.renewals || (permit.metadata as any)?.renewalCount || 0;
  const renewalInfo = renewalCount > 0 ? `Renouvellement n°${renewalCount}` : 'Première émission';

  // Informations de l'émetteur basées sur les vraies données utilisateur qui a créé le permis
  const createdByUser = (permit.metadata as any)?.createdByUser;
  const sectorInfo = createdByUser?.departement || 'Non défini';
  const regionInfo = createdByUser?.region || '';
  const issuerInfo = sectorInfo !== 'Non défini' ? `Service des Eaux et Forêts - Secteur/${sectorInfo}` : 'Service des Eaux et Forêts';
  const fullIssuerInfo = 'Direction des Eaux et Forêts, Chasse et de la Conservation des Sols';

  const qrData =
    `Direction Eaux & Forêts\n` +
    `Chasse et Conservation des Sols\n` +
    `\n` +
    `Service des Eaux et Forêts DEFCCS\n` +
    `\n` +
    `Émetteur : ${fullIssuerInfo}\n` +
    `${issuerInfo}\n` +
    `\n` +
    `Permis de chasse : ${permit.permitNumber}\n` +
    `\n` +
    `Type : ${permit.type === 'petite-chasse' ? 'petite-chasse' :
             permit.type === 'grande-chasse' ? 'grande-chasse' :
             permit.type === 'gibier-eau' ? 'touriste-gibier-eau-1mois' : permit.type}\n` +
    `\n` +
    `Nom du chasseur :\n` +
    `${hunter.firstName} ${hunter.lastName}\n` +
    `\n` +
    `Renouvellements : ${renewalCount}\n` +
    `Statut : ${renewalInfo}\n` +
    `\n` +
    `Prix : ${Number(permit.price).toLocaleString()} FCFA\n` +
    `\n` +
    `Émis le : ${format(new Date(permit.issueDate ?? permit.createdAt ?? new Date().toISOString()), "dd/MM/yyyy")}\n` +
    `\n` +
    `Expire le : ${format(new Date(permit.expiryDate), "dd/MM/yyyy")}\n` +
    `\n` +
    `Quittance : ${permit.receiptNumber || 'Non défini'}`;

  return (
    <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-lg overflow-hidden shadow-md p-6 print:shadow-none">
      {/* Entête */}
      <div className="flex justify-between items-center border-b pb-4 mb-4">
        <div className="flex items-center">
          <img src={senegalFlag} alt="Drapeau du Sénégal" className="h-10 mr-3" />
          <div>
            <div className="font-bold text-green-800">RÉPUBLIQUE DU SÉNÉGAL</div>
            <div className="text-sm text-green-700">Ministère de l'Environnement et de la Transition Écologique</div>
          </div>
        </div>

        <div className="text-right">
          <img src={eauxForetsLogo} alt="Logo Eaux et Forêts" className="h-16" />
        </div>
      </div>

      {/* Titre */}
      <div className="text-center my-4">
        <h1 className="text-2xl font-bold uppercase text-green-900">PERMIS DE CHASSE</h1>
      </div>

      {/* Informations principales */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="mb-4">
            <div className="text-sm text-gray-600">N° de Permis:</div>
            <div className="font-bold">{permit.permitNumber}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Titulaire:</div>
            <div className="font-bold">{hunter.firstName} {hunter.lastName}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Type de Permis:</div>
            <div className="font-bold">
              {permit.type === 'petite-chasse' ? 'Petite Chasse' :
               permit.type === 'grande-chasse' ? 'Grande Chasse' :
               permit.type === 'gibier-eau' ? 'Gibier d\'Eau' :
               permit.type}
            </div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Montant Payé:</div>
            <div className="font-bold">{Number(permit.price).toLocaleString()} FCFA</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">N° Quittance Permis:</div>
            <div className="font-bold">{permit.receiptNumber || 'Non défini'}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Renouvellements:</div>
            <div className="font-bold">{renewalCount}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Statut:</div>
            <div className="font-bold text-green-600">{renewalInfo}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Service émetteur:</div>
            <div className="font-bold text-blue-600">{issuerInfo}</div>
          </div>

          {/* Informations sur l'arme */}
          {hunter.weaponType && (
            <div className="mb-4 border-t pt-3">
              <div className="text-sm text-gray-600 font-semibold mb-2">Arme Autorisée:</div>
              <div className="text-xs space-y-1">
                <div><span className="font-medium">Type:</span> {hunter.weaponType}</div>
                {hunter.weaponBrand && (
                  <div><span className="font-medium">Marque:</span> {hunter.weaponBrand}</div>
                )}
                {hunter.weaponCaliber && (
                  <div><span className="font-medium">Calibre:</span> {hunter.weaponCaliber}</div>
                )}
                {hunter.weaponReference && (
                  <div><span className="font-medium">Réf:</span> {hunter.weaponReference}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between">
          <div className="mb-4">
            <div className="text-sm text-gray-600">N° Pièce d'identité:</div>
            <div className="font-bold">{hunter.idNumber}</div>
          </div>


          <div className="mb-0 mt-auto flex flex-col items-center">
            <div className="qrcode-wrapper" id="qrcode-container">
              {/* QR code synchronisé avec le format du quitus + overlay logo */}
              <div className="relative w-40 h-40 mx-auto mb-1">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrData)}`}
                  alt="QR Code du Permis"
                  className="absolute inset-0 w-full h-full"
                />
                {/* Overlay du logo centré */}
                <img
                  src="/logo_forets.png"
                  alt="Logo Eaux et Forêts"
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8"
                />
              </div>
              <div className="text-xs text-center text-gray-500">Scannez pour vérifier</div>
            </div>
          </div>
        </div>
      </div>

      {/* Signature et pied de page */}
      <div className="border-t pt-4 mt-4 flex justify-between">
        <div>
          <div className="text-sm text-gray-600 mb-1">Émetteur</div>
          <div className="border border-gray-300 w-40 h-16 flex flex-col items-center justify-center text-xs text-gray-700 p-2">
            <div className="text-center font-medium">Direction des Eaux et Forêts</div>
            <div className="text-center">{issuerInfo}</div>
          </div>
        </div>

        <div className="text-right text-xs text-gray-600">
          <p className="mt-1 italic">Document officiel - Le titulaire doit présenter ce permis sur demande des autorités.</p>
        </div>
      </div>
    </div>
  );
}
