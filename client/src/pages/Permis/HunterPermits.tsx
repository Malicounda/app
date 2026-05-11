import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Printer, Search, FileBox, FileDown, Calendar, Eye, Download, Info, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { format, isAfter, isBefore, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";

// Interface pour les pièces jointes
interface Attachment {
  id: number;
  name: string;
  type: string;
  url: string;
  uploadDate: string;
}

// Interface pour la campagne cynégétique
interface Campaign {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  year: string;
  status: 'active' | 'inactive' | 'upcoming' | 'completed';
}

// Interface pour les permis
interface Permit {
  id: number;
  permitNumber: string;
  receiptNumber: string; // Numéro de quittance
  hunterId: number;
  issueDate: string;
  expiryDate: string;
  status: 'active' | 'expired' | 'suspended';
  price: number;
  type: string;
  area?: string;
  zone?: string;
  issuedBy: string; // Secteur ou Inspection émetteur
  renewalCount: number; // Nombre de renouvellements
  campaignId: number; // ID de la campagne cynégétique associée
  campaign?: Campaign; // Détails de la campagne
  attachments: Attachment[]; // Pièces jointes
  history?: Permit[]; // Historique des permis précédents
}

// Interface pour le profil du chasseur
interface Hunter {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  category: 'resident' | 'coutumier' | 'touristique';
  nationality: string;
  region: string;
  department: string;
  birthDate: string;
  permitCount: number;
}

export default function HunterPermits() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // États locaux
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);
  const [viewAttachmentUrl, setViewAttachmentUrl] = useState<string | null>(null);
  const [viewAttachmentName, setViewAttachmentName] = useState<string>("");
  const [activeTab, setActiveTab] = useState("active");

  // Récupération des permis du chasseur
  const { data: permits, isLoading: permitsLoading, error: permitsError, refetch: refetchPermits } = useQuery<Permit[]>({
    queryKey: ['/api/hunters/me/permits'],
    queryFn: () => apiRequest({
      url: `/api/hunters/me/permits`,
      method: 'GET',
    }),
    enabled: !!user?.hunter?.id,
  });

  // Récupération du profil du chasseur
  const { data: hunterProfile, isLoading: profileLoading } = useQuery<Hunter>({
    queryKey: ['/api/hunters/me'],
    queryFn: () => apiRequest({
      url: `/api/hunters/me`,
      method: 'GET',
    }),
    enabled: !!user?.hunter?.id,
  });

  // Filtrer les permis par statut et terme de recherche
  const filteredPermits = useMemo(() => {
    if (!permits) return [];
    
    return permits.filter(permit => {
      // Filtrer par statut selon l'onglet actif
      const statusMatch = 
        (activeTab === "active" && permit.status === "active") ||
        (activeTab === "expired" && permit.status === "expired") ||
        (activeTab === "suspended" && permit.status === "suspended") ||
        (activeTab === "all");
      
      // Filtrer par terme de recherche
      const searchMatch = 
        !searchTerm || 
        permit.permitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permit.receiptNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        permit.type.toLowerCase().includes(searchTerm.toLowerCase());
      
      return statusMatch && searchMatch;
    });
  }, [permits, activeTab, searchTerm]);

  // Fonction pour formater le type de permis
  const formatPermitType = (type: string) => {
    switch (type) {
      case "sportif-petite-chasse": return "Permis sportif de petite chasse";
      case "grande-chasse": return "Permis de grande chasse";
      case "special-gibier-eau": return "Permis spécial gibier d'eau";
      default: return type;
    }
  };

  // Fonction pour obtenir la couleur du badge selon le statut
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-800 hover:bg-green-200";
      case "expired": return "bg-gray-100 text-gray-800 hover:bg-gray-200";
      case "suspended": return "bg-red-100 text-red-800 hover:bg-red-200";
      default: return "bg-blue-100 text-blue-800 hover:bg-blue-200";
    }
  };

  // Fonction pour obtenir l'icône selon le statut
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active": return <CheckCircle className="h-4 w-4 text-green-600" />;
      case "expired": return <Clock className="h-4 w-4 text-gray-600" />;
      case "suspended": return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  // Fonction pour afficher le détail d'un permis
  const handleViewPermit = (permit: Permit) => {
    setSelectedPermit(permit);
  };

  // Fonction pour afficher une pièce jointe
  const handleViewAttachment = (url: string, name: string) => {
    setViewAttachmentUrl(url);
    setViewAttachmentName(name);
  };

  // Fonction pour télécharger une pièce jointe
  const handleDownloadAttachment = (url: string, name: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fonction pour formater la date
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd MMMM yyyy', { locale: fr });
    } catch (error) {
      return dateString;
    }
  };

  // Fonction pour obtenir le label du type de pièce jointe
  const getAttachmentTypeLabel = (type: string) => {
    switch (type) {
      case "receipt": return "Quittance de paiement de la taxe du permis";
      case "tax-stamp": return "Timbre fiscal de l'impôt";
      case "weapon-tax": return "Quittance de paiement de la taxe sur l'arme";
      case "rc-chasse": return "Document RC-Chasse";
      default: return type;
    }
  };

  // Fonction pour vérifier si un permis est renouvelable
  const isPermitRenewable = (permit: Permit) => {
    if (permit.status !== "active") return false;
    if (permit.renewalCount >= 2) return false; // Maximum 2 renouvellements par an
    
    // Vérifier si la date d'expiration est atteinte
    const expiryDate = permit.expiryDate ? new Date(permit.expiryDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normaliser à minuit
    if (expiryDate && expiryDate > today) {
      return false; // Le permis ne peut être renouvelé qu'après sa date d'expiration
    }
    
    // Vérifier si la campagne est active
    if (permit.campaign && permit.campaign.status !== "active") return false;
    
    return true;
  };

  // Fonction pour obtenir le message de non-renouvellement
  const getRenewalBlockedMessage = (permit: Permit) => {
    if (permit.status !== "active") {
      return "Le permis doit être actif pour être renouvelé";
    }
    if (permit.renewalCount >= 2) {
      return "Nombre maximal de renouvellements atteint (maximum 2 renouvellements par an)";
    }
    
    // Vérifier si la date d'expiration est atteinte
    const expiryDate = permit.expiryDate ? new Date(permit.expiryDate) : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expiryDate && expiryDate > today) {
      const formattedDate = format(expiryDate, 'dd/MM/yyyy', { locale: fr });
      return `Le renouvellement n'est possible qu'après la date d'expiration (${formattedDate})`;
    }
    
    if (permit.campaign && permit.campaign.status !== "active") {
      return "La campagne cynégétique associée n'est pas active";
    }
    
    return "";
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Mes Permis de Chasse</h1>
          <p className="text-gray-500">
            Consultez et gérez vos permis de chasse
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Rechercher un permis..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full md:w-64"
          />
          <Button variant="outline" size="icon" onClick={() => refetchPermits()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="active">Actifs</TabsTrigger>
          <TabsTrigger value="expired">Expirés</TabsTrigger>
          <TabsTrigger value="suspended">Suspendus</TabsTrigger>
          <TabsTrigger value="all">Tous</TabsTrigger>
        </TabsList>

        {permitsLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : permitsError ? (
          <Card className="bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <p>Une erreur est survenue lors du chargement des permis.</p>
              </div>
            </CardContent>
          </Card>
        ) : filteredPermits.length === 0 ? (
          <Card>
            <CardContent className="pt-6 flex flex-col items-center justify-center h-64">
              <FileBox className="h-16 w-16 text-gray-300 mb-4" />
              <p className="text-gray-500 text-center">
                {searchTerm 
                  ? "Aucun permis ne correspond à votre recherche." 
                  : activeTab === "all" 
                    ? "Vous n'avez pas encore de permis." 
                    : `Vous n'avez pas de permis ${activeTab === "active" ? "actifs" : activeTab === "expired" ? "expirés" : "suspendus"}.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredPermits.map((permit) => (
              <Card key={permit.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg font-semibold">{formatPermitType(permit.type)}</CardTitle>
                    <Badge className={getStatusBadgeColor(permit.status)} variant="outline">
                      <span className="flex items-center gap-1">
                        {getStatusIcon(permit.status)}
                        {permit.status === "active" ? "Actif" : permit.status === "expired" ? "Expiré" : "Suspendu"}
                      </span>
                    </Badge>
                  </div>
                  <CardDescription>
                    <span className="font-medium">N° {permit.permitNumber}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="pb-2">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">N° Quittance:</span>
                      <span className="font-medium">{permit.receiptNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Émis le:</span>
                      <span>{formatDate(permit.issueDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Expire le:</span>
                      <span>{formatDate(permit.expiryDate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Émis par:</span>
                      <span>{permit.issuedBy}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Campagne:</span>
                      <span>{permit.campaign?.year || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Renouvellements:</span>
                      <span>{permit.renewalCount}/2</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pt-2">
                  <Button variant="outline" className="w-full" onClick={() => handleViewPermit(permit)}>
                    <Eye className="h-4 w-4 mr-2" />
                    Voir les détails
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </Tabs>

      {/* Modal de détail du permis */}
      {selectedPermit && (
        <Dialog open={!!selectedPermit} onOpenChange={(open) => !open && setSelectedPermit(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-xl flex items-center gap-2">
                <span>Détails du Permis</span>
                <Badge className={getStatusBadgeColor(selectedPermit.status)} variant="outline">
                  <span className="flex items-center gap-1">
                    {getStatusIcon(selectedPermit.status)}
                    {selectedPermit.status === "active" ? "Actif" : selectedPermit.status === "expired" ? "Expiré" : "Suspendu"}
                  </span>
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6">
              {/* Informations principales */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Informations du Permis</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Type de permis:</span>
                        <span className="font-medium">{formatPermitType(selectedPermit.type)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">N° de permis:</span>
                        <span className="font-medium">{selectedPermit.permitNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">N° de quittance:</span>
                        <span className="font-medium">{selectedPermit.receiptNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date d'émission:</span>
                        <span>{formatDate(selectedPermit.issueDate)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Date d'expiration:</span>
                        <span>{formatDate(selectedPermit.expiryDate)}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Émis par:</span>
                        <span>{selectedPermit.issuedBy}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Département:</span>
                        <span>{selectedPermit.zone || "N/A"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Campagne:</span>
                        <span>{selectedPermit.campaign?.name || "N/A"} ({selectedPermit.campaign?.year || "N/A"})</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Renouvellements:</span>
                        <span>{selectedPermit.renewalCount}/2</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Montant payé:</span>
                        <span>{selectedPermit.price.toLocaleString()} FCFA</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pièces jointes */}
              <Accordion type="single" collapsible defaultValue="attachments">
                <AccordionItem value="attachments">
                  <AccordionTrigger>Pièces Jointes</AccordionTrigger>
                  <AccordionContent>
                    {selectedPermit.attachments && selectedPermit.attachments.length > 0 ? (
                      <div className="space-y-2">
                        {selectedPermit.attachments.map((attachment) => (
                          <div key={attachment.id} className="flex items-center justify-between p-2 border rounded-md">
                            <div className="flex items-center gap-2">
                              <FileBox className="h-5 w-5 text-blue-500" />
                              <span>{getAttachmentTypeLabel(attachment.type)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleViewAttachment(attachment.url, attachment.name)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDownloadAttachment(attachment.url, attachment.name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">Aucune pièce jointe disponible</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Historique des renouvellements */}
              <Accordion type="single" collapsible>
                <AccordionItem value="history">
                  <AccordionTrigger>Historique des Renouvellements</AccordionTrigger>
                  <AccordionContent>
                    {selectedPermit.history && selectedPermit.history.length > 0 ? (
                      <ScrollArea className="h-[200px]">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>N° Permis</TableHead>
                              <TableHead>Date d'émission</TableHead>
                              <TableHead>Date d'expiration</TableHead>
                              <TableHead>Statut</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedPermit.history.map((historyItem) => (
                              <TableRow key={historyItem.id}>
                                <TableCell>{historyItem.permitNumber}</TableCell>
                                <TableCell>{formatDate(historyItem.issueDate)}</TableCell>
                                <TableCell>{formatDate(historyItem.expiryDate)}</TableCell>
                                <TableCell>
                                  <Badge className={getStatusBadgeColor(historyItem.status)} variant="outline">
                                    <span className="flex items-center gap-1">
                                      {getStatusIcon(historyItem.status)}
                                      {historyItem.status === "active" ? "Actif" : historyItem.status === "expired" ? "Expiré" : "Suspendu"}
                                    </span>
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <p className="text-gray-500 text-center py-4">Aucun historique de renouvellement disponible</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Informations sur la campagne cynégétique */}
              <Accordion type="single" collapsible>
                <AccordionItem value="campaign">
                  <AccordionTrigger>Campagne Cynégétique</AccordionTrigger>
                  <AccordionContent>
                    {selectedPermit.campaign ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Nom de la campagne:</span>
                          <span>{selectedPermit.campaign.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Année:</span>
                          <span>{selectedPermit.campaign.year}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Date de début:</span>
                          <span>{formatDate(selectedPermit.campaign.startDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Date de fin:</span>
                          <span>{formatDate(selectedPermit.campaign.endDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Statut:</span>
                          <Badge 
                            className={
                              selectedPermit.campaign.status === "active" ? "bg-green-100 text-green-800" :
                              selectedPermit.campaign.status === "upcoming" ? "bg-blue-100 text-blue-800" :
                              selectedPermit.campaign.status === "completed" ? "bg-gray-100 text-gray-800" :
                              "bg-yellow-100 text-yellow-800"
                            }
                            variant="outline"
                          >
                            {selectedPermit.campaign.status === "active" ? "Active" :
                             selectedPermit.campaign.status === "upcoming" ? "À venir" :
                             selectedPermit.campaign.status === "completed" ? "Terminée" :
                             "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-4">Aucune information sur la campagne cynégétique disponible</p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>

            <DialogFooter className="flex justify-between items-center gap-2 mt-4">
              <Button variant="outline" onClick={() => setSelectedPermit(null)}>
                Fermer
              </Button>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline"
                  disabled={!isPermitRenewable(selectedPermit)}
                  title={!isPermitRenewable(selectedPermit) ? getRenewalBlockedMessage(selectedPermit) : "Renouveler ce permis"}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Renouveler
                </Button>
                <Button variant="default">
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimer
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal de visualisation des pièces jointes */}
      {viewAttachmentUrl && (
        <Dialog open={!!viewAttachmentUrl} onOpenChange={(open) => !open && setViewAttachmentUrl(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{viewAttachmentName}</DialogTitle>
            </DialogHeader>
            <div className="h-[70vh] w-full">
              <iframe src={viewAttachmentUrl} className="w-full h-full" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewAttachmentUrl(null)}>
                Fermer
              </Button>
              <Button onClick={() => handleDownloadAttachment(viewAttachmentUrl, viewAttachmentName)}>
                <Download className="h-4 w-4 mr-2" />
                Télécharger
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Composant RefreshCw pour le bouton de rafraîchissement
function RefreshCw(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
