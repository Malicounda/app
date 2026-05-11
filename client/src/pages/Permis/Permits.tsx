import PermitDetails from "@/components/permits/PermitDetails";
import PermitForm from "@/components/permits/PermitForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHunters } from "@/lib/hooks/useHunters";
import { usePermits } from "@/lib/hooks/usePermits";
import { isPermitExpired, isPermitSuspended } from "@/lib/utils/permits";
import { exportToCsv } from "@/utils/export";
import { PdfLibraryLoader, generatePdf } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { BookPlus, Eye, FileDown, Printer, Search } from "lucide-react";
import { useEffect, useState } from "react";

export default function Permits() {
  console.log('[Permits] Composant Permits chargé');
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPermitId, setSelectedPermitId] = useState<number | null>(null);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { allPermits: permits, isLoading: permitsLoading, error: permitsError } = usePermits();
  const { allHunters, huntersLoading, error: huntersError } = useHunters();

  const isLoading = permitsLoading || huntersLoading;
  const error = permitsError || huntersError;

  // Debug logging
  console.log('Permits Debug:', {
    permits,
    permitsLoading,
    permitsError,
    allHunters,
    huntersLoading,
    huntersError,
    isLoading,
    error
  });

  // (pagination helpers moved below, after filteredPermits is defined)

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const filterType = searchParams?.get('filter');

  // Sécuriser la liste pour éviter les unions non désirées
  const permitsList = Array.isArray(permits) ? permits : [];
  // Helpers: effective expiry from backend or stored, and derived status
  const getEffectiveExpiry = (p: any) => (p?.computedEffectiveExpiry || p?.expiryDate || null);
  const isExpiredDerived = (p: any) => {
    const ee = getEffectiveExpiry(p);
    if (!ee) return false;
    const d = new Date(ee);
    return !isNaN(d.getTime()) && d < new Date();
  };
  // Helpers
  const getHunterById = (hunterId: number) => {
    // prefer embedded info if present
    const p = permitsList.find((pp: any) => pp.hunterId === hunterId) as any;
    if (p && (p.hunterFirstName || p.hunterLastName || p.hunterIdNumber)) {
      console.log(`[DEBUG] Données embarquées trouvées pour hunterId ${hunterId}:`, {
        hunterFirstName: p.hunterFirstName,
        hunterLastName: p.hunterLastName,
        hunterIdNumber: p.hunterIdNumber
      });
      return {
        firstName: p.hunterFirstName || '',
        lastName: p.hunterLastName || '',
        idNumber: p.hunterIdNumber || ''
      };
    }
    const h = allHunters?.find((hh: any) => hh.id === hunterId);
    if (h) {
      console.log(`[DEBUG] Données chasseur trouvées dans allHunters pour ID ${hunterId}:`, {
        firstName: h.firstName,
        lastName: h.lastName,
        idNumber: h.idNumber
      });
      return h ? { firstName: h.firstName, lastName: h.lastName, idNumber: (h as any)?.idNumber || '' } : { firstName: '', lastName: '', idNumber: '' };
    }
    console.log(`[DEBUG] Aucune donnée trouvée pour hunterId ${hunterId}`);
    return { firstName: '', lastName: '', idNumber: '' };
  };
  const computeIssuerServiceLocation = (permit: any) => {
    const role = (permit.issuerRole || user?.type || (user?.role === 'agent' ? 'regional' : (user?.role === 'sub-agent' ? 'secteur' : user?.role)) || '').toLowerCase();
    const region = (permit.issuerRegion || user?.region || '').toString().trim();
    const zone = (permit.issuerZone || (user as any)?.zone || '').toString().trim();
    const dept = ((permit as any).issuerDepartement || (user as any)?.departement || '').toString().trim();
    if (role === 'admin') return 'Service des Eaux et Forêts DEFCCS';
    const isRegional = role.includes('region');
    const isSector = role.includes('secteur') || role.includes('sector') || role.includes('sub-agent');
    if (isRegional) {
      return region ? `IREF/${region}` : 'IREF';
    }
    if (isSector) {
      if (dept) return `Secteur/${dept}`;
      if (zone) return `Secteur/${zone}`;
      return 'Secteur/Non défini';
    }
    // Fallbacks
    if (dept) return `Secteur/${dept}`;
    if (zone) return `Secteur/${zone}`;
    return region ? `IREF/${region}` : '';
  };

  const filteredPermits = permitsList.filter((permit: any) => {
    const searchLower = searchTerm.toLowerCase();
    // Debug: vérifier la structure du permis
    if (!permit.permitNumber) {
      console.warn('[PERMITS FILTER] Permis sans permitNumber:', permit);
      return false;
    }
    const hunter = getHunterById(permit.hunterId);
    const haystacks = [
      permit.permitNumber?.toString().toLowerCase() || '',
      hunter.firstName?.toString().toLowerCase() || '',
      hunter.lastName?.toString().toLowerCase() || '',
      hunter.idNumber?.toString().toLowerCase() || '',
      (permit.receiptNumber || '').toString().toLowerCase()
    ];
    const matchesSearch = !searchLower || haystacks.some(h => h.includes(searchLower));

    // Appliquer le filtre de statut (all | active | suspended)
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? (permit.status === 'active' && !isPermitSuspended(permit))
          : (permit.status === 'suspended' || isPermitSuspended(permit));

    if (filterType === 'expired') {
      return matchesSearch && matchesStatus && (isExpiredDerived(permit) || isPermitExpired(permit));
    }

    return matchesSearch && matchesStatus;
  });

  // Debug: afficher les résultats du filtrage
  console.log('[PERMITS FILTER] Résultats du filtrage:', {
    totalPermits: permitsList.length || 0,
    filteredPermits: filteredPermits?.length || 0,
    searchTerm,
    filterType,
    firstPermit: permitsList[0]
  });

  // Pagination helpers (computed after filteredPermits)
  const totalPages = Math.max(1, Math.ceil((filteredPermits?.length || 0) / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredPermits?.length || 0);
  const paginatedPermits = (filteredPermits || []).slice(startIndex, endIndex);

  // Reset to page 1 when search/filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleSearch = () => {
    // Client-side filtering is already happening with the state change
  };

  const handlePrint = () => {
    // Ajouter une feuille de style temporaire pour l'impression qui cache tout sauf le tableau
    const style = document.createElement('style');
    style.id = 'print-style-permits';
    style.innerHTML = `
      @media print {
        body * {
          visibility: hidden;
        }
        .overflow-x-auto, .overflow-x-auto * {
          visibility: visible;
        }
        .print\\:hidden {
          display: none !important;
        }
        .overflow-x-auto {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        table {
          width: 100%;
        }
        .hidden {
          display: table-cell !important;
        }
      }
    `;
    document.head.appendChild(style);

    // Imprimer et nettoyer
    window.print();

    // Supprimer la feuille de style temporaire après l'impression
    setTimeout(() => {
      const printStyle = document.getElementById('print-style-permits');
      if (printStyle) printStyle.remove();
    }, 1000);
  };

  const handleExportPdf = () => {
    if (!filteredPermits || !allHunters) {
      toast({
        title: "Erreur",
        description: "Impossible de générer le PDF. Données manquantes.",
        variant: "destructive",
      });
      return;
    }

    // Préparer les données pour le PDF
    const tableColumns = ['N° Permis', 'Chasseur', 'Type', 'Date Expiration', 'Prix', 'N° Quittance', 'Statut'];
    const tableData = filteredPermits.map(permit => [
      permit.permitNumber,
      getHunterName(permit.hunterId),
      permit.categoryId || permit.type || '-',
      (() => { const ee = getEffectiveExpiry(permit); return ee ? format(new Date(ee), "dd/MM/yyyy") : ''; })(),
      `${Number(permit.price).toLocaleString()} FCFA`,
      permit.receiptNumber || '',
      getStatusText(permit)
    ]);

    // Générer le PDF
    generatePdf({
      title: 'Liste des Permis de Chasse',
      filename: `permis-chasse-${format(new Date(), "yyyy-MM-dd")}.pdf`,
      tableColumns,
      tableData,
      additionalContent: (doc) => {
        // Ajouter du contenu personnalisé
        doc.setFontSize(10);
        doc.text('Direction des Eaux et Forêts - République du Sénégal', 14, doc.autoTable.previous.finalY + 10);
        doc.text(`Généré par: ${localStorage.getItem('username') || 'Utilisateur'} - ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, doc.autoTable.previous.finalY + 16);
      },
    });

    toast({
      title: "Succès",
      description: "Le PDF a été généré avec succès.",
    });
  };

  const handleExportCsv = () => {
    if (!filteredPermits) {
      toast({
        title: "Erreur",
        description: "Impossible d'exporter en CSV. Données manquantes.",
        variant: "destructive",
      });
      return;
    }
    const columns = [
      { key: 'permitNumber', label: 'N° Permis' },
      { key: 'hunter', label: 'Chasseur' },
      { key: 'idNumber', label: "N° ID" },
      { key: 'type', label: 'Type' },
      { key: 'expiryDate', label: 'Date Expiration' },
      { key: 'price', label: 'Prix (FCFA)' },
      { key: 'receiptNumber', label: 'N° Quittance' },
      { key: 'status', label: 'Statut' },
      { key: 'issuer', label: 'Émetteur' },
    ];
    const rows = filteredPermits.map((permit: any) => ({
      permitNumber: permit.permitNumber,
      hunter: getHunterName(permit.hunterId),
      idNumber: getHunterById(permit.hunterId).idNumber || '',
      type: permit.categoryId || permit.type || '-',
      expiryDate: (() => { const ee = getEffectiveExpiry(permit); return ee ? format(new Date(ee), "dd/MM/yyyy") : ''; })(),
      price: Number(permit.price || 0).toLocaleString('fr-FR'),
      receiptNumber: permit.receiptNumber || '',
      status: getStatusText(permit),
      issuer: computeIssuerServiceLocation(permit) || '',
    }));
    exportToCsv(`permis-chasse-${format(new Date(), 'yyyy-MM-dd')}.csv`, columns, rows);
    toast({ title: "Succès", description: "Export CSV terminé." });
  };

  const viewPermitDetails = (permitId: number) => {
    setSelectedPermitId(permitId);
  };

  const getStatusClass = (permit: any) => {
    if (isPermitSuspended(permit)) return "bg-orange-100 text-orange-800";
    if (isExpiredDerived(permit) || isPermitExpired(permit)) return "bg-red-100 text-red-800";
    return "bg-green-100 text-green-800";
  };

  const getStatusText = (permit: any) => {
    if (isPermitSuspended(permit)) return "Suspendu";
    if (isExpiredDerived(permit) || isPermitExpired(permit)) return "Expiré";
    return "Actif";
  };

  const getHunterName = (hunterId: number) => {
    // Essayer d'abord de trouver les données chasseur dans les permis
    const permit = permitsList.find((p: any) => p.hunterId === hunterId);
    if (permit) {
      console.log(`[DEBUG] Données chasseur dans permis pour ID ${hunterId}:`, {
        hunterFirstName: permit.hunterFirstName,
        hunterLastName: permit.hunterLastName,
        hunterIdNumber: permit.hunterIdNumber
      });

      if (permit.hunterFirstName && permit.hunterLastName) {
        return `${permit.hunterFirstName} ${permit.hunterLastName}`;
      }
    }

    // Fallback vers les données chasseurs si disponibles
    if (!allHunters) {
      console.log(`[DEBUG] Données allHunters non disponibles pour ID ${hunterId}`);
      return "Chargement...";
    }

    const hunter = allHunters.find((h: any) => h.id === hunterId);
    if (hunter) {
      console.log(`[DEBUG] Données chasseur trouvées dans allHunters pour ID ${hunterId}:`, {
        firstName: hunter.firstName,
        lastName: hunter.lastName,
        idNumber: hunter.idNumber
      });

      if (hunter.firstName && hunter.lastName) {
        return `${hunter.firstName} ${hunter.lastName}`;
      }
    }

    // Si aucune information n'est disponible, afficher l'ID avec un message plus informatif
    console.log(`[DEBUG] Aucune donnée chasseur trouvée pour ID ${hunterId}`);
    return `Chasseur ID: ${hunterId}`;
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <h1 className="text-2xl font-bold text-neutral-800 mb-4 md:mb-0">Gestion des Permis</h1>
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2"
          >
            <BookPlus className="h-4 w-4" />
            Ajouter un Permis
          </Button>
        </div>

        {/* Scope badge + results count (above filters) */}
        <div className="flex items-center gap-3 mt-1 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            {user?.role === 'agent'
              ? `Portée: Régionale${user?.region ? ` (${user.region})` : ''}`
              : user?.role === 'sub-agent'
                ? `Portée: Département${(user as any)?.departement || user?.zone ? ` (${(user as any)?.departement || user?.zone})` : ''}`
                : 'Portée: Nationale'}
          </span>
          <span className="text-xs text-gray-600">• Résultats: {filteredPermits?.length ?? 0}</span>
        </div>

        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 items-center">
              <div className="w-full sm:flex-1 px-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type="text"
                    placeholder="Rechercher (N° permis, N° quittance, N° pièce, nom, téléphone)"
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-full sm:w-auto px-2 flex flex-wrap items-center gap-2 justify-end">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="active">Actifs</SelectItem>
                    <SelectItem value="suspended">Suspendus</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="default"
                  className="px-3 py-2 text-sm"
                  onClick={handleSearch}
                >
                  Rechercher
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                  onClick={handlePrint}
                >
                  <Printer className="h-4 w-4" />
                  Imprimer
                </Button>
                <PdfLibraryLoader fallback={
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                    disabled
                  >
                    <FileDown className="h-4 w-4" />
                    PDF
                  </Button>
                }>
                  <Button
                    variant="outline"
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                    onClick={handleExportPdf}
                  >
                    <FileDown className="h-4 w-4" />
                    PDF
                  </Button>
                </PdfLibraryLoader>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                  onClick={handleExportCsv}
                >
                  <FileDown className="h-4 w-4" />
                  CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center">Chargement des permis...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">Erreur: Impossible de charger les permis</div>
            ) : filteredPermits && filteredPermits.length > 0 ? (
              <>
              <div className="overflow-x-auto rounded-lg print:overflow-visible relative">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Permis</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chasseur</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Informations</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Expiration</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prix</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Quittance</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th scope="col" className="px-3 md:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50 z-10 print:hidden w-24">Détail</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedPermits.map((permit: any) => (
                      <tr key={permit.id}>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm font-medium text-gray-900">{permit.permitNumber}</td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">{getHunterName(permit.hunterId)}</td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-[11px] md:text-sm text-gray-600">
                          <div className="flex flex-col">
                            <span className="mt-0.5"><strong>Émetteur:</strong> {computeIssuerServiceLocation(permit) || '-'}</span>
                          </div>
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">
                          {permit.categoryId || permit.type || '-'}
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">
                          {(() => { const ee = getEffectiveExpiry(permit); return ee ? format(new Date(ee), "dd/MM/yyyy") : ''; })()}
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">
                          {Number(permit.price).toLocaleString()} FCFA
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500">
                          {permit.receiptNumber || ''}
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusClass(permit)}`}>
                            {getStatusText(permit)}
                          </span>
                        </td>
                        <td className="px-3 md:px-6 py-2 md:py-4 whitespace-nowrap text-xs md:text-sm text-gray-500 print:hidden sticky right-0 bg-white z-10 text-right w-24">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary-700 hover:text-primary-900"
                            onClick={() => viewPermitDetails(permit.id)}
                            title="Voir les détails"
                            aria-label="Voir le détail du permis"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination footer (outside of the scrollable table) */}
              <div className="p-3 flex justify-between items-center text-sm bg-gray-50 border-t">
                <div className="text-gray-600">
                  Affichage de {filteredPermits.length === 0 ? 0 : startIndex + 1} à {endIndex} sur {filteredPermits.length} permis
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
              </>
            ) : (
              <div className="p-8 text-center text-gray-500">Aucun permis trouvé</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Permit Form Modal */}
      {showAddForm && (
        <PermitForm
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Permit Details Modal */}
      {selectedPermitId && (
        <PermitDetails
          permitId={selectedPermitId}
          open={!!selectedPermitId}
          onClose={() => setSelectedPermitId(null)}
        />
      )}
    </>
  );
}
