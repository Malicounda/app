import { HuntingGuideForm } from "@/components/guides/HuntingGuideForm";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IdBadge } from "@/components/ui/id-badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HuntingGuide } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
    CheckCircle,
    Edit,
    Loader2,
    Plus,
    Search,
    Trash2,
    UserX
} from "lucide-react";
import { useEffect, useState } from "react";

export default function GuidesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editGuide, setEditGuide] = useState<
    | (HuntingGuide & { username?: string })
    | null
  >(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Log pour déboguer l'état de showAddForm
  console.log('showAddForm:', showAddForm);
  const [searchTerm, setSearchTerm] = useState("");
  const [processing, setProcessing] = useState<{[key: number]: boolean}>({});
  const [guideToDelete, setGuideToDelete] = useState<HuntingGuide | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState("all");
  const itemsPerPage = 10;

  // Récupération des guides de chasse
  const { data: guides = [], isLoading } = useQuery<HuntingGuide[]>({
    queryKey: ["/api/guides"],
    enabled: !!user && ["admin", "agent", "sub-agent"].includes(user.role),
  });

  // Filtrer les guides en fonction du terme de recherche
  const filteredGuides = guides.filter((guide) => {
    const searchValue = searchTerm.toLowerCase();
    return (
      guide.firstName.toLowerCase().includes(searchValue) ||
      guide.lastName.toLowerCase().includes(searchValue) ||
      (guide.phone ?? "").includes(searchValue) ||
      (guide.departement && guide.departement.toLowerCase().includes(searchValue)) ||
      (guide.idNumber ?? "").includes(searchValue)
    );
  });

  // Pagination
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredGuides.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredGuides.length / itemsPerPage);
  const paginatedGuides = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredGuides.length);

  // Réinitialiser la page quand on change de recherche ou d'onglet
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Mutation pour supprimer définitivement un guide
  const deleteGuideMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest({
        url: `/api/guides/${id}`,
        method: "DELETE"
      }),
    onSuccess: () => {
      toast({
        title: "Guide supprimé",
        description: "Le guide de chasse a été supprimé définitivement.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
      setShowDeleteDialog(false);
      setGuideToDelete(null);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la suppression du guide.",
        variant: "destructive",
      });
      setShowDeleteDialog(false);
    }
  });

  // Fonction pour changer le statut d'un guide
  const toggleGuideStatus = async (id: number, isActive: boolean) => {
    setProcessing(prev => ({ ...prev, [id]: true }));

    try {
      await apiRequest({
        url: `/api/guides/${id}/status`,
        method: "PATCH",
        data: { isActive: !isActive }
      });

      toast({
        title: `Guide ${!isActive ? "activé" : "désactivé"}`,
        description: `Le guide a été ${!isActive ? "activé" : "désactivé"} avec succès.`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la modification du statut.",
        variant: "destructive",
      });
    } finally {
      setProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  // Rendu du tableau de guides
  const renderGuidesTable = (guides: HuntingGuide[]) => {
    // Pagination spécifique pour les guides filtrés passés en paramètre
    const startIdx = (currentPage - 1) * itemsPerPage;
    const endIdx = startIdx + itemsPerPage;
    const paginatedData = guides.slice(startIdx, endIdx);
    const totalPgs = Math.ceil(guides.length / itemsPerPage);

    return (
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Département</TableHead>
              <TableHead>Région</TableHead>
              <TableHead>N° pièce d'identité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.map((guide) => (
              <TableRow key={guide.id}>
                <TableCell>
                  <IdBadge id={guide.id} type="guide" />
                </TableCell>
                <TableCell>
                  <span className="font-medium">{guide.lastName}</span> {guide.firstName}
                </TableCell>
                <TableCell>{guide.phone}</TableCell>
                <TableCell>{guide.departement}</TableCell>
                <TableCell>{guide.region}</TableCell>
                <TableCell>{guide.idNumber}</TableCell>
                <TableCell>
                  <Badge
                    variant={guide.isActive ? "outline" : "destructive"}
                    className={guide.isActive ? "bg-green-50 text-green-700 hover:bg-green-50" : ""}
                  >
                    {guide.isActive ? "Actif" : "Inactif"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditGuide(guide);
                        setShowEditDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>

                    <Button
                      variant={guide.isActive ? "destructive" : "outline"}
                      size="sm"
                      onClick={() => toggleGuideStatus(guide.id, guide.isActive)}
                      disabled={processing[guide.id]}
                    >
                      {processing[guide.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : guide.isActive ? (
                        <UserX className="h-4 w-4" />
                      ) : (
                        <CheckCircle className="h-4 w-4" />
                      )}
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setGuideToDelete(guide);
                        setShowDeleteDialog(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {guides.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Aucun résultat trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {guides.length > 0 && (
          <div className="p-4 flex justify-between items-center text-sm bg-gray-50 border-t">
            <div className="text-muted-foreground">
              Affichage de {startIdx + 1} à {Math.min(endIdx, guides.length)} sur {guides.length} guides
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
                disabled={currentPage >= totalPgs}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!user || !["admin", "agent", "sub-agent"].includes(user.role)) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Accès non autorisé</h2>
        <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      {/* Boîte de dialogue pour confirmer la suppression d'un guide */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement le guide</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement le guide {guideToDelete?.firstName} {guideToDelete?.lastName} ?
              Cette action est irréversible et supprimera toutes les données associées à ce guide.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => guideToDelete && deleteGuideMutation.mutate(guideToDelete.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteGuideMutation.isPending}
            >
              {deleteGuideMutation.isPending ? "Suppression en cours..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold mb-2">
          Gestion des Guides de Chasse
        </h2>

        {!showAddForm && (
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter un guide
          </Button>
        )}
      </div>

      {showAddForm ? (
        <div className="mb-6">
          <HuntingGuideForm onCancel={() => setShowAddForm(false)} />
        </div>
      ) : (
        <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex justify-between">
            <TabsList>
              <TabsTrigger value="all">Tous</TabsTrigger>
              <TabsTrigger value="active">Actifs</TabsTrigger>
              <TabsTrigger value="inactive">Inactifs</TabsTrigger>
            </TabsList>

            <div className="relative w-64">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un guide..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <TabsContent value="all" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-3xl font-bold mb-2">Liste des guides de chasse</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredGuides.length > 0 ? (
                  renderGuidesTable(filteredGuides)
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-muted-foreground">Aucun guide de chasse trouvé</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="active" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-3xl font-bold mb-2">Guides de chasse actifs</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredGuides.filter(g => g.isActive).length > 0 ? (
                  renderGuidesTable(filteredGuides.filter(g => g.isActive))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-muted-foreground">Aucun guide de chasse actif trouvé</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive" className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-3xl font-bold mb-2">Guides de chasse inactifs</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredGuides.filter(g => !g.isActive).length > 0 ? (
                  renderGuidesTable(filteredGuides.filter(g => !g.isActive))
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-muted-foreground">Aucun guide de chasse inactif trouvé</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Dialogue d'édition d'un guide (réutilise le formulaire de création) */}
      {editGuide && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="sm:max-w-[720px] w-[95vw] max-h-[90vh] overflow-y-auto p-4">
            <DialogHeader>
              <DialogTitle>Modifier le guide</DialogTitle>
            </DialogHeader>
            <HuntingGuideForm
              mode="edit"
              initialValues={{
                id: editGuide.id,
                firstName: editGuide.lastName,
                lastName: editGuide.firstName,
                phone: editGuide.phone ?? "",
                // préférer 'zone' si déjà exposé par l'API, sinon 'departement'
                zone: (editGuide as any).zone || (editGuide as any).departement || "",
                departement: (editGuide as any).departement,
                region: editGuide.region ?? "",
                zoneId: (editGuide as any).zoneId ?? null,
                idNumber: editGuide.idNumber ?? undefined,
                photo: (editGuide as any).photo,
                username: (editGuide as any).username,
                isActive: editGuide.isActive,
              }}
              onSuccess={() => {
                setShowEditDialog(false);
                setEditGuide(null);
              }}
              onCancel={() => {
                setShowEditDialog(false);
                setEditGuide(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
