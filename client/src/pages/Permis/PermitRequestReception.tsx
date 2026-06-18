import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { resolveApiUrl } from "@/utils/environment";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, Check, FileText, Filter, MoreHorizontal, RefreshCw, Search, X, Loader2, AlertCircle, Hourglass } from "lucide-react";

// Type pour les demandes de permis
interface PermitRequest {
  id: number;
  hunterName: string;
  hunterCategory: string;
  requestDate: string;
  status: "pending" | "approved" | "rejected" | "delivered";
  permitType: string;
  hunterId?: number;
  notes?: string;
  reason?: string;
  createdAt?: string;
  region: string;
  phone: string;
  email: string;
  comments?: string;
  deliveredBy?: number;
  deliveredAt?: string;
}

const getPermitTypeLabel = (typeId: string) => {
  if (!typeId) return "Non spécifié";
  const map: Record<string, string> = {
    'resident-petite': 'Petite Chasse - Résident',
    'resident-grande': 'Grande Chasse - Résident',
    'resident-gibier': 'Gibier d\'eau - Résident',
    'coutumier-petite': 'Petite Chasse - Coutumier',
    'coutumier-grande': 'Grande Chasse - Coutumier',
    'touriste-petite': 'Petite Chasse - Touriste',
    'touriste-grande': 'Grande Chasse - Touriste',
    'touriste-gibier': 'Gibier d\'eau - Touriste',
    'capture-commerciale': 'Capture Commerciale',
    'oisellier': 'Oisellier',
    'scientifique': 'Scientifique',
    'exportation': 'Exportation',
    'detention': 'Détention',
    'chasse': 'Permis de Chasse',
    'petite-chasse': 'Petite Chasse',
    'grande-chasse': 'Grande Chasse',
    'gibier-eau': 'Gibier d\'eau'
  };
  return map[typeId] || typeId;
};

