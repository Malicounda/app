import ResponsivePage from "@/components/layout/ResponsivePage";
import SubAccounts from "@/pages/Regional/SubAccounts";
import { useState } from "react";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { IdBadge } from "@/components/ui/id-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { departmentsByRegion } from '@/lib/constants';
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit, Eye, EyeOff, Plus, RefreshCw, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import type { ChangeEvent } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Le numéro de téléphone sera saisi sans l'indicatif +221 qui est affiché séparément
const formatPhoneNumber = (value: string) => {
  // Supprimer tout ce qui n'est pas un chiffre
  const numbers = value.replace(/[^\d]/g, '');

  // Limiter à 9 chiffres pour un numéro sénégalais
  return numbers.slice(0, 9);
};

interface SectorAgent {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  telephone: string;
  phone: string;
  matricule: string;
  sector: string;
  zone: string;
  departement?: string;
  isActive: boolean;
  email: string;
}

// Schéma de validation pour le formulaire d'ajout d'agent
const createSectorAgentSchema = z.object({
  firstName: z.string().min(2, { message: "Le prénom doit contenir au moins 2 caractères" }),
  lastName: z.string().min(2, { message: "Le nom doit contenir au moins 2 caractères" }),
  username: z.string().min(3, { message: "Le nom d'utilisateur doit contenir au moins 3 caractères" }),
  email: z.string().email({ message: "Format d'email invalide" }),
  password: z.string().min(6, { message: "Le mot de passe doit contenir au moins 6 caractères" }),
  telephone: z.string().min(8, { message: "Le numéro de téléphone doit contenir au moins 8 caractères" }),
  matricule: z.string().min(3, { message: "Le matricule doit contenir au moins 3 caractères" }),
  sector: z.string({ required_error: "Veuillez sélectionner un secteur" }),
});

type CreateSectorAgentFormValues = z.infer<typeof createSectorAgentSchema>;

