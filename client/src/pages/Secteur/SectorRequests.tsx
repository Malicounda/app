import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Printer, Search, Check, X, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermitRequests, usePermitRequestsByZone } from "@/lib/hooks/usePermitRequests";
import { useHunters } from "@/lib/hooks/useHunters";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PdfLibraryLoader, generatePdf } from "@/utils/pdfGenerator";
import { useLocation } from "wouter";

// Type pour les demandes de permis (ajustez selon votre schema)
interface PermitRequest {
  id: number;
  hunterId: number;
  status: "pending" | "approved" | "rejected";
  requestDate: string;
  type: string;
  category?: string;
  area?: string;
  zone?: string;
  pickupLocation?: string;
  receiptNumber?: string;
}

// Type pour les chasseurs
interface Hunter {
  id: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  phone: string;
}

export default function SectorRequests() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("sector");
  const [location, navigate] = useLocation();
  
  // Vérifier si un onglet spécifique est demandé via l'URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.split("?")[1]);
    const tab = searchParams.get("tab");
    if (tab === "all") {
      setActiveTab("all");
    }
  }, [location]);

  // Récupérer les demandes de permis et les chasseurs avec filtrage spécifique à la zone
  const { requests: allRequests, isLoading: allRequestsLoading, error: allRequestsError } = usePermitRequests();
  const { requests: sectorRequests, isLoading: sectorRequestsLoading, error: sectorRequestsError } = usePermitRequestsByZone(user?.zone || null);
  const { allHunters: hunters, huntersLoading, error: huntersError } = useHunters();

  const isLoading = allRequestsLoading || sectorRequestsLoading || huntersLoading;
  const error = allRequestsError || sectorRequestsError || huntersError;

  // Filtrer les demandes en fonction de la recherche et de l'onglet actif
  const filteredRequests = useMemo(() => {
    const requestsToFilter = activeTab === "sector" ? sectorRequests : allRequests || [];
    
    if (!searchTerm) return requestsToFilter;
    
    const searchLower = searchTerm.toLowerCase();
    return requestsToFilter.filter((request: PermitRequest) => {
      const hunter = hunters?.find((h) => h.id === request.hunterId);
      return (
        hunter?.firstName?.toLowerCase().includes(searchLower) ||
        hunter?.lastName?.toLowerCase().includes(searchLower) ||
        hunter?.idNumber?.toLowerCase().includes(searchLower) ||
        request.type?.toLowerCase().includes(searchLower) ||
        request.pickupLocation?.toLowerCase().includes(searchLower)
      );
    });
  }, [activeTab, sectorRequests, allRequests, searchTerm, hunters]);

  // Compter les différents statuts des demandes
  const requestsCounts = useMemo(() => {
    const requestsToCount = activeTab === "sector" ? sectorRequests : allRequests || [];
    return {
      pending: requestsToCount.filter(req => req.status === "pending").length,
      approved: requestsToCount.filter(req => req.status === "approved").length,
      rejected: requestsToCount.filter(req => req.status === "rejected").length,
      total: requestsToCount.length
    };
  }, [activeTab, sectorRequests, allRequests]);

  // Approuver une demande
  const handleApproveRequest = async (requestId: number) => {
    try {
      await apiRequest({ url: `/api/permit-requests/${requestId}/approve`, method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      toast({
        title: "Demande approuvée",
        description: "La demande de permis a été approuvée avec succès.",
      });
    } catch (error) {
      console.error("Erreur lors de l'approbation de la demande:", error);
      toast({
        title: "Erreur",
        description: "Impossible d'approuver la demande de permis.",
        variant: "destructive",
      });
    }
  };

  // Rejeter une demande
  const handleRejectRequest = async (requestId: number) => {
    try {
      await apiRequest({ url: `/api/permit-requests/${requestId}/reject`, method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      toast({
        title: "Demande rejetée",
        description: "La demande de permis a été rejetée.",
      });
    } catch (error) {
      console.error("Erreur lors du rejet de la demande:", error);
      toast({
        title: "Erreur",
        description: "Impossible de rejeter la demande de permis.",
        variant: "destructive",
      });
    }
  };

  // Exporter la liste des demandes en PDF
  const exportRequestsList = () => {
    toast({
      title: "Export en cours",
      description: "La liste des demandes est en cours d'exportation au format PDF.",
    });
    
    const requestsList = filteredRequests.map((request: PermitRequest) => {
      const hunter = hunters?.find((h) => h.id === request.hunterId);
      return {
        'Chasseur': hunter ? `${hunter.firstName} ${hunter.lastName}` : 'Inconnu',
        'ID Chasseur': hunter?.idNumber || 'N/A',
        'Date demande': format(new Date(request.requestDate), 'dd/MM/yyyy'),
        'Type': request.type || '-',
        'Catégorie': request.category || '-',
        'Département': request.zone || '-',
        'Lieu de retrait': request.pickupLocation || '-',
        'Statut': request.status === "pending" ? "En attente" : 
                  request.status === "approved" ? "Approuvée" : "Rejetée"
      } as const;
    });

    const columns = Object.keys(requestsList[0] || {});
    const body = requestsList.map((row) => columns.map((c) => (row as any)[c]));

    generatePdf({
      title: activeTab === "sector" ? "Demandes de Permis - Secteur" : "Demandes de Permis - National",
      filename: activeTab === "sector" ? "demandes-secteur.pdf" : "demandes-national.pdf",
      tableColumns: columns,
      tableData: body,
    });
    toast({
      title: "Export terminé",
      description: "La liste des demandes a été exportée avec succès.",
    });
  };

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Demandes de Permis</h1>
          <p className="text-muted-foreground">
            {activeTab === "sector" 
              ? "Gérez les demandes de permis pour votre secteur" 
              : "Consultez toutes les demandes de permis"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total des demandes</p>
              <h4 className="text-2xl font-bold">{requestsCounts.total}</h4>
            </div>
            <Badge variant="outline" className="text-xl px-3 py-1">
              {requestsCounts.total}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">En attente</p>
              <h4 className="text-2xl font-bold">{requestsCounts.pending}</h4>
            </div>
            <Badge variant="secondary" className="text-xl px-3 py-1">
              {requestsCounts.pending}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Approuvées</p>
              <h4 className="text-2xl font-bold">{requestsCounts.approved}</h4>
            </div>
            <Badge variant="default" className="text-xl px-3 py-1">
              {requestsCounts.approved}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Rejetées</p>
              <h4 className="text-2xl font-bold">{requestsCounts.rejected}</h4>
            </div>
            <Badge variant="destructive" className="text-xl px-3 py-1">
              {requestsCounts.rejected}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sector" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger 
            value="sector" 
            onClick={() => {
              setActiveTab("sector");
              navigate("/sector-requests?tab=sector");
            }}
          >
            Demande traitée
          </TabsTrigger>
          <TabsTrigger 
            value="all" 
            onClick={() => {
              setActiveTab("all");
              navigate("/sector-requests?tab=all");
            }}
          >
            Demande de Permis Régional
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sector" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
                <CardTitle>Demandes pour votre Département ({(user as any)?.departement || user?.zone || "Non défini"})</CardTitle>
                <div className="flex space-x-2 mt-2 md:mt-0">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher une demande..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={exportRequestsList}>
                    <Printer className="h-4 w-4 mr-2" />
                    Exporter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <p>Chargement des demandes...</p>
                </div>
              ) : error ? (
                <div className="flex justify-center items-center h-32">
                  <p className="text-destructive">
                    Erreur lors du chargement des demandes. Veuillez réessayer.
                  </p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="flex justify-center items-center h-32">
                  <p>Liste des demandes traitée par le secteur.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Chasseur</th>
                        <th className="text-left py-2 px-2">Téléphone</th>
                        <th className="text-left py-2 px-2">Date demande</th>
                        <th className="text-left py-2 px-2">Type de permis</th>
                        <th className="text-left py-2 px-2">Lieu de retrait</th>
                        <th className="text-left py-2 px-2">Statut</th>
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request: PermitRequest) => {
                        const hunter = hunters?.find((h) => h.id === request.hunterId);
                        return (
                          <tr key={request.id} className="border-b">
                            <td className="py-2 px-2">
                              {hunter ? `${hunter.firstName} ${hunter.lastName}` : "Inconnu"}
                            </td>
                            <td className="py-2 px-2">{hunter?.phone || "N/A"}</td>
                            <td className="py-2 px-2">
                              {format(new Date(request.requestDate), 'dd/MM/yyyy')}
                            </td>
                            <td className="py-2 px-2">{request.type || "Standard"}</td>
                            <td className="py-2 px-2">{request.pickupLocation || "Non défini"}</td>
                            <td className="py-2 px-2">
                              <Badge variant={
                                request.status === "pending" ? 'secondary' :
                                request.status === "approved" ? 'default' :
                                'destructive'
                              }>
                                {request.status === "pending" ? 'En attente' :
                                request.status === "approved" ? 'Approuvée' :
                                'Rejetée'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex space-x-2">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setSelectedRequestId(request.id)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Détails
                                </Button>
                                {request.status === "pending" && (
                                  <>
                                    <Button 
                                      variant="default" 
                                      size="sm" 
                                      onClick={() => handleApproveRequest(request.id)}
                                    >
                                      <Check className="h-4 w-4 mr-1" />
                                      Approuver
                                    </Button>
                                    <Button 
                                      variant="destructive" 
                                      size="sm"
                                      onClick={() => handleRejectRequest(request.id)}
                                    >
                                      <X className="h-4 w-4 mr-1" />
                                      Rejeter
                                    </Button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
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
                <CardTitle>Toutes les Demandes de Permis</CardTitle>
                <div className="flex space-x-2 mt-2 md:mt-0">
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher une demande..."
                      className="pl-8"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Button variant="outline" onClick={exportRequestsList}>
                    <Printer className="h-4 w-4 mr-2" />
                    Exporter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center items-center h-32">
                  <p>Chargement des demandes...</p>
                </div>
              ) : error ? (
                <div className="flex justify-center items-center h-32">
                  <p className="text-destructive">
                    Erreur lors du chargement des demandes. Veuillez réessayer.
                  </p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="flex justify-center items-center h-32">
                  <p>Aucune demande trouvée.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2">Chasseur</th>
                        <th className="text-left py-2 px-2">Date demande</th>
                        <th className="text-left py-2 px-2">Type</th>
                        <th className="text-left py-2 px-2">Département</th>
                        <th className="text-left py-2 px-2">Lieu de retrait</th>
                        <th className="text-left py-2 px-2">Statut</th>
                        <th className="text-left py-2 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((request) => {
                        const hunter = hunters?.find(h => h.id === request.hunterId);
                        return (
                          <tr key={request.id} className="border-b">
                            <td className="py-2 px-2">
                              {hunter ? `${hunter.firstName} ${hunter.lastName}` : "Inconnu"}
                            </td>
                            <td className="py-2 px-2">
                              {format(new Date(request.requestDate), 'dd/MM/yyyy')}
                            </td>
                            <td className="py-2 px-2">{request.type || "Standard"}</td>
                            <td className="py-2 px-2">{request.zone || "Non définie"}</td>
                            <td className="py-2 px-2">{request.pickupLocation || "Non défini"}</td>
                            <td className="py-2 px-2">
                              <Badge variant={
                                request.status === "pending" ? 'secondary' :
                                request.status === "approved" ? 'default' :
                                'destructive'
                              }>
                                {request.status === "pending" ? 'En attente' :
                                request.status === "approved" ? 'Approuvée' :
                                'Rejetée'}
                              </Badge>
                            </td>
                            <td className="py-2 px-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setSelectedRequestId(request.id)}
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                Détails
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal pour afficher les détails (à implémenter si nécessaire) */}
      {/* {selectedRequestId && (
        <PermitRequestDetails
          requestId={selectedRequestId}
          open={!!selectedRequestId}
          onClose={() => setSelectedRequestId(null)}
        />
      )} */}
    </div>
  );
}