import React, { useState } from "react";
import { useGuardians } from "@/lib/hooks/useGuardians";
import MainLayout from "@/components/layout/MainLayout";
import { GuardianDetails } from "@/components/guardians/GuardianDetails";
import { GuardianDialog } from "@/components/guardians/GuardianDialog";
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
import { Button } from "@/components/ui/button";
import { PlusCircle, Search, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/contexts/AuthContext";
import type { Guardian } from "@shared/schema";

export default function GuardiansPage() {
  const { user } = useAuth();
  const {
    guardians,
    guardianLoading,
    createGuardian,
    updateGuardian,
    deleteGuardian,
  } = useGuardians();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGuardian, setSelectedGuardian] = useState<Guardian | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isAdmin = user?.role === "admin";
  const canManageGuardians = isAdmin || user?.role === "agent";

  // Filtrer les tuteurs en fonction du terme de recherche
  const guardiansList: Guardian[] = Array.isArray(guardians) ? (guardians as Guardian[]) : [];
  const filteredGuardians = guardiansList.filter((guardian: Guardian) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      guardian.firstName.toLowerCase().includes(searchLower) ||
      guardian.lastName.toLowerCase().includes(searchLower) ||
      guardian.idNumber.toLowerCase().includes(searchLower) ||
      (guardian.phone && guardian.phone.toLowerCase().includes(searchLower))
    );
  });

  const handleAddGuardian = (guardianData: Omit<Guardian, "id" | "createdAt">) => {
    createGuardian.mutate(guardianData, {
      onSuccess: () => {
        setIsAddDialogOpen(false);
      },
    });
  };

  const handleEditGuardian = (guardianData: Omit<Guardian, "id" | "createdAt">) => {
    if (selectedGuardian) {
      updateGuardian.mutate(
        { ...guardianData, id: selectedGuardian.id, createdAt: selectedGuardian.createdAt },
        {
          onSuccess: () => {
            setIsEditDialogOpen(false);
            setSelectedGuardian(null);
          },
        }
      );
    }
  };

  const handleDeleteGuardian = () => {
    if (selectedGuardian) {
      deleteGuardian.mutate(selectedGuardian.id, {
        onSuccess: () => {
          setIsDeleteDialogOpen(false);
          setSelectedGuardian(null);
        },
      });
    }
  };

  return (
    <MainLayout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Gestion des Tuteurs</h1>
          {canManageGuardians && (
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <PlusCircle className="h-4 w-4 mr-2" /> Ajouter un tuteur
            </Button>
          )}
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Rechercher un tuteur par nom, prénom, numéro d'ID ou téléphone..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {guardianLoading ? (
          <div className="flex justify-center items-center py-12">
            <Spinner size="lg" />
          </div>
        ) : filteredGuardians?.length === 0 ? (
          <div className="text-center py-12">
            <UserRound className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun tuteur trouvé</h3>
            <p className="text-muted-foreground">
              {searchTerm
                ? "Aucun tuteur ne correspond à votre recherche"
                : "Aucun tuteur n'a encore été ajouté au système"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGuardians?.map((guardian: Guardian) => (
              <GuardianDetails
                key={guardian.id}
                guardian={guardian}
                isAdmin={isAdmin}
                onEdit={() => {
                  setSelectedGuardian(guardian);
                  setIsEditDialogOpen(true);
                }}
                onDelete={() => {
                  setSelectedGuardian(guardian);
                  setIsDeleteDialogOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog d'ajout d'un tuteur */}
      <GuardianDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onSubmit={handleAddGuardian}
        isSubmitting={createGuardian.isPending}
        title="Ajouter un tuteur"
        description="Remplissez les informations du tuteur pour un chasseur mineur."
      />

      {/* Dialog de modification d'un tuteur */}
      {selectedGuardian && (
        <GuardianDialog
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedGuardian(null);
          }}
          onSubmit={handleEditGuardian}
          isSubmitting={updateGuardian.isPending}
          defaultValues={{
            lastName: selectedGuardian.lastName,
            firstName: selectedGuardian.firstName,
            idNumber: selectedGuardian.idNumber,
            relationship: selectedGuardian.relationship,
            phone: selectedGuardian.phone || "",
            address: selectedGuardian.address || "",
          }}
          title="Modifier le tuteur"
          description="Mettre à jour les informations du tuteur."
        />
      )}

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce tuteur ? Cette action est irréversible.
              {" "}
              Les liens avec les chasseurs mineurs associés seront rompus, mais les chasseurs ne seront pas supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setSelectedGuardian(null);
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGuardian}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteGuardian.isPending ? <Spinner className="mr-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
