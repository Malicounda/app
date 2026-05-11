import AddAgentForm from "@/components/agents/AddAgentForm";
import AgentForm from "@/components/agents/AgentForm";
// ResponsivePage removed: MainLayout supplies the page-frame wrapper
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
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
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDownIcon, Download, Edit, Eye, EyeOff, Printer, RefreshCw, Search, Trash2, User, UserPlus } from "lucide-react";
import { useState } from "react";

// Types
type TabKey = 'admins' | 'agents' | 'subagents' | 'guides' | 'hunters';

interface User {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'agent' | 'sub-agent' | 'hunter' | 'guide' | 'hunting-guide';
  phone: string | null;
  region?: string | null;
  isSuspended?: boolean;
  matricule?: string | null;
  serviceLocation?: string | null;
  assignmentPost?: string | null;
  guideId?: number;  // ID référençant un guide de chasse
}

interface Guide {
  id: number;
  lastName: string;
  firstName: string;
  phone: string;
  zone?: string | null;
  region?: string | null;
  idNumber: string;
  photo?: string | null;
  userId?: number;  // ID référençant l'utilisateur associé
  username?: string; // Nom d'utilisateur associé
}

export default function Accounts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [agentPermitAccessUnavailable, setAgentPermitAccessUnavailable] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isEditAgentDialogOpen, setIsEditAgentDialogOpen] = useState(false);
  const [isDeleteAllHuntersDialogOpen, setIsDeleteAllHuntersDialogOpen] = useState(false);
  const [isDeleteAllGuidesDialogOpen, setIsDeleteAllGuidesDialogOpen] = useState(false);
  const [isSuspensionDialogOpen, setIsSuspensionDialogOpen] = useState(false);
  const [suspensionAction, setSuspensionAction] = useState<'suspend' | 'reactivate'>('suspend');
  const [isAddAgentDialogOpen, setIsAddAgentDialogOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState<Record<TabKey, number>>({ admins: 1, agents: 1, subagents: 1, guides: 1, hunters: 1 });
  const itemsPerPage = 5;

  // --- Feature flag: override national pour agents ---
  const { data: nationalOverrideData, isLoading: isLoadingOverride } = useQuery<{ enabled: boolean}>({
    queryKey: ["/api/settings/national-override"],
    queryFn: async () => apiRequest<{ enabled: boolean}>({ url: "/api/settings/national-override", method: "GET" }),
    refetchOnWindowFocus: false,
  });

  // --- Feature flag: allow agents to open hunter permit details from hunter modal ---
  // local fallback key (used when backend route is not available)
  const AGENT_PERMIT_ACCESS_LOCAL_KEY = 'agentPermitAccess';
  const readLocalAgentPermitAccess = () => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = localStorage.getItem(AGENT_PERMIT_ACCESS_LOCAL_KEY);
      if (!raw) return null;
      return { enabled: raw === 'true' } as { enabled: boolean };
    } catch (e) {
      return null;
    }
  };

  const { data: agentPermitAccessData, isLoading: isLoadingAgentPermitAccess } = useQuery<{ enabled: boolean } | null>({
    queryKey: ["/api/settings/agent-permit-access"],
    queryFn: async () => {
      try {
        const res = await apiRequest<{ enabled: boolean }>({ url: "/api/settings/agent-permit-access", method: "GET" });
        return res as any;
      } catch (err: any) {
        // If backend route not found (404) or other error, fallback to localStorage
        console.warn('agent-permit-access fetch failed, falling back to localStorage', err?.message || err);
        try { setAgentPermitAccessUnavailable(true); } catch (_) {}
        const local = readLocalAgentPermitAccess();
        return local ?? { enabled: false };
      }
    },
    initialData: readLocalAgentPermitAccess() ?? { enabled: false },
    refetchOnWindowFocus: false,
    retry: false,
  });

  const toggleAgentPermitAccessMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      // Attempt server update first
      return apiRequest<{ enabled: boolean }>({ url: "/api/settings/agent-permit-access", method: "PUT", data: { enabled } });
    },
    onMutate: async (enabled: boolean) => {
      const key = ["/api/settings/agent-permit-access"];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, { enabled });
      return { previous };
    },
    onError: (err: any, variables: any, context: any) => {
      // If backend route missing (404) or network error, persist locally so the toggle doesn't immediately revert
      const status = err?.status || err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || "Échec de la mise à jour du paramètre.";
      if (status === 404 || String(msg).toLowerCase().includes('route') || String(msg).toLowerCase().includes('non trouv')) {
        try {
          if (typeof window !== 'undefined') {
            localStorage.setItem(AGENT_PERMIT_ACCESS_LOCAL_KEY, String(variables));
          }
          queryClient.setQueryData(["/api/settings/agent-permit-access"], { enabled: variables });
          toast({ title: "Paramètre enregistré localement", description: "Le backend ne fournit pas encore ce paramètre. La valeur est conservée localement pour votre navigateur.", });
          return;
        } catch (e) {
          // fallback to showing error
        }
      }
      // generic rollback
      toast({ variant: "destructive", title: "Erreur", description: msg });
      if (context?.previous) {
        queryClient.setQueryData(["/api/settings/agent-permit-access"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/agent-permit-access"] });
    }
  });

  const toggleOverrideMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      return apiRequest<{ enabled: boolean}>({ url: "/api/settings/national-override", method: "PUT", data: { enabled } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/national-override"] });
      toast({ title: "Paramètre mis à jour", description: "L'autorisation nationale pour les agents a été mise à jour." });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || "Échec de la mise à jour du paramètre.";
      toast({ variant: "destructive", title: "Erreur", description: msg });
    }
  });

  // Requête pour récupérer tous les utilisateurs
  const { data: users = [], isLoading, refetch: refetchUsers } = useQuery<User[]>({
    queryKey: ["/api/users", { limit: 1000 }],
    queryFn: async () => {
      const response: any = await apiRequest<any>({ url: "/api/users?limit=1000", method: "GET" });
      // Vérifier si la réponse directe est un tableau
      if (Array.isArray(response)) {
        return response;
      }
      // Vérifier si la réponse est un objet contenant une propriété 'data' qui est un tableau
      if (response && Array.isArray(response.data)) {
        return response.data;
      }
      // Si la structure est inattendue ou si la réponse est vide, retourner un tableau vide pour éviter les erreurs
      console.warn("La réponse de /api/users n'a pas la structure attendue ou est vide:", response);
      return [];
    },
    refetchOnWindowFocus: false,
  });

  console.log('[Accounts.tsx] Données brutes de /api/users:', users);

  // Requête pour récupérer tous les guides de chasse avec leurs infos utilisateur
  const { data: guides = [], isLoading: isLoadingGuides, refetch: refetchGuides } = useQuery<Guide[]>({
    queryKey: ["/api/guides/with-users"],
    queryFn: async () => {
      // Récupérer les guides
      const guidesData = await apiRequest<Guide[]>({ url: "/api/guides", method: "GET" });

      // Les données serveur incluent déjà userId et username via jointure.
      // On sécurise néanmoins en recomplétant depuis /api/users si absent.
      const guideUsers = users.filter(u => u.role === 'guide' || u.role === 'hunting-guide');

      return guidesData.map((guide: Guide) => {
        if (guide.username && guide.userId) return guide;
        // 1) Tentative par clé étrangère (userId)
        let matchingUser = guideUsers.find(u => u.id === guide.userId);
        // 2) Si pas trouvé, tentative par noms
        if (!matchingUser) {
          matchingUser = guideUsers.find(u =>
            (u.firstName?.toLowerCase() === guide.firstName.toLowerCase()) &&
            (u.lastName?.toLowerCase() === guide.lastName.toLowerCase())
          );
        }
        // 3) Si toujours pas, tentative par téléphone
        if (!matchingUser && guide.phone) {
          matchingUser = guideUsers.find(u => (u.phone || '').replace(/\s+/g, '') === (guide.phone || '').replace(/\s+/g, ''));
        }
        return {
          ...guide,
          userId: guide.userId ?? matchingUser?.id,
          username: guide.username ?? matchingUser?.username,
        };
      });
    },
    enabled: !isLoading, // Attendre que les utilisateurs soient chargés
    refetchOnWindowFocus: false,
  });

  // Filtrer les utilisateurs par rôle
  const admins = users.filter((user: User) => user.role === "admin");
  const agents = users.filter((user: User) => user.role === "agent");
  const subAgents = users.filter((user: User) => user.role === "sub-agent");
  const hunters = users.filter((user: User) => user.role === "hunter");
  const guideUsers = users.filter((user: User) => user.role === "guide");

  console.log('[Accounts.tsx] Agents Régionaux filtrés:', agents);
  console.log('[Accounts.tsx] Agents Secteurs filtrés:', subAgents);

  // Filtrage des utilisateurs par recherche
  const filterUsers = (userList: User[]) => {
    const searchLower = searchTerm.toLowerCase();
    return userList.filter(user =>
      user.username.toLowerCase().includes(searchLower) ||
      (user.firstName && user.firstName.toLowerCase().includes(searchLower)) ||
      (user.lastName && user.lastName.toLowerCase().includes(searchLower)) ||
      user.email.toLowerCase().includes(searchLower) ||
      (user.phone && user.phone.toLowerCase().includes(searchLower)) ||
      (user.region && user.region.toLowerCase().includes(searchLower))
    );
  };

  // Filtrage des guides par recherche
  const filteredGuides = guides.filter(guide => {
    const searchLower = searchTerm.toLowerCase();
    return (
      guide.lastName.toLowerCase().includes(searchLower) ||
      guide.firstName.toLowerCase().includes(searchLower) ||
      guide.phone.toLowerCase().includes(searchLower) ||
      (guide.zone && guide.zone.toLowerCase().includes(searchLower)) ||
      (guide.region && guide.region.toLowerCase().includes(searchLower)) ||
      guide.idNumber.toLowerCase().includes(searchLower) ||
      (guide.username && guide.username.toLowerCase().includes(searchLower))
    );
  });

  // Pagination pour chaque onglet
  const getPaginatedData = (data: any[], tab: TabKey) => {
    const startIndex = (currentPage[tab] - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (data: any[]) => Math.ceil(data.length / itemsPerPage);

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
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec de la réinitialisation du mot de passe.",
      });
    },
  });

  // Mutation pour supprimer tous les chasseurs
  const deleteAllHuntersMutation = useMutation({
    mutationFn: async () => {
      const promises = hunters.map(hunter =>
        apiRequest({
          url: `/api/users/${hunter.id}?force=true`,
          method: "DELETE",
        })
      );
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;
      return { successful, failed };
    },
    onSuccess: (data) => {
      toast({
        title: "Chasseurs supprimés",
        description: `${data.successful} chasseurs ont été supprimés avec succès. ${data.failed} suppressions ont échoué.`,
      });
      setIsDeleteAllHuntersDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec de la suppression des chasseurs.",
      });
    },
  });

  // Mutation pour supprimer tous les guides de chasse
  const deleteAllGuidesMutation = useMutation({
    mutationFn: async () => {
      const promises = guides.map(guide =>
        apiRequest({
          url: `/api/guides/${guide.id}?force=true`,
          method: "DELETE",
        })
      );
      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;
      return { successful, failed };
    },
    onSuccess: (data) => {
      toast({
        title: "Guides de chasse supprimés",
        description: `${data.successful} guides ont été supprimés avec succès. ${data.failed} suppressions ont échoué.`,
      });
      setIsDeleteAllGuidesDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/guides"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Échec de la suppression des guides.",
      });
    },
  });

  // Mutation pour supprimer un utilisateur
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const isAdmin = localStorage.getItem('userRole') === 'admin';
      const url = isAdmin ? `/api/users/${userId}?force=true` : `/api/users/${userId}`;
      return apiRequest({
        url: url,
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Utilisateur supprimé",
        description: "L'utilisateur a été supprimé avec succès.",
      });
      setIsDeleteDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
    },
    onError: (error: any) => {
      let errorMessage = "Échec de la suppression de l'utilisateur.";
      if (error.response?.status === 403) {
        errorMessage = "Vous n'avez pas les permissions nécessaires pour supprimer cet utilisateur.";
      } else if (error.response?.status === 404) {
        errorMessage = "Utilisateur introuvable.";
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      }
      toast({
        variant: "destructive",
        title: "Erreur",
        description: errorMessage,
      });
    },
  });

  // Mutation pour suspendre/réactiver un utilisateur
  const toggleSuspensionMutation = useMutation({
    mutationFn: async ({ userId, action }: { userId: number; action: 'suspend' | 'reactivate' }) => {
      return apiRequest({
        url: `/api/users/${userId}/${action}`,
        method: "POST",
      });
    },
    onSuccess: () => {
      toast({
        title: suspensionAction === 'suspend' ? "Compte suspendu" : "Compte réactivé",
        description: suspensionAction === 'suspend'
          ? "Le compte utilisateur a été suspendu avec succès."
          : "Le compte utilisateur a été réactivé avec succès.",
      });
      setIsSuspensionDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
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

  const handleEditAgent = (user: User) => {
    setSelectedUser(user);
    setIsEditAgentDialogOpen(true);
  };

  const handleToggleSuspension = (user: User) => {
    setSelectedUser(user);
    setSuspensionAction(user.isSuspended ? 'reactivate' : 'suspend');
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

  const handleRefresh = async () => {
    await Promise.all([refetchUsers(), refetchGuides()]);
    toast({
      title: "Données actualisées",
      description: "Les données des utilisateurs et des guides ont été actualisées.",
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    alert("Exportation en PDF simulée !");
    // Ici, tu peux intégrer une bibliothèque comme jsPDF pour générer un PDF
  };

  const handleExport = () => {
    alert("Exportation des données simulée !");
    // Ici, tu peux ajouter une logique pour exporter les données (par exemple, en CSV)
  };

  // Rendu de tableau d'utilisateurs
  const renderUsersTable = (userList: User[], tab: TabKey) => {
    const filteredList = filterUsers(userList);
    const paginatedList = getPaginatedData(filteredList, tab);
    const totalPages = getTotalPages(filteredList);
    const startIndex = (currentPage[tab] - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredList.length);
    const hideId = tab === 'agents' || tab === 'subagents' || tab === 'hunters' || tab === 'admins';
    const emptyColSpan = hideId ? 7 : 8; // (optional ID) + username + nom + prenom + email + phone + region + actions

    return (
      <>
        <div className="w-full overflow-x-auto border border-gray-200 rounded-md">
          <Table className="min-w-full text-sm">
          <TableCaption>Liste des utilisateurs</TableCaption>
          <TableHeader>
            <TableRow>
              {!hideId && (<TableHead className="hidden md:table-cell">ID</TableHead>)}
              <TableHead>Nom d'utilisateur</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead className="hidden sm:table-cell">Prénom</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead className="hidden sm:table-cell">Région</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="text-center">
                  Aucun utilisateur trouvé
                </TableCell>
              </TableRow>
            ) : (
              paginatedList.map((user) => (
                <TableRow key={user.id}>
                  {!hideId && (<TableCell className="hidden md:table-cell">{user.id}</TableCell>)}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {(tab === 'agents' || tab === 'subagents' || tab === 'hunters' || tab === 'admins') && (
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={`${tab === 'hunters'
                              ? 'bg-amber-100 text-amber-600'
                              : tab === 'admins'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-green-600 text-white'
                            }`}>
                            <User className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <span>{user.username}</span>
                    </div>
                    <Badge className="ml-2" variant={
                      user.role === 'admin' ? "destructive" :
                        user.role === 'agent' ? "outline" :
                          user.role === 'sub-agent' ? "default" :
                            "secondary"
                    }>
                      {
                        user.role === 'admin' ? 'Admin' :
                          user.role === 'agent' ? 'Agent' :
                            user.role === 'sub-agent' ? 'Agent Secteur' :
                              user.role === 'hunting-guide' ? 'Guide de chasse' :
                                'Chasseur'
                      }
                    </Badge>
                  </TableCell>
                  <TableCell>{user.lastName || "-"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{user.firstName || "-"}</TableCell>
                  <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                  <TableCell>{user.phone || "-"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{user.region || "-"}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          Actions <ChevronDownIcon className="ml-1 h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Options</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {user.role === 'agent' && (
                          <DropdownMenuItem onClick={() => handleEditAgent(user)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Modifier
                          </DropdownMenuItem>
                        )}
                        {user.role !== 'admin' && (
                          <>
                            <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDeleteUser(user)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Supprimer
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
          </Table>
        </div>

        <div className="p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm mt-4 sticky bottom-0 bg-white/95 backdrop-blur border-t rounded-b-md z-20 pointer-events-auto">
          <div className="text-muted-foreground">
            {filteredList.length > 0 ? `Affichage de ${startIndex + 1} à ${endIndex} sur ${filteredList.length} utilisateurs` : "Aucun résultat"}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage({ ...currentPage, [tab]: Math.max(1, currentPage[tab] - 1) })}
              disabled={currentPage[tab] === 1}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage({ ...currentPage, [tab]: currentPage[tab] + 1 })}
              disabled={currentPage[tab] >= totalPages}
            >
              Suivant
            </Button>
          </div>
        </div>
      </>
    );
  };

  // Rendu du tableau des guides de chasse
  const renderGuidesTable = () => {
    const paginatedGuides = getPaginatedData(filteredGuides, 'guides');
    const totalPages = getTotalPages(filteredGuides);
    const startIndex = (currentPage.guides - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, filteredGuides.length);
    const emptyColSpan = 8; // username + nom + prenom + telephone + zone + region + idNumber + actions

    return (
      <>
        <div className="overflow-x-auto">
          <Table>
          <TableCaption>Liste des guides de chasse</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Nom d'utilisateur</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Prénom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Zone/Lieu</TableHead>
              <TableHead>Région</TableHead>
              <TableHead>N° Pièce d'identité</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedGuides.length === 0 ? (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="text-center">
                  Aucun guide de chasse trouvé
                </TableCell>
              </TableRow>
            ) : (
              paginatedGuides.map((guide) => (
                <TableRow key={guide.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-100 text-blue-600">
                          <User className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <span>{guide.username || "Non assigné"}</span>
                    </div>
                    <Badge className="ml-2" variant="secondary">
                      Guide de chasse
                    </Badge>
                  </TableCell>
                  <TableCell>{guide.lastName}</TableCell>
                  <TableCell>{guide.firstName}</TableCell>
                  <TableCell>{guide.phone}</TableCell>
                  <TableCell>{guide.zone || "-"}</TableCell>
                  <TableCell>{guide.region || "-"}</TableCell>
                  <TableCell>{guide.idNumber}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">
                      Actions <ChevronDownIcon className="ml-1 h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </div>

        <div className="p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm mt-4 sticky bottom-0 bg-white/95 backdrop-blur border-t rounded-b-md z-20 pointer-events-auto">
          <div className="text-muted-foreground">
            {filteredGuides.length > 0 ? `Affichage de ${startIndex + 1} à ${endIndex} sur ${filteredGuides.length} guides` : "Aucun résultat"}
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage({ ...currentPage, guides: Math.max(1, currentPage.guides - 1) })}
              disabled={currentPage.guides === 1}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage({ ...currentPage, guides: currentPage.guides + 1 })}
              disabled={currentPage.guides >= totalPages}
            >
              Suivant
            </Button>
          </div>
        </div>
      </>
    );
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gestion des comptes</h1>
      </div>

      {/* Administrative options card */}
      <Card>
        <CardHeader>
          <CardTitle>Options administratives</CardTitle>
          <CardDescription>Paramètres globaux pour le comportement des agents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Permettre aux agents d'accéder aux détails des permis depuis la fiche chasseur</Label>
              <p className="text-sm text-muted-foreground">Si activé, un bouton s'affichera dans la modal 'Détails du Chasseur' pour ouvrir le modal 'Détails du Permis'.</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={agentPermitAccessData?.enabled ? "default" : "secondary"}>
                {agentPermitAccessData?.enabled ? "Activé" : "Désactivé"}
              </Badge>
              {agentPermitAccessUnavailable && (
                <div className="text-xs text-yellow-700 ml-2">(Paramètre stocké localement — backend indisponible)</div>
              )}
              <Switch
                id="agent-permit-access"
                checked={!!agentPermitAccessData?.enabled}
                disabled={isLoadingAgentPermitAccess || toggleAgentPermitAccessMutation.isPending}
                onCheckedChange={(_checked: boolean) => {
                  const next = !(agentPermitAccessData?.enabled);
                  // optimistic UI: update cache and localStorage immediately
                  try {
                    if (typeof window !== 'undefined') {
                      localStorage.setItem(AGENT_PERMIT_ACCESS_LOCAL_KEY, String(next));
                    }
                  } catch (e) {
                    // ignore
                  }
                  queryClient.setQueryData(["/api/settings/agent-permit-access"], { enabled: next });
                  toggleAgentPermitAccessMutation.mutate(Boolean(next));
                }}
              />
            </div>
          </div>

          <div className="mt-4 p-3 border rounded-md bg-slate-50 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="national-override" className="text-base font-medium">Autoriser agents à délivrer permis/attaxes à tous les chasseurs (National)</Label>
              <p className="text-sm text-muted-foreground">
                Lorsque cette option est activée, les agents régionaux et de secteur peuvent délivrer un permis ou ajouter une taxe à n'importe quel chasseur de la liste nationale. Les règles de portée par région/département sont temporairement suspendues.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={nationalOverrideData?.enabled ? "default" : "secondary"}>
                {nationalOverrideData?.enabled ? "Activé" : "Désactivé"}
              </Badge>
              <Switch
                id="national-override"
                checked={!!nationalOverrideData?.enabled}
                disabled={isLoadingOverride || toggleOverrideMutation.isPending}
                onCheckedChange={(checked: boolean) => toggleOverrideMutation.mutate(checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gestion des utilisateurs</CardTitle>
          <CardDescription>
            Gestion des différents profils d'utilisateurs du système
          </CardDescription>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
            <div className="w-full sm:w-1/2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher (nom, email, région, rôle)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex space-x-2 w-full sm:w-auto">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimer
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="mr-2 h-4 w-4" />
                Exporter
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <Tabs defaultValue="admins">
            <div className="overflow-x-auto">
              <TabsList className="w-full flex overflow-x-auto whitespace-nowrap gap-2 rounded-none">
                <TabsTrigger value="admins">Administrateurs ({admins.length})</TabsTrigger>
                <TabsTrigger value="agents">Agents Régionaux ({agents.length})</TabsTrigger>
                <TabsTrigger value="subagents">Agents Secteur ({subAgents.length})</TabsTrigger>
                <TabsTrigger value="guides">Guides de Chasse ({guides.length})</TabsTrigger>
                <TabsTrigger value="hunters">Chasseurs ({hunters.length})</TabsTrigger>
              </TabsList>
              {/* Paramètre déplacé vers Options administratives */}
            </div>

            <TabsContent value="admins" className="p-4">
              <div className="overflow-x-auto">
                {renderUsersTable(admins, 'admins')}
              </div>
            </TabsContent>

            <TabsContent value="agents" className="p-4">
              <div className="pb-4 flex justify-end">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsAddAgentDialogOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Ajouter un agent
                </Button>
              </div>
              {renderUsersTable(agents, 'agents')}
            </TabsContent>

            <TabsContent value="subagents" className="p-4">
              <div className="pb-4 flex justify-between">
                <div className="text-sm text-muted-foreground">
                  Agents Secteur créés par les agents régionaux
                </div>
              </div>
              {renderUsersTable(subAgents, 'subagents')}
            </TabsContent>

            <TabsContent value="guides" className="p-4">
              <div className="pb-4 flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsDeleteAllGuidesDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer tous les Guides de chasse
                </Button>
              </div>
              {renderGuidesTable()}
            </TabsContent>

            <TabsContent value="hunters" className="p-4">
              <div className="pb-4 flex justify-end">
                {hunters.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setIsDeleteAllHuntersDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer tous les chasseurs
                  </Button>
                )}
              </div>
              {renderUsersTable(hunters, 'hunters')}
            </TabsContent>

      {/* Formulaire d'ajout d'agent */}
      <AddAgentForm
        open={isAddAgentDialogOpen}
        onClose={() => setIsAddAgentDialogOpen(false)}
      />
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialogue de confirmation pour réinitialiser le mot de passe */}
      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définir un nouveau mot de passe pour l'utilisateur {selectedUser?.username}.
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
            <Button
              variant="default"
              onClick={confirmResetPassword}
              disabled={resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  En cours...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Mettre à jour
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialogue de confirmation pour supprimer un utilisateur */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'utilisateur</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'utilisateur {selectedUser?.username} ?
              Cette action est irréversible et supprimera toutes les données associées à cet utilisateur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-destructive"
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  En cours...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogue de confirmation pour supprimer tous les guides de chasse */}
      <AlertDialog open={isDeleteAllGuidesDialogOpen} onOpenChange={setIsDeleteAllGuidesDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tous les guides de chasse</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer tous les guides de chasse ?
              Cette action est irréversible et supprimera toutes les données associées à ces guides.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllGuidesMutation.mutate()}
              className="bg-destructive"
              disabled={deleteAllGuidesMutation.isPending}
            >
              {deleteAllGuidesMutation.isPending ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  En cours...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Supprimer tous
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogue de confirmation pour suspendre/réactiver un compte */}
      <AlertDialog open={isSuspensionDialogOpen} onOpenChange={setIsSuspensionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {suspensionAction === 'suspend' ? 'Suspendre le compte' : 'Réactiver le compte'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspensionAction === 'suspend'
                ? `Êtes-vous sûr de vouloir suspendre temporairement le compte de ${selectedUser?.username} ? L'utilisateur ne pourra plus se connecter jusqu'à la réactivation de son compte.`
                : `Êtes-vous sûr de vouloir réactiver le compte de ${selectedUser?.username} ? L'utilisateur pourra à nouveau se connecter.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSuspensionAction}
              className={suspensionAction === 'suspend' ? 'bg-destructive' : 'bg-primary'}
              disabled={toggleSuspensionMutation.isPending}
            >
              {toggleSuspensionMutation.isPending ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  En cours...
                </>
              ) : (
                <>
                  {suspensionAction === 'suspend' ? (
                    <>
                      <AlertTriangle className="mr-2 h-4 w-4" />
                      Suspendre
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Réactiver
                    </>
                  )}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialogue de confirmation pour supprimer tous les chasseurs */}
      <AlertDialog open={isDeleteAllHuntersDialogOpen} onOpenChange={setIsDeleteAllHuntersDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tous les chasseurs</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer tous les comptes chasseurs ({hunters.length}) ?
              Cette action est irréversible et supprimera également toutes les données associées à ces utilisateurs.
              Les comptes administrateurs et agents seront préservés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllHuntersMutation.mutate()}
              className="bg-destructive"
              disabled={deleteAllHuntersMutation.isPending}
            >
              {deleteAllHuntersMutation.isPending ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-b-transparent border-white rounded-full"></div>
                  En cours...
                </>
              ) : (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Supprimer tous les chasseurs
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Formulaire d'édition d'agent */}
      {selectedUser && (
        <AgentForm
          open={isEditAgentDialogOpen}
          onClose={() => setIsEditAgentDialogOpen(false)}
          agent={selectedUser}
        />
      )}
      </div>
  );
}
