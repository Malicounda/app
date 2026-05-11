import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { isSectorSubRole } from "@/utils/navigation";
import { HuntingGuide } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import {
    Eye,
    Loader2,
    Phone,
    Search
} from "lucide-react";
import { useState } from "react";

export default function SectorGuidesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [viewGuide, setViewGuide] = useState<HuntingGuide | null>(null);

  // Récupération explicite des guides du département via l'endpoint dédié
  const dept = (user as any)?.departement || (user as any)?.zone || "";
  const { data: guides = [], isLoading } = useQuery<HuntingGuide[]>({
    queryKey: [`/api/guides/by-departement/${encodeURIComponent(dept)}`],
    enabled: isSectorSubRole(user?.role) && !!dept,
  });

  // Filtrer les guides en fonction du terme de recherche
  const filteredGuides = guides.filter((guide) => {
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
    setViewGuide(guide);
    setShowViewDialog(true);
  };

  // Rendu du tableau de guides
  const renderGuidesTable = (guides: HuntingGuide[]) => {
    return (
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Département</TableHead>
              <TableHead>N° pièce d'identité</TableHead>
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
                  {((guide as any).departement || (guide as any).zone) ?? ""}
                </TableCell>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewGuideDetails(guide)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {guides.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  Aucun résultat trouvé
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  };

  if (!user || !isSectorSubRole(user.role)) {
    return (
      <div className="flex-1 space-y-4 p-8 pt-6">
        <h2 className="text-3xl font-bold tracking-tight">Accès non autorisé</h2>
        <p>Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Guides de Chasse Secteur
          </h2>
          {(user as any)?.departement || user?.zone ? (
            <p className="text-muted-foreground">Département: {(user as any)?.departement || user?.zone}</p>
          ) : null}
        </div>
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

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Tous les guides du secteur</CardTitle>
              <CardDescription>
                Liste complète des guides de chasse opérant dans votre secteur
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
                  <p className="text-muted-foreground">Aucun guide de chasse trouvé dans votre secteur</p>
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
                Guides de chasse actuellement actifs dans votre secteur
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
                  <p className="text-muted-foreground">Aucun guide de chasse actif trouvé dans votre secteur</p>
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
                Guides de chasse actuellement inactifs dans votre secteur
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
                  <p className="text-muted-foreground">Aucun guide de chasse inactif trouvé dans votre secteur</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showViewDialog} onOpenChange={(open) => { if (!open) setViewGuide(null); setShowViewDialog(open); }} modal={false}>
        <DialogContent className="sm:max-w-[700px] w-[95vw] z-[1000]" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
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
  );
}