export default function PermitRequestReception() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterRegion, setFilterRegion] = useState<string | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<number[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [currentRequest, setCurrentRequest] = useState<PermitRequest | null>(null);
  const [hunterAttachments, setHunterAttachments] = useState<any[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);

  const DOC_TYPES = [
    { code: 'idCardDocument', label: "Pièce d'identité" },
    { code: 'weaponPermit', label: "Permis de Port d'Arme" },
    { code: 'hunterPhoto', label: "Photo du Chasseur" },
    { code: 'treasuryStamp', label: "Timbre Impôt" },
    { code: 'weaponReceipt', label: "Quittance de l'Arme par le Trésor" },
    { code: 'insurance', label: "Assurance" },
    { code: 'moralCertificate', label: "Certificat de Bonne Vie et Mœurs" },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 font-semibold rounded-full px-2.5 py-0.5 border flex items-center gap-1.5 w-fit">
            <Hourglass className="h-3 w-3 text-yellow-500 animate-pulse" />
            En attente
          </Badge>
        );
      case "approved":
        return (
          <Badge className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100 font-semibold rounded-full px-2.5 py-0.5 border flex items-center gap-1.5 w-fit">
            <Check className="h-3 w-3 text-green-600" />
            Validé
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 font-semibold rounded-full px-2.5 py-0.5 border flex items-center gap-1.5 w-fit">
            <X className="h-3 w-3 text-rose-600" />
            Rejeté
          </Badge>
        );
      case "delivered":
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200 font-semibold rounded-full px-2.5 py-0.5 border flex items-center gap-1.5 w-fit">
            <Check className="h-3 w-3 text-green-700" />
            Délivré
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 font-semibold rounded-full px-2.5 py-0.5 border w-fit">
            {status}
          </Badge>
        );
    }
  };

  const viewDocument = async (docCode: string) => {
    if (!currentRequest?.hunterId) return;
    try {
      const token = localStorage.getItem('token');
      const headers: HeadersInit = {
        'Accept': 'application/octet-stream'
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const isAutre = currentRequest.hunterCategory?.toLowerCase() === 'autre';
      const endpoint = isAutre 
        ? `/api/hunter-documents/${currentRequest.hunterId}/${docCode}`
        : `/api/attachments/${currentRequest.hunterId}/${docCode}?inline=1`;

      const response = await fetch(resolveApiUrl(endpoint), {
        headers
      });
      if (!response.ok) throw new Error("Impossible de charger le document");
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('Error viewing document:', error);
      toast({
        title: 'Erreur',
        description: 'Impossible de visualiser le document',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (detailsOpen && currentRequest?.hunterId) {
      const fetchHunterAttachments = async () => {
        setLoadingAttachments(true);
        try {
          const isAutre = currentRequest.hunterCategory?.toLowerCase() === 'autre';
          const endpoint = isAutre 
            ? `/api/hunter-documents/${currentRequest.hunterId}`
            : `/api/attachments/${currentRequest.hunterId}`;

          const res = await fetch(resolveApiUrl(endpoint));
          if (res.ok) {
            const data = await res.json();
            setHunterAttachments(data.items || []);
          }
        } catch (err) {
          console.error("Error loading hunter attachments:", err);
        } finally {
          setLoadingAttachments(false);
        }
      };
      fetchHunterAttachments();
    } else {
      setHunterAttachments([]);
    }
  }, [detailsOpen, currentRequest]);

  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Récupérer la région de l'agent connecté
  const { data: agentProfile } = useQuery({
    queryKey: ["/api/users", user?.id],
    queryFn: async () => {
      if (!user) return null;
      try {
        const response = await fetch(resolveApiUrl(`/api/users/${user.id}`));
        if (!response.ok) return null;
        return response.json();
      } catch (error) {
        console.error("Error fetching agent profile:", error);
        return null;
      }
    },
    enabled: !!user,
  });

  // Définir automatiquement le filtre de région en fonction du profil de l'agent
  useEffect(() => {
    if (agentProfile?.region && agentProfile.region.toUpperCase() !== "NATIONAL") {
      setFilterRegion(agentProfile.region);
    } else {
      setFilterRegion(null);
    }
  }, [agentProfile]);

  // Requête pour récupérer les demandes de permis
  const { data: permitRequests, isLoading, error, refetch } = useQuery<PermitRequest[]>({
    queryKey: ["/api/permit-requests", filterRegion],
    queryFn: async () => {
      try {
        // Construire l'URL avec les paramètres de filtre
        let url = "/api/permit-requests";
        const params = new URLSearchParams();

        if (filterRegion) {
          params.append("region", filterRegion);
        }
        
        // Anti-cache: force le navigateur et le Service Worker à faire une vraie requête
        params.append("_t", Date.now().toString());

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        const response = await fetch(resolveApiUrl(url));
        if (!response.ok) throw new Error("Erreur lors de la récupération des demandes");
        const raw = await response.json();
        return raw
          .filter((r: any) => r.status !== 'draft')
          .map((r: any) => ({
            ...r,
            status: r.status || r.requestStatus || "pending",
            permitType: getPermitTypeLabel(r.requestedType || r.permitType || "Non spécifié"),
            hunterCategory: r.requestedCategory || r.hunterCategory || "resident",
            requestDate: r.createdAt || r.requestDate || new Date().toISOString(),
            comments: r.reason || r.comments || null,
            hunterName: r.hunterFirstName ? `${r.hunterFirstName} ${r.hunterLastName}` : r.hunterName || "Inconnu"
          }));
      } catch (error) {
        console.error("Error fetching permit requests:", error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
    enabled: !!user,
  });

  // Mutation pour approuver une demande
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      // Simuler un appel API pour approuver la demande
      const response = await fetch(resolveApiUrl(`/api/permit-requests/${id}/approve`), {
        method: "POST",
      });
      if (!response.ok) throw new Error("Échec de l'approbation");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "La demande a été approuvée avec succès",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      setDetailsOpen(false);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible d'approuver la demande",
        variant: "destructive",
      });
    },
  });

  // Mutation pour rejeter une demande
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      // Simuler un appel API pour rejeter la demande
      return fetch(resolveApiUrl(`/api/permit-requests/${id}/reject`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: user?.id }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      setDetailsOpen(false);
      toast({
        title: "Demande rejetée",
        description: "La demande de permis a été rejetée avec succès.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de rejeter la demande. Veuillez réessayer.",
      });
    },
  });

  // Mutation pour marquer un permis comme délivré
  const deliverMutation = useMutation({
    mutationFn: async (id: number) => {
      // Appel API pour marquer le permis comme délivré
      return fetch(resolveApiUrl(`/api/permit-requests/${id}/deliver`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: user?.id,
          deliveredAt: new Date().toISOString()
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      setDetailsOpen(false);
      toast({
        title: "Permis délivré",
        description: "Le permis a été marqué comme délivré avec succès.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de marquer le permis comme délivré. Veuillez réessayer.",
      });
    },
  });

  // Mutation pour supprimer une demande rejetée
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(resolveApiUrl(`/api/permit-requests/${id}`), {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Échec de la suppression");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      setDetailsOpen(false);
      toast({
        title: "Succès",
        description: "La demande a été supprimée avec succès.",
      });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer la demande. Veuillez réessayer.",
      });
    },
  });

  // Mutation pour les actions en masse
  const bulkActionMutation = useMutation({
    mutationFn: async ({ action, ids }: { action: "approve" | "reject"; ids: number[] }) => {
      // Simuler un appel API pour actions en masse
      const response = await fetch(resolveApiUrl(`/api/permit-requests/bulk-${action}`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) throw new Error(`Échec de l'action en masse`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: `${selectedRequests.length} demandes ont été traitées avec succès`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/permit-requests"] });
      setSelectedRequests([]);
      setBulkActionOpen(false);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de traiter les demandes sélectionnées",
        variant: "destructive",
      });
    },
  });

  // Fonction pour filtrer les demandes
  const filteredRequests = permitRequests
    ? permitRequests.filter((request) => {
      const matchesSearch =
        (request.hunterName || "").toLowerCase().includes((searchTerm || "").toLowerCase()) ||
        (request.phone || "").includes(searchTerm || "") ||
        (request.email || "").toLowerCase().includes((searchTerm || "").toLowerCase());

      const matchesStatus = !filterStatus || request.status === filterStatus;
      const matchesRegion =
        !filterRegion ||
        (request.region || "").trim().toLowerCase() === (filterRegion || "").trim().toLowerCase();

      return matchesSearch && matchesStatus && matchesRegion;
    })
    : [];

  // Pagination
  const countPending = permitRequests ? permitRequests.filter(r => r.status === 'pending').length : 0;
  const countApproved = permitRequests ? permitRequests.filter(r => r.status === 'approved').length : 0;
  const countRejected = permitRequests ? permitRequests.filter(r => r.status === 'rejected').length : 0;
  const countTotal = permitRequests ? permitRequests.length : 0;

  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredRequests.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredRequests.length / itemsPerPage);
  const paginatedRequests = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredRequests.length);

  // Réinitialiser la page quand on change de filtre
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterRegion]);

  // Fonctions de gestion des sélections
  const toggleSelectAll = () => {
    if (selectedRequests.length === paginatedRequests.length) {
      setSelectedRequests([]);
    } else {
      setSelectedRequests(paginatedRequests.map((r) => r.id));
    }
  };

  const toggleSelectRequest = (id: number) => {
    if (selectedRequests.includes(id)) {
      setSelectedRequests(selectedRequests.filter((requestId) => requestId !== id));
    } else {
      setSelectedRequests([...selectedRequests, id]);
    }
  };

  // Fonction pour ouvrir les détails d'une demande
  const viewRequestDetails = (request: PermitRequest) => {
    setCurrentRequest(request);
    setDetailsOpen(true);
  };

  // Fonction pour exécuter l'action en masse
  const executeBulkAction = () => {
    if (bulkAction && selectedRequests.length > 0) {
      bulkActionMutation.mutate({ action: bulkAction, ids: selectedRequests });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-gray-50 p-4 rounded-md">
        <h1 className="text-xl font-semibold text-neutral-800 mb-2 md:mb-0">
          Réception des Demandes de Permis
        </h1>

      </div>

      {/* Filtres et recherche */}
      <div className="flex flex-wrap justify-between items-center bg-gray-50 p-3 rounded-lg shadow-sm gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto flex-1">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Rechercher (N° permis, N° quittance, N° pièce, nom, téléphone)"
            className="pl-10 bg-white h-9 text-sm border-gray-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="hidden xl:flex items-center gap-2 text-xs">
          <Badge variant="outline" className="bg-white">Total: {countTotal}</Badge>
          <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200">En attente: {countPending}</Badge>
          <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-200">Approuvés: {countApproved}</Badge>
          <Badge variant="outline" className="bg-rose-50 text-rose-600 border-rose-200">Rejetés: {countRejected}</Badge>
        </div>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Filter className="h-3.5 w-3.5" />
                Filtres
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  setFilterStatus(null);
                  if (agentProfile?.region && agentProfile.region.toUpperCase() !== "NATIONAL") {
                    setFilterRegion(agentProfile.region);
                  } else {
                    setFilterRegion(null);
                  }
                  setSearchTerm("");
                }}
                className="font-bold text-rose-600 focus:text-rose-700"
              >
                Réinitialiser les filtres
              </DropdownMenuItem>
              <div className="h-px bg-slate-100 my-1" />
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statut</div>
              <DropdownMenuItem
                onClick={() => setFilterStatus(null)}
                className={filterStatus === null ? "bg-accent font-medium" : ""}
              >
                Tous les statuts
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterStatus("pending")}
                className={filterStatus === "pending" ? "bg-accent font-medium" : ""}
              >
                En attente
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterStatus("approved")}
                className={filterStatus === "approved" ? "bg-accent font-medium" : ""}
              >
                Approuvés
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterStatus("rejected")}
                className={filterStatus === "rejected" ? "bg-accent font-medium" : ""}
              >
                Rejetés
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setFilterStatus("delivered")}
                className={filterStatus === "delivered" ? "bg-accent font-medium" : ""}
              >
                Délivrés
              </DropdownMenuItem>
              
              <div className="h-px bg-slate-100 my-1" />
              <div className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Région</div>
              <DropdownMenuItem
                onClick={() => setFilterRegion(null)}
                className={filterRegion === null ? "bg-accent font-medium" : ""}
              >
                Toutes les régions
              </DropdownMenuItem>
              {agentProfile?.region && agentProfile.region.toUpperCase() !== "NATIONAL" && (
                <DropdownMenuItem
                  onClick={() => setFilterRegion(agentProfile.region)}
                  className={filterRegion === agentProfile.region ? "bg-accent font-medium" : ""}
                >
                  Ma région ({agentProfile.region})
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {selectedRequests.length > 0 && (
            <Button
              variant="default"
              size="sm"
              className="flex items-center gap-1 text-xs"
              onClick={() => {
                setBulkAction("approve");
                setBulkActionOpen(true);
              }}
            >
              <Check className="h-3.5 w-3.5" />
              Approuver ({selectedRequests.length})
            </Button>
          )}
        </div>
      </div>

      {/* Badges de filtres actifs */}
      {(filterStatus || filterRegion || searchTerm) && (
        <div className="flex flex-wrap gap-2 items-center px-1">
          <span className="text-xs font-semibold text-slate-400">Filtres actifs :</span>
          {searchTerm && (
            <Badge variant="secondary" className="gap-1 text-xs px-2 py-0.5 rounded-full">
              Recherche: "{searchTerm}"
              <X className="h-3 w-3 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => setSearchTerm("")} />
            </Badge>
          )}
          {filterStatus && (
            <Badge variant="secondary" className="gap-1 text-xs px-2 py-0.5 rounded-full capitalize">
              Statut: {filterStatus === "pending" ? "En attente" : filterStatus === "approved" ? "Approuvé" : filterStatus === "rejected" ? "Rejeté" : "Délivré"}
              <X className="h-3 w-3 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => setFilterStatus(null)} />
            </Badge>
          )}
          {filterRegion && (
            <Badge variant="secondary" className="gap-1 text-xs px-2 py-0.5 rounded-full">
              Région: {filterRegion}
              <X className="h-3 w-3 cursor-pointer text-slate-400 hover:text-slate-600" onClick={() => setFilterRegion(null)} />
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setFilterStatus(null);
              if (agentProfile?.region && agentProfile.region.toUpperCase() !== "NATIONAL") {
                setFilterRegion(agentProfile.region);
              } else {
                setFilterRegion(null);
              }
              setSearchTerm("");
            }}
            className="text-xs h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 font-bold"
          >
            Effacer tout
          </Button>
        </div>
      )}

      {/* Tableau des demandes */}
      <div className="bg-white rounded-md shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center">Chargement des demandes...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-500">Erreur: Impossible de charger les demandes</div>
        ) : filteredRequests.length > 0 ? (
          <div className="overflow-x-auto rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <div className="flex items-center justify-center">
                      <Checkbox
                        checked={selectedRequests.length === paginatedRequests.length && paginatedRequests.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </div>
                  </TableHead>
                  <TableHead>Chasseur</TableHead>
                  <TableHead>Type de Permis</TableHead>
                  <TableHead>Date de Demande</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRequests.map((request) => (
                  <TableRow key={request.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectedRequests.includes(request.id)}
                          onCheckedChange={() => toggleSelectRequest(request.id)}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{request.hunterName}</TableCell>
                    <TableCell>{request.permitType}</TableCell>
                    <TableCell>
                      {format(new Date(request.requestDate), "dd MMM yyyy", { locale: fr })}
                    </TableCell>
                    <TableCell className="capitalize">{request.hunterCategory}</TableCell>
                    <TableCell>
                      {getStatusBadge(request.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewRequestDetails(request)}
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Détails
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredRequests.length > 0 && (
              <div className="p-4 flex justify-between items-center text-sm bg-gray-50 border-t">
                <div className="text-muted-foreground">
                  Affichage de {startIndex + 1} à {endIndex} sur {filteredRequests.length} demandes
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
        ) : (
          <div className="p-8 text-center text-gray-500">Aucune demande trouvée</div>
        )}
      </div>

      {/* Boîte de dialogue des détails de la demande */}
      {currentRequest && (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Détails de la Demande de Permis</DialogTitle>
            </DialogHeader>

            <div className="space-y-4 my-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Chasseur</h4>
                  <p className="text-base">{currentRequest.hunterName}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Catégorie</h4>
                  <p className="text-base capitalize">{currentRequest.hunterCategory}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Type de Permis</h4>
                  <p className="text-base">{currentRequest.permitType}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Date de Demande</h4>
                  <p className="text-base">
                    {format(new Date(currentRequest.requestDate), "dd MMMM yyyy", { locale: fr })}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Région</h4>
                  <p className="text-base">{currentRequest.region}</p>
                </div>
                {/* Section département supprimée */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Téléphone</h4>
                  <p className="text-base">{currentRequest.phone}</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Email</h4>
                  <p className="text-base">{currentRequest.email || "Non spécifié"}</p>
                </div>
              </div>

              {currentRequest.comments && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Commentaires</h4>
                  <p className="text-base p-2 bg-gray-50 rounded-md">{currentRequest.comments}</p>
                </div>
              )}

              {currentRequest.notes && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-500">Détails de l'arme</h4>
                  <p className="text-sm p-2 bg-slate-50 border border-slate-100 rounded-md font-medium text-slate-800">{currentRequest.notes}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Justificatifs du Chasseur</h4>
                {loadingAttachments ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-primary mr-2" />
                    <span className="text-sm text-gray-500">Chargement des justificatifs...</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {currentRequest.hunterCategory?.toLowerCase() === 'autre' ? (
                      hunterAttachments.length === 0 ? (
                        <p className="text-sm text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-100 flex items-center">
                          <AlertCircle className="h-4 w-4 mr-2" /> Aucun justificatif téléversé pour le moment.
                        </p>
                      ) : (
                        hunterAttachments.map((fileInfo: any) => (
                          <div key={fileInfo.type} className="flex items-center justify-between p-2.5 rounded-lg border text-sm bg-white hover:bg-slate-50 transition">
                            <div className="flex items-center space-x-2">
                              <div className="text-green-600">
                                <Check className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-xs">
                                  {fileInfo.name || "Document Justificatif"}
                                </p>
                              </div>
                            </div>
                            <div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => viewDocument(fileInfo.type)}
                                className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                              >
                                <FileText className="h-3 w-3 mr-1" /> Visualiser
                              </Button>
                            </div>
                          </div>
                        ))
                      )
                    ) : (
                      DOC_TYPES.map((doc) => {
                        const fileInfo = hunterAttachments.find((a: any) => a.type === doc.code);
                        const isPresent = fileInfo?.present;
                        return (
                          <div key={doc.code} className="flex items-center justify-between p-2.5 rounded-lg border text-sm bg-white hover:bg-slate-50 transition">
                            <div className="flex items-center space-x-2">
                              <div className={isPresent ? 'text-green-600' : 'text-gray-400'}>
                                {isPresent ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 text-xs">{doc.label}</p>
                                {isPresent && fileInfo.expiryDate && (
                                  <p className="text-[10px] text-gray-500">
                                    Expire le : {new Date(fileInfo.expiryDate).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div>
                              {isPresent ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => viewDocument(doc.code)}
                                  className="h-7 px-2 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                                >
                                  <FileText className="h-3 w-3 mr-1" /> Visualiser
                                </Button>
                              ) : (
                                <span className="text-[11px] text-gray-400 font-medium italic">Non fourni</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-500 mb-1">Statut</h4>
                {getStatusBadge(currentRequest.status)}
              </div>
            </div>

            <DialogFooter>
              {currentRequest.status === "pending" && (
                <div className="flex space-x-2 w-full">
                  <Button
                    variant="outline"
                    onClick={() => rejectMutation.mutate(currentRequest.id)}
                    disabled={rejectMutation.isPending}
                    className="flex-1"
                  >
                    {rejectMutation.isPending ? "Traitement..." : "Rejeter"}
                  </Button>
                  <Button
                    onClick={() => approveMutation.mutate(currentRequest.id)}
                    disabled={approveMutation.isPending}
                    className="flex-1"
                  >
                    {approveMutation.isPending ? "Traitement..." : "Approuver"}
                  </Button>
                </div>
              )}
              {currentRequest.status === "approved" && (
                <div className="flex space-x-2 w-full">
                  <Button
                    onClick={() => deliverMutation.mutate(currentRequest.id)}
                    disabled={deliverMutation.isPending}
                    className="flex-1"
                  >
                    {deliverMutation.isPending ? "Traitement..." : "Marquer comme délivré"}
                  </Button>
                </div>
              )}
              {currentRequest.status === "rejected" && (
                <div className="flex space-x-2 w-full">
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm("Êtes-vous sûr de vouloir supprimer cette demande rejetée ?")) {
                        deleteMutation.mutate(currentRequest.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium shadow-sm transition-colors duration-200"
                  >
                    {deleteMutation.isPending ? "Suppression..." : "Supprimer la demande"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Boîte de dialogue pour action en masse */}
      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "approve" ? "Approuver les demandes" : "Rejeter les demandes"}
            </DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de {bulkAction === "approve" ? "approuver" : "rejeter"} {selectedRequests.length} demande(s) de permis. Êtes-vous sûr de vouloir continuer ?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkActionOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={executeBulkAction}
              disabled={bulkActionMutation.isPending}
              variant={bulkAction === "approve" ? "default" : "destructive"}
            >
              {bulkActionMutation.isPending ? "Traitement..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
