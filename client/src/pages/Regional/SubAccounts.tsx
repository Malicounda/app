import { AddAgentSubAccountForm } from "@/components/agents/AddAgentSubAccountForm";
import ResponsivePage from "@/components/layout/ResponsivePage";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Eye, EyeOff, Lock, MoreHorizontal, Trash2, User, UserPlus } from "lucide-react";
import { useState } from "react";

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
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";

// Types
interface User {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'agent' | 'hunter' | 'sub-agent';
  phone: string;
  region?: string;
  isSuspended?: boolean;
  matricule?: string;
  serviceLocation?: string;
}

import { useRef } from "react";

export default function SubAccounts() {
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSuspensionDialogOpen, setIsSuspensionDialogOpen] = useState(false);
  const [suspensionAction, setSuspensionAction] = useState<'suspend' | 'activate'>('suspend');
  const [isAddSubAccountDialogOpen, setIsAddSubAccountDialogOpen] = useState(false);

  // Requête pour récupérer tous les utilisateurs
  const regionalAgentApiEndpoint = "/api/regional/my-sector-agents"; // Nouvel endpoint dédié

  const { data: users = [], isLoading, refetch } = useQuery<User[]>({
    queryKey: [regionalAgentApiEndpoint], // Utilisation du nouvel endpoint
    refetchOnWindowFocus: false,
    // La fonction 'select' n'est plus nécessaire ici,
    // car nous supposons que le backend retourne déjà les données filtrées
    // pour l'agent régional connecté.
    // Assurez-vous que l'endpoint `regionalAgentApiEndpoint` retourne bien
    // un tableau d'utilisateurs (agents secteur) pertinent.
  });

  // Mutation pour réinitialiser le mot de passe d'un utilisateur
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) => {
      return apiRequest({
        url: `/api/users/${userId}`,
        method: "PUT",
        data: { password },
      });
    },
    onSuccess: () => {
      toast({
        title: "Mot de passe réinitialisé",
        description: "Le mot de passe a été mis à jour avec succès.",
      });
      setIsResetPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec de la réinitialisation du mot de passe.",
      });
    },
  });

  // Mutation pour supprimer un utilisateur
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      console.log(`🚫 Tentative de suppression du sous-compte ${userId}`);

      try {
        const response = await apiRequest({
          url: `/api/users/${userId}`,
          method: "DELETE",
        });
        console.log(`✅ Réponse de suppression:`, response);
        return response;
      } catch (error) {
        console.error(`❌ Erreur lors de la suppression du sous-compte ${userId}:`, error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log("✅ Suppression réussie:", data);
      toast({
        title: "Agent Secteur supprimé",
        description: "L'Agent Secteur a été supprimé avec succès.",
      });
      setIsDeleteDialogOpen(false);
      refetch();
    },
    onError: (error: any) => {
      console.error("❌ Erreur détaillée:", error);

      // Message personnalisé en fonction du statut de l'erreur
      let errorMessage = "Échec de la suppression de l'Agent Secteur.";

      if (error.response?.status === 403) {
        errorMessage = "Vous n'avez pas les permissions nécessaires pour supprimer ce compte.";
      } else if (error.response?.status === 404) {
        errorMessage = "Utilisateur introuvable.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }

      toast({
        variant: "destructive",
        title: "Erreur",
        description: errorMessage
      });
    },
  });

  // Mutation pour suspendre/réactiver un utilisateur
  const toggleSuspensionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: number; action: 'suspend' | 'activate' }) => {
      return apiRequest({
        url: `/api/users/${userId}/${action}`,
        method: "PUT",
      });
    },
    onSuccess: () => {
      toast({
        title: suspensionAction === 'suspend' ? "Compte suspendu" : "Compte réactivé",
        description: suspensionAction === 'suspend'
          ? "Le compte a été suspendu avec succès."
          : "Le compte a été réactivé avec succès.",
      });
      setIsSuspensionDialogOpen(false);
      refetch();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: suspensionAction === 'suspend'
          ? "Échec de la suspension du compte."
          : "Échec de la réactivation du compte.",
      });
    },
  });

  const handleResetPassword = (user: User) => {
    setSelectedUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsResetPasswordDialogOpen(true);
  };

  const handleDeleteUser = (user: User) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const handleToggleSuspension = (user: User) => {
    setSelectedUser(user);
    setSuspensionAction(user.isSuspended ? 'activate' : 'suspend');
    setIsSuspensionDialogOpen(true);
  };

  const confirmResetPassword = () => {
    if (!selectedUser) return;
    if (!newPassword || newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Mot de passe invalide",
        description: "Le mot de passe doit contenir au moins 6 caractères.",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Confirmation incorrecte",
        description: "Les deux mots de passe ne correspondent pas.",
      });
      return;
    }
    resetPasswordMutation.mutate({ userId: selectedUser.id, password: newPassword });
  };

  const confirmDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  const confirmSuspensionAction = () => {
    if (selectedUser) {
      toggleSuspensionMutation.mutate({
        userId: selectedUser.id,
        action: suspensionAction
      });
    }
  };

  const resolveSectorLabel = (u: any) => {
    const rawRegion = (u?.region || '').trim();
    const regionKey = rawRegion
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '-');
    const sectorValue = (u?.zone || u?.departement || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/\s+/g, '-');
    const list = (departmentsByRegion as any)[regionKey] as Array<{ value: string; label: string }>|undefined;
    const found = list?.find(d => d.value === sectorValue);
    const label = found?.label?.replace(/^Secteur\s+/i, '');
    const fallback = sectorValue ? sectorValue.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '';
    return label || fallback || '-';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="mt-4 text-lg">Chargement des données...</p>
        </div>
      </div>
    );
  }

  return (
    <ResponsivePage>
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">Chef de division</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">Agents Secteur de votre région</div>
                <div className="text-sm text-muted-foreground">Gérez les Agents Secteur rattachés à votre région</div>
              </div>
              <div className="flex gap-2">
                <Button
                  ref={addButtonRef}
                  size="sm"
                  className="bg-green-700 hover:bg-green-800 text-white"
                  onClick={() => setIsAddSubAccountDialogOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" /> Ajouter un Agent Secteur
                </Button>
              </div>
            </div>

            <div className="w-full overflow-x-auto rounded-md border">
              <Table className="min-w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">ID</TableHead>
                    <TableHead>Nom d'utilisateur</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead className="hidden sm:table-cell">Prénom</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead className="hidden md:table-cell">Matricule</TableHead>
                    <TableHead>Secteur</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">Chargement...</TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                        Aucun Agent Secteur trouvé dans votre région
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="hidden md:table-cell">
                          <Avatar className="h-8 w-8">
                            {/* If you have a profile image, you can set it via AvatarImage */}
                            {/* <AvatarImage src={user.avatarUrl} alt={user.username} /> */}
                            <AvatarFallback className="bg-green-600 text-white">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>{user.username}</TableCell>
                        <TableCell>{user.lastName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{user.firstName}</TableCell>
                        <TableCell>{user.phone}</TableCell>
                        <TableCell className="hidden md:table-cell">{user.matricule ?? '-'}</TableCell>
                        <TableCell>{resolveSectorLabel(user)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="outline">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                <Lock className="mr-2 h-4 w-4" />
                                Réinitialiser le mot de passe
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleSuspension(user)}>
                                {user.isSuspended ? (
                                  <>
                                    <Check className="mr-2 h-4 w-4" />
                                    Réactiver le compte
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                    Suspendre le compte
                                  </>
                                )}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDeleteUser(user)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Supprimer
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="text-xs text-center text-muted-foreground mt-3">Liste des Agents Secteur</div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogue de réinitialisation de mot de passe */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définir un nouveau mot de passe pour {selectedUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  name="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showNewPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  aria-label={showConfirmPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetPasswordDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={confirmResetPassword}>
              Mettre à jour
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de suppression */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'Agent Secteur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cet Agent Secteur? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser} className="bg-red-600 hover:bg-red-700">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogue de suspension/réactivation */}
      <AlertDialog open={isSuspensionDialogOpen} onOpenChange={setIsSuspensionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspensionAction === 'suspend' ? 'Suspendre le compte' : 'Réactiver le compte'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspensionAction === 'suspend'
                ? "Êtes-vous sûr de vouloir suspendre ce compte? L'utilisateur ne pourra plus se connecter."
                : "Êtes-vous sûr de vouloir réactiver ce compte? L'utilisateur pourra à nouveau se connecter."
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSuspensionAction}
              className={suspensionAction === 'suspend' ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              {suspensionAction === 'suspend' ? 'Suspendre' : 'Réactiver'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Formulaire d'ajout d'agent secteur */}
      <AddAgentSubAccountForm
        open={isAddSubAccountDialogOpen}
        onClose={() => setIsAddSubAccountDialogOpen(false)}
        mode="agent"
        triggerRef={addButtonRef}
      />
    </ResponsivePage>
  );
}
