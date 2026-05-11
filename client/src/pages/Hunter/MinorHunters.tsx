import React, { useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, UserRound, Link as LinkIcon, AlertTriangle } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useHunters } from "@/lib/hooks/useHunters";
import { useGuardians } from "@/lib/hooks/useGuardians";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuardianDetails } from "@/components/guardians/GuardianDetails";
import { Link } from "wouter";
import type { Hunter, Guardian } from "@shared/schema";

// Type local pour inclure l'attribut optionnel guardianId présent côté backend/DB
interface HunterWithGuardian extends Hunter {
  guardianId?: number | null;
}

export default function MinorHuntersPage() {
  const { user } = useAuth();
  const { allHunters, huntersLoading } = useHunters();
  const { guardians, guardianLoading, associateGuardianToHunter } = useGuardians();
  const guardiansList: Guardian[] = Array.isArray(guardians) ? guardians : [];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedHunter, setSelectedHunter] = useState<any | null>(null);
  const [selectedGuardianId, setSelectedGuardianId] = useState<string>("");
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isViewGuardianDialogOpen, setIsViewGuardianDialogOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const canManageMinors = isAdmin || user?.role === "agent";

  // Filtrer uniquement les chasseurs mineurs ou ceux qui ont un statut de mineur
  const minorHunters = allHunters?.filter(
    (hunter) => hunter.isMinor || (
      hunter.dateOfBirth && isMinor(new Date(hunter.dateOfBirth))
    )
  );

  // Fonction pour vérifier si un chasseur est mineur en fonction de sa date de naissance
  function isMinor(dateOfBirth: Date): boolean {
    const today = new Date();
    const age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    // Si le mois de naissance n'est pas encore passé ou si c'est le même mois mais pas encore le jour,
    // alors l'âge réel est l'âge calculé moins 1
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      return age - 1 < 18;
    }

    return age < 18;
  }

  // Filtrer les chasseurs mineurs en fonction du terme de recherche
  const filteredMinorHunters = minorHunters?.filter((hunter) => {
    if (!searchTerm) return true;

    const searchLower = searchTerm.toLowerCase();
    return (
      hunter.firstName.toLowerCase().includes(searchLower) ||
      hunter.lastName.toLowerCase().includes(searchLower) ||
      hunter.idNumber.toLowerCase().includes(searchLower) ||
      (hunter.phone && hunter.phone.toLowerCase().includes(searchLower))
    );
  });

  // Obtenir le tuteur associé à un chasseur mineur
  const getGuardianForHunter = (hunterId: number, guardianId: number | null) => {
    if (!guardianId) return null;
    return guardiansList.find(guardian => guardian.id === guardianId) || null;
  };

  // Gérer l'association d'un tuteur à un chasseur mineur
  const handleLinkGuardian = () => {
    if (selectedHunter && selectedGuardianId) {
      associateGuardianToHunter.mutate(
        { hunterId: selectedHunter.id, guardianId: parseInt(selectedGuardianId) },
        {
          onSuccess: () => {
            setIsLinkDialogOpen(false);
            setSelectedHunter(null);
            setSelectedGuardianId("");
          },
        }
      );
    }
  };

  const openLinkDialog = (hunter: any) => {
    const h = hunter as unknown as HunterWithGuardian;
    setSelectedHunter(h);
    setSelectedGuardianId(h.guardianId?.toString() || "");
    setIsLinkDialogOpen(true);
  };

  const openViewGuardianDialog = (hunter: any) => {
    const h = hunter as unknown as HunterWithGuardian;
    if (h.guardianId) {
      setSelectedHunter(h);
      setIsViewGuardianDialogOpen(true);
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Chasseurs Mineurs</h1>
          <Link href="/minors/guardians">
            <Button variant="outline">
              Gestion des Tuteurs
            </Button>
          </Link>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Rechercher (nom, prénom, N° pièce, téléphone)"
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {huntersLoading || guardianLoading ? (
          <div className="flex justify-center items-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filteredMinorHunters?.length === 0 ? (
          <div className="text-center py-12">
            <UserRound className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun chasseur mineur trouvé</h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Aucun chasseur mineur ne correspond à votre recherche"
                : "Aucun chasseur mineur n'est enregistré dans le système"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMinorHunters?.map((hunter) => {
              const guardianId = (hunter as unknown as HunterWithGuardian).guardianId ?? null;
              const guardian = getGuardianForHunter(hunter.id, guardianId);
              return (
                <Card key={hunter.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <CardTitle>
                      {hunter.lastName.toUpperCase()} {hunter.firstName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-muted-foreground text-sm">ID</Label>
                        <div className="text-sm font-medium">{hunter.idNumber}</div>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-sm">Date de naissance</Label>
                        <div className="text-sm font-medium">
                          {new Date(hunter.dateOfBirth).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="text-muted-foreground text-sm">Tuteur associé</Label>
                      {guardian ? (
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-sm font-medium">
                            {guardian.firstName} {guardian.lastName}
                            <span className="text-xs ml-1 text-muted-foreground">({guardian.relationship})</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openViewGuardianDialog(hunter)}
                          >
                            Voir
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between mt-1">
                          <div className="text-sm text-amber-600 flex items-center">
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Aucun tuteur associé
                          </div>
                          {canManageMinors && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openLinkDialog(hunter)}
                            >
                              <LinkIcon className="h-3 w-3 mr-1" />
                              Associer
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="flex justify-end">
                      {guardian && canManageMinors && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openLinkDialog(hunter)}
                        >
                          <LinkIcon className="h-3 w-3 mr-1" />
                          Changer de tuteur
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog pour associer un tuteur */}
      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedHunter?.guardianId
                ? "Modifier le tuteur associé"
                : "Associer un tuteur"}
            </DialogTitle>
            <DialogDescription>
              {selectedHunter?.guardianId
                ? "Sélectionnez un nouveau tuteur pour ce chasseur mineur."
                : "Sélectionnez un tuteur à associer à ce chasseur mineur."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h3 className="font-medium">Chasseur mineur</h3>
              <p className="text-sm">
                {selectedHunter?.lastName.toUpperCase()} {selectedHunter?.firstName} (ID: {selectedHunter?.idNumber})
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="guardian-select">Sélectionner un tuteur</Label>
              <Select
                value={selectedGuardianId}
                onValueChange={setSelectedGuardianId}
              >
                <SelectTrigger id="guardian-select">
                  <SelectValue placeholder="Sélectionner un tuteur" />
                </SelectTrigger>
                <SelectContent>
                  {guardiansList.map((guardian) => (
                    <SelectItem key={guardian.id} value={guardian.id.toString()}>
                      {guardian.lastName} {guardian.firstName} - {guardian.relationship}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => {
                setIsLinkDialogOpen(false);
                setSelectedHunter(null);
                setSelectedGuardianId("");
              }}>
                Annuler
              </Button>
              <Button
                onClick={handleLinkGuardian}
                disabled={!selectedGuardianId || associateGuardianToHunter.isPending}
              >
                {associateGuardianToHunter.isPending && <Spinner className="mr-2" />}
                Confirmer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pour voir les détails du tuteur */}
      <Dialog
        open={isViewGuardianDialogOpen}
        onOpenChange={setIsViewGuardianDialogOpen}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Détails du tuteur</DialogTitle>
            <DialogDescription>
              Informations complètes sur le tuteur de {selectedHunter?.firstName} {selectedHunter?.lastName}
            </DialogDescription>
          </DialogHeader>

          {selectedHunter?.guardianId && (
            <>
              {(() => {
                const guardian = getGuardianForHunter(selectedHunter.id, selectedHunter.guardianId);
                return guardian ? (
                  <GuardianDetails guardian={guardian} />
                ) : (
                  <div className="text-center py-4">
                    <p>Impossible de charger les détails du tuteur.</p>
                  </div>
                );
              })()}

              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => setIsViewGuardianDialogOpen(false)}
                >
                  Fermer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