export default function AgentsSecteur() {
  const { user } = useAuth();
  if (user?.role !== "agent") {
    return <div style={{padding: 40, color: 'red', fontWeight: 'bold'}}>Accès refusé : cette page est réservée aux agents régionaux.</div>;
  }
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Récupérer les secteurs en fonction de la région de l'agent connecté
  const getSectorsByRegion = (region: string | undefined) => {
    if (!region) return [];

    // Récupérer les départements pour cette région
    const regionDepartments = departmentsByRegion[region as keyof typeof departmentsByRegion] || [];

    // Transformer en format pour le select
    return regionDepartments.map(dept => ({
      id: dept.value,
      name: dept.label.replace("Secteur ", "")
    }));
  };

  // Liste des secteurs disponibles dans la région de l'agent connecté
  const sectors = getSectorsByRegion(user?.region);

  // Formulaire de création d'agent
  const form = useForm<CreateSectorAgentFormValues>({
    resolver: zodResolver(createSectorAgentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      username: "",
      email: "",
      password: "",
      telephone: "",
      matricule: "",
      sector: "",
    },
  });

  // Mutation pour créer un agent de secteur
  const createAgentMutation = useMutation({
    mutationFn: async (data: CreateSectorAgentFormValues) => {
      try {
        // Utiliser le numéro tel quel (commence déjà par 7)
        const formattedPhone = data.telephone;

        // Ajouter la région de l'agent connecté aux données
        const agentData = {
          ...data,
          telephone: formattedPhone,
          role: "sub-agent",
          region: user?.region,
          // IMPORTANT: le backend attend 'departement' (secteur)
          departement: data.sector,
        };

        console.log('Envoi des données agent:', agentData);

        // Utiliser fetch directement pour avoir plus de contrôle sur la réponse
        const response = await fetch('/api/users/create-agent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...agentData,
            isActive: true, // S'assurer que le compte est activé dès la création
            phone: formattedPhone, // Utiliser le champ phone au lieu de telephone pour la compatibilité
          }),
          credentials: 'include',
        });

        // Vérifier si la réponse est OK
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }

        // Essayer de parser la réponse JSON
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        } else {
          // Si ce n'est pas du JSON, retourner le texte
          const text = await response.text();
          return { success: true, message: text };
        }
      } catch (err: any) {
        console.error('Erreur lors de la création de l\'agent:', err);
        throw new Error(err.message || 'Erreur lors de la création de l\'agent');
      }
    },
    onSuccess: () => {
      toast({
        title: "Agent créé avec succès",
        description: "Le nouvel agent de secteur a été ajouté.",
      });
      setDialogOpen(false);
      form.reset();
      // Actualiser la liste des agents
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
    },
    onError: (error: any) => {
      console.error('Détails de l\'erreur:', error);
      toast({
        title: "Erreur lors de la création",
        description: error.message || "Une erreur s'est produite, veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  // Gérer la soumission du formulaire
  // Mutation pour modifier un agent de secteur
  const updateAgentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: Partial<SectorAgent> }) => {
      try {
        const response = await fetch(`/api/users/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.error('Erreur lors de la modification de l\'agent:', err);
        throw new Error(err.message || 'Erreur lors de la modification de l\'agent');
      }
    },
    onSuccess: () => {
      toast({
        title: "Agent modifié avec succès",
        description: "Les informations de l'agent ont été mises à jour.",
      });
      setEditDialogOpen(false);
      // Actualiser la liste des agents
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
    },
    onError: (error: any) => {
      console.error('Détails de l\'erreur:', error);
      toast({
        title: "Erreur lors de la modification",
        description: error.message || "Une erreur s'est produite, veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  // Mutation pour supprimer un agent de secteur
  const deleteAgentMutation = useMutation({
    mutationFn: async (id: number) => {
      try {
        const response = await fetch(`/api/users/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.error('Erreur lors de la suppression de l\'agent:', err);
        throw new Error(err.message || 'Erreur lors de la suppression de l\'agent');
      }
    },
    onSuccess: () => {
      toast({
        title: "Agent supprimé avec succès",
        description: "L'agent de secteur a été supprimé.",
      });
      setDeleteDialogOpen(false);
      // Actualiser la liste des agents
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
    },
    onError: (error: any) => {
      console.error('Détails de l\'erreur:', error);
      toast({
        title: "Erreur lors de la suppression",
        description: error.message || "Une erreur s'est produite, veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  // Mutation pour activer/désactiver un agent de secteur
  const toggleAgentStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number, isActive: boolean }) => {
      try {
        const response = await fetch(`/api/users/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ isActive }),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.error('Erreur lors de la modification du statut de l\'agent:', err);
        throw new Error(err.message || 'Erreur lors de la modification du statut de l\'agent');
      }
    },
    onSuccess: (_, variables) => {
      toast({
        title: variables.isActive ? "Agent activé" : "Agent désactivé",
        description: variables.isActive ? "L'agent peut maintenant se connecter." : "L'agent ne peut plus se connecter.",
      });
      // Actualiser la liste des agents
      queryClient.invalidateQueries({ queryKey: [`/api/users`] });
    },
    onError: (error: any) => {
      console.error('Détails de l\'erreur:', error);
      toast({
        title: "Erreur lors de la modification du statut",
        description: error.message || "Une erreur s'est produite, veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  // Mutation pour réinitialiser le mot de passe d'un agent
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: number, newPassword: string }) => {
      try {
        const response = await fetch(`/api/users/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ password: newPassword }),
          credentials: 'include',
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Erreur ${response.status}: ${errorText}`);
        }

        return await response.json();
      } catch (err: any) {
        console.error('Erreur lors de la réinitialisation du mot de passe:', err);
        throw new Error(err.message || 'Erreur lors de la réinitialisation du mot de passe');
      }
    },
    onSuccess: () => {
      toast({
        title: "Mot de passe réinitialisé",
        description: "Le mot de passe de l'agent a été modifié avec succès.",
      });
      setResetPasswordDialogOpen(false);
      setNewPassword("");
      setShowNewPassword(false);
    },
    onError: (error: any) => {
      console.error('Détails de l\'erreur:', error);
      toast({
        title: "Erreur lors de la réinitialisation du mot de passe",
        description: error.message || "Une erreur s'est produite, veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateSectorAgentFormValues) => {
    createAgentMutation.mutate(data);
  };

  // État pour les dialogues
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SectorAgent | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Fetcher les agents de secteur pour la région de l'agent connecté
  const { data: agentsSecteur = [], isLoading, refetch } = useQuery<SectorAgent[]>({
    queryKey: [user?.region ? `/api/users/by-region/${user?.region}` : null],
    enabled: !!user?.region,
    queryFn: async ({ queryKey }) => {
      try {
        console.log('Récupération des agents pour la région:', user?.region);
        const response = await fetch(queryKey[0] as string, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error(`Erreur lors de la récupération des agents: ${response.status}`);
        }

        const allUsers = await response.json();
        console.log('Agents récupérés:', allUsers);

        // Filtrer simplement pour n'avoir que les agents de secteur (sub-agent) de la région
        const filteredAgents = allUsers.filter((agentItem: any) => {
          return agentItem.role === 'sub-agent' && agentItem.region === user?.region;
        });

        console.log('Agents filtrés:', filteredAgents);
        return filteredAgents;
      } catch (error) {
        console.error('Erreur dans la récupération des agents:', error);
        throw error;
      }
    },
  });

  return (
    <ResponsivePage>
      <div className="space-y-4">
      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          {/* En-tête */}
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h1 className="text-xl font-semibold">Agents Secteur de votre Région</h1>
            <div className="flex gap-2">
              <Button variant="outline" className="flex items-center" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Actualiser
              </Button>
              <Button
                className="flex items-center bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Ajouter un Agent Secteur
              </Button>

              {/* Dialogue pour ajouter un agent */}
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Ajouter un Agent Secteur</DialogTitle>
                    <DialogDescription>
                      Créez un nouvel Agent Secteur dans votre région
                    </DialogDescription>
                  </DialogHeader>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Prénom */}
                        <FormField
                          control={form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Prénom</FormLabel>
                              <FormControl>
                                <Input placeholder="Prénom" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Nom */}
                        <FormField
                          control={form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nom</FormLabel>
                              <FormControl>
                                <Input placeholder="Nom" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {/* Nom d'utilisateur */}
                        <FormField
                          control={form.control}
                          name="username"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Nom d'utilisateur</FormLabel>
                              <FormControl>
                                <Input placeholder="Nom d'utilisateur" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Email */}
                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input placeholder="Email" type="email" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Mot de passe */}
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Mot de passe</FormLabel>
                            <div className="relative">
                              <FormControl>
                                <Input
                                  placeholder="Mot de passe"
                                  type={showPassword ? "text" : "password"}
                                  {...field}
                                />
                              </FormControl>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full px-3"
                                onClick={() => setShowPassword(!showPassword)}
                              >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </Button>
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-2 gap-4">
                        {/* Téléphone */}
                        <FormField
                          control={form.control}
                          name="telephone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Téléphone</FormLabel>
                              <FormControl>
                                <div className="flex">
                                  <div className="bg-gray-100 flex items-center justify-center px-3 border border-r-0 rounded-l-md">
                                    +221
                                  </div>
                                  <Input
                                    placeholder="7X XXX XX XX"
                                    className="rounded-l-none"
                                    {...field}
                                    value={formatPhoneNumber(field.value || '')}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                      // Extraire seulement les chiffres pour le stockage
                                      const rawValue = e.target.value.replace(/[^\d]/g, '');
                                      // S'assurer que le numéro commence par 7
                                      const validValue = rawValue.startsWith('7') ? rawValue : '7' + rawValue.slice(rawValue.startsWith('7') ? 1 : 0);
                                      field.onChange(validValue);
                                    }}
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Matricule */}
                        <FormField
                          control={form.control}
                          name="matricule"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Matricule</FormLabel>
                              <FormControl>
                                <Input placeholder="Matricule" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Secteur */}
                      <FormField
                        control={form.control}
                        name="sector"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Secteur</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              value={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Sélectionner un secteur" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {sectors.map((sector) => (
                                  <SelectItem key={sector.id} value={sector.id}>
                                    {sector.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <DialogFooter className="pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setDialogOpen(false)}
                        >
                          Annuler
                        </Button>
                        <Button
                          type="submit"
                          className="bg-green-600 hover:bg-green-700"
                          disabled={createAgentMutation.isPending}
                        >
                          Créer l'Agent Secteur
                        </Button>
                      </DialogFooter>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Section d'information */}
          <div className="bg-gray-50 p-4 text-sm text-gray-600">
            Chefs de la division faune rattachés à votre région
          </div>

          {/* Tableau des agents */}
          <div className="w-full overflow-x-auto border rounded-md">
            <table className="w-full min-w-[900px] text-sm text-left">
              <thead className="bg-gray-100 text-gray-600">
                <tr>
                  <th className="px-4 py-3 hidden md:table-cell">ID</th>
                  <th className="px-4 py-3">Nom d'utilisateur</th>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Prénom</th>
                  <th className="px-4 py-3">Téléphone</th>
                  <th className="px-4 py-3 hidden md:table-cell">Matricule</th>
                  <th className="px-4 py-3">Secteur</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4">Chargement...</td>
                  </tr>
                ) : agentsSecteur.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4">Aucun agent de secteur trouvé dans votre région</td>
                  </tr>
                ) : (
                  agentsSecteur.map((agent) => (
                    <tr key={agent.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 hidden md:table-cell"><IdBadge id={agent.id} type="agent" /></td>
                      <td className="px-4 py-3">{agent.username}</td>
                      <td className="px-4 py-3">{agent.lastName}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">{agent.firstName}</td>
                      <td className="px-4 py-3">{agent.phone || agent.telephone}</td>
                      <td className="px-4 py-3 hidden md:table-cell">{agent.matricule}</td>
                      <td className="px-4 py-3">{agent.zone || agent.sector}</td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="flex items-center">
                              Actions <ChevronDown className="h-4 w-4 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedAgent(agent);
                                setNewPassword("");
                                setConfirmPassword("");
                                setShowNewPassword(false);
                                setShowConfirmPassword(false);
                                setResetPasswordDialogOpen(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Réinitialiser le mot de passe
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedAgent(agent);
                                setEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Modifier
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => toggleAgentStatusMutation.mutate({
                                id: agent.id,
                                isActive: !agent.isActive
                              })}
                            >
                              {agent.isActive ? (
                                <>
                                  <ToggleLeft className="h-4 w-4 mr-2" />
                                  Désactiver
                                </>
                              ) : (
                                <>
                                  <ToggleRight className="h-4 w-4 mr-2" />
                                  Activer
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedAgent(agent);
                                setDeleteDialogOpen(true);
                              }}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pied de tableau */}

    {/* Pied de tableau */}
    <div className="bg-gray-50 p-3 text-sm text-gray-500 text-center border-t border-gray-200">
      Liste des Agents Secteur
    </div>
  </CardContent>
</Card>

{/* Dialogue de confirmation de suppression */}
<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
      <AlertDialogDescription>
        Êtes-vous sûr de vouloir supprimer l'agent {selectedAgent?.firstName} {selectedAgent?.lastName} ?
        Cette action est irréversible et supprimera définitivement le compte de cet agent.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Annuler</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => selectedAgent && deleteAgentMutation.mutate(selectedAgent.id)}
        className="bg-red-600 hover:bg-red-700"
      >
        Supprimer
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>

{/* Dialogue de réinitialisation de mot de passe */}
<Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
      <DialogDescription>
        Définir un nouveau mot de passe pour {selectedAgent?.firstName} {selectedAgent?.lastName}.
      </DialogDescription>
    </DialogHeader>
    <div className="py-4">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="newPassword">Nouveau mot de passe</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showNewPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
              className="pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
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
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              className="pr-10"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
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
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setResetPasswordDialogOpen(false)}
      >
        Annuler
      </Button>
      <Button
        onClick={() => {
          if (!selectedAgent) return;
          if (!newPassword || newPassword.length < 6) {
            toast({
              title: "Mot de passe invalide",
              description: "Le mot de passe doit contenir au moins 6 caractères.",
              variant: "destructive",
            });
            return;
          }
          if (newPassword !== confirmPassword) {
            toast({
              title: "Confirmation incorrecte",
              description: "Les deux mots de passe ne correspondent pas.",
              variant: "destructive",
            });
            return;
          }
          resetPasswordMutation.mutate({ id: selectedAgent.id, newPassword });
        }}
      >
        Mettre à jour
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
<SubAccounts />
</div>
</ResponsivePage>
);
}
