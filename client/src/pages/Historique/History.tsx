import { useEffect, useState } from "react";
// ResponsivePage removed: rely on MainLayout page-frame
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, Banknote, Calendar, Clock, Download, Edit, Eye, FileText, PenTool, Search, Send, ShieldAlert, Trash, Upload, User, UserIcon } from "lucide-react";

interface HistoryEvent {
  id: number;
  operation: string;
  entityType: string;
  entityId: number;
  details: string;
  userId: number | null;
  createdAt: string;
  userName?: string;
  userRegion?: string;
  userDepartement?: string;
}

export default function History() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOperation, setSelectedOperation] = useState<string>("");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [currentTab, setCurrentTab] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Récupérer l'historique avec filtrage régional pour les agents régionaux
  const { data: systemHistory = [], isLoading: isHistoryLoading } = useQuery<HistoryEvent[]>({
    queryKey: ["/api/history/regional", user?.region],
    queryFn: async () => {
      if (user?.role === 'agent' && user?.region) {
        // Pour les agents régionaux, récupérer l'historique filtré par région
        const response: any = await apiRequest({
          url: `/api/history/regional?region=${encodeURIComponent(user.region)}`,
          method: 'GET'
        });
        return Array.isArray(response) ? response : (response?.data || []);
      } else {
        // Pour les autres rôles, utiliser l'endpoint standard
        const response: any = await apiRequest({
          url: '/api/history',
          method: 'GET'
        });
        return Array.isArray(response) ? response : (response?.data || []);
      }
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Les noms des utilisateurs sont déjà inclus dans l'historique via la jointure backend
  // Pas besoin de charger séparément la liste des utilisateurs

  // Obtenir les opérations uniques pour le filtre
  const uniqueOperations = Array.from(
    new Set((systemHistory as HistoryEvent[]).map((event) => event.operation))
  );

  // Obtenir les types d'entités uniques pour le filtre
  const uniqueEntityTypes = Array.from(
    new Set((systemHistory as HistoryEvent[]).map((event) => event.entityType))
  );

  // Filtrer les événements selon les critères
  const filteredHistory = (systemHistory as HistoryEvent[]).filter((event) => {
    // Filtrer par opération si une opération est sélectionnée
    if (selectedOperation && selectedOperation !== "all" && event.operation !== selectedOperation) {
      return false;
    }

    // Filtrer par type d'entité si un type est sélectionné
    if (selectedEntityType && selectedEntityType !== "all" && event.entityType !== selectedEntityType) {
      return false;
    }

    // Filtrer par date si une date est sélectionnée
    if (selectedDate) {
      const eventDate = new Date(event.createdAt).toISOString().split('T')[0];
      if (eventDate !== selectedDate) {
        return false;
      }
    }

    // Filtrer par texte de recherche
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        event.details.toLowerCase().includes(query) ||
        (event.userId ? String(event.userId).includes(query) : false) ||
        event.operation.toLowerCase().includes(query) ||
        event.entityType.toLowerCase().includes(query)
      );
    }

    // Filtrer par onglet
    if (currentTab !== "all") {
      // Onglet Connexions : afficher les événements de login
      if (currentTab === 'login') {
        return event.operation === 'login';
      }
      // Autres onglets : correspondance stricte
      return event.entityType === currentTab;
    }

    return true;
  });

  // Pagination
  const sortedHistory = filteredHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedHistory.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(sortedHistory.length / itemsPerPage);
  const paginatedHistory = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, sortedHistory.length);

  // Réinitialiser la page quand on change de filtre
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedOperation, selectedEntityType, selectedDate, currentTab]);

  // Fonction pour obtenir une couleur de badge en fonction du type d'entité
  const getEntityTypeColor = (entityType: string) => {
    switch (entityType) {
      case "permit":
        return "bg-blue-100 text-blue-800";
      case "user":
        return "bg-purple-100 text-purple-800";
      case "hunter":
        return "bg-amber-100 text-amber-800";
      case "system":
        return "bg-gray-100 text-gray-800";
      case "revenue":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Fonction pour obtenir une icône en fonction de l'opération
  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case "create":
        return <PenTool className="h-4 w-4 text-green-600" />;
      case "update":
        return <Edit className="h-4 w-4 text-blue-600" />;
      case "delete":
        return <Trash className="h-4 w-4 text-red-600" />;
      case "login":
        return <User className="h-4 w-4 text-purple-600" />;
      case "view":
        return <Eye className="h-4 w-4 text-gray-600" />;
      case "download":
        return <Download className="h-4 w-4 text-blue-800" />;
      case "upload":
        return <Upload className="h-4 w-4 text-blue-600" />;
      case "sms_notification":
        return <Send className="h-4 w-4 text-amber-600" />;
      case "payment":
        return <Banknote className="h-4 w-4 text-green-600" />;
      case "alert":
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case "error":
        return <ShieldAlert className="h-4 w-4 text-red-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  // Fonction pour traduire le nom de l'opération
  const getOperationName = (operation: string) => {
    switch (operation) {
      case "create":
        return "Création";
      case "update":
        return "Modification";
      case "delete":
        return "Suppression";
      case "login":
        return "Connexion";
      case "view":
        return "Consultation";
      case "download":
        return "Téléchargement";
      case "upload":
        return "Importation";
      case "sms_notification":
        return "Notification SMS";
      case "payment":
        return "Paiement";
      case "alert":
        return "Alerte";
      case "error":
        return "Erreur";
      default:
        return operation;
    }
  };

  // Fonction pour traduire le type d'entité
  const getEntityTypeName = (entityType: string) => {
    switch (entityType) {
      case "permit":
        return "Permis";
      case "user":
        return "Utilisateur";
      case "hunter":
        return "Chasseur";
      case "system":
        return "Système";
      case "revenue":
        return "Finance";
      case "tax":
        return "Taxe";
      case "alert":
        return "Alerte";
      default:
        return entityType;
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Historique Régional</h1>
            {user?.role === 'agent' && user?.region && (
              <p className="text-sm text-gray-600 mt-1">Région : {user.region}</p>
            )}
          </div>
        </div>

        <Card>
        <CardHeader>
          <CardTitle>Filtres</CardTitle>
          <CardDescription>
            {user?.role === 'agent'
              ? `Activités de votre région et de vos agents secteur`
              : 'Filtrer les événements par type, opération, date ou recherche'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-2">
              <Label htmlFor="search">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="search"
                  placeholder="Rechercher..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="operation">Opération</Label>
              <Select
                value={selectedOperation}
                onValueChange={setSelectedOperation}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Toutes les opérations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les opérations</SelectItem>
                  {uniqueOperations.map((operation) => (
                    <SelectItem key={operation} value={operation}>
                      {getOperationName(operation)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="entityType">Type d'entité</Label>
              <Select
                value={selectedEntityType}
                onValueChange={setSelectedEntityType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {uniqueEntityTypes.map((entityType) => (
                    <SelectItem key={entityType} value={entityType}>
                      {getEntityTypeName(entityType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <div className="relative">
                <Calendar className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <Input
                  id="date"
                  type="date"
                  className="pl-8"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="all" value={currentTab} onValueChange={setCurrentTab}>
        <TabsList className="grid w-full grid-cols-6 mb-6">
          <TabsTrigger value="all">Tout</TabsTrigger>
          <TabsTrigger value="login">Connexions</TabsTrigger>
          <TabsTrigger value="permit">Permis</TabsTrigger>
          <TabsTrigger value="tax">Taxes</TabsTrigger>
          <TabsTrigger value="alert">Alertes</TabsTrigger>
          <TabsTrigger value="user">Utilisateurs</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="overflow-hidden">
        <div className="w-full overflow-x-auto table-container">
          <table className="w-full min-w-[720px] text-sm table-sticky">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="py-4 px-6 font-medium">Date et Heure</th>
                <th className="py-4 px-6 font-medium">Opération</th>
                <th className="py-4 px-6 font-medium">Type</th>
                <th className="py-4 px-6 font-medium">Utilisateur</th>
                <th className="py-4 px-6 font-medium">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedHistory.length > 0 ? (
                paginatedHistory.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-800">
                            {format(new Date(event.createdAt), "dd/MM/yyyy à HH:mm", {locale: fr})}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-1.5">
                          {getOperationIcon(event.operation)}
                          <span>{getOperationName(event.operation)}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <Badge className={getEntityTypeColor(event.entityType)}>
                          {getEntityTypeName(event.entityType)}
                        </Badge>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <UserIcon className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">
                              {event.userName && event.userName.trim()
                                ? event.userName
                                : (event.userId ? `ID: ${event.userId}` : "Système")
                              }
                            </span>
                          </div>
                          {event.userDepartement && (
                            <span className="text-xs text-gray-500 ml-5">Secteur: {event.userDepartement}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="text-sm">{event.details}</div>
                      </td>
                    </tr>
                  ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">
                    {isHistoryLoading ? "Chargement de l'historique..." : "Aucun événement trouvé"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedHistory.length > 0 && (
          <div className="p-4 flex justify-between items-center text-sm bg-gray-50 border-t">
            <div className="text-muted-foreground">
              Affichage de {startIndex + 1} à {endIndex} sur {sortedHistory.length} événements
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
                disabled={currentPage >= totalPages}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>
      </div>
  );
}
