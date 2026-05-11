import HunterCarnetModal from "@/components/hunters/HunterCarnetModal";
import HunterDetails from "@/components/hunters/HunterDetails";
import HunterForm from "@/components/hunters/HunterForm";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useHunters, useNationalHunters } from "@/lib/hooks/useHunters";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  MoreHorizontal,
  Printer,
  Search,
  Trash2,
  User,
  UserPlus
} from "lucide-react";
import { useEffect, useState } from "react";

export default function Hunters() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [serverResults, setServerResults] = useState<any[] | null>(null);
  const [serverSearching, setServerSearching] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedHunterId, setSelectedHunterId] = useState<number | null>(null);
  const [hunterToDelete, setHunterToDelete] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [carnetHunterId, setCarnetHunterId] = useState<number | null>(null);
  const [carnetHunterName, setCarnetHunterName] = useState<string>("");
  const [activeTab, setActiveTab] = useState(() => {
    const role = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    return role === 'agent' ? 'region' : role === 'sub-agent' ? 'zone' : 'all';
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Synchroniser l'onglet actif avec le rÃ´le de l'utilisateur
  useEffect(() => {
    if (!user) return;
    const desired = user.role === "agent" ? "region" : user.role === "sub-agent" ? "zone" : "all";
    setActiveTab(desired);
  }, [user]);

  // RÃ©cupÃ©rer tous les chasseurs (portÃ©e dÃ©pend de l'utilisateur connectÃ©)
  const { allHunters, huntersLoading: isLoadingAll, error: errorAll } = useHunters();
  // RÃ©cupÃ©rer la liste nationale
  const { nationalHunters, nationalLoading, nationalError } = useNationalHunters();

  // DÃ©river la liste par dÃ©partement (utile pour sub-agent)
  const zoneHunters = (allHunters || []).filter((h: any) =>
    user?.departement ? (h.departement || "").toLowerCase() === String(user.departement).toLowerCase() : false
  );

  // DÃ©terminer quels chasseurs afficher en fonction de l'onglet actif
  // "all" = liste nationale (via /hunters/all)
  // "region" = liste rÃ©gionale (via /hunters qui inclut agent + secteurs de la rÃ©gion)
  const hunters = activeTab === "all" ? nationalHunters :
    activeTab === "region" ? allHunters :
      activeTab === "zone" ? zoneHunters :
        allHunters;

  const isLoading = activeTab === "all" ? nationalLoading : isLoadingAll;

  const error = activeTab === "all" ? nationalError : errorAll;

  // Mutation pour supprimer un chasseur
  const deleteHunterMutation = useMutation({
    mutationFn: async (hunterId: number) => {
      console.log(`ðŸš« Tentative de suppression du chasseur ${hunterId}`);

      // VÃ©rifier si l'utilisateur est admin pour forcer la suppression
      const isAdmin = localStorage.getItem('userRole') === 'admin';
      console.log(`ðŸ”‘ Suppression par admin? ${isAdmin}`);

      try {
        // Si c'est un administrateur, ajouter force=true dans l'URL
        const url = isAdmin
          ? `/api/hunters/${hunterId}?force=true`
          : `/api/hunters/${hunterId}`;

        console.log(`ðŸ”— URL d'appel: ${url}`);

        const response = await apiRequest({
          url: url,
          method: "DELETE",
        });
        console.log(`âœ… RÃ©ponse de suppression:`, response);
        return response;
      } catch (error) {
        console.error(`âŒ Erreur lors de la suppression du chasseur ${hunterId}:`, error);
        throw error;
      }
    },
    onSuccess: (_data, hunterId) => {
      console.log("âœ… Suppression rÃ©ussie:", hunterId);
      // Certaines libs de modals (Radix) appliquent un scroll-lock / pointer-events sur le body.
      // En cas de mauvaise restauration, l'app paraît "bloquée" (menu + navigation non cliquables).
      // On force ici une restauration après fermeture.
      try {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.removeAttribute('data-scroll-locked');
        document.documentElement.removeAttribute('data-scroll-locked');
      } catch {}
      toast({
        title: "Chasseur supprimé",
        description: "Le chasseur a été supprimé avec succès.",
      });
      setIsDeleteDialogOpen(false);
      // Nettoyage de la sÃ©lection et rafraÃ®chissement des listes
      setHunterToDelete(null);
      // Si le chasseur supprimé était affiché dans un modal, fermer pour éviter une page en erreur
      if (selectedHunterId === hunterId) {
        setSelectedHunterId(null);
      }
      if (carnetHunterId === hunterId) {
        setCarnetHunterId(null);
        setCarnetHunterName("");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/region", user?.region] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/zone", user?.zone] });
    },
    onError: (error: any) => {
      console.error("âŒ Erreur lors de la suppression du chasseur:", error);
      try {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.removeAttribute('data-scroll-locked');
        document.documentElement.removeAttribute('data-scroll-locked');
      } catch {}
      const errorMessage = (error && (error.response?.data?.message || error.message)) || "Une erreur est survenue lors de la suppression.";
      toast({
        title: "Erreur de suppression",
        description: errorMessage,
        variant: "destructive",
      });
      setIsDeleteDialogOpen(false);
      // Nettoyer la sÃ©lection pour rÃ©activer les interactions
      setHunterToDelete(null);
    },
  });

  // Mutation pour activer le profil d'un chasseur
  const activateHunterMutation = useMutation({
    mutationFn: async (hunterId: number) => {
      return apiRequest({
        url: `/api/hunters/${hunterId}/activate`,
        method: "PUT",
      });
    },
    onSuccess: () => {
      toast({
        title: "Profil Activé",
        description: "Le profil du chasseur a été activé avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/region", user?.region] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/zone", user?.zone] });
    },
    onError: (error: any) => {
      const errorMessage = (error && (error.response?.data?.message || error.message)) || "Une erreur est survenue lors de l'activation du profil.";
      toast({
        title: "Erreur d'activation",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Mutation pour suspendre le profil d'un chasseur
  const suspendHunterMutation = useMutation({
    mutationFn: async (hunterId: number) => {
      return apiRequest({
        url: `/api/hunters/${hunterId}/suspend`,
        method: "PUT",
      });
    },
    onSuccess: () => {
      toast({
        title: "Profil Suspendu",
        description: "Le profil du chasseur a été suspendu avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/region", user?.region] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/zone", user?.zone] });
    },
    onError: (error: any) => {
      const errorMessage = (error && (error.response?.data?.message || error.message)) || "Une erreur est survenue lors de la suspension du profil.";
      toast({
        title: "Erreur de suspension",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // DÃ©clencher une recherche serveur (incluant NÂ° permis) quand l'utilisateur saisit un terme
  useEffect(() => {
    let timer: any;
    const q = (searchTerm || "").trim();
    if (q.length >= 2) {
      setServerSearching(true);
      timer = setTimeout(async () => {
        try {
          const res = await apiRequest<any[]>({ url: `/api/hunters/search?q=${encodeURIComponent(q)}`, method: 'GET' });
          const arr = Array.isArray(res) ? (res as any) : (res as any)?.data || [];
          setServerResults(arr);
        } catch (e) {
          console.error('[Hunters] search error:', e);
          setServerResults([]);
        } finally {
          setServerSearching(false);
        }
      }, 350); // debounce
    } else {
      setServerResults(null);
    }
    return () => timer && clearTimeout(timer);
  }, [searchTerm]);

  const baseList = hunters || [];
  const clientFiltered = baseList.filter((hunter) => {
    const searchLower = (searchTerm || "").toLowerCase();
    const lastName = (hunter.lastName || "").toLowerCase();
    const firstName = (hunter.firstName || "").toLowerCase();
    const idNumber = (hunter.idNumber || "").toLowerCase();
    const phone = (hunter.phone || "").toString().toLowerCase();
    return (
      lastName.includes(searchLower) ||
      firstName.includes(searchLower) ||
      idNumber.includes(searchLower) ||
      phone.includes(searchLower)
    );
  });

  const filteredHunters = serverResults !== null ? serverResults : clientFiltered;

  // Pagination
  const getPaginatedData = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredHunters.slice(startIndex, endIndex);
  };

  const getTotalPages = () => Math.ceil(filteredHunters.length / itemsPerPage);
  const paginatedHunters = getPaginatedData();
  const totalPages = getTotalPages();
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredHunters.length);

  // RÃ©initialiser la page quand on change de recherche ou d'onglet
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // Éviter une page invalide après suppression (ex: suppression du dernier élément de la dernière page)
  useEffect(() => {
    const tp = Math.max(1, Math.ceil((filteredHunters?.length ?? 0) / itemsPerPage));
    if (currentPage > tp) {
      setCurrentPage(tp);
    }
  }, [filteredHunters, currentPage]);

  const handleSearch = () => {
    // Client-side filtering is already happening with the state change
    // This function is if we decide to add server-side search in the future
  };

  const handlePrint = () => {
    // Ajouter une feuille de style temporaire pour l'impression qui cache tout sauf le tableau
    const style = document.createElement('style');
    style.id = 'print-style-hunters';
    style.innerHTML = `
      @media print {
        @page { margin: 16mm 12mm; }
        body * {
          visibility: hidden;
        }
        #print-header-hunters, #print-header-hunters * { visibility: visible; }
        #hunters-table, #hunters-table * {
          visibility: visible;
        }
        .print\\:hidden {
          display: none !important;
        }
        #hunters-table {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
        }
        table { width: 100%; table-layout: auto; }
        th, td { white-space: normal !important; word-break: break-word; }
        /* Eviter les coupures de lignes sur plusieurs pages */
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr, th, td { page-break-inside: avoid; break-inside: avoid; }
        .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        /* Pied de page pagination */
        #print-footer-hunters { position: fixed; bottom: 6mm; left: 12mm; right: 12mm; font-size: 11px; color: #6b7280; text-align: right; visibility: visible; }
        #print-footer-hunters .page-number::after { content: "Page " counter(page) " / " counter(pages); }
        .hidden {
          display: table-cell !important;
        }
      }
    `;
    document.head.appendChild(style);

    // En-tÃªte d'impression (titre + date)
    const header = document.createElement('div');
    header.id = 'print-header-hunters';
    header.style.marginBottom = '12px';
    header.style.paddingBottom = '8px';
    header.style.borderBottom = '1px solid #e5e7eb';
    header.innerHTML = `
      <div style="font-family: ui-sans-serif, system-ui;">
        <div style="font-size: 18px; font-weight: 700;">Gestion des Chasseurs</div>
        <div style="font-size: 12px; color: #6b7280;">Imprimé le ${new Date().toLocaleString('fr-FR')}</div>
      </div>
    `;
    const tableWrapper = document.getElementById('hunters-table')?.parentElement;
    if (tableWrapper && tableWrapper.parentElement) {
      tableWrapper.parentElement.insertBefore(header, tableWrapper);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }

    // Pied de page pagination
    const footer = document.createElement('div');
    footer.id = 'print-footer-hunters';
    footer.innerHTML = `<span class="page-number"></span>`;
    document.body.appendChild(footer);

    // Imprimer et nettoyer
    window.print();

    // Supprimer la feuille de style temporaire aprÃ¨s l'impression
    setTimeout(() => {
      const printStyle = document.getElementById('print-style-hunters');
      if (printStyle) printStyle.remove();
      const hdr = document.getElementById('print-header-hunters');
      if (hdr && hdr.parentElement) hdr.parentElement.removeChild(hdr);
      const ftr = document.getElementById('print-footer-hunters');
      if (ftr && ftr.parentElement) ftr.parentElement.removeChild(ftr);
    }, 1000);
  };

  const viewHunterDetails = (hunterId: number) => {
    setSelectedHunterId(hunterId);
  };

  const handleDeleteHunter = (hunterId: number) => {
    setHunterToDelete(hunterId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteHunter = () => {
    if (hunterToDelete) {
      deleteHunterMutation.mutate(hunterToDelete);
    }
  };

  // GÃ©rer l'ouverture/fermeture du dialog pour nettoyer l'Ã©tat et rÃ©initialiser la mutation
  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open);
    if (!open) {
      setHunterToDelete(null);
      try {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        document.body.removeAttribute('data-scroll-locked');
        document.documentElement.removeAttribute('data-scroll-locked');
      } catch {}
      // RÃ©initialiser l'Ã©tat de la mutation pour Ã©viter les boutons bloquÃ©s
      deleteHunterMutation.reset();
    }
  };

  return (
    <main className="page-frame-container bg-white">
  <div className="page-frame-inner container mx-auto px-4 py-2 space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold">Gestion des Chasseurs</h1>
          <Button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 w-full sm:w-auto"
          >
            <UserPlus className="h-4 w-4" />
            Ajouter un Chasseur
          </Button>
        </div>

        {/* Scope badge + results count (above toolbar) */}
        <div className="flex flex-wrap items-center gap-3 mt-1 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            {activeTab === 'all'
              ? 'Portée: Nationale'
              : activeTab === 'region'
                ? `Portée: Régionale${user?.region ? ` (${user.region})` : ''}`
                : `Portée: Département${(user as any)?.departement || user?.zone ? ` (${(user as any)?.departement || user?.zone})` : ''}`}
          </span>
          <span className="text-xs text-gray-600">• Résultats: {filteredHunters?.length ?? 0}</span>
        </div>

        {/* Tabs moved below the search/tools toolbar */}

        {/* Search and actions toolbar */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-gray-50 p-3 rounded-lg shadow-sm print:hidden">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              type="text"
              placeholder="Rechercher (N° pièce, nom, téléphone, N° permis)"
              className="pl-10 bg-white h-9 text-sm border-gray-300"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {serverSearching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">Recherche...</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-xs"
              onClick={handleSearch}
            >
              <Search className="h-3.5 w-3.5" />
              Filtres
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-xs"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimer
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-xs"
            >
              PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-xs"
            >
              Exporter
            </Button>
          </div>
        </div>

        {/* Tabs based on user role (now below the search/tools line) */}
        {user?.role === "agent" ? (
          <Tabs value={activeTab} className="w-full mt-3" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="region">Chasseurs de la Région</TabsTrigger>
              <TabsTrigger value="all">Liste Nationale des Chasseurs</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : user?.role === "sub-agent" ? (
          <Tabs value={activeTab} className="w-full mt-3" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="all">Liste Nationale des Chasseurs</TabsTrigger>
              <TabsTrigger value="zone">Suivi Chasseur (Département)</TabsTrigger>
            </TabsList>
            <div className="mt-2 px-2 py-1 bg-yellow-50 text-sm text-yellow-700 rounded border border-yellow-200">
              <p className="font-medium">Informations sur le suivi des chasseurs :</p>
              <ul className="list-disc ml-4 mt-1 text-xs">
                <li>L'onglet "Suivi Chasseur" affiche les chasseurs assignÃ©s Ã  votre dÃ©partement et ceux qui ont des permis actifs dans votre dÃ©partement</li>
                <li>Les chasseurs avec un permis actif dans votre zone apparaissent automatiquement, même s'ils ne sont pas assignés explicitement</li>
              </ul>
            </div>
          </Tabs>
        ) : null}



        <div className="bg-white rounded-md shadow-sm">
          {isLoading ? (
            <div className="p-8 text-center">Chargement des chasseurs...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">
              Erreur: Impossible de charger les chasseurs{activeTab === 'all' ? " (l'accès national peut être désactivé par l'administrateur)." : ''}
            </div>
          ) : filteredHunters && filteredHunters.length > 0 ? (
            <div className="overflow-x-auto rounded-lg print:overflow-visible">
              <table className="w-full" id="hunters-table">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="p-3 text-left text-xs font-medium text-gray-500">NOM COMPLET</th>
                    <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                    <th className="hidden sm:table-cell p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catégorie</th>
                    <th className="hidden sm:table-cell p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Enregistré par</th>
                    <th className="hidden sm:table-cell p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut Compte</th>
                    <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carnet de chasse</th>
                    <th className="p-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedHunters.map((hunter) => (
                    <tr key={hunter.id} className="hover:bg-gray-50">
                      <td className="p-3 text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                            <AvatarFallback className="bg-amber-100 text-amber-600">
                              <User className="h-4 w-4" />
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm sm:text-base">{hunter.firstName} {hunter.lastName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-700">{hunter.phone}</td>
                      <td className="hidden sm:table-cell p-3 text-sm text-gray-700 capitalize">{hunter.category}</td>
                      <td className="hidden sm:table-cell p-3 text-sm text-gray-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{(hunter as any).registeredBy || '-'}</span>
                          <span className="text-xs text-gray-500 text-right whitespace-nowrap">
                            {hunter.createdAt ? new Date(hunter.createdAt).toLocaleDateString('fr-FR') : ''}
                          </span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell p-3 text-sm">
                        {hunter.isActive ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Inactif
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center gap-2 h-8 px-2 text-xs"
                          onClick={() => {
                            setCarnetHunterId(hunter.id);
                            setCarnetHunterName(`${hunter.firstName} ${hunter.lastName}`);
                          }}
                        >
                          <BookOpen className="h-4 w-4" />
                          Carnet
                        </Button>
                      </td>
                      <td className="p-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => viewHunterDetails(hunter.id)}>
                              Voir les détails
                            </DropdownMenuItem>
                            {user?.role === 'admin' && (
                              <>
                                {!hunter.isActive && (
                                  <DropdownMenuItem
                                    onClick={() => activateHunterMutation.mutate(hunter.id)}
                                    disabled={activateHunterMutation.isPending}
                                  >
                                    {activateHunterMutation.isPending && activateHunterMutation.variables === hunter.id ? 'Activation...' : 'Activer le Profil'}
                                  </DropdownMenuItem>
                                )}
                                {hunter.isActive && (
                                  <DropdownMenuItem
                                    onClick={() => suspendHunterMutation.mutate(hunter.id)}
                                    disabled={suspendHunterMutation.isPending}
                                  >
                                    {suspendHunterMutation.isPending && suspendHunterMutation.variables === hunter.id ? 'Suspension...' : 'Suspendre le Profil'}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleDeleteHunter(hunter.id)}
                                  className="text-red-600 hover:!text-red-700"
                                  disabled={deleteHunterMutation.isPending}
                                >
                                  {deleteHunterMutation.isPending && deleteHunterMutation.variables === hunter.id ? 'Suppression...' : 'Supprimer le chasseur'}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="p-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm bg-gray-50 sticky bottom-0 z-20 border-t border-gray-200 pointer-events-auto">
                <div className="text-muted-foreground">
                  {filteredHunters.length > 0 ? `Affichage de ${startIndex + 1} à ${endIndex} sur ${filteredHunters.length} chasseurs` : "Aucun résultat"}
                </div>
                <div className="flex gap-2 sm:ml-auto">
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
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">Aucun chasseur trouvé</div>
          )}
        </div>

        {/* Add Hunter Form Modal */}
        {showAddForm && (
          <HunterForm
            open={showAddForm}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Hunter Details Modal */}
        {selectedHunterId && (
          <HunterDetails
            hunterId={selectedHunterId}
            open={!!selectedHunterId}
            onClose={() => setSelectedHunterId(null)}
          />
        )}

        {/* Hunter Carnet Modal */}
        {carnetHunterId && (
          <HunterCarnetModal
            hunterId={carnetHunterId}
            hunterName={carnetHunterName}
            open={!!carnetHunterId}
            onClose={() => {
              setCarnetHunterId(null);
              setCarnetHunterName("");
            }}
          />
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce chasseur ? Cette action ne peut pas être annulée.
              {localStorage.getItem('userRole') === 'admin' && (
                <span className="block text-red-500 mt-2">
                  En tant qu'administrateur, cette suppression sera forcée, même si le chasseur possède des permis ou un historique.
                </span>
              )}
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteHunter}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteHunterMutation.isPending}
              >
                {deleteHunterMutation.isPending ? (
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
      </div>
    </main>
  );
}

