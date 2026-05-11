import ResponsivePage from "@/components/layout/ResponsivePage";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
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
import { Edit, Eye, Loader2, MoreHorizontal, RefreshCw, Trash2, User, UserPlus } from "lucide-react";

// Types pour les agents
interface BaseAgent {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  est_actif: boolean;
  region: string;
}

interface AgentRegional extends BaseAgent {
  service: string;
}

interface AgentSecteur extends BaseAgent {
  secteur: string;
}

export default function GestiondesAgents() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("regional");

  // Vérifier si l'utilisateur est un administrateur
  const isAdmin = user?.role === "admin";

  // Récupérer les agents régionaux
  const {
    data: regionalAgents = [],
    isLoading: isLoadingRegional,
    refetch: refetchRegional,
  } = useQuery<AgentRegional[]>({
    queryKey: ['agents_regionaux'],
    queryFn: async () => {
      const response = await fetch('/api/users/agents', {
        credentials: 'include', // Inclure les cookies d'authentification
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des agents régionaux');
      }
      const json = await response.json();
      const data = Array.isArray(json) ? json : (json?.data ?? []);
      return data
        .filter((agent: any) => agent.role === 'agent' && agent.serviceLocation?.toLowerCase().includes('régional'))
        .map((agent: any) => ({
          id: agent.id,
          matricule: agent.username,
          nom: agent.lastName,
          prenom: agent.firstName,
          telephone: agent.phone || '-',
          est_actif: agent.isActive ?? true,
          service: agent.region
        }));
    },
    enabled: !!user && isAdmin,
    retry: 1,
    refetchOnWindowFocus: false
  });

  // Récupérer les agents secteurs
  const {
    data: sectorAgents = [],
    isLoading: isLoadingSector,
    refetch: refetchSector,
  } = useQuery<AgentSecteur[]>({
    queryKey: ['agents_secteurs'],
    queryFn: async () => {
      const response = await fetch('/api/users/agents', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error('Erreur lors de la récupération des agents secteurs');
      }
      const json = await response.json();
      const data = Array.isArray(json) ? json : (json?.data ?? []);

      console.log('🔍 DEBUG AGENTS SECTEUR - Données reçues:', {
        isArray: Array.isArray(json),
        totalAgents: data.length,
        roles: data.map((a: any) => a.role)
      });

      // Debug: afficher les données brutes du premier agent secteur
      const firstSubAgent = data.find((a: any) => a.role === 'sub-agent');
      if (firstSubAgent) {
        console.log('🔍 DEBUG - Premier agent secteur trouvé:', {
          id: firstSubAgent.id,
          username: firstSubAgent.username,
          role: firstSubAgent.role,
          region: firstSubAgent.region,
          departement: firstSubAgent.departement,
          zone: firstSubAgent.zone,
          toutesLesCles: Object.keys(firstSubAgent)
        });
      } else {
        console.log('⚠️ Aucun agent secteur (sub-agent) trouvé dans les données');
      }

      return data
        .filter((agent: any) => agent.role === 'sub-agent')
        .map((agent: any) => ({
          id: agent.id,
          matricule: agent.username,
          nom: agent.lastName,
          prenom: agent.firstName,
          telephone: agent.phone || '-',
          est_actif: agent.isActive ?? true,
          region: agent.region || '-',
          secteur: agent.departement || '-'  // Même logique que pour region
        }));
    },
    enabled: !!user && isAdmin,
    retry: 1,
    refetchOnWindowFocus: false
  });

  // Filtrer les agents en fonction du terme de recherche
  const filteredRegionalAgents = regionalAgents.filter((agent: AgentRegional) =>
    agent.matricule.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.region.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (agent.telephone && agent.telephone.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSectorAgents = sectorAgents.filter((agent: AgentSecteur) =>
    agent.matricule.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.region.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.secteur.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (agent.telephone && agent.telephone.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Pagination des listes
  const regionalPagination = usePagination(filteredRegionalAgents, { pageSize: 10 });
  const sectorPagination = usePagination(filteredSectorAgents, { pageSize: 10 });

  // Fonction pour rafraîchir les données
  const handleRefresh = async () => {
    try {
      await Promise.all([refetchRegional(), refetchSector()]);
      toast({
        title: "Succès",
        description: "Les données ont été rafraîchies",
        variant: "default"
      });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de rafraîchir les données",
        variant: "destructive"
      });
    }
  };

  // Fonction pour voir le profil d'un agent
  const handleViewProfile = (agentId: number, agentType: string) => {
    console.log("Voir profil", { agentId, agentType });
    // Implémenter la logique pour voir le profil
  };

  // Fonction pour modifier un agent
  const handleEditAgent = (agentId: number, agentType: string) => {
    console.log(`Modifier l'agent ${agentType} avec ID: ${agentId}`);
    // Exemple: history.push(`/admin/edit-agent/${agentType}/${agentId}`);
  };

  // Fonction pour supprimer un agent
  const handleDeleteAgent = async (agentId: number, agentType: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer cet agent ${agentType} ? Cette action est irréversible.`)) {
      return;
    }
    try {
      // Remplacer par votre véritable appel API
      // await apiRequest.delete(`/api/users/agents/${agentId}`);
      console.log(`Supprimer l'agent ${agentType} ID: ${agentId}`);
      toast({
        title: "Succès",
        description: `L'agent ${agentType} a été supprimé avec succès.`,
        variant: "default",
      });
      // Rafraîchir les données après suppression
      // await queryClient.invalidateQueries(['agents_regionaux']);
      // await queryClient.invalidateQueries(['agents_secteurs']);
      handleRefresh(); // Utiliser la fonction de rafraîchissement existante si elle fait l'affaire
    } catch (error) {
      console.error(`Erreur lors de la suppression de l'agent ${agentType}:`, error);
      toast({
        title: "Erreur",
        description: `Impossible de supprimer l'agent ${agentType}. Veuillez réessayer.`,
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsivePage>
      <div className="space-y-6">
        <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestion des Agents</h1>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Rafraîchir
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Ajouter un agent
          </Button>

          </div>
        </div>

        <div className="mb-6">
          <Input
            type="search"
            placeholder="Rechercher un agent..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="regional">Agents Régionaux</TabsTrigger>
            <TabsTrigger value="sector">Agents Secteur</TabsTrigger>
          </TabsList>

          <TabsContent value="regional" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Liste des Agents Régionaux</CardTitle>
                <CardDescription>
                  {filteredRegionalAgents.length} agent(s) régional(aux) trouvé(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto border border-gray-200 rounded-md">
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead className="hidden sm:table-cell">Région</TableHead>
                      <TableHead className="hidden md:table-cell">Service</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingRegional ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : regionalPagination.currentItems.length > 0 ? (
                      regionalPagination.currentItems.map((agent: AgentRegional) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-600 text-white">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <span>{agent.matricule}</span>
                            </div>
                          </TableCell>
                          <TableCell>{agent.nom}</TableCell>
                          <TableCell>{agent.prenom}</TableCell>
                          <TableCell className="hidden sm:table-cell">{agent.region}</TableCell>
                          <TableCell className="hidden md:table-cell">{agent.service}</TableCell>
                          <TableCell>{agent.telephone}</TableCell>
                          <TableCell>
                            <Badge
                              variant={agent.est_actif ? "default" : "destructive"}
                              className={agent.est_actif ? "bg-green-500 hover:bg-green-600" : ""}
                            >
                              {agent.est_actif ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewProfile(agent.id, "regional")}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir profil
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditAgent(agent.id, "regional")}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Modifier
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteAgent(agent.id, "regional")} className="text-red-600 hover:text-red-700 focus:text-red-700">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          Aucun agent régional trouvé
                        </TableCell>
                      </TableRow>
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
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious onClick={() => regionalPagination.prevPage()} />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext onClick={() => regionalPagination.nextPage()} />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sector" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Liste des Agents Secteur</CardTitle>
                <CardDescription>
                  {filteredSectorAgents.length} agent(s) secteur trouvé(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full overflow-x-auto border border-gray-200 rounded-md">
                <Table className="min-w-full text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Prénom</TableHead>
                      <TableHead className="hidden sm:table-cell">Région</TableHead>
                      <TableHead className="hidden md:table-cell">Secteur</TableHead>
                      <TableHead>Téléphone</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingSector ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : sectorPagination.currentItems.length > 0 ? (
                      sectorPagination.currentItems.map((agent: AgentSecteur) => (
                        <TableRow key={agent.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-green-600 text-white">
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <span>{agent.matricule}</span>
                            </div>
                          </TableCell>
                          <TableCell>{agent.nom}</TableCell>
                          <TableCell>{agent.prenom}</TableCell>
                          <TableCell className="hidden sm:table-cell">{agent.region}</TableCell>
                          <TableCell className="hidden md:table-cell">{agent.secteur}</TableCell>
                          <TableCell>{agent.telephone || "-"}</TableCell>
                          <TableCell>
                            <Badge
                              variant={agent.est_actif ? "default" : "destructive"}
                              className={agent.est_actif ? "bg-green-500 hover:bg-green-600" : ""}
                            >
                              {agent.est_actif ? "Actif" : "Inactif"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleViewProfile(agent.id, "sector")}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  Voir profil
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleEditAgent(agent.id, "sector")}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Modifier
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDeleteAgent(agent.id, "sector")} className="text-red-600 hover:text-red-700 focus:text-red-700">
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Supprimer
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-4">
                          Aucun agent secteur trouvé
                        </TableCell>
                      </TableRow>
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
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious onClick={() => sectorPagination.prevPage()} />
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext onClick={() => sectorPagination.nextPage()} />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ResponsivePage>
  );
}
