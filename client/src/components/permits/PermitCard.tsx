import { format } from "date-fns";
// Importation statique remplacée par des URLs directes pour éviter les problèmes d'import
import { Hunter, Permit } from "@shared/schema";

interface PermitCardProps {
  permit: Permit;
  hunter: Hunter;
}

// Validité (jours) – utiliser la colonne si dispo, sinon calculer à partir des dates
const msPerDay = 1000 * 60 * 60 * 24;

// Helpers alignés avec PermitDetails pour afficher le Lieu de service
const normalize = (s: string) => (s || '')
  .normalize('NFD')
  .replace(/\p{Diacritic}+/gu, '')
  .toLowerCase();
const toSlug = (s: string) => normalize(s).replace(/\s+/g, '-');
const ucfirstWords = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
// Minimal fallback des listes; PermitCard n'importe pas les constantes, on applique une heuristique simple
const getRegionLabel = (raw: string) => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Laisser tel quel en capitalisant les mots
  return ucfirstWords(trimmed.toLowerCase());
};
const getSectorLabel = (regionRaw: string, zoneRaw: string) => {
  const zoneVal = (zoneRaw || '').toString().trim();
  if (!zoneVal) return '';
  // Normaliser "secteur-xxx" → "xxx"
  const cleaned = zoneVal.replace(/^secteur\s*/i, '').replace(/^secteur[-_/\s]*/i, '');
  return ucfirstWords(cleaned.replace(/-/g, ' ').toLowerCase());
};
const computeServiceLocation = (roleLike: string, regionRaw: string, zoneRaw: string, deptRaw?: string) => {
  const rl = (roleLike || '').toLowerCase();
  const isRegional = rl.includes('region') || rl.includes('regional') || rl === 'agent' || rl.includes('admin-agent-regional');
  const isSector = rl.includes('secteur') || rl.includes('sector') || rl.includes('sub-agent') || rl.includes('subagent') || rl.includes('agent-secteur');
  if (rl === 'admin') return 'Service des Eaux et Forêts DEFCCS';
  if (isRegional) {
    const reg = getRegionLabel(regionRaw);
    return reg ? `IREF/${reg}` : 'IREF';
  }
  if (isSector) {
    const dept = (deptRaw || '').toString().trim();
    if (dept) return `Secteur/${dept}`;
    const sec = getSectorLabel(regionRaw, zoneRaw);
    const secPart = sec || 'Non défini';
    return `Secteur/${secPart}`;
  }
  // Fallback: présence d'une zone/dept => secteur, sinon IREF
  if ((deptRaw || '').toString().trim() || (zoneRaw || '').toString().trim()) {
    const dept = (deptRaw || '').toString().trim();
    if (dept) return `Secteur/${dept}`;
    const sec = getSectorLabel(regionRaw, zoneRaw);
    const secPart = sec || 'Non défini';
    return `Secteur/${secPart}`;
  }
  const reg = getRegionLabel(regionRaw);
  return reg ? `IREF/${reg}` : 'IREF';
};

