import HunterDetails from "@/components/hunters/HunterDetails";
import HunterForm from "@/components/hunters/HunterForm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNationalHunters, useSectorHuntersCreatedByMe } from "@/lib/hooks/useHunters";
import { exportToCsv } from "@/utils/export";
import { isSectorSubRole } from "@/utils/navigation";
import { PdfLibraryLoader, generatePdf } from "@/utils/pdfGenerator";
import { useQueryClient } from "@tanstack/react-query";
import {
    Eye,
    FileDown,
    Plus,
    Printer,
    Search,
    User
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

// Type pour les chasseurs (simplifié pour l'exemple)
interface Hunter {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  idNumber: string;
  address: string;
  region?: string;
  departement?: string;
  category: string;
  profession: string;
  experience: number;
}

export default function SectorHunters() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("zone");
  const [searchSectorTerm, setSearchSectorTerm] = useState("");
  const [searchNationalTerm, setSearchNationalTerm] = useState("");
  const [selectedHunterId, setSelectedHunterId] = useState<number | null>(null);
  const [showAddHunterForm, setShowAddHunterForm] = useState(false);
  const [location, navigate] = useLocation();

  // Vérifier si un onglet spécifique est demandé via l'URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split("?")[1]);
    const tab = searchParams.get("tab");
    if (tab === "all") {
      setActiveTab("all");
    }
  }, [location]);

  // Récupérer les chasseurs créés par l'utilisateur (secteur) et la liste nationale
  const { mySectorHunters, isLoading: isLoadingSector, error: errorSector } = useSectorHuntersCreatedByMe();
  const { nationalHunters, nationalLoading, nationalError } = useNationalHunters();

  // Déterminer quels chasseurs afficher pour l'onglet secteur (créés par moi)
  const hunters = mySectorHunters;
  const isLoading = isLoadingSector;
  const error = errorSector;

  // Filtrer les chasseurs par terme de recherche
  const huntersList: Hunter[] = Array.isArray(hunters) ? (hunters as Hunter[]) : [];
  const filteredHunters = huntersList.filter((hunter: Hunter) => {
    const searchLower = searchSectorTerm.toLowerCase();
    return (
      hunter.firstName?.toLowerCase().includes(searchLower) ||
      hunter.lastName?.toLowerCase().includes(searchLower) ||
      hunter.idNumber?.toLowerCase().includes(searchLower) ||
      hunter.phone?.includes(searchSectorTerm)
    );
  });

  const nationalList: Hunter[] = Array.isArray(nationalHunters) ? (nationalHunters as Hunter[]) : [];
  const filteredNationalHunters = nationalList.filter((hunter: Hunter) => {
    const searchLower = searchNationalTerm.toLowerCase();
    return (
      hunter.firstName?.toLowerCase().includes(searchLower) ||
      hunter.lastName?.toLowerCase().includes(searchLower) ||
      hunter.idNumber?.toLowerCase().includes(searchLower) ||
      hunter.phone?.includes(searchNationalTerm) ||
      hunter.region?.toLowerCase?.().includes(searchLower) ||
      (hunter as any)?.departement?.toLowerCase?.().includes(searchLower)
    );
  });

  // Affichage conditionnel de la colonne Département pour la liste nationale
  const isSectorAgent = isSectorSubRole(user?.role);
  const showDepartementCol = !isSectorAgent;

  // Fonction pour envoyer un SMS à un chasseur
  const sendSmsToHunter = (hunterId: number) => {
    // Stocker l'id du chasseur dans le localStorage pour le récupérer dans la page SMS
    localStorage.setItem('smsRecipientId', hunterId.toString());
    navigate("/sms");
  };

  // Impression (scopée) d'un conteneur
  const printTable = (containerSelector: string) => {
    const style = document.createElement('style');
    style.id = 'print-style-hunters';
    style.innerHTML = `
      @media print {
        body * { visibility: hidden; }
        ${containerSelector}, ${containerSelector} * { visibility: visible; }
        ${containerSelector} { position: absolute; left: 0; top: 0; width: 100%; }
        .print\\:hidden { display: none !important; }
        table { width: 100%; }
      }
    `;
    document.head.appendChild(style);
    window.print();
    setTimeout(() => document.getElementById('print-style-hunters')?.remove(), 800);
  };

  // Exports PDF/CSV pour l'onglet secteur
  const exportSectorPdf = () => {
    if (!filteredHunters) return;
    const cols = ["ID", "Nom", "Prénom", "N° ID", "Téléphone", "Catégorie"];
    const data = filteredHunters.map(h => [
      String(h.id),
      h.lastName,
      h.firstName,
      h.idNumber,
      h.phone,
      h.category,
    ]);
    generatePdf({
      title: "Chasseurs enregistrés (Secteur)",
      filename: `chasseurs-secteur-${new Date().toISOString().slice(0,10)}.pdf`,
      tableColumns: cols,
      tableData: data,
    });
    toast({ title: "PDF", description: "Le PDF a été généré." });
  };

  const exportSectorCsv = () => {
    if (!filteredHunters) return;
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'lastName', label: 'Nom' },
      { key: 'firstName', label: 'Prénom' },
      { key: 'idNumber', label: "N° ID" },
      { key: 'phone', label: 'Téléphone' },
      { key: 'category', label: 'Catégorie' },
    ];
    const rows = filteredHunters.map(h => ({
      id: String(h.id),
      lastName: h.lastName,
      firstName: h.firstName,
      idNumber: h.idNumber,
      phone: h.phone,
      category: h.category,
    }));
    exportToCsv(`chasseurs-secteur-${new Date().toISOString().slice(0,10)}.csv`, columns, rows);
    toast({ title: "Export CSV", description: "Le fichier a été téléchargé." });
  };

  // Exports PDF/CSV pour l'onglet national
  const exportNationalPdf = () => {
    if (!filteredNationalHunters) return;
    // Remove internal DB ID from exported columns (not needed for external lists)
    const cols = showDepartementCol
      ? ["Nom", "Prénom", "N° ID", "Téléphone", "Région", "Département", "Catégorie"]
      : ["Nom", "Prénom", "N° ID", "Téléphone", "Région", "Catégorie"];
    const data = filteredNationalHunters.map(h => {
      const base = [
        h.lastName,
        h.firstName,
        h.idNumber,
        h.phone,
        (h as any)?.region || '',
      ];
      return showDepartementCol
        ? [...base, (h as any)?.departement || '', h.category]
        : [...base, h.category];
    });
    generatePdf({
      title: "Liste Nationale des Chasseurs",
      filename: `chasseurs-nationaux-${new Date().toISOString().slice(0,10)}.pdf`,
      tableColumns: cols,
      tableData: data,
    });
    toast({ title: "PDF", description: "Le PDF a été généré." });
  };

  const exportNationalCsv = () => {
    if (!filteredNationalHunters) return;
    // Omit internal ID from CSV export to match UI
    const columns = showDepartementCol
      ? [
          { key: 'lastName', label: 'Nom' },
          { key: 'firstName', label: 'Prénom' },
          { key: 'idNumber', label: "N° ID" },
          { key: 'phone', label: 'Téléphone' },
          { key: 'region', label: 'Région' },
          { key: 'departement', label: 'Département' },
          { key: 'category', label: 'Catégorie' },
        ]
      : [
          { key: 'lastName', label: 'Nom' },
          { key: 'firstName', label: 'Prénom' },
          { key: 'idNumber', label: "N° ID" },
          { key: 'phone', label: 'Téléphone' },
          { key: 'region', label: 'Région' },
          { key: 'category', label: 'Catégorie' },
        ];
    const rows = filteredNationalHunters.map(h => {
      const base: any = {
        lastName: h.lastName,
        firstName: h.firstName,
        idNumber: h.idNumber,
        phone: h.phone,
        region: (h as any)?.region || '',
        category: h.category,
      };
      if (showDepartementCol) {
        (base as any).departement = (h as any)?.departement || '';
      }
      return base;
    });
    exportToCsv(`chasseurs-nationaux-${new Date().toISOString().slice(0,10)}.csv`, columns, rows);
    toast({ title: "Export CSV", description: "Le fichier a été téléchargé." });
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Gestion des Chasseurs</h1>
          <p className="text-muted-foreground">
            {activeTab === "zone"
              ? "Consultez les chasseurs enregistrés par votre secteur (portée selon vos autorisations)"
              : "Consultez la liste nationale des chasseurs"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="zone" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger
            value="zone"
            onClick={() => {
              setActiveTab("zone");
              // Lien vers la même page pour rester sur l'onglet "Chasseurs du Secteur"
              navigate("/sector-hunters");
            }}
          >
            Chasseurs Enregistrés (Par le secteur)
          </TabsTrigger>
          <TabsTrigger
            value="all"
            onClick={() => {
              setActiveTab("all");
              // Lien avec la barre latérale "Gestion Chasseurs"
              navigate("/sector-hunters?tab=all");
            }}
          >
            Liste Nationale des Chasseurs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="zone" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="flex items-center space-x-3">
                  <CardTitle>Chasseurs Enregistrés (Par le secteur)</CardTitle>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Portée: Secteur (créés par vous)</span>
                  <span className="text-xs text-muted-foreground">{filteredHunters.length} résultat(s)</span>
                </div>
                <div className="flex space-x-2 mt-2 md:mt-0">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher (liste du secteur)..."
                      className="pl-8"
                      value={searchSectorTerm}
                      onChange={(e) => setSearchSectorTerm(e.target.value)}
                    />
                  </div>
                  {(user && ["admin","agent","sub-agent","brigade","triage","poste-control","sous-secteur"].includes(user.role)) && (
                    <Button onClick={() => setShowAddHunterForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un Chasseur
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => printTable('#sector-hunters-table')}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimer
                  </Button>
                  <PdfLibraryLoader fallback={
                    <Button variant="outline" disabled>
                      <FileDown className="h-4 w-4 mr-2" /> PDF
                    </Button>
                  }>
                    <Button variant="outline" onClick={exportSectorPdf}>
                      <FileDown className="h-4 w-4 mr-2" /> PDF
                    </Button>
                  </PdfLibraryLoader>
                  <Button variant="outline" onClick={exportSectorCsv}>
                    <FileDown className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <p>Chargement des chasseurs...</p>
                </div>
              ) : error ? (
                <div className="flex justify-center items-center h-32">
                  <p className="text-destructive">
                    Erreur lors du chargement des chasseurs. Veuillez réessayer.
                  </p>
                </div>
              ) : filteredHunters.length === 0 ? (
                <div className="flex justify-center items-center h-32">
                  <p>Aucun chasseur trouvé.</p>
                </div>
              ) : (
                <div className="overflow-x-auto" id="sector-hunters-table">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">ID</th>
                        <th className="text-left py-2 px-2">Nom</th>
                        <th className="text-left py-2 px-2">Prénom</th>
                        <th className="text-left py-2 px-2">N° d'identification</th>
                        <th className="text-left py-2 px-2">Téléphone</th>
                        <th className="text-left py-2 px-2">Catégorie</th>
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHunters.map((hunter: Hunter) => (
                        <tr key={hunter.id} className="border-b">
                          <td className="py-2 px-2">{hunter.id}</td>
                          <td className="py-2 px-2">{hunter.lastName}</td>
                          <td className="py-2 px-2">{hunter.firstName}</td>
                          <td className="py-2 px-2">{hunter.idNumber}</td>
                          <td className="py-2 px-2">{hunter.phone}</td>
                          <td className="py-2 px-2">
                            <Badge variant={
                              hunter.category === 'resident' ? 'default' :
                              hunter.category === 'coutumier' ? 'secondary' :
                              hunter.category === 'touristique' ? 'destructive' : 'outline'
                            }>
                              {hunter.category === 'resident' ? 'Résident' :
                               hunter.category === 'coutumier' ? 'Coutumier' :
                               hunter.category === 'touristique' ? 'Touristique' : hunter.category}
                            </Badge>
                          </td>
                          <td className="py-2 px-2">
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedHunterId(hunter.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Voir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div className="flex items-center space-x-3">
                  <CardTitle>Liste Nationale des Chasseurs</CardTitle>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Portée: Nationale</span>
                  <span className="text-xs text-muted-foreground">{filteredNationalHunters.length} résultat(s)</span>
                </div>
                <div className="flex space-x-2 mt-2 md:mt-0">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher (liste nationale)..."
                      className="pl-8"
                      value={searchNationalTerm}
                      onChange={(e) => setSearchNationalTerm(e.target.value)}
                    />
                  </div>
                  {(user && ["admin","agent","sub-agent","brigade","triage","poste-control","sous-secteur"].includes(user.role)) && (
                    <Button onClick={() => setShowAddHunterForm(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter un Chasseur
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => printTable('#national-hunters-table')}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimer
                  </Button>
                  <PdfLibraryLoader fallback={
                    <Button variant="outline" disabled>
                      <FileDown className="h-4 w-4 mr-2" /> PDF
                    </Button>
                  }>
                    <Button variant="outline" onClick={exportNationalPdf}>
                      <FileDown className="h-4 w-4 mr-2" /> PDF
                    </Button>
                  </PdfLibraryLoader>
                  <Button variant="outline" onClick={exportNationalCsv}>
                    <FileDown className="h-4 w-4 mr-2" /> CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {nationalLoading ? (
                <div className="flex justify-center items-center h-32">
                  <p>Chargement des chasseurs...</p>
                </div>
              ) : nationalError ? (
                <div className="flex justify-center items-center h-32">
                  <p className="text-destructive text-center">
                    Erreur lors du chargement des chasseurs. Il est possible que l'accès à la liste nationale soit désactivé par l'administrateur.
                  </p>
                </div>
              ) : filteredNationalHunters.length === 0 ? (
                <div className="flex justify-center items-center h-32">
                  <p>Aucun chasseur trouvé.</p>
                </div>
              ) : (
                <div className="overflow-x-auto" id="national-hunters-table">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Nom</th>
                        <th className="text-left py-2 px-2">Prénom</th>
                        <th className="text-left py-2 px-2">N° d'identification</th>
                        <th className="text-left py-2 px-2">Téléphone</th>
                        <th className="text-left py-2 px-2">Région</th>
                        {showDepartementCol && (
                          <th className="text-left py-2 px-2">Département</th>
                        )}
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredNationalHunters.map((hunter: Hunter) => (
                        <tr key={hunter.id} className="border-b">
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="bg-amber-100 text-amber-600">
                                  <User className="h-3.5 w-3.5" />
                                </AvatarFallback>
                              </Avatar>
                              <span>{hunter.lastName}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">{hunter.firstName}</td>
                          <td className="py-2 px-2">{hunter.idNumber}</td>
                          <td className="py-2 px-2">{hunter.phone}</td>
                          <td className="py-2 px-2">{hunter.region || "Non définie"}</td>
                          {showDepartementCol && (
                            <td className="py-2 px-2">{(hunter as any)?.departement || "Non défini"}</td>
                          )}
                          <td className="py-2 px-2">
                            <div className="flex space-x-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedHunterId(hunter.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Voir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedHunterId && (
        <HunterDetails
          hunterId={selectedHunterId}
          open={!!selectedHunterId}
          onClose={() => setSelectedHunterId(null)}
        />
      )}

      {/* Formulaire d'ajout de chasseur */}
      <HunterForm
        open={showAddHunterForm}
        onClose={() => setShowAddHunterForm(false)}
      />
    </div>
  );
}
