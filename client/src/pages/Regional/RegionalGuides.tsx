import { HuntingGuideForm } from "@/components/guides/HuntingGuideForm";
import ResponsivePage from "@/components/layout/ResponsivePage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { HuntingGuide } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import {
    CheckCircle,
    Edit,
    Eye,
    Loader2,
    MapPin,
    Phone,
    Plus,
    Search,
    UserX
} from "lucide-react";
import { useState } from "react";
// import MainLayout from "@/components/layout/MainLayout"; // Removed to prevent double layout

export default function RegionalGuidesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editGuide, setEditGuide] = useState<(HuntingGuide & { username?: string }) | null>(null);
  const [processing, setProcessing] = useState<{[key: number]: boolean}>({});
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewGuide, setViewGuide] = useState<HuntingGuide | null>(null);

  // Récupération des guides de chasse de la région de l'agent
  const { data: guides = [], isLoading } = useQuery<HuntingGuide[]>({
    queryKey: ["/api/guides"],
    enabled: user?.role === "agent" || user?.role === "sub-agent",
  });

  // Filtrer les guides en fonction du terme de recherche
  const filteredGuides = guides.filter((guide) => {
    // Afficher uniquement les guides de la même région que l'agent régional
    if (user?.region && guide.region !== user.region) {
      return false;
    }
    const searchValue = searchTerm.toLowerCase();
    return (
      guide.firstName.toLowerCase().includes(searchValue) ||
      guide.lastName.toLowerCase().includes(searchValue) ||
      (guide.phone ?? "").includes(searchValue) ||
      ((guide as any).departement && String((guide as any).departement).toLowerCase().includes(searchValue)) ||
      ((guide as any).zone && String((guide as any).zone).toLowerCase().includes(searchValue)) ||
      (guide.idNumber ?? "").includes(searchValue)
    );
  });

  // Visualiser les détails d'un guide
  const viewGuideDetails = (guide: HuntingGuide) => {
    console.log('[RegionalGuides] Open view modal for guide:', guide);
    setViewGuide(guide);
    setShowViewDialog(true);
  };

  const toggleGuideStatus = async (id: number, isActive: boolean) => {
    setProcessing(prev => ({ ...prev, [id]: true }));
    try {
      await apiRequest({ url: `/api/guides/${id}/status`, method: "PATCH", data: { isActive: !isActive } });
      toast({ title: `Guide ${!isActive ? "activé" : "désactivé"}`, description: `Le guide a été ${!isActive ? "activé" : "désactivé"} avec succès.` });
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
    } catch (e:any) {
      toast({ title: "Erreur", description: e?.body?.message || e?.message || "Impossible de modifier le statut", variant: "destructive" });
    } finally {
      setProcessing(prev => ({ ...prev, [id]: false }));
    }
  };

  // Rendu du tableau de guides
  const renderGuidesTable = (guides: HuntingGuide[]) => {
    return (
      <div className="w-full overflow-x-auto border rounded-md">
        <Table className="min-w-full text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Département</TableHead>
              <TableHead className="hidden md:table-cell">N° pièce d'identité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guides.map((guide) => (
              <TableRow key={guide.id}>
                <TableCell>
                  <span className="font-medium">{guide.lastName}</span> {guide.firstName}
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <Phone className="h-4 w-4 mr-1 text-muted-foreground" />
                    {guide.phone}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1 text-muted-foreground" />
                    {((guide as any).departement || (guide as any).zone) ?? ""}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">{guide.idNumber}</TableCell>
                <TableCell>
                  <Badge
                    variant={guide.isActive ? "outline" : "destructive"}
                    className={guide.isActive ? "bg-green-50 text-green-700 hover:bg-green-50" : ""}
                  >
                    {guide.isActive ? "Actif" : "Inactif"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewGuideDetails(guide)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setEditGuide(guide); setShowEditDialog(true); }}
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {guides.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  Aucun résultat trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (!user || (user.role !== "agent" && user.role !== "sub-agent")) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Accès non autorisé</h2>
        <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
      </div>
    );
  }

  return (
    <ResponsivePage>
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Guides de Chasse Régionaux
            </h2>
            {user?.region && (
              <p className="text-muted-foreground">Région: {user.region}</p>
            )}
          </div>
          <div className="flex items-center justify-end">
            {!showAddForm && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="mr-2 h-4 w-4" /> Ajouter un guide
              </Button>
            )}
          </div>

          <Tabs defaultValue="all" className="space-y-4">
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

        {showAddForm && (
          <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
            <DialogContent className="max-w-2xl w-[90vw] sm:w-full max-h-[90vh] overflow-y-auto p-0">
              <DialogHeader>
                <DialogTitle>Ajouter un guide</DialogTitle>
              </DialogHeader>
              <HuntingGuideForm onSuccess={() => { setShowAddForm(false); }} onCancel={() => setShowAddForm(false)} />
            </DialogContent>
          </Dialog>
        )}

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Tous les guides de la région</CardTitle>
              <CardDescription>
                Liste complète des guides de chasse opérant dans votre région
              </CardDescription>
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
                  <p className="text-muted-foreground">Aucun guide de chasse trouvé dans votre région</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Guides actifs</CardTitle>
              <CardDescription>
                Guides de chasse actuellement actifs dans votre région
              </CardDescription>
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
                  <p className="text-muted-foreground">Aucun guide de chasse actif trouvé dans votre région</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Guides inactifs</CardTitle>
              <CardDescription>
                Guides de chasse actuellement inactifs dans votre région
              </CardDescription>
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
                  <p className="text-muted-foreground">Aucun guide de chasse inactif trouvé dans votre région</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editGuide && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl w-[90vw] sm:w-full max-h-[90vh] overflow-y-auto p-0">
            <DialogHeader>
              <DialogTitle>Modifier le guide #{editGuide.id}</DialogTitle>
            </DialogHeader>
            <HuntingGuideForm
              mode="edit"
              initialValues={{
                id: editGuide.id,
                firstName: editGuide.firstName,
                lastName: editGuide.lastName,
                phone: editGuide.phone ?? "",
                zone: (editGuide as any).zone || (editGuide as any).departement || "",
                departement: (editGuide as any).departement,
                region: editGuide.region ?? "",
                zoneId: (editGuide as any).zoneId ?? null,
                idNumber: editGuide.idNumber ?? undefined,
                photo: (editGuide as any).photo,
                username: (editGuide as any).username,
                isActive: editGuide.isActive,
              }}
              onSuccess={() => { setShowEditDialog(false); setEditGuide(null); }}
              onCancel={() => { setShowEditDialog(false); setEditGuide(null); }}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={showViewDialog} onOpenChange={(open) => {
        if (!open) setViewGuide(null);
        setShowViewDialog(open);
      }}>
        <DialogContent className="sm:max-w-[500px] w-[90vw] z-[1000]">
          <DialogHeader className="text-center">
            <DialogTitle>
              {viewGuide ? (
                <>Détails du Guide: {viewGuide.lastName} {viewGuide.firstName}</>
              ) : (
                'Détails du Guide'
              )}
            </DialogTitle>
          </DialogHeader>
          {viewGuide ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div>
                <div className="text-xs text-muted-foreground">Téléphone</div>
                <div className="font-medium">{viewGuide.phone}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">N° pièce d'identité</div>
                <div className="font-medium">{viewGuide.idNumber}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Département</div>
                <div className="font-medium">{((viewGuide as any).departement || (viewGuide as any).zone) ?? ""}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Région</div>
                <div className="font-medium">{viewGuide.region}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Statut</div>
                <div>
                  <Badge
                    variant={viewGuide.isActive ? "outline" : "destructive"}
                    className={viewGuide.isActive ? "bg-green-50 text-green-700 hover:bg-green-50" : ""}
                  >
                    {viewGuide.isActive ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-muted-foreground text-sm">Chargement…</div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => { setShowViewDialog(false); setViewGuide(null); }}>Fermer</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  </ResponsivePage>
);
}
