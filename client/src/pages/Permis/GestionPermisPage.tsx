import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { PermitStatus, PermitWithHunterInfo, TypePermis } from '@/types/permis';
import { exportToCsv } from '@/utils/export';
import { PdfLibraryLoader, generatePdf } from '@/utils/pdfGenerator';
import { AlertCircle, AlertTriangle, BookPlus, CalendarX, Check, Clock, Eye, FileDown, FileText, Printer, Search, XCircle, XOctagon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

const permitStatutCouleurs: Record<PermitStatus, string> = {
  [PermitStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [PermitStatus.ACTIVE]: 'bg-green-100 text-green-800',
  [PermitStatus.EXPIRED]: 'bg-gray-100 text-gray-800',
  [PermitStatus.SUSPENDED]: 'bg-orange-100 text-orange-800',
  [PermitStatus.REVOKED]: 'bg-red-100 text-red-800',
  [PermitStatus.CANCELLED]: 'bg-red-200 text-red-900',
};

const permitStatutIcones: Record<PermitStatus, JSX.Element> = {
  [PermitStatus.PENDING]: <Clock className="h-4 w-4" />,
  [PermitStatus.ACTIVE]: <Check className="h-4 w-4" />,
  [PermitStatus.EXPIRED]: <CalendarX className="h-4 w-4" />,
  [PermitStatus.SUSPENDED]: <AlertTriangle className="h-4 w-4" />,
  [PermitStatus.REVOKED]: <XOctagon className="h-4 w-4" />,
  [PermitStatus.CANCELLED]: <XCircle className="h-4 w-4" />,
};

const typePermisLabels: Record<TypePermis, string> = {
  [TypePermis.PETITE_CHASSE_RESIDENT]: 'Petite Chasse (Résident)',
  [TypePermis.PETITE_CHASSE_COUTUMIER]: 'Petite Chasse (Coutumier)',
  [TypePermis.GRANDE_CHASSE]: 'Grande Chasse',
  [TypePermis.GIBIER_EAU]: 'Gibier d\'Eau',
  [TypePermis.SCIENTIFIQUE]: 'Scientifique',
  [TypePermis.CAPTURE_COMMERCIALE]: 'Capture Commerciale',
  [TypePermis.OISELLERIE]: 'Oisellerie',
  [TypePermis.PORT_ARME]: 'Port d\'Arme',
};

const GestionPermisPage = () => {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [permisList, setPermisList] = useState<PermitWithHunterInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [, setShowSuspended] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchPermis = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const response = await fetch('/api/permits', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (!response.ok) {
          throw new Error('Erreur lors du chargement des permis');
        }

        const data: PermitWithHunterInfo[] = await response.json();
        setPermisList(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermis();
  }, [user]);

  // Helpers: effective expiry and derived status
  const getEffectiveExpiry = (p: any) => (p?.computedEffectiveExpiry || p?.expiryDate || null);
  const isExpiredDerived = (p: any) => {
    const ee = getEffectiveExpiry(p);
    if (!ee) return false;
    const d = new Date(ee);
    return !isNaN(d.getTime()) && d < new Date();
  };
  const getDerivedStatus = (p: any): PermitStatus => {
    if (p?.status === PermitStatus.SUSPENDED) return PermitStatus.SUSPENDED;
    if (isExpiredDerived(p)) return PermitStatus.EXPIRED;
    return PermitStatus.ACTIVE;
  };

  const handleSearch = () => {
    // Le filtrage est basé sur la saisie, rien à faire ici
  };

  const handlePrint = () => {
    // Appliquer un style temporaire pour n'imprimer que le tableau (comme dans Permits.tsx)
    const style = document.createElement('style');
    style.id = 'print-style-gestion-permis';
    style.innerHTML = `
      @media print {
        @page { margin: 16mm 12mm; }
        body * { visibility: hidden; }
        #print-header-gestion-permis, #print-header-gestion-permis * { visibility: visible; }
        .overflow-x-auto, .overflow-x-auto * { visibility: visible; }
        .print\\:hidden { display: none !important; }
        .overflow-x-auto { position: absolute; left: 0; top: 0; width: 100%; }
        table { width: 100%; table-layout: auto; }
        th, td { white-space: normal !important; word-break: break-word; }
        /* Eviter les coupures de lignes sur plusieurs pages */
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr, th, td { page-break-inside: avoid; break-inside: avoid; }
        .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        /* Pied de page pagination */
        #print-footer-gestion-permis { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 11px; color: #6b7280; text-align: right; visibility: visible; }
        #print-footer-gestion-permis .page-number::after { content: "Page " counter(page) " / " counter(pages); }
        .hidden { display: table-cell !important; }
      }
    `;
    document.head.appendChild(style);

    // Insérer un en-tête (titre + date) visible uniquement à l'impression
    const header = document.createElement('div');
    header.id = 'print-header-gestion-permis';
    header.style.marginBottom = '12px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid #e5e7eb';
    header.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui;">
        <div style="font-size: 18px; font-weight: 700;">Gestion des Permis</div>
        <div style="font-size: 12px; color: #6b7280;">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
      </div>
    `;
    const tableWrapper = document.querySelector('.overflow-x-auto');
    if (tableWrapper && tableWrapper.parentElement) {
      tableWrapper.parentElement.insertBefore(header, tableWrapper);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }

    // Ajouter un pied de page pour la pagination (best-effort selon support navigateur)
    const footer = document.createElement('div');
    footer.id = 'print-footer-gestion-permis';
    footer.innerHTML = `<span class="page-number"></span>`;
    document.body.appendChild(footer);

    window.print();

    setTimeout(() => {
      const printStyle = document.getElementById('print-style-gestion-permis');
      if (printStyle) printStyle.remove();
      const hdr = document.getElementById('print-header-gestion-permis');
      if (hdr && hdr.parentElement) hdr.parentElement.removeChild(hdr);
      const ftr = document.getElementById('print-footer-gestion-permis');
      if (ftr && ftr.parentElement) ftr.parentElement.removeChild(ftr);
    }, 1000);
  };

  const handleExportPdf = () => {
    if (!filteredPermis) return;
    const tableColumns = ['N° Permis', 'Titulaire', 'Type', "Date d'émission", "Date d'expiration", 'Statut'];
    const tableData = filteredPermis.map((p) => [
      p.permitNumber,
      `${p.hunterFirstName || ''} ${p.hunterLastName || ''}`.trim(),
      (typePermisLabels[p.type as TypePermis] || p.type),
      new Date(p.issueDate).toLocaleDateString('fr-FR'),
      (() => { const ee = getEffectiveExpiry(p); return ee ? new Date(ee).toLocaleDateString('fr-FR') : ''; })(),
      getDerivedStatus(p),
    ]);
    generatePdf({
      title: 'Gestion des Permis',
      filename: `gestion-permis-${new Date().toISOString().slice(0,10)}.pdf`,
      tableColumns,
      tableData,
    });
  };

  const handleExportCsv = () => {
    if (!filteredPermis) return;
    const columns = [
      { key: 'permitNumber', label: 'N° Permis' },
      { key: 'holder', label: 'Titulaire' },
      { key: 'type', label: 'Type' },
      { key: 'issueDate', label: "Date d'émission" },
      { key: 'expiryDate', label: "Date d'expiration" },
      { key: 'status', label: 'Statut' },
    ];
    const rows = filteredPermis.map((p) => ({
      permitNumber: p.permitNumber,
      holder: `${p.hunterFirstName || ''} ${p.hunterLastName || ''}`.trim(),
      type: (typePermisLabels[p.type as TypePermis] || p.type),
      issueDate: new Date(p.issueDate).toLocaleDateString('fr-FR'),
      expiryDate: (() => { const ee = getEffectiveExpiry(p); return ee ? new Date(ee).toLocaleDateString('fr-FR') : ''; })(),
      status: getDerivedStatus(p),
    }));
    exportToCsv(`gestion-permis-${new Date().toISOString().slice(0,10)}.csv`, columns, rows);
  };


  const getPermitStatutBadge = (statut: PermitStatus) => (
    <div className="flex items-center">
      <Badge className={`${permitStatutCouleurs[statut]} flex items-center gap-1`}>
        {permitStatutIcones[statut]}
        {statut.charAt(0).toUpperCase() + statut.slice(1).replace('_', ' ')}
      </Badge>
    </div>
  );

  if (!user) {
    navigate('/login');
    return null;
  }

  const filteredPermis = permisList.filter(permis => {
    const hunterName = `${permis.hunterFirstName || ''} ${permis.hunterLastName || ''}`.toLowerCase();
    const permitNumber = permis.permitNumber.toLowerCase();
    const term = searchTerm.toLowerCase();

    const matchesSearchTerm = hunterName.includes(term) || permitNumber.includes(term);
    const matchesSuspendedFilter = true;

    return matchesSearchTerm && matchesSuspendedFilter;
  });

  // Pagination
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredPermis.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredPermis.length / itemsPerPage);
  const paginatedPermis = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredPermis.length);

  // Réinitialiser la page quand on change de recherche
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 py-2">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Gestion des Permis</h1>
            <p className="text-muted-foreground">
              Consultez et gérez tous les permis de chasse attribués.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/permis/nouveau')}>
              <BookPlus className="h-4 w-4 mr-2" />
              Ajouter un Permis
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 items-center">
            <div className="w-full sm:flex-1 px-0 sm:px-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Rechercher (N° permis, N° quittance, N° pièce, nom, téléphone)"
                  className="pl-8 w-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            <div className="w-full sm:w-auto px-0 sm:px-0 flex flex-wrap items-center gap-2 justify-end mt-2 sm:mt-0">
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
                <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm" disabled>
                  <FileDown className="h-4 w-4" />
                  PDF
                </Button>
              }>
                <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm" onClick={handleExportPdf}>
                  <FileDown className="h-4 w-4" />
                  PDF
                </Button>
              </PdfLibraryLoader>
              <Button variant="outline" className="flex items-center gap-2 px-3 py-2 text-sm" onClick={handleExportCsv}>
                <FileDown className="h-4 w-4" />
                CSV
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            <AlertCircle className="inline mr-2" />
            {error}
          </div>
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : filteredPermis.length === 0 ? (
              <div className="text-center p-12">
                <FileText className="mx-auto h-16 w-16 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">Aucun permis trouvé</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {searchTerm ? "Aucun permis ne correspond à votre recherche." : "Aucun permis n'a été attribué pour le moment."}
                </p>
                <div className="mt-6">
                  <Button onClick={() => navigate('/permis/nouveau')}>
                    Ajouter un Permis
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="w-full overflow-x-auto rounded-t-lg border">
                  <Table className="w-full min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>N° Permis</TableHead>
                        <TableHead>Titulaire</TableHead>
                        <TableHead>Type de permis</TableHead>
                        <TableHead>Date d'émission</TableHead>
                        <TableHead>Date d'expiration</TableHead>
                        <TableHead>Statut</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedPermis.map((permis) => (
                        <TableRow key={permis.id}>
                          <TableCell className="font-medium">{permis.permitNumber}</TableCell>
                          <TableCell>{permis.hunterFirstName} {permis.hunterLastName}</TableCell>
                          <TableCell>{typePermisLabels[permis.type as TypePermis] || permis.type}</TableCell>
                          <TableCell>
                            {new Date(permis.issueDate).toLocaleDateString('fr-FR')}
                          </TableCell>
                          <TableCell>
                            {(() => { const ee = getEffectiveExpiry(permis); return ee ? new Date(ee).toLocaleDateString('fr-FR') : ''; })()}
                          </TableCell>
                          <TableCell>
                            {getPermitStatutBadge(getDerivedStatus(permis))}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => navigate(`/permis/details/${permis.id}`)}
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filteredPermis.length > 0 && (
                  <div className="p-3 flex justify-between items-center text-sm bg-gray-50 border border-t-0 rounded-b-lg">
                    <div className="text-muted-foreground">
                      Affichage de {startIndex + 1} à {endIndex} sur {filteredPermis.length} permis
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        Précédent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                      >
                        Suivant
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default GestionPermisPage;
