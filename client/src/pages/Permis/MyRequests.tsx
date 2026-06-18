import { resolveApiUrl } from "@/utils/environment";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertCircle, Calendar, CheckCircle, Clock, Eye, FileBadge, Loader2, Search, XCircle, Trash2, Edit3, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

// Interface pour les demandes de permis
interface PermitRequest {
  id: number;
  userId: number;
  hunterId: number;
  requestedType: string;
  requestedCategory: string;
  region: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'delivered';
  reason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export default function MyRequests({ onEditRequest }: { onEditRequest?: (req: PermitRequest) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<PermitRequest | null>(null);

  useEffect(() => {
    document.title = 'Mes Demandes | SCoDiPP - Systeme de Control';
  }, []);

  // Vérifier si l'utilisateur a un profil chasseur
  const { data: hunterProfile, isLoading: isLoadingHunter, error: hunterError } = useQuery({
    queryKey: ['/api/hunters/me'],
    queryFn: async () => {
      try {
        const response = await fetch(resolveApiUrl('/api/hunters/me'));
        if (!response.ok) {
          if (response.status === 404) {
            // L'utilisateur n'a pas de profil chasseur
            return null;
          }
          throw new Error('Erreur lors de la récupération du profil chasseur');
        }
        return await response.json();
      } catch (error) {
        console.error('Erreur:', error);
        throw error; // Propager l'erreur au lieu de retourner null
      }
    },
    enabled: !!user,
  });

  // Récupérer les demandes de permis du chasseur
  const { data: requests = [], isLoading, refetch } = useQuery<PermitRequest[]>({
    queryKey: ['/api/hunters/me/permit-requests'],
    queryFn: async () => {
      try {
        // Si l'utilisateur n'a pas de profil chasseur, ne pas faire la requête
        if (!hunterProfile) return [];

        const response = await fetch(resolveApiUrl('/api/hunters/me/permit-requests'));
        if (!response.ok) throw new Error('Erreur lors de la récupération des demandes');
        return await response.json();
      } catch (error) {
        console.error('Erreur:', error);
        return [];
      }
    },
    enabled: !!user && !!hunterProfile,
    refetchInterval: 30000, // Rafraîchir toutes les 30 secondes
  });

  // Filtrer les demandes selon l'onglet actif et le terme de recherche
  const filteredRequests = requests.filter(request => {
    const matchesTab =
      activeTab === 'all' ||
      (activeTab === 'pending' && request.status === 'pending') ||
      (activeTab === 'approved' && request.status === 'approved') ||
      (activeTab === 'rejected' && request.status === 'rejected') ||
      (activeTab === 'delivered' && request.status === 'delivered');

    const matchesSearch =
      searchTerm === '' ||
      request.requestedType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.region.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Formater le type de permis pour l'affichage
  const formatPermitType = (type: string) => {
    switch (type) {
      case 'sportif-petite-chasse': return 'Sportif Petite Chasse';
      case 'grande-chasse': return 'Grande Chasse';
      case 'special-gibier-eau': return 'Spécial Gibier d\'Eau';
      default: return type;
    }
  };

  // Formater la catégorie de chasseur pour l'affichage
  const formatHunterCategory = (category: string) => {
    switch (category) {
      case 'resident': return 'Résident';
      case 'coutumier': return 'Coutumier';
      case 'touristique': return 'Touristique';
      default: return category;
    }
  };

  // Formater la durée pour l'affichage
  const formatDuration = (duration?: string) => {
    if (!duration) return 'Saison complète';
    switch (duration) {
      case '1-week': return '1 Semaine';
      case '2-weeks': return '2 Semaines';
      case '1-month': return '1 Mois';
      default: return duration;
    }
  };

  // Obtenir la couleur du badge selon le statut
  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'approved': return 'bg-green-100 text-green-800 border-green-300';
      case 'rejected': return 'bg-red-100 text-red-800 border-red-300';
      case 'delivered': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Obtenir l'icône selon le statut
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Save className="h-4 w-4 text-slate-600" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'approved': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-600" />;
      case 'delivered': return <FileBadge className="h-4 w-4 text-blue-600" />;
      default: return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  // Formater le statut pour l'affichage
  const formatStatus = (status: string) => {
    switch (status) {
      case 'draft': return 'Brouillon';
      case 'pending': return 'En attente';
      case 'approved': return 'Approuvé';
      case 'rejected': return 'Rejeté';
      case 'delivered': return 'Délivré';
      default: return status;
    }
  };

  // Afficher les détails d'une demande
  const viewRequestDetails = (request: PermitRequest) => {
    setSelectedRequest(request);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(resolveApiUrl(`/api/permit-requests/${id}`), {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Erreur lors de la suppression de la demande');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Demande supprimée avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/hunters/me/permit-requests'] });
      refetch();
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer cette demande.",
        variant: "destructive"
      });
    }
  });

  const handleDelete = (id: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer cette demande ?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4 pt-2">      {isLoadingHunter ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
        </div>
      ) : hunterError ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Erreur de chargement du profil</CardTitle>
            <CardDescription className="text-red-600">
              Nous n'avons pas pu charger les informations de votre profil chasseur. Veuillez réessayer plus tard ou contacter le support si le problème persiste.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-500">Détail de l'erreur : {(hunterError as Error).message}</p>
          </CardContent>
        </Card>
      ) : (
        // Le profil existe et est actif, afficher le contenu principal
        <>


          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Aucune demande en cours</CardTitle>
                <CardDescription>
                  Vous n'avez aucune demande de permis en cours.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Pour demander un nouveau permis de chasse, cliquez sur le bouton "Nouvelle demande".
                </p>
                <Button variant="outline" asChild>
                  <Link href="/mypermits">
                    Demander un permis
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-center bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                    <div className="flex items-center">
                      <Badge variant="outline" className="text-sm font-medium text-blue-700 bg-blue-50/50 border-blue-200 px-3 py-1 shadow-sm">
                        {filteredRequests.length} demande{filteredRequests.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select value={activeTab} onValueChange={setActiveTab}>
                        <SelectTrigger className="bg-white shadow-sm font-medium text-slate-700 w-[160px] h-9">
                          <SelectValue placeholder="Filtrer par statut" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Toutes</SelectItem>
                          <SelectItem value="draft">Brouillons</SelectItem>
                          <SelectItem value="pending">En attente</SelectItem>
                          <SelectItem value="approved">Approuvées</SelectItem>
                          <SelectItem value="rejected">Rejetées</SelectItem>
                          <SelectItem value="delivered">Délivrées</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredRequests.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Aucune demande trouvée pour ces critères.
                      </div>
                    ) : (
                      filteredRequests.map((request) => (
                        <Card key={request.id} className="mb-3 overflow-hidden border-l-4 border-l-blue-500 shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex flex-col md:flex-row">
                            <div className="px-4 py-3 flex-grow">
                              <div className="flex justify-between items-start">
                                <div className="flex flex-col gap-0.5">
                                  <h3 className="font-semibold text-slate-800 text-base">{formatPermitType(request.requestedType)}</h3>
                                  <p className="text-sm text-slate-500">
                                    {formatHunterCategory(request.requestedCategory)}
                                  </p>
                                </div>
                                <Badge className={`${getStatusBadgeColor(request.status)} flex items-center gap-1 text-xs px-2 py-0.5`}>
                                  {getStatusIcon(request.status)}
                                  {formatStatus(request.status)}
                                </Badge>
                              </div>
                              <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                                <div>
                                  <span className="text-slate-500">Région:</span> <span className="font-medium text-slate-700">{request.region}</span>
                                </div>
                                <div className="flex items-center text-slate-500">
                                  <Calendar className="h-3.5 w-3.5 mr-1.5 opacity-70" />
                                  Demandé le {format(new Date(request.createdAt), 'dd/MM/yyyy')}
                                </div>
                              </div>
                            </div>
                            <div className="bg-slate-50/50 px-4 py-3 flex flex-row md:flex-col justify-end items-center gap-2 border-t md:border-t-0 md:border-l border-slate-100 min-w-[120px]">
                              {(request.status === 'draft' || request.status === 'rejected') && onEditRequest && (
                                <Button variant="outline" size="sm" onClick={() => onEditRequest(request)} className="w-full bg-white shadow-sm hover:bg-slate-50 text-blue-600 border-blue-200 hover:text-blue-700">
                                  <Edit3 className="h-4 w-4 mr-2" /> Modifier
                                </Button>
                              )}
                              <Button variant="outline" size="sm" onClick={() => viewRequestDetails(request)} className="w-full bg-white shadow-sm hover:bg-slate-50">
                                <Eye className="h-4 w-4 mr-2 text-slate-500" /> Détails
                              </Button>
                              {request.status === 'draft' && (
                                <Button variant="ghost" size="sm" onClick={() => handleDelete(request.id)} className="w-full text-red-500 hover:text-red-700 hover:bg-red-50" disabled={deleteMutation.isPending}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Supprimer
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Modal de détails de la demande */}
              {selectedRequest && (
                <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <FileBadge className="h-5 w-5 text-blue-600" />
                        Détails de la demande
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-medium">{formatPermitType(selectedRequest.requestedType)}</h3>
                        <Badge className={`${getStatusBadgeColor(selectedRequest.status)} flex items-center gap-1`}>
                          {getStatusIcon(selectedRequest.status)}
                          {formatStatus(selectedRequest.status)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground block">Catégorie:</span>
                          {formatHunterCategory(selectedRequest.requestedCategory)}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Raison:</span>
                          {selectedRequest.reason || 'Non spécifiée'}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Région:</span>
                          {selectedRequest.region}
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Date de demande:</span>
                          {format(new Date(selectedRequest.createdAt), 'dd/MM/yyyy', { locale: fr })}
                        </div>
                      </div>

                      {selectedRequest.notes && (
                        <div className="border-t pt-3 mt-3">
                          <h4 className="font-medium mb-2">Informations sur l'arme</h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground block">Notes:</span>
                              {selectedRequest.notes || 'Aucune note'}
                            </div>

                          </div>
                        </div>
                      )}

                      {selectedRequest.status === 'approved' && (
                        <div className="bg-green-50 p-3 rounded-md border border-green-200 mt-3">
                          <p className="text-green-800 text-sm">
                            Votre demande a été approuvée. Vous pouvez vous rendre dans n'importe quel service des eaux et forêts de la région {selectedRequest.region} pour récupérer votre permis.
                          </p>
                        </div>
                      )}

                      {selectedRequest.status === 'rejected' && (
                        <div className="bg-red-50 p-3 rounded-md border border-red-200 mt-3">
                          <p className="text-red-800 text-sm">
                            Votre demande a été rejetée. Veuillez contacter le service des eaux et forêts pour plus d'informations.
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setSelectedRequest(null)}>
                        Fermer
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
