import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertCircle, Calendar, Check, FileText, MapPin, Trash2, User, X } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { z } from "zod";

// Types
type Hunter = { id: number; lastName: string; firstName: string };
type Permit = { id: number; permitNumber: string; permitType: string; status: string; expiryDate: string };
type GuideDeclaration = {
  id: number;
  user_id: number;
  hunter_id: number;
  guide_id: number;
  guideName: string;
  permit_id: number;
  permit_number: string;
  category: string;
  espece_id: string;
  nom_espece: string;
  nom_scientifique?: string;
  sexe: string;
  quantity?: number;
  observations?: string;
  lat?: number;
  lon?: number;
  location: string;
  photo_data?: any;
  photo_mime?: string;
  photo_name?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

// Schéma de validation pour l'approbation/rejet
const declarationReviewSchema = z.object({
  declarationId: z.number(),
  action: z.enum(['approve', 'reject']),
  notes: z.string().optional(),
});

type ReviewFormValues = z.infer<typeof declarationReviewSchema>;

export default function HuntingDeclarationsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [_, setLocation] = useLocation();
  const [showRemoveAssociationConfirm, setShowRemoveAssociationConfirm] = useState(false);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  // Pagination (5 éléments/page) pour les déclarations du guide
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // Récupérer les informations du chasseur connecté
  const { data: hunter, isLoading: isLoadingHunter } = useQuery<Hunter>({
    queryKey: ["/api/hunters/me"],
    queryFn: () => apiRequest({ url: "/api/hunters/me", method: "GET" }),
    enabled: !!user && user.role === "hunter",
  });

  // Récupérer les permis du chasseur connecté
  const { data: hunterPermits = [], isLoading: isLoadingPermits } = useQuery<Permit[]>({
    queryKey: ["/api/permits/hunter", hunter?.id],
    queryFn: () => apiRequest({ url: `/api/permits/hunter/${hunter?.id}`, method: "GET" }),
    enabled: !!hunter?.id,
  });

  // Récupérer l'association avec un guide de chasse depuis guide_hunter_associations
  const { data: guideAssociation, isLoading: isLoadingAssociation } = useQuery<{guide: any, associationId: number} | null>({
    queryKey: ["/api/guide-hunter-associations", hunter?.id],
    queryFn: () => apiRequest({ url: `/api/guide-hunter-associations/hunter/${hunter?.id}`, method: "GET" }),
    enabled: !!hunter?.id,
  });

  // Récupérer les déclarations d'espèces faites par le guide pour ce chasseur
  const { data: guideDeclarations = [], isLoading: isLoadingDeclarations } = useQuery<GuideDeclaration[]>({
    queryKey: ["/api/declaration-especes/guide-declarations", hunter?.id],
    queryFn: () => apiRequest({ url: `/api/declaration-especes/guide-declarations/${hunter?.id}`, method: "GET" }),
    enabled: !!hunter?.id,
  });

  // Ne garder que les déclarations EN ATTENTE ET FAITES PAR UN GUIDE (guide_id défini)
  const pendingGuideDeclarations = (Array.isArray(guideDeclarations) ? guideDeclarations : []).filter(
    (d: any) => {
      const gid = d?.guide_id ?? d?.guideId;
      const isGuide = gid != null && !isNaN(Number(gid)) && Number(gid) > 0;
      // Exclure toute déclaration créée par l'utilisateur connecté (le chasseur lui-même)
      const isCreatedByCurrentUser = typeof d?.user_id === 'number' && typeof (user as any)?.id === 'number' && d.user_id === (user as any).id;
      return d?.status === 'pending' && isGuide && !isCreatedByCurrentUser;
    }
  );

  // Tri et pagination des déclarations en attente (plus récentes d'abord)
  const sortedPending = pendingGuideDeclarations
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const totalItems = sortedPending.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedPending = sortedPending.slice(startIndex, endIndex);

  // Réinitialiser la page quand la source change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // (pas de dépendances de date pour éviter des boucles)


  // Mutation pour approuver/rejeter une déclaration du guide
  const reviewDeclarationMutation = useMutation({
    mutationFn: (data: { declarationId: number; action: 'approve' | 'reject'; notes?: string }) =>
      apiRequest({
        url: `/api/declaration-especes/${data.declarationId}/review`,
        method: "POST",
        data: {
          action: data.action,
          notes: data.notes,
        },
      }),
    onSuccess: (_, variables) => {
      toast({
        title: variables.action === 'approve' ? "Déclaration approuvée" : "Déclaration rejetée",
        description: variables.action === 'approve'
          ? "La déclaration du guide a été approuvée avec succès."
          : "La déclaration du guide a été rejetée.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/declaration-especes/guide-declarations"] });
      // Invalider aussi le cache des activités pour qu'elles apparaissent immédiatement
      queryClient.invalidateQueries({ queryKey: ["/api/hunting-activities"] });
      // Invalidation ciblée sur la clé exacte utilisée par HuntingActivities.tsx
      queryClient.invalidateQueries({ queryKey: ["/api/hunting-activities", user?.hunterId] });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors du traitement de la déclaration.",
        variant: "destructive",
      });
      console.error("Erreur lors de la révision de la déclaration:", error);
    },
  });

  // Mutation pour supprimer l'association avec le guide
  const removeAssociationMutation = useMutation({
    mutationFn: (associationId: number) =>
      apiRequest({
        url: `/api/guide-hunter-associations/${associationId}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({
        title: "Association supprimée",
        description: "L'association avec le guide de chasse a été supprimée avec succès.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guide-hunter-associations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/declaration-especes/guide-declarations"] });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la suppression de l'association.",
        variant: "destructive",
      });
      console.error("Erreur lors de la suppression de l'association:", error);
    },
  });

  // Formater le statut de la déclaration
  const formatDeclarationStatus = (status: string) => {
    switch (status) {
      case "pending": return "En attente";
      case "approved": return "Validée";
      case "rejected": return "Rejetée";
      default: return status;
    }
  };

  // Obtenir la couleur du badge selon le statut
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "approved": return "default";
      case "pending": return "outline";
      case "rejected": return "destructive";
      default: return "outline";
    }
  };

  if (isLoadingHunter || isLoadingPermits || isLoadingDeclarations || isLoadingAssociation) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  // Vérifier si l'utilisateur est bien un chasseur
  if (!hunter) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Accès refusé</CardTitle>
            <CardDescription>
              Vous devez être enregistré comme chasseur pour accéder à cette page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Veuillez contacter un agent des Eaux et Forêts pour créer votre profil de chasseur.</p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={() => setLocation("/dashboard")}>
              Retour au tableau de bord
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 lg:ml-64 lg:mt-24 pt-4 lg:pt-0">
      <div className="container mx-auto px-4 py-4 lg:py-8 space-y-6 max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <User className="h-6 w-6 text-gray-700" />
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Association avec Guide</h1>
              <p className="text-gray-600 mt-1 md:mt-2">Gérer votre association avec un guide de chasse</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setLocation("/dashboard")}
            className="hidden md:inline-flex"
          >
            Retour au tableau de bord
          </Button>
        </div>

        {guideAssociation ? (
          <Card className="shadow-md border-0">
            <CardContent className="pt-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 p-4 bg-white border border-blue-200 rounded-lg shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-full">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {guideAssociation.guide.firstName} {guideAssociation.guide.lastName}
                      </h3>
                      <p className="text-sm text-gray-600">Guide de chasse associé</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">
                    Les déclarations effectuées par ce guide avec vos permis apparaîtront ci-dessous pour validation.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRemoveAssociationConfirm(true)}
                  className="text-red-600 border-red-200 hover:bg-red-50 w-full lg:w-auto flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer l'association
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-md border-0">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between gap-2 p-2 sm:p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="flex items-center gap-2">
                  <div className="inline-flex items-center justify-center w-7 h-7 bg-gray-200 rounded-full">
                    <User className="h-4 w-4 text-gray-600" />
                  </div>
                  <div className="leading-tight">
                    <h3 className="font-semibold text-gray-700 text-sm">Aucune Association avec Guide</h3>
                    <p className="text-gray-600 text-xs">Vous n'êtes actuellement associé à aucun guide de chasse.</p>
                  </div>
                </div>
                <Button
                  onClick={() => setLocation("/guides")}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                >
                  Trouver un guide
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section Déclarations */}
        <Card className="shadow-md border-0">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Déclarations en attente
                </CardTitle>
                <CardDescription>
                  {pendingGuideDeclarations.length} déclaration(s) nécessitant votre validation
                </CardDescription>
              </div>
              {totalItems > pageSize && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
                  >
                    Précédent
                  </Button>
                  <span className="px-2 text-sm text-emerald-800">
                    Page {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200"
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {pendingGuideDeclarations.length === 0 ? (
              <div className="text-center py-12">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Aucune déclaration en attente
                </h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  Aucune déclaration de guide en attente de validation sur vos permis. Les déclarations validées ou rejetées ne sont pas affichées ici.
                </p>
                <Alert className="max-w-md mx-auto bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-blue-800">Information</AlertTitle>
                  <AlertDescription className="text-blue-700">
                    Les déclarations effectuées par les guides de chasse sur vos permis apparaîtront ici pour validation.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedPending.map((declaration) => (
                  <Card key={declaration.id} className="overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
                    <CardHeader className="p-3 border-b bg-white">
                      <div className="flex items-start gap-3">
                        {/* Vignette */}
                        <div className="w-14 h-14 rounded-md bg-gray-100 border flex items-center justify-center overflow-hidden flex-shrink-0">
                          {declaration.photo_data ? (
                            <img
                              src={`data:${declaration.photo_mime};base64,${declaration.photo_data}`}
                              alt={`Photo de ${declaration.nom_espece}`}
                              className="w-full h-full object-cover cursor-zoom-in"
                              onClick={() => setExpandedImage(`data:${declaration.photo_mime};base64,${declaration.photo_data}`)}
                            />
                          ) : (
                            <span className="text-xl">🦌</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <CardTitle className="text-sm font-semibold truncate">
                              {declaration.nom_espece}
                            </CardTitle>
                            <span className="text-[10px] text-gray-500 flex items-center gap-1 flex-shrink-0">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(declaration.created_at), "dd MMM yyyy", { locale: fr })}
                            </span>
                          </div>
                          <CardDescription className="mt-1 text-xs flex items-center gap-1 truncate">
                            <User className="h-3 w-3" /> Par {declaration.guideName}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-3">
                      {/* Ligne d'infos condensées */}
                      <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{declaration.category || 'N/A'}</span>
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">Sexe: {declaration.sexe}</span>
                        <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">Qté: {declaration.quantity || 1}</span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium truncate">{declaration.permit_number}</span>
                      </div>
                      {declaration.location && (
                        <div className="mt-2 text-[11px] text-gray-600 flex items-center gap-1 truncate">
                          <MapPin className="h-3 w-3 text-gray-500" />
                          <span className="truncate">{declaration.location}</span>
                        </div>
                      )}

                      {declaration.observations && (
                        <div className="mt-2 text-[11px] text-gray-600 line-clamp-2">{declaration.observations}</div>
                      )}

                      {declaration.status === 'pending' && (
                        <div className="mt-3">
                          <div className="flex gap-2">
                            <Button
                              onClick={() => {
                                reviewDeclarationMutation.mutate({
                                  declarationId: declaration.id,
                                  action: 'approve',
                                  notes: ''
                                });
                              }}
                              className="bg-green-600 hover:bg-green-700"
                              size="sm"
                              disabled={reviewDeclarationMutation.isPending}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              {reviewDeclarationMutation.isPending ? 'Validation...' : 'Approuver'}
                            </Button>
                            <Button
                              onClick={() => {
                                const reason = prompt('Raison du rejet (optionnel):');
                                if (reason !== null) {
                                  reviewDeclarationMutation.mutate({
                                    declarationId: declaration.id,
                                    action: 'reject',
                                    notes: reason || 'Déclaration rejetée'
                                  });
                                }
                              }}
                              variant="destructive"
                              size="sm"
                              disabled={reviewDeclarationMutation.isPending}
                            >
                              <X className="h-4 w-4 mr-1" />
                              {reviewDeclarationMutation.isPending ? 'Rejet...' : 'Rejeter'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal d'image agrandie */}
        {expandedImage && (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 cursor-pointer"
            onClick={() => setExpandedImage(null)}
          >
            <div className="relative max-w-4xl max-h-full">
              <img
                src={expandedImage}
                alt="Photo agrandie"
                className="max-w-full max-h-screen object-contain rounded-lg"
              />
              <button
                className="absolute top-4 right-4 bg-white text-black rounded-full w-10 h-10 flex items-center justify-center font-bold hover:bg-gray-200 shadow-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedImage(null);
                }}
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Modal de confirmation de suppression d'association */}
        {showRemoveAssociationConfirm && guideAssociation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-red-100 rounded-full">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Supprimer l'association
                </h3>
              </div>
              <p className="text-gray-600 mb-4">
                Êtes-vous sûr de vouloir supprimer l'association avec <strong>{guideAssociation.guide.firstName} {guideAssociation.guide.lastName}</strong> ?
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4">
                <p className="text-amber-800 text-sm">
                  <strong>Note :</strong> Les déclarations en attente seront conservées mais aucune nouvelle déclaration ne pourra être effectuée par ce guide.
                </p>
              </div>

              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowRemoveAssociationConfirm(false)}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => {
                    removeAssociationMutation.mutate(guideAssociation.associationId);
                    setShowRemoveAssociationConfirm(false);
                  }}
                  variant="destructive"
                  className="bg-red-600 hover:bg-red-700"
                >
                  Supprimer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
