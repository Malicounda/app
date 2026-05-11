import TaxForm from "@/components/taxes/TaxForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTaxes } from "@/lib/hooks/useTaxes";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { exportToCsv } from "@/utils/export";
import { isSectorSubRole } from "@/utils/navigation";
import { PdfLibraryLoader, generatePdf } from "@/utils/pdfGenerator";
import { format } from "date-fns";
import { Coins, FileDown, FileText, Pencil, Printer, Search, Trash } from "lucide-react";
import { useEffect, useState } from "react";

export default function Taxes() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editTaxId, setEditTaxId] = useState<number | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [deleteTaxId, setDeleteTaxId] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { taxes, isLoading, error } = useTaxes();

  // Type local minimal pour correspondre aux champs utilisés dans ce composant
  interface Tax {
    id: number;
    taxNumber: string;
    hunterId: number;
    permitId: number;
    issueDate: string;
    animalType: string;
    quantity: number;
    receiptNumber: string;
    amount: number | string;
    // Informations du chasseur
    hunterFirstName?: string;
    hunterLastName?: string;
    hunterIdNumber?: string;
    hunterNationality?: string; // ajouté pour afficher la nationalité
    // Informations du permis
    permitNumber?: string;
    permitType?: string;
    permitStatus?: string;
  }

  const list: Tax[] = Array.isArray(taxes) ? (taxes as unknown as Tax[]) : [];

  const filteredTaxes = list.filter((tax: Tax) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      tax.taxNumber.toLowerCase().includes(searchLower) ||
      tax.receiptNumber.toLowerCase().includes(searchLower) ||
      tax.animalType.toLowerCase().includes(searchLower) ||
      `${tax.hunterFirstName} ${tax.hunterLastName}`.toLowerCase().includes(searchLower) ||
      tax.hunterIdNumber?.toLowerCase().includes(searchLower) ||
      tax.hunterNationality?.toLowerCase().includes(searchLower) ||
      tax.permitNumber?.toLowerCase().includes(searchLower) ||
      // Some tax records may store the quittance/receipt number under different keys
      (tax as any).receiptNumber?.toString().toLowerCase().includes(searchLower) ||
      (tax as any).quittance?.toString().toLowerCase().includes(searchLower) ||
      (tax as any).receipt?.toString().toLowerCase().includes(searchLower)
    );
  });

  // Pagination
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredTaxes.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredTaxes.length / itemsPerPage);
  const paginatedTaxes = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTaxes.length);

  // Réinitialiser la page quand on change de recherche
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const handleSearch = () => {
    // Client-side filtering is already happening with the state change
  };

  const handlePrint = () => {
    // Appliquer une feuille de style temporaire pour n'imprimer que la table
    const style = document.createElement('style');
    style.id = 'print-style-taxes';
    style.innerHTML = `
      @media print {
        @page { size: landscape; margin: 16mm 12mm; }
        body * { visibility: hidden; }
        #print-header-taxes, #print-header-taxes * { visibility: visible; }
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
        #print-footer-taxes { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 11px; color: #6b7280; text-align: right; visibility: visible; }
        #print-footer-taxes .page-number::after { content: "Page " counter(page) " / " counter(pages); }
        .hidden { display: table-cell !important; }
      }
    `;
    document.head.appendChild(style);

    // Insérer un en-tête (titre + date) visible uniquement à l'impression
    const header = document.createElement('div');
    header.id = 'print-header-taxes';
    header.style.marginBottom = '12px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid #e5e7eb';
    header.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui;">
        <div style="font-size: 18px; font-weight: 700;">Liste des Taxes d'Abattage</div>
        <div style="font-size: 12px; color: #6b7280;">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
      </div>
    `;
    const tableWrapper = document.querySelector('.overflow-x-auto');
    if (tableWrapper && tableWrapper.parentElement) {
      tableWrapper.parentElement.insertBefore(header, tableWrapper);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }

    // Pied de page de pagination
    const footer = document.createElement('div');
    footer.id = 'print-footer-taxes';
    footer.innerHTML = `<span class="page-number"></span>`;
    document.body.appendChild(footer);

    window.print();

    setTimeout(() => {
      const printStyle = document.getElementById('print-style-taxes');
      if (printStyle) printStyle.remove();
      const hdr = document.getElementById('print-header-taxes');
      if (hdr && hdr.parentElement) hdr.parentElement.removeChild(hdr);
      const ftr = document.getElementById('print-footer-taxes');
      if (ftr && ftr.parentElement) ftr.parentElement.removeChild(ftr);
    }, 1000);
  };

  const handleExportPdf = () => {
    if (!filteredTaxes) return;
    const tableColumns = [
      "N° Taxe",
      "Date",
      "Animal",
      "Quantité",
      "N° Quittance",
      "Chasseur",
      "Permis",
      "Montant",
    ];
    const tableData = filteredTaxes.map((t) => [
      t.taxNumber,
      format(new Date(t.issueDate), "dd/MM/yyyy"),
      t.animalType,
      String(t.quantity),
      t.receiptNumber,
      `${t.hunterFirstName ?? ''} ${t.hunterLastName ?? ''}`.trim(),
      t.permitNumber ? `${t.permitNumber} (${t.permitType ?? ''})` : "",
      `${Number(t.amount).toLocaleString()} FCFA`,
    ]);
    generatePdf({
      title: "Liste des Taxes d'Abattage",
      filename: `taxes-${format(new Date(), "yyyy-MM-dd")}.pdf`,
      tableColumns,
      tableData,
    });
    toast({ title: "PDF", description: "Le PDF a été généré." });
  };

  const handleExportCsv = () => {
    if (!filteredTaxes) return;
    const columns = [
      { key: "taxNumber", label: "N° Taxe" },
      { key: "date", label: "Date" },
      { key: "animal", label: "Animal" },
      { key: "quantity", label: "Quantité" },
      { key: "receiptNumber", label: "N° Quittance" },
      { key: "hunter", label: "Chasseur" },
      { key: "permit", label: "Permis" },
      { key: "amount", label: "Montant" },
    ];
    const rows = filteredTaxes.map((t) => ({
      taxNumber: t.taxNumber,
      date: format(new Date(t.issueDate), "dd/MM/yyyy"),
      animal: t.animalType,
      quantity: String(t.quantity),
      receiptNumber: t.receiptNumber,
      hunter: `${t.hunterFirstName ?? ''} ${t.hunterLastName ?? ''}`.trim(),
      permit: t.permitNumber ? `${t.permitNumber} (${t.permitType ?? ''})` : "",
      amount: Number(t.amount).toLocaleString('fr-FR'),
    }));
    exportToCsv(`taxes-${format(new Date(), "yyyy-MM-dd")}.csv`, columns, rows);
    toast({ title: "Export CSV", description: "Le fichier a été téléchargé." });
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <h1 className="text-2xl font-bold text-neutral-800 mb-4 md:mb-0">Gestion des Taxes d'Abattage</h1>
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Ajouter une Taxe
          </Button>
        </div>

        {/* Scope badge + results count (above filters) */}
        <div className="flex items-center gap-3 mt-1 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            {user?.role === 'agent'
              ? `Portée: Régionale${user?.region ? ` (${user.region})` : ''}`
              : isSectorSubRole(user?.role)
                ? `Portée: Département${(user as any)?.departement || user?.zone ? ` (${(user as any)?.departement || user?.zone})` : ''}`
                : 'Portée: Nationale'}
          </span>
          <span className="text-xs text-gray-600">• Résultats: {filteredTaxes?.length ?? 0}</span>
        </div>

        <Card className="border border-gray-200">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 items-center">
              <div className="w-full sm:flex-1 px-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    type="text"
                    placeholder="Rechercher (N° taxe, N° quittance, N° pièce, chasseur, permis)"
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-full sm:w-auto px-2 flex flex-wrap items-center gap-2 justify-end print:hidden">
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
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center">Chargement des taxes...</div>
            ) : error ? (
              <div className="p-8 text-center text-red-500">Erreur: Impossible de charger les taxes</div>
            ) : filteredTaxes && filteredTaxes.length > 0 ? (
              <div className="overflow-x-auto rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Taxe</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Animal</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantité</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">N° Quittance</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Informations</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                      {(user?.role === 'admin' || user?.role === 'agent' || isSectorSubRole(user?.role)) && (
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {paginatedTaxes.map((tax) => (
                      <tr key={tax.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tax.taxNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {format(new Date(tax.issueDate), "dd/MM/yyyy")}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">{tax.animalType}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tax.quantity}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tax.receiptNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="space-y-1">
                            <div className="font-medium text-gray-900">
                              {tax.hunterFirstName} {tax.hunterLastName}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {tax.hunterIdNumber}
                            </div>
                            <div className="text-xs text-gray-500">Nationalité: {tax.hunterNationality ?? 'Non renseignée'}</div>
                            {tax.permitNumber && (
                              <div className="text-xs text-blue-600">
                                Permis: {tax.permitNumber} ({tax.permitType})
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="flex items-center">{Number(tax.amount).toLocaleString()} <Coins className="ml-1 h-3 w-3 text-yellow-500" /> FCFA</span>
                        </td>
                        {(user?.role === 'admin' || user?.role === 'agent' || isSectorSubRole(user?.role)) && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                title="Modifier"
                                onClick={() => { setEditTaxId(tax.id); setShowEditForm(true); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {(user?.role === 'admin' || user?.role === 'agent') && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 border-red-200 hover:bg-red-50"
                                  title="Supprimer"
                                  onClick={() => { setDeleteTaxId(tax.id); setShowDeleteConfirm(true); }}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="p-3 flex justify-between items-center text-sm bg-gray-50 border-t">
                  <div className="text-muted-foreground">
                    {filteredTaxes.length > 0 ? `Affichage de ${startIndex + 1} à ${endIndex} sur ${filteredTaxes.length} taxes` : "Aucun résultat"}
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
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">Aucune taxe d'abattage trouvée</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Tax Form Modal */}
      {showAddForm && (
        <TaxForm
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
        />
      )}

      {/* Edit Tax Form Modal */}
      {showEditForm && editTaxId != null && (
        <TaxForm
          taxId={editTaxId}
          open={showEditForm}
          onClose={() => { setShowEditForm(false); setEditTaxId(null); }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la taxe</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Confirmez la suppression de cette taxe d'abattage.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>Annuler</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteTaxId) return;
                setIsDeleting(true);
                try {
                  await apiRequest({ url: `/api/taxes/${deleteTaxId}`, method: 'DELETE' });
                  await queryClient.invalidateQueries({ queryKey: ['/api/taxes'] });
                  setShowDeleteConfirm(false);
                  setDeleteTaxId(null);
                  toast({ title: 'Supprimée', description: 'La taxe a été supprimée avec succès.' });
                } catch (e: any) {
                  toast({ title: 'Erreur', description: e?.message || "Impossible de supprimer la taxe.", variant: 'destructive' });
                } finally {
                  setIsDeleting(false);
                }
              }}
              disabled={isDeleting}
            >
              {isDeleting ? 'Suppression...' : 'Supprimer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