export default function PermitCard({ permit, hunter }: PermitCardProps) {
  // URLs directes des images pour éviter les problèmes d'import
  const senegalFlag = "https://upload.wikimedia.org/wikipedia/commons/f/fd/Flag_of_Senegal.svg";
  const eauxForetsLogo = "/logo_forets.png";

  // Format des données QR avec informations dynamiques basées sur les vraies données
  // Récupération dynamique des données de renouvellement depuis les métadonnées du permis
  const renewalMetadata = (permit.metadata as any)?.renewals;
  let renewalCount = 0;
  let renewalInfo = 'Première émission';
  let renewalDates: string[] = [];
  let lastRenewalLocation = '';
  let lastRenewalBy: any = null;

  if (renewalMetadata) {
    if (Array.isArray(renewalMetadata)) {
      // Si c'est un tableau de renouvellements avec détails
      renewalCount = renewalMetadata.length;
      if (renewalCount > 0) {
        // Extraire les dates de renouvellement
        renewalDates = renewalMetadata.map(renewal => {
          const date = renewal?.date || renewal?.renewedAt;
          return date ? format(new Date(date), "dd/MM/yyyy") : null;
        }).filter(date => date !== null);

        const lastRenewal = renewalMetadata[renewalMetadata.length - 1];
        const renewalAgent = lastRenewal?.renewedBy || lastRenewal?.by;
        lastRenewalBy = renewalAgent || null;

        // Extraire le poste et lieu au lieu du nom
        if (renewalAgent && typeof renewalAgent === 'object') {
          const agentDepartement = renewalAgent.departement;
          const agentRegion = renewalAgent.region;
          const agentRole = renewalAgent.role || renewalAgent.entityType;

          const computed = computeServiceLocation(String(agentRole || ''), String(agentRegion || ''), String((renewalAgent as any).zone || ''), String(agentDepartement || ''));
          lastRenewalLocation = computed || 'Service des Eaux et Forêts';
        }

        renewalInfo = `Renouvellement n°${renewalCount} - Service des Eaux et Forêts\n${lastRenewalLocation}`;
      }
    } else if (typeof renewalMetadata === 'object' && renewalMetadata.count) {
      // Si c'est un objet avec une propriété count
      renewalCount = typeof renewalMetadata.count === 'number' ? renewalMetadata.count : parseInt(renewalMetadata.count) || 0;
      if (renewalCount > 0) {
        if (renewalMetadata.lastRenewalDate) {
          renewalDates = [format(new Date(renewalMetadata.lastRenewalDate), "dd/MM/yyyy")];
        }

        if (renewalMetadata.lastRenewedBy) {
          const agent = renewalMetadata.lastRenewedBy;
          lastRenewalBy = agent || null;
          if (typeof agent === 'object') {
            const agentDepartement = agent.departement;
            const agentRegion = agent.region;
            const agentRole = agent.role || agent.entityType;

            const computed = computeServiceLocation(String(agentRole || ''), String(agentRegion || ''), String((agent as any).zone || ''), String(agentDepartement || ''));
            lastRenewalLocation = computed || 'Service des Eaux et Forêts';
          }
        }

        renewalInfo = `Renouvellement n°${renewalCount} - Service des Eaux et Forêts\n${lastRenewalLocation}`;
      }
    } else if (typeof renewalMetadata === 'number') {
      // Si c'est directement un nombre
      renewalCount = renewalMetadata;
      renewalInfo = renewalCount > 0 ? `Renouvellement n°${renewalCount}` : 'Première émission';
    }
  }

  // Informations de l'émetteur: préférer le dernier renouvellement (role/region/departement), sinon champs du permis
  const createdByUser = (permit.metadata as any)?.createdByUser;
  const fallbackIssuerName = (createdByUser?.firstName && createdByUser?.lastName) ? `${createdByUser.firstName} ${createdByUser.lastName}` : '';
  const lastBy = lastRenewalBy || null;
  const issuerName = lastBy && (lastBy.firstName || lastBy.lastName)
    ? `${lastBy.firstName || ''} ${lastBy.lastName || ''}`.trim()
    : fallbackIssuerName;

  const lastRoleForIssuer = (lastBy?.role || '').toString().toLowerCase();
  const lastRegionForIssuer = (lastBy?.region || '').toString().trim();
  const lastDeptForIssuer = (lastBy?.departement || (lastBy as any)?.department || lastBy?.zone || '').toString().trim();
  const effRole = (lastRoleForIssuer || (permit as any).issuerRole || '').toLowerCase();
  const region = (lastRegionForIssuer || (permit as any).issuerRegion || '').trim();
  const zone = (
    lastDeptForIssuer ||
    (permit as any).issuerZone ||
    ''
  ).trim();
  const dept = (
    lastDeptForIssuer ||
    (permit as any).issuerDepartement ||
    ''
  ).trim();
  const issuerComputed = computeServiceLocation(effRole, region, zone, dept);

  // Construction du QR code au format PermitDetails
  const qrType = (permit as any).categoryId && String((permit as any).categoryId).trim().length > 0
    ? String((permit as any).categoryId)
    : (permit.type === 'petite-chasse' ? 'Petite Chasse' :
       permit.type === 'grande-chasse' ? 'Grande Chasse' :
       permit.type === 'gibier-eau' ? "Gibier d'Eau" :
       permit.type);

  // Construction des lignes de renouvellement pour le QR
  const renewalLines = renewalDates.length > 0
    ? (`\nRenouvellements (${renewalCount}):` +
       renewalDates.map((date, idx) => {
         return `\n  ${idx + 1}. ${date} - ${lastRenewalLocation || 'Service des Eaux et Forêts'}`;
       }).join(''))
    : '';

  // Informations sur l'arme
  const brandLine = hunter.weaponBrand ? `\nMarque: ${hunter.weaponBrand}` : '';
  const caliberLine = hunter.weaponCaliber ? `\nCalibre: ${hunter.weaponCaliber}` : '';

  const validityDays = typeof (permit as any)?.validityDays === 'number' && (permit as any).validityDays > 0
    ? (permit as any).validityDays
    : (() => {
        try {
          const issue = permit.issueDate ? new Date(permit.issueDate as any) : null;
          const expiry = permit.expiryDate ? new Date(permit.expiryDate as any) : null;
          if (issue && expiry && !isNaN(issue.getTime()) && !isNaN(expiry.getTime())) {
            return Math.max(0, Math.ceil((expiry.getTime() - issue.getTime()) / msPerDay));
          }
        } catch {}
        return undefined as unknown as number;
      })();

  const qrData = `Numéro de Permis: ${permit.permitNumber || ''}\n` +
    `Nom: ${hunter.lastName}\n` +
    `Prénom: ${hunter.firstName}\n` +
    `N° Pièce d'identité: ${(hunter as any)?.idNumber || ''}\n` +
    `Type de permis: ${qrType}\n` +
    `Date d'émission: ${format(new Date(permit.issueDate || (typeof permit.createdAt === 'string' ? permit.createdAt : new Date())), "dd/MM/yyyy")}\n` +
    `Date d'expiration: ${format(new Date(permit.expiryDate), "dd/MM/yyyy")}\n` +
    `${typeof validityDays === 'number' && validityDays > 0 ? `Validité: ${validityDays} jours\n` : ''}` +
    `Prix: ${Number(permit.price).toLocaleString()} FCFA\n` +
    `N° Quittance: ${permit.receiptNumber || ''}\n` +
    `Émetteur: Service des Eaux et Forêts${effRole === 'admin' ? ' DEFCCS' : ''}\n` +
    `${effRole !== 'admin' && issuerComputed ? issuerComputed + "\n" : ''}` +
    `${brandLine}${caliberLine}${renewalLines}\n` +
    `Statut: ${permit.status === 'active' ? 'Actif' :
      permit.status === 'suspended' ? 'Suspendu' :
      permit.status === 'expired' ? 'Expiré' : 'Inconnu'}`;

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
        {renewalCount > 0 && (
          <span className="inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700 border border-green-200">
            Renouvelé
          </span>
        )}
      </div>

      {/* Informations principales */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <div className="mb-4">
            <div className="text-sm text-gray-600">Type de Permis:</div>
            <div className="font-bold">{String((permit as any).categoryId || permit.type || '')}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Titulaire:</div>
            <div className="font-bold">{String(hunter.firstName || '')} {String(hunter.lastName || '')}</div>
            {hunter.address && (
              <div className="text-sm text-gray-600 mt-1">
                <div>{String(hunter.address)}</div>
              </div>
            )}
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">N° de Permis:</div>
            <div className="font-bold">{String(permit.permitNumber || '')}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Montant Payé:</div>
            <div className="font-bold">{Number(permit.price || 0).toLocaleString()} FCFA</div>
          </div>

          {typeof validityDays === 'number' && validityDays > 0 && (
            <div className="mb-4">
              <div className="text-sm text-gray-600">Validité:</div>
              <div className="font-bold">{validityDays} jours</div>
            </div>
          )}

          <div className="mb-4">
            <div className="text-sm text-gray-600">N° Quittance Permis:</div>
            <div className="font-bold">{String(permit.receiptNumber || 'Non défini')}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Renouvellements:</div>
            <div className="font-bold">{String(renewalCount)}</div>
          </div>

          <div className="mb-4">
            <div className="text-sm text-gray-600">Statut:</div>
            <div className="font-bold text-green-600">
              {renewalInfo.split('\n').map((line, index) => (
                <div key={index}>{line}</div>
              ))}
            </div>
          </div>

          {issuerName && (
            <div className="mb-4">
              <div className="text-sm text-gray-600">Émetteur:</div>
              <div className="font-bold text-blue-600">{String(issuerName)}</div>
              <div className="text-sm text-blue-500 whitespace-pre-line">{String(issuerComputed)}</div>
            </div>
          )}

          {/* Informations sur l'arme */}
          {hunter.weaponType && (
            <div className="mb-4 border-t pt-3">
              <div className="text-sm text-gray-600 font-semibold mb-2">Arme Autorisée:</div>
              <div className="text-xs space-y-1">
                <div><span className="font-medium">Type:</span> {String(hunter.weaponType || '')}</div>
                {hunter.weaponBrand && (
                  <div><span className="font-medium">Marque:</span> {String(hunter.weaponBrand || '')}</div>
                )}
                {hunter.weaponCaliber && (
                  <div><span className="font-medium">Calibre:</span> {String(hunter.weaponCaliber || '')}</div>
                )}
                {hunter.weaponReference && (
                  <div><span className="font-medium">Réf:</span> {String(hunter.weaponReference || '')}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between">
          <div className="mb-4">
            <div className="text-sm text-gray-600">N° Pièce d'identité:</div>
            <div className="font-bold">{String(hunter.idNumber || '')}</div>
          </div>


          <div className="mb-0 mt-auto flex flex-col items-center">
            <div className="qrcode-wrapper" id="qrcode-container">
              <div className="bg-gray-50 p-4 rounded-lg" style={{marginTop: '1.5cm'}}>
                <div className="relative w-48 h-48 mx-auto mb-1">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrData)}`}
                    alt="QR Code du Permis"
                    className="absolute inset-0 w-full h-full"
                  />
                  {/* Overlay du logo centré */}
                  <img
                    src="/logo_forets.png"
                    alt="Logo Eaux et Forêts"
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10"
                  />
                </div>
                <div className="text-xs text-center text-gray-500">Scannez pour vérifier</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pied de page avec informations complètes de l'émetteur */}
      <div className="border-t pt-4 mt-4">
        <div className="flex justify-between items-start">
          <div className="text-xs text-gray-600">
            <div className="font-semibold mb-1">Émetteur:</div>
            {issuerName && <div>{String(issuerName)}</div>}
            <div>Direction des Eaux et Forêts</div>
            <div>Chasse et Conservation des Sols</div>
            <div className="mt-1">
              <div>Service des Eaux et Forêts{effRole === 'admin' ? ' DEFCCS' : ''}</div>
              {effRole !== 'admin' && (
                <div className="whitespace-pre-line">{String(issuerComputed)}</div>
              )}
            </div>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p className="italic">Document officiel - Le titulaire doit présenter ce permis sur demande des autorités.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
