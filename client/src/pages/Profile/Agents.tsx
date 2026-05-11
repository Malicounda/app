import { useState } from "react";
// ResponsivePage removed: layout provides page-frame centering
import AddAgentForm from "@/components/agents/AddAgentForm";
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
    CardHeader
} from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Eye, EyeOff, FileDown, FileText, MapPin, User, UserCog, UserPlus } from "lucide-react";

// Types
interface Agent {
  id: number;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  matricule: string | null;
  grade?: string | null;
  genre?: string | null;
  serviceLocation: string | null;
  assignmentPost: string | null;
  region: string | null;
  zone?: string | null;
  departement?: string | null;
  role: 'agent' | 'sub-agent';
  isSuspended?: boolean;
  isActive?: boolean;
}

export default function AgentsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [detailsEditMode, setDetailsEditMode] = useState(false);
  const [detailsUsername, setDetailsUsername] = useState("");
  const [detailsEmail, setDetailsEmail] = useState("");
  const [detailsPhone, setDetailsPhone] = useState("");
  const [detailsFirstName, setDetailsFirstName] = useState("");
  const [detailsLastName, setDetailsLastName] = useState("");
  const [detailsMatricule, setDetailsMatricule] = useState("");
  const [detailsRegion, setDetailsRegion] = useState("");
  const [detailsDepartement, setDetailsDepartement] = useState("");
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Récupérer tous les agents (régionaux et secteurs)
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    // Aligner la clé avec les invalidations utilisées plus bas
    queryKey: ["/api/users/agents"],
    queryFn: async () => {
      const response = await apiRequest<any>({
        url: "/api/users/agents?limit=1000",
        method: "GET",
      });

      // Supporte à la fois un tableau brut et une réponse paginée { data: [...] }
      const agentList: any[] = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response)
          ? response
          : [];

      // Filtrer et formater les agents
      return agentList
        .filter((agent: any) =>
          // Pour les agents régionaux : role === 'agent' avec une région
          // Pour les agents secteur : role === 'sub-agent' (même sans zone renseignée)
          (agent.role === 'agent' && agent.region) ||
          (agent.role === 'sub-agent')
        )
        .map((agent: any) => ({
          id: agent.id,
          username: agent.username,
          email: agent.email,
          firstName: agent.firstName,
          lastName: agent.lastName,
          phone: agent.phone,
          matricule: agent.matricule,
          grade: agent.grade ?? null,
          genre: agent.genre ?? null,
          serviceLocation: agent.serviceLocation,
          assignmentPost: agent.assignmentPost,
          region: agent.region || '-',
          zone: agent.zone || '-',
          departement: agent.departement || '-',
          role: agent.role,
          isSuspended: agent.isSuspended ?? false,
          isActive: agent.isActive ?? true,
        }));
    },
    refetchOnWindowFocus: false,
  });

  // Sécuriser le tableau principal pour éviter never[]
  const agentsList: Agent[] = Array.isArray(agents) ? agents : [];

  // Séparer les agents régionaux et les agents de secteur
  const regionalAgents: Agent[] = agentsList.filter((agent: Agent) =>
    agent.role === 'agent' && !!agent.region
  );

  const sectorAgents: Agent[] = agentsList.filter((agent: Agent) =>
    agent.role === 'sub-agent'
  );

  // Filtrer les agents en fonction de la région et de la recherche
  const filteredRegionalAgents = regionalAgents.filter((agent: Agent) => {
    const matchesRegion =
      filterRegion === "all" ||
      ((agent.region || "").toLowerCase().trim() === filterRegion.toLowerCase().trim());
    const matchesSearch =
      searchQuery === "" ||
      (agent.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.firstName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.lastName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.matricule || "").toLowerCase().includes(searchQuery.toLowerCase());

    return matchesRegion && matchesSearch;
  });

  const filteredSectorAgents = sectorAgents.filter((agent: Agent) => {
    const matchesRegion =
      filterRegion === "all" ||
      ((agent.region || "").toLowerCase().trim() === filterRegion.toLowerCase().trim());
    const matchesSearch =
      searchQuery === "" ||
      (agent.username || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.firstName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.lastName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (agent.matricule || "").toLowerCase().includes(searchQuery.toLowerCase());

    return matchesRegion && matchesSearch;
  });

  const regionalPagination = usePagination(filteredRegionalAgents, { pageSize: 10 });
  const sectorPagination = usePagination(filteredSectorAgents, { pageSize: 10 });

  // Obtenir la liste des régions uniques parmi les agents
  const uniqueRegionsSet = new Set<string>();
  agentsList.forEach((agent: Agent) => {
    if (agent.region) {
      uniqueRegionsSet.add(agent.region);
    }
  });
  const uniqueRegions = Array.from(uniqueRegionsSet) as string[];

  // Mutation pour supprimer définitivement un agent
  const deleteAgentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest({
        url: `/api/users/${id}`,
        method: "DELETE"
      }),
    onSuccess: () => {
      toast({
        title: "Agent supprimé",
        description: "Le compte de l'agent a été supprimé définitivement.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
      setShowDetails(false);
      setIsDeleteDialogOpen(false);
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la suppression du compte.",
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
    }
  });

  // Mutation pour activer/désactiver un agent
  const toggleAgentStatusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      apiRequest({
        url: `/api/users/${id}/${active ? 'activate' : 'suspend'}`,
        method: "PUT"
      }),
    onMutate: async ({ id, active }) => {
      // Mise à jour optimiste pour refléter immédiatement le changement dans la modal
      setSelectedAgent((prev) => {
        if (!prev || prev.id !== id) return prev;
        return {
          ...prev,
          isActive: active,
          isSuspended: active ? false : true,
        };
      });
    },
    onSuccess: () => {
      toast({
        title: "Statut mis à jour",
        description: "Le statut de l'agent a été mis à jour avec succès.",
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
    },
    onError: (_err, variables) => {
      // Rollback simple sur la modal (on inverse ce qui a été fait en optimiste)
      setSelectedAgent((prev) => {
        if (!prev || prev.id !== variables.id) return prev;
        return {
          ...prev,
          isActive: !variables.active,
          isSuspended: variables.active ? true : false,
        };
      });
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la mise à jour du statut.",
        variant: "destructive",
      });
    }
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) => {
      return apiRequest({
        url: `/api/users/${id}`,
        method: "PUT",
        data: { password },
      });
    },
    onSuccess: () => {
      toast({
        title: "Mot de passe mis à jour",
        description: "Le mot de passe a été réinitialisé avec succès.",
      });
      setIsResetPasswordDialogOpen(false);
      setNewPassword("");
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
    },
    onError: () => {
      toast({
        title: "Erreur",
        description: "Échec de la réinitialisation du mot de passe.",
        variant: "destructive",
      });
    },
  });

  const getAgentRegionName = (regionCode: string) => {
    const region = regionEnum.find((r: { value: string; label: string }) => r.value === regionCode);
    return region ? region.label : regionCode;
  };

  const viewAgentDetails = (agent: Agent) => {
    setSelectedAgent(agent);
    setShowDetails(true);
    setDetailsEditMode(false);
    setDetailsUsername(agent.username || "");
    setDetailsEmail(agent.email || "");
    setDetailsPhone(agent.phone || "");
    setDetailsFirstName(agent.firstName || "");
    setDetailsLastName(agent.lastName || "");
    setDetailsMatricule(agent.matricule || "");
    setDetailsRegion(agent.region || "");
    setDetailsDepartement(agent.departement || "");
  };

  const updateDetailsMutation = useMutation({
    mutationFn: async (payload: { id: number; data: Record<string, any> }) => {
      return apiRequest({
        url: `/api/users/${payload.id}`,
        method: "PUT",
        data: payload.data,
      });
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Les informations de l'agent ont été mises à jour.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
      setDetailsEditMode(false);
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: String(e?.message || "Mise à jour impossible"),
        variant: "destructive",
      });
    },
  });

  const openResetPasswordDialog = () => {
    setNewPassword("");
    setConfirmPassword("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsResetPasswordDialogOpen(true);
  };

  const confirmResetPassword = () => {
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
    resetPasswordMutation.mutate({ id: selectedAgent.id, password: newPassword });
  };

  const refreshAgents = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
  };

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 main-content-area">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold mb-2">Chef de Division Faune</h1>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center mb-2">
            <div />
              <div className="flex items-center space-x-2">
                <Button className="bg-black hover:bg-black/90 text-white" onClick={() => setShowAddForm(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Ajouter un Agent
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="agents">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="agents">Agents Régionaux ({filteredRegionalAgents.length})</TabsTrigger>
                <TabsTrigger value="subagents">Agents Secteur ({filteredSectorAgents.length})</TabsTrigger>
              </TabsList>

            <TabsContent value="agents" className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-1/3">
                  <Input
                    placeholder="Rechercher (nom, email, matricule, région)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-1/3">
                  <Select value={filterRegion} onValueChange={setFilterRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrer par région" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les régions</SelectItem>
                      {regionEnum.map((r: { value: string; label: string }) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-1/3 flex justify-end space-x-2">
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Imprimer
                  </Button>
                  <Button variant="outline">
                    <FileDown className="h-4 w-4 mr-2" />
                    Exporter
                  </Button>
                </div>
              </div>

              <div className="w-full overflow-x-auto border rounded-md">
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom d'utilisateur</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead className="hidden sm:table-cell">Prénom</TableHead>
                      <TableHead>Région</TableHead>
                      <TableHead className="hidden md:table-cell">Matricule</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRegionalAgents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center">
                          Aucun agent régional trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      regionalPagination.currentItems.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-600 text-white">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <span>{agent.username}</span>
                            </div>
                          </TableCell>
                          <TableCell>{agent.lastName || "Non défini"}</TableCell>
                          <TableCell className="hidden sm:table-cell">{agent.firstName || "Non défini"}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <MapPin className="mr-1 h-4 w-4 text-muted-foreground" />
                              {agent.region ? agent.region.toUpperCase() : "NON DÉFINI"}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">{agent.matricule || "Non défini"}</TableCell>
                          <TableCell>
                            <Badge variant={agent.isActive ? "default" : "destructive"}>
                              {agent.isActive ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => viewAgentDetails(agent)}
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {regionalPagination.total > 0
                    ? `${regionalPagination.rangeFrom}-${regionalPagination.rangeTo} sur ${regionalPagination.total}`
                    : `0 sur 0`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regionalPagination.prevPage()}
                    disabled={regionalPagination.page <= 1}
                  >
                    Précédent
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {regionalPagination.page} / {regionalPagination.pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => regionalPagination.nextPage()}
                    disabled={regionalPagination.page >= regionalPagination.pageCount}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="subagents" className="space-y-4 pt-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-1/3">
                  <Input
                    placeholder="Rechercher un agent de secteur..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-1/3">
                  <Select value={filterRegion} onValueChange={setFilterRegion}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filtrer par région" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toutes les régions</SelectItem>
                      {regionEnum.map((r: { value: string; label: string }) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:w-1/3 flex justify-end space-x-2">
                  <Button variant="outline">
                    <FileText className="h-4 w-4 mr-2" />
                    Imprimer
                  </Button>
                  <Button variant="outline">
                    <FileDown className="h-4 w-4 mr-2" />
                    Exporter
                  </Button>
                </div>
              </div>

              <div className="w-full overflow-x-auto border rounded-md">
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom d'utilisateur</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead className="hidden sm:table-cell">Prénom</TableHead>
                      <TableHead>Région</TableHead>
                      <TableHead>Secteur</TableHead>
                      <TableHead className="hidden md:table-cell">Matricule</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSectorAgents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center">
                          Aucun agent de secteur trouvé
                        </TableCell>
                      </TableRow>
                    ) : (
                      sectorPagination.currentItems.map((agent) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-600 text-white">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <span>{agent.username}</span>
                            </div>
                          </TableCell>
                          <TableCell>{agent.lastName || "Non défini"}</TableCell>
                          <TableCell className="hidden sm:table-cell">{agent.firstName || "Non défini"}</TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <MapPin className="mr-1 h-4 w-4 text-muted-foreground" />
                              {agent.region ? agent.region.toUpperCase() : "NON DÉFINI"}
                            </div>
                          </TableCell>
                          <TableCell>{agent.departement || "Non défini"}</TableCell>
                          <TableCell className="hidden md:table-cell">{agent.matricule || "Non défini"}</TableCell>
                          <TableCell>
                            <Badge variant={agent.isActive ? "default" : "destructive"}>
                              {agent.isActive ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => viewAgentDetails(agent)}
                              title="Voir les détails"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {sectorPagination.total > 0
                    ? `${sectorPagination.rangeFrom}-${sectorPagination.rangeTo} sur ${sectorPagination.total}`
                    : `0 sur 0`}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sectorPagination.prevPage()}
                    disabled={sectorPagination.page <= 1}
                  >
                    Précédent
                  </Button>
                  <div className="text-sm text-muted-foreground">
                    Page {sectorPagination.page} / {sectorPagination.pageCount}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sectorPagination.nextPage()}
                    disabled={sectorPagination.page >= sectorPagination.pageCount}
                  >
                    Suivant
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Détails de l'agent</DialogTitle>
            <DialogDescription>
              Informations complètes et gestion de l'agent
            </DialogDescription>
          </DialogHeader>

          {selectedAgent && (
            <Tabs defaultValue="info">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Informations</TabsTrigger>
                <TabsTrigger value="activity">Activité</TabsTrigger>
                <TabsTrigger value="settings">Gestion</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant={detailsEditMode ? "outline" : "default"}
                    onClick={() => setDetailsEditMode((v) => !v)}
                  >
                    {detailsEditMode ? "Annuler" : "Modifier"}
                  </Button>
                  {detailsEditMode && (
                    <Button
                      onClick={() => {
                        if (!selectedAgent) return;
                        updateDetailsMutation.mutate({
                          id: selectedAgent.id,
                          data: {
                            username: detailsUsername.trim(),
                            email: detailsEmail.trim(),
                            phone: detailsPhone.trim(),
                            firstName: detailsFirstName.trim(),
                            lastName: detailsLastName.trim(),
                            matricule: detailsMatricule.trim(),
                            region: detailsRegion.trim(),
                            departement: detailsDepartement.trim() || undefined,
                          },
                        });
                      }}
                      disabled={updateDetailsMutation.isPending}
                    >
                      {updateDetailsMutation.isPending ? "En cours..." : "Enregistrer"}
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Nom d'utilisateur</h3>
                    {detailsEditMode ? (
                      <Input value={detailsUsername} onChange={(e) => setDetailsUsername(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.username}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Email</h3>
                    {detailsEditMode ? (
                      <Input value={detailsEmail} onChange={(e) => setDetailsEmail(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.email}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Nom</h3>
                    {detailsEditMode ? (
                      <Input value={detailsLastName} onChange={(e) => setDetailsLastName(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.lastName || "Non défini"}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Prénom</h3>
                    {detailsEditMode ? (
                      <Input value={detailsFirstName} onChange={(e) => setDetailsFirstName(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.firstName || "Non défini"}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Téléphone</h3>
                    {detailsEditMode ? (
                      <Input value={detailsPhone} onChange={(e) => setDetailsPhone(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.phone || "Non défini"}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Matricule</h3>
                    {detailsEditMode ? (
                      <Input value={detailsMatricule} onChange={(e) => setDetailsMatricule(e.target.value)} />
                    ) : (
                      <p className="mt-1">{selectedAgent.matricule || "Non défini"}</p>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Grade</h3>
                    <p className="mt-1">{selectedAgent.grade || "Non défini"}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Genre</h3>
                    <p className="mt-1">{selectedAgent.genre || "Non défini"}</p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Région / Niveau</h3>
                    {detailsEditMode ? (
                      <Select value={detailsRegion} onValueChange={(val) => { setDetailsRegion(val); setDetailsDepartement(""); }}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Sélectionner une région" />
                        </SelectTrigger>
                        <SelectContent>
                          {regionEnum.map((r) => (
                            <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="mt-1">{selectedAgent.region ? selectedAgent.region.toUpperCase() : "NON DÉFINI"}</p>
                    )}
                  </div>

                  {selectedAgent.role === 'sub-agent' && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500">Département / Secteur</h3>
                      {detailsEditMode ? (
                        <Select value={detailsDepartement} onValueChange={setDetailsDepartement} disabled={!detailsRegion}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder={!detailsRegion ? "Sélectionnez d'abord une région" : "Sélectionner un département"} />
                          </SelectTrigger>
                          <SelectContent>
                            {(departmentsByRegion[detailsRegion as keyof typeof departmentsByRegion] || []).map((d) => (
                              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="mt-1">{selectedAgent.departement || "Non défini"}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Lieu de service</h3>
                    <p className="mt-1">
                      {selectedAgent.role === 'agent'
                        ? (() => {
                          const label = getAgentRegionName(selectedAgent.region || "");
                          return label ? `IREF/${label}` : 'IREF';
                        })()
                        : (selectedAgent.serviceLocation || "Non défini")}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Statut</h3>
                    <p className="mt-1">
                      <Badge variant={selectedAgent.isActive ? "default" : "destructive"}>
                        {selectedAgent.isActive ? "Actif" : "Inactif"}
                      </Badge>
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="activity">
                <div className="space-y-4">
                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-center">
                      <UserCog className="h-6 w-6 mr-2 text-muted-foreground" />
                      <div>
                        <h3 className="font-medium">Statistiques d'activité</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Cette fonctionnalité sera disponible prochainement
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="settings">
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-md bg-muted p-4">
                    <div className="flex items-center">
                      {selectedAgent.isActive ? (
                        <AlertTriangle className="h-6 w-6 mr-2 text-amber-500" />
                      ) : (
                        <Check className="h-6 w-6 mr-2 text-green-500" />
                      )}
                      <div>
                        <h3 className="font-medium">
                          {selectedAgent.isActive ? "Désactiver" : "Activer"} le compte
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          {selectedAgent.isActive
                            ? "L'agent ne pourra plus se connecter à la plateforme"
                            : "L'agent pourra à nouveau se connecter à la plateforme"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={selectedAgent.isActive ? "destructive" : "outline"}
                      onClick={() => toggleAgentStatusMutation.mutate({
                        id: selectedAgent.id,
                        active: !selectedAgent.isActive
                      })}
                      disabled={toggleAgentStatusMutation.isPending}
                    >
                      {toggleAgentStatusMutation.isPending
                        ? "En cours..."
                        : selectedAgent.isActive ? "Désactiver" : "Activer"}
                    </Button>
                  </div>

                  <div className="rounded-md bg-muted p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">Réinitialiser le mot de passe</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Définir un nouveau mot de passe
                        </p>
                      </div>
                      <Button variant="outline" onClick={openResetPasswordDialog}>
                        Réinitialiser
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md bg-red-50 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-red-600">Supprimer définitivement</h3>
                        <p className="text-sm text-red-500 mt-1">
                          Cette action est irréversible et supprimera toutes les données de l'agent
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setIsDeleteDialogOpen(true)}
                      >
                        Supprimer
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement l'agent</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement le compte de {selectedAgent?.firstName} {selectedAgent?.lastName} ({selectedAgent?.username}) ? Cette action est irréversible et supprimera toutes les données associées à cet agent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedAgent && deleteAgentMutation.mutate(selectedAgent.id)}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteAgentMutation.isPending}
            >
              {deleteAgentMutation.isPending ? "Suppression en cours..." : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isResetPasswordDialogOpen} onOpenChange={setIsResetPasswordDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
            <DialogDescription>
              Définir un nouveau mot de passe pour {selectedAgent?.firstName} {selectedAgent?.lastName} ({selectedAgent?.username}).
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
            <Button onClick={confirmResetPassword} disabled={resetPasswordMutation.isPending}>
              {resetPasswordMutation.isPending ? "En cours..." : "Mettre à jour"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddAgentForm open={showAddForm} onClose={() => setShowAddForm(false)} />

      </div>
  );
}
