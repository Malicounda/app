import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { format, isValid, parseISO } from 'date-fns';
import { Eye, Feather, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { resolveApiUrl } from '@/utils/environment';

// Types pour les activités de chasse
interface HuntingSpecies {
  id: string;
  name: string;
  category: string;
  count: number;
  scientificName?: string;
  sex?: string;
}

interface HuntingActivity {
  id: string;
  date: string;
  zone: string;
  region?: string;
  arrondissement?: string | null;
  commune?: string | null;
  departement?: string | null;
  permitNumber: string;
  species: HuntingSpecies[];
  guideId?: string;
  guideName?: string;
  status?: string;
  coordinates?: string;
  notes?: string;
  type?: string; // Pour différencier les déclarations d'abattage
  photoAvailable?: boolean;
  activityNumber?: string; // Numéro d'activité pour les déclarations validées
  reportId?: number; // Ajouté pour correspondre à l'usage
}

// Interface pour les activités unifiées (backend)
interface UnifiedActivity {
  id: number;
  source_type: string;
  source_id: number;
  hunter_id: number;
  guide_id?: number;
  permit_id?: number;
  permit_number?: string;
  species_id: number;
  species_name: string;
  scientific_name?: string;
  sex: string;
  quantity: number;
  location?: string;
  lat?: number;
  lon?: number;
  hunting_date: string;
  photo_data?: string;
  photo_mime?: string;
  photo_name?: string;
  created_at: string;
  activity_number?: string;
  status: string;
  is_validated_activity: boolean;
  is_guide_declaration: boolean;
  reportId?: number; // id réel de la ligne declaration_especes
}

interface GuideActivity {
  id: string;
  date: string;
  zone: string;
  guideName: string;
  hunterCount: number;
  species: HuntingSpecies[];
  status: string; // 'verified' ou 'rejected'
  createdAt: string; // Date de création pour calculer les 48h
}

interface FilterState {
  region: string;
  date: string;
  species: string;
}

export default function HuntingActivities() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const token = typeof window !== 'undefined' ? (localStorage.getItem('token') || sessionStorage.getItem('token')) : '';

  // Vérifier si le chasseur a des permis actifs
  const { data: hunterPermits = [] } = useQuery({
    queryKey: ['hunter-permits'],
    queryFn: async () => {
      if (user?.role !== 'hunter') return [];
      const response = await apiRequest('GET', '/api/permits/hunter/my-permits');
      const permits = Array.isArray(response) ? response : (response as any)?.data || [];
      console.log('[HuntingActivities] Permis récupérés:', permits);
      return permits;
    },
    enabled: user?.role === 'hunter',
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 5_000,
    refetchInterval: 30_000,
  });



  // Vérifier si le chasseur a des permis actifs (non expirés et non suspendus)
  const hasActivePermits = Array.isArray(hunterPermits) && hunterPermits.some((permit: any) => {
    const isActive = permit.status === 'active';
    const isNotExpired = permit.expiryDate && new Date(permit.expiryDate) >= new Date();
    const result = isActive && isNotExpired;
    console.log(`[HuntingActivities] Permis ${permit.permitNumber}: status=${permit.status}, expiryDate=${permit.expiryDate}, isActive=${isActive}, isNotExpired=${isNotExpired}, hasActivePermit=${result}`);
    return result;
  });

  console.log('[HuntingActivities] hasActivePermits:', hasActivePermits, 'Total permis:', Array.isArray(hunterPermits) ? hunterPermits.length : 0);
  const [selectedActivity, setSelectedActivity] = useState<HuntingActivity | null>(null);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState<number | null>(null);
  const [selectedGuideActivity, setSelectedGuideActivity] = useState<GuideActivity | null>(null);
  const [showSpeciesDetails, setShowSpeciesDetails] = useState<{[key: string]: boolean}>({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedSpecies, setEditedSpecies] = useState<HuntingSpecies[]>([]);
  const [editReason, setEditReason] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  // Pagination (5 éléments par page)
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // État pour les filtres
  const [filters, setFilters] = useState<FilterState>({
    region: '',
    date: '',
    species: '',
  });

  useEffect(() => {
    document.title = 'Carnet de Chasse Numérique | SCoDiPP_Ch';
  }, []);

  const isGuide = user?.role === 'hunting-guide';
  const queryId = isGuide ? user?.guideId : user?.hunterId;
  const endpointPath = isGuide ? 'guide' : 'hunter';

  // Récupérer les activités de chasse unifiées (déclarations + activités validées)
  const { data: unifiedActivities = [], isLoading: activitiesLoading } = useQuery({
    queryKey: ['/api/hunting-activities', endpointPath, queryId],
    queryFn: async () => {
      if (!queryId) return [];
      const response = await apiRequest<UnifiedActivity[]>('GET', `/api/hunting-activities/${endpointPath}/${queryId}`);
      const data = Array.isArray(response) ? response : (response as any)?.data || [];
      console.log('[HuntingActivities] API response:', data.map((a: any) => ({
        id: a.id,
        source_type: a.source_type,
        is_validated_activity: a.is_validated_activity,
        status: a.status
      })));
      return data as UnifiedActivity[];
    },
    enabled: !!queryId,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });

  // Convertir les activités unifiées au format attendu par l'interface
  const activities: HuntingActivity[] = unifiedActivities.map((activity: UnifiedActivity) => {
    let calculatedType: 'validated' | 'pending' | 'rejected' | 'direct' = 'direct';
    if (activity.is_validated_activity || activity.status === 'approved') {
      calculatedType = 'validated';
    } else if (activity.status === 'rejected') {
      calculatedType = 'rejected';
    } else if (activity.status === 'pending' || activity.status === null) {
      calculatedType = 'pending';
    }
    console.log(`[HuntingActivities] Mapping activity id=${activity.id}, source_type=${activity.source_type}, status=${activity.status}, calculatedType=${calculatedType}`);

    // Construire la zone avec Région/Département si disponibles
    let zoneDisplay = activity.location || '';
    if ((activity as any).region_name || (activity as any).departement_name) {
      const parts = [];
      if ((activity as any).region_name) parts.push(`Région: ${(activity as any).region_name}`);
      if ((activity as any).departement_name) parts.push(`Département: ${(activity as any).departement_name}`);
      zoneDisplay = parts.join(' / ');
    } else if (activity.lat && activity.lon) {
      zoneDisplay = `GPS: ${activity.lat}, ${activity.lon}`;
    }

    return {
      id: `${activity.source_type}-${activity.id}`,
      date: activity.hunting_date || activity.created_at,
      zone: zoneDisplay,
      region: (activity as any).region_name || '',
      // Renseigner le département pour l'affichage dans le modal
      departement: (activity as any).departement_name || '',
      permitNumber: activity.permit_number || '',
      species: [{
        id: activity.species_id.toString(),
        name: activity.species_name,
        category: '', // Catégorie à déterminer
        count: activity.quantity,
        scientificName: activity.scientific_name,
        sex: activity.sex
      }],
      guideId: activity.guide_id?.toString(),
      guideName: activity.is_guide_declaration ? 'Guide de chasse' : undefined,
      status: activity.status,
      coordinates: activity.lat && activity.lon ? `${activity.lat}, ${activity.lon}` : undefined,
      type: calculatedType,
      photoAvailable: !!activity.photo_data,
      reportId: activity.is_validated_activity ? (activity as any).id : activity.source_id,
      activityNumber: activity.activity_number
    };
  });

  // Ancien chargement direct des déclarations supprimé: on s'appuie uniquement sur l'endpoint unifié

  // Récupérer les activités des guides associés à l'utilisateur
  const { data: guideActivities = [], isLoading: guidesLoading } = useQuery({
    queryKey: ['/api/guide-activities', user?.id],
    queryFn: async () => {
      // Dans une version réelle, on ferait un appel API ici
      return [];
    },
    enabled: !!user,
  });

  // Fonction pour basculer l'affichage des détails d'espèces
  const toggleSpeciesDetails = (activityId: string) => {
    setShowSpeciesDetails(prev => ({
      ...prev,
      [activityId]: !prev[activityId]
    }));
  };

  // Utils de date sûrs
  const safeParse = (dateStr: string) => {
    const d = parseISO(dateStr);
    return isValid(d) ? d : new Date(NaN);
  };
  const safeTime = (dateStr: string) => {
    const d = parseISO(dateStr);
    return isValid(d) ? d.getTime() : 0;
  };
  const safeFormatDate = (dateStr: string, fmt = 'dd/MM/yyyy') => {
    const d = parseISO(dateStr);
    return isValid(d) ? format(d, fmt) : '-';
  };

  // Utiliser uniquement les activités unifiées (validées + en attente)
  const allActivities = [...activities].sort((a: any, b: any) => safeTime(b.date) - safeTime(a.date));

  // Fonction pour filtrer les activités
  const filteredActivities = allActivities.filter((activity) => {
    return (
      (filters.region === '' || (activity.region && activity.region.toLowerCase().includes(filters.region.toLowerCase()))) &&
      (filters.date === '' || activity.date.includes(filters.date)) &&
      (filters.species === '' || (Array.isArray(activity.species) && activity.species.some((s: HuntingSpecies) => s.name.toLowerCase().includes(filters.species.toLowerCase()))))
    );
  });

  // Tri et pagination (calculés après les filtres et après les états page/pageSize)
  const sortedActivities = filteredActivities
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const totalItems = sortedActivities.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedActivities = sortedActivities.slice(startIndex, endIndex);

  // Revenir à la page 1 quand les filtres changent
  useEffect(() => {
    setPage(1);
  }, [filters.region, filters.date, filters.species]);

  // S'assurer que la page courante est toujours valide lorsque le nombre total change
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages]);

  // Fonction pour réinitialiser les filtres
  const resetFilters = () => {
    setFilters({
      region: '',
      date: '',
      species: '',
    });

    // Notification pour confirmer la réinitialisation
    toast({
      title: 'Filtres réinitialisés',
      description: 'Tous les filtres ont été réinitialisés avec succès.',
    });
  };

  // Vérifier si une activité est modifiable (moins de 48h)
  const isActivityEditable = (createdAt: string): boolean => {
    const creationDate = new Date(createdAt).getTime();
    const now = new Date().getTime();
    const hoursDiff = (now - creationDate) / (1000 * 60 * 60);
    return hoursDiff < 48;
  };

  // Fonction pour obtenir le statut affiché
  const getDisplayStatus = (activity: GuideActivity): string => {
    // Si plus de 48h, tout est automatiquement vérifié
    if (!isActivityEditable(activity.createdAt)) {
      return 'Vérifié';
    }

    // Sinon, afficher le statut réel
    if (activity.status === 'rejected') {
      return 'Rejeté';
    }
    return 'Vérifié';
  };

  // Fonction pour obtenir la couleur du badge de statut
  const getStatusBadgeClass = (activity: GuideActivity): string => {
    if (!isActivityEditable(activity.createdAt)) {
      return 'bg-green-100 text-green-800';
    }

    if (activity.status === 'rejected') {
      return 'bg-red-100 text-red-800';
    }

    return 'bg-green-100 text-green-800';
  };

  // Fonction pour commencer l'édition d'une activité
  const startEditing = (activity: GuideActivity) => {
    setSelectedGuideActivity(activity);
    setEditedSpecies([...activity.species]);
    setEditReason('');
    setIsEditing(true);
  };

  // Fonction pour mettre à jour la quantité d'une espèce
  const updateSpeciesCount = (id: string, count: number) => {
    setEditedSpecies(prev =>
      prev.map(species =>
        species.id === id ? { ...species, count: Math.max(0, count) } : species
      )
    );
  };

  // Fonction pour sauvegarder les modifications
  const saveChanges = () => {
    if (!selectedGuideActivity) return;

    if (!editReason.trim()) {
      toast({
        title: 'Raison requise',
        description: 'Veuillez indiquer la raison de votre modification.',
        variant: 'destructive'
      });
      return;
    }

    // Dans une version réelle, on ferait un appel API ici pour sauvegarder les modifications
    toast({
      title: 'Modifications enregistrées',
      description: 'Les modifications ont été enregistrées avec succès.',
    });

    setIsEditing(false);
    setSelectedGuideActivity(null);
    setEditReason('');
  };

  return (
    <div className="h-[calc(100dvh-75px)] sm:h-screen bg-stone-100 flex flex-col overflow-hidden pb-safe">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="container mx-auto max-w-4xl px-2 sm:px-4 py-2 sm:py-4 flex-1 flex flex-col min-h-0">
          <div className="mb-4 shrink-0">
            <Tabs value="activites" onValueChange={(v) => { if (v === 'carnet') setLocation('/hunting-reports'); }} className="w-full">
              <TabsList className="grid grid-cols-2 bg-[#0b3d2e] border border-emerald-700/50 rounded-lg w-full p-1 shadow-md">
                <TabsTrigger value="carnet" className="flex items-center justify-center gap-2 data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 text-emerald-100 font-serif transition-all">
                  Carnet de Chasse
                </TabsTrigger>
                <TabsTrigger value="activites" className="flex items-center justify-center gap-2 data-[state=active]:bg-amber-500 data-[state=active]:text-amber-950 text-emerald-100 font-serif transition-all">
                  <FileText className="h-4 w-4" />
                  Mes Activités
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {!showForm ? (
            <div className="relative flex-1 flex flex-col min-h-0">
              {/* Pages du carnet */}
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-xl p-3 sm:p-6 relative overflow-hidden flex-1 flex flex-col min-h-0" style={{
                backgroundImage: `
                  linear-gradient(90deg, rgba(139, 69, 19, 0.05) 0%, transparent 5%),
                  repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(139, 69, 19, 0.1) 24px, rgba(139, 69, 19, 0.1) 25px)
                `,
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1), 0 5px 20px rgba(0,0,0,0.2)'
              }}>
                {/* Reliure de la page */}
                <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-r from-emerald-900 to-emerald-800 shadow-inner">
                  <div className="flex flex-col justify-evenly h-full px-1">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-600 rounded-full shadow-inner mx-auto"></div>
                    ))}
                  </div>
                </div>

                <div className="ml-8 sm:ml-12 flex flex-col flex-1 min-h-0">
                  <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 min-h-0">

                    <TabsContent value="list" className="data-[state=active]:flex flex-col flex-1 min-h-0 m-0">
                      <div className="flex flex-col flex-1 min-h-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-2 shrink-0">
                          <h2 className="text-2xl font-bold text-amber-800 font-serif mb-2 sm:mb-0">
                            {user?.role === 'hunting-guide' ? 'Les Prélèvements' : 'Mes Prélèvements'}
                          </h2>
                          {totalItems > pageSize && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                              >
                                Précédent
                              </Button>
                              <span className="px-2 text-sm text-amber-800">
                                Page {currentPage} / {totalPages}
                              </span>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages}
                                className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                              >
                                Suivant
                              </Button>
                            </div>
                          )}
                        </div>

                        {filteredActivities.length === 0 ? (
                          <div className="text-center py-12 flex-1">
                            <div className="text-6xl mb-4">📖</div>
                            <p className="text-amber-700 font-serif text-lg">Votre carnet est vide</p>
                            <p className="text-amber-600 font-serif">Commencez par déclarer votre premier prélèvement</p>
                          </div>
                        ) : (
                          <div className="space-y-4 flex-1 overflow-y-auto pr-2 pb-2 -mr-2 styled-scrollbar">
                            {paginatedActivities.map((activity, index) => (
                              <div key={activity.id} className="bg-gradient-to-r from-amber-100 to-amber-50 rounded-lg p-3 sm:p-6 shadow-md border-l-4 border-amber-600 relative" style={{
                                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(139, 69, 19, 0.05) 24px, rgba(139, 69, 19, 0.05) 25px)'
                              }}>
                                {/* Numéro d'entrée */}
                                <div className="absolute -left-2 -top-2 w-8 h-8 bg-amber-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                  {sortedActivities.length - (startIndex + index)}
                                </div>

                                {/* Badge pour indiquer le type d'activité */}
                                <div className="absolute -right-2 -top-2">
                                  {activity.type === 'validated' ? (
                                    <Badge className="bg-green-600 text-white border-green-700">
                                      ✓ Validée
                                    </Badge>
                                  ) : activity.type === 'rejected' ? (
                                    <Badge variant="destructive" className="bg-red-600">
                                      ✗ Rejetée
                                    </Badge>
                                  ) : activity.type === 'pending' ? (
                                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                      ⏳ En attente
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
                                      📝 Déclaration directe
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start justify-between">
                                  <div className="order-1 w-full sm:w-auto text-center sm:text-left">
                                    <h3 className="font-bold text-amber-800 font-serif mb-2">📅 {safeFormatDate(activity.date)}</h3>
                                    {activity.type === 'rejected' && (activity as any).review_notes && (
                                      <div className="mt-2 mb-2 p-2 bg-red-50 border border-red-200 rounded-md text-left inline-block max-w-[250px]">
                                        <p className="text-red-700 text-xs font-semibold mb-1">Motif du rejet:</p>
                                        <p className="text-red-600 text-xs italic break-words">{(activity as any).review_notes}</p>
                                      </div>
                                    )}

                                  </div>

                                  <div className="order-3 sm:order-2 flex flex-col items-center flex-1 w-full mt-2 sm:mt-0 text-center">
                                    <h4 className="font-semibold text-amber-800 font-serif mb-1">🎯 Espèces prélevées : {(() => {
                                      const name = Array.isArray(activity.species) && activity.species.length > 0 ? activity.species[0]?.name : null;
                                      return (!name || name === 'null') ? 'Espèce inconnue' : name;
                                    })()}</h4>
                                    {(activity as any).hunterName || activity.permitNumber ? (
                                      <div className="text-[12px] text-amber-700 mb-3">
                                        {((activity as any).hunterName) && (
                                          <span><strong>Pour:</strong> {(activity as any).hunterName}</span>
                                        )}
                                        {((activity as any).hunterName) && activity.permitNumber ? ' • ' : ''}
                                        {activity.permitNumber && (
                                          <span><strong>Permis:</strong> {activity.permitNumber}</span>
                                        )}
                                      </div>
                                    ) : null}
                                    <div className="flex flex-col items-center">
                                      {activity.photoAvailable && activity.reportId ? (
                                        <img
                                          src={resolveApiUrl(`/api/hunting-activities/${activity.reportId}/photo${token ? `?token=${token}` : ''}`)}
                                          alt={activity.species[0]?.name && activity.species[0].name !== 'null' ? `Photo: ${activity.species[0].name}` : "Photo de l'espèce déclarée"}
                                          className="w-24 h-24 object-cover rounded-md border-2 border-amber-300 bg-white shadow-sm mb-2"
                                        />
                                      ) : null}
                                      <div className="w-full">
                                        {(Array.isArray(activity.species) ? activity.species : []).map((species: HuntingSpecies) => (
                                          <div key={species.id}>
                                            <span className="font-serif text-amber-800">{species.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>

                                  <div className="order-2 sm:order-3 w-full sm:w-auto">
                                    <Button
                                      variant="outline"
                                      className="w-full sm:w-auto bg-amber-200 hover:bg-amber-300 border-amber-400 text-amber-800 font-serif shadow-sm"
                                      onClick={() => setSelectedActivityIndex(startIndex + index)}
                                    >
                                      <Eye className="h-4 w-4 mr-2" />
                                      Voir détails
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {/* Pagination Controls */}
                            {totalItems > pageSize && (
                              <div className="flex items-center justify-end pt-2">
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                                  >
                                    Précédent
                                  </Button>
                                  <span className="px-2 text-sm text-amber-800">
                                    Page {currentPage} / {totalPages}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage >= totalPages}
                                    className="bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200"
                                  >
                                    Suivant
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Message informatif pour chasseurs sans permis - Ne pas afficher si le chasseur a déjà des activités */}
                        {user?.role === 'hunter' && !hasActivePermits && filteredActivities.length === 0 && (
                          <div className="mt-8 bg-gradient-to-br from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-6 shadow-lg relative overflow-hidden">
                            {/* Décoration avec plumes */}
                            <div className="absolute top-2 right-2 opacity-20">
                              <Feather className="h-16 w-16 text-emerald-600 transform rotate-12" />
                            </div>
                            <div className="absolute bottom-2 left-2 opacity-10">
                              <Feather className="h-12 w-12 text-emerald-500 transform -rotate-45" />
                            </div>

                            <div className="relative z-10">
                              <div className="flex items-center mb-4">
                                <div className="bg-emerald-100 p-2 rounded-full mr-3">
                                  <Feather className="h-6 w-6 text-emerald-600" />
                                </div>
                                <h3 className="text-xl font-bold text-emerald-800 font-serif">
                                  📜 Information importante
                                </h3>
                              </div>

                              <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-emerald-100">
                                <p className="text-emerald-700 text-lg font-medium mb-3 leading-relaxed">
                                  Pour accéder pleinement aux fonctionnalités de chasse, vous devez obtenir un permis de chasse valide.
                                </p>

                                <div className="bg-emerald-50 rounded-lg p-4 border-l-4 border-emerald-400">
                                  <p className="text-emerald-800 font-semibold mb-2 flex items-center">
                                    <span className="mr-2">🏛️</span>
                                    Veuillez vous rapprocher du Service des Eaux et Forêts :
                                  </p>
                                  <ul className="text-emerald-700 space-y-2 ml-6">
                                    <li className="flex items-center">
                                      <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3"></span>
                                      <strong>Inspection Régionale</strong> de votre région
                                    </li>
                                    <li className="flex items-center">
                                      <span className="w-2 h-2 bg-emerald-400 rounded-full mr-3"></span>
                                      <strong>Secteur Départemental</strong> de votre département
                                    </li>
                                  </ul>
                                </div>

                                <div className="mt-4 text-center">
                                  <div className="inline-flex items-center px-4 py-2 bg-emerald-100 rounded-full">
                                    <Feather className="h-4 w-4 text-emerald-600 mr-2" />
                                    <span className="text-emerald-700 font-medium text-sm">
                                      Ensemble une gestion durable
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </div>
          ) : (
            <div className="container mx-auto px-4 py-8">
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg shadow-xl p-8 relative" style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 24px, rgba(139, 69, 19, 0.1) 24px, rgba(139, 69, 19, 0.1) 25px)',
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.1), 0 5px 20px rgba(0,0,0,0.2)'
              }}>
                {/* Reliure de la page */}
                <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-red-600 to-red-500 shadow-inner">
                  <div className="flex flex-col justify-evenly h-full">
                    {[...Array(20)].map((_, i) => (
                      <div key={i} className="w-1 h-1 bg-red-800 rounded-full mx-auto"></div>
                    ))}
                  </div>
                </div>

                <div className="ml-8">
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="text-3xl font-bold text-amber-800 font-serif">Déclaration d'Abattage</h1>
                    <Button
                      onClick={() => setShowForm(false)}
                      variant="outline"
                      className="bg-amber-200 hover:bg-amber-300 border-amber-400 text-amber-800 font-serif"
                    >
                      ← Retour au carnet
                    </Button>
                  </div>

                  <form className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-amber-800 font-serif mb-2">Date de chasse</label>
                        <Input type="date" className="bg-amber-50 border-amber-300 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-amber-800 font-serif mb-2">Zone de chasse</label>
                        <Input placeholder="Ex: Zone A1" className="bg-amber-50 border-amber-300 focus:border-amber-500" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-amber-800 font-serif mb-2">Région</label>
                      <Input placeholder="Ex: Région Nord" className="bg-amber-50 border-amber-300 focus:border-amber-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-amber-800 font-serif mb-2">Coordonnées GPS (optionnel)</label>
                      <Input placeholder="Ex: 45.5017, -73.5673" className="bg-amber-50 border-amber-300 focus:border-amber-500" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-amber-800 font-serif mb-2">Notes (optionnel)</label>
                      <Textarea
                        placeholder="Conditions météo, observations, etc."
                        className="bg-amber-50 border-amber-300 focus:border-amber-500"
                        rows={4}
                      />
                    </div>

                    <div className="flex gap-4 pt-6">
                      <Button
                        type="button"
                        onClick={() => setShowForm(false)}
                        variant="outline"
                        className="flex-1 bg-amber-200 hover:bg-amber-300 border-amber-400 text-amber-800 font-serif"
                      >
                        Annuler
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-serif"
                      >
                        Enregistrer la déclaration
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Global Dialog for Activity Details */}
      <Dialog open={selectedActivityIndex !== null} onOpenChange={(open) => !open && setSelectedActivityIndex(null)}>
        {selectedActivityIndex !== null && sortedActivities[selectedActivityIndex] && (
          (() => {
            const activity = sortedActivities[selectedActivityIndex];
            return (
              <DialogContent className="top-auto bottom-0 left-0 right-0 translate-x-0 translate-y-0 w-full max-w-full rounded-t-xl rounded-b-none max-h-[95vh] sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:right-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-2xl sm:rounded-xl sm:max-h-[90vh] overflow-y-auto p-0 border-0 bg-stone-100">
                <div className="bg-amber-100 py-2 px-3 sm:py-3 sm:px-4 border-b border-amber-200 sticky top-0 z-10">
                  <DialogHeader>
                    <DialogTitle className="font-serif text-xl sm:text-2xl text-amber-900 text-center">Détails du prélèvement</DialogTitle>
                    <DialogDescription className="text-center text-amber-700 font-medium pt-0.5 text-xs sm:text-sm">
                      📅 {safeFormatDate(activity.date)}
                    </DialogDescription>
                  </DialogHeader>
                </div>
                
                <div className="pt-2 px-3 pb-24 sm:pt-3 sm:px-4 space-y-3">
                  
                  {/* Section Localisation & Chasseur */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Carte Localisation */}
                    <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-200">
                      <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-1.5 text-sm sm:text-base">
                        <span className="bg-amber-100 p-1 rounded text-xs">📍</span> Localisation
                      </h4>
                      <div className="space-y-1 text-xs sm:text-sm text-stone-700">
                        {activity.zone && !(typeof activity.zone === 'string' && activity.zone.toUpperCase().includes('GPS')) && (
                          <p className="flex justify-between border-b border-stone-50 pb-0.5">
                            <span className="font-medium text-stone-500">Zone</span>
                            <span className="text-right">{activity.zone}</span>
                          </p>
                        )}
                        {activity.arrondissement && (
                          <p className="flex justify-between border-b border-stone-50 pb-0.5">
                            <span className="font-medium text-stone-500">Arrond.</span>
                            <span className="text-right">{activity.arrondissement}</span>
                          </p>
                        )}
                        {activity.departement && (
                          <p className="flex justify-between border-b border-stone-50 pb-0.5">
                            <span className="font-medium text-stone-500">Département</span>
                            <span className="text-right">{activity.departement}</span>
                          </p>
                        )}
                        {activity.region && (
                          <p className="flex justify-between pb-0.5">
                            <span className="font-medium text-stone-500">Région</span>
                            <span className="text-right">{activity.region}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Carte Chasseur & Permis */}
                    {(((activity as any).hunterName) || activity.permitNumber) && (
                      <div className="bg-white p-3 rounded-xl shadow-sm border border-stone-200">
                        <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-1.5 text-sm sm:text-base">
                          <span className="bg-amber-100 p-1 rounded text-xs">👤</span> Acteur
                        </h4>
                        <div className="space-y-1 text-xs sm:text-sm text-stone-700">
                          {((activity as any).hunterName) && (
                            <p className="flex justify-between border-b border-stone-50 pb-0.5">
                              <span className="font-medium text-stone-500">Chasseur</span>
                              <span className="font-semibold text-stone-800 text-right">{(activity as any).hunterName}</span>
                            </p>
                          )}
                          {activity.permitNumber && (
                            <p className="flex justify-between pb-0.5">
                              <span className="font-medium text-stone-500">Permis N°</span>
                              <span className="font-mono text-amber-700 font-bold bg-amber-50 px-1 rounded text-right">{activity.permitNumber}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Carte Espèce & Photo */}
                  <div className="bg-white rounded-xl shadow-sm border border-stone-200 overflow-hidden">
                    <div className="p-3 border-b border-stone-100 bg-stone-50/50">
                      <h4 className="font-semibold text-amber-800 flex justify-between items-center text-sm sm:text-base">
                        <span className="flex items-center gap-1.5">
                          <span className="bg-amber-100 p-1 rounded text-xs">🎯</span>
                          Détails Espèce
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">
                          Qté: {Array.isArray(activity.species) && activity.species.length > 0 && typeof activity.species[0].count === 'number' ? activity.species[0].count : 1}
                        </span>
                      </h4>
                    </div>
                    
                    <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                      <div className="text-center sm:text-left space-y-2">
                        {Array.isArray(activity.species) && activity.species.length > 0 && activity.species[0].name && activity.species[0].name !== 'null' ? (
                          <div className="flex flex-col">
                            <span className="text-xl sm:text-2xl font-serif text-stone-800 font-bold">{activity.species[0].name}</span>
                            {activity.species[0].scientificName && (
                              <span className="text-stone-500 italic mt-0.5 text-xs sm:text-sm">
                                {activity.species[0].scientificName.split(' ').map((part: string, idx: number) => (
                                  <span key={idx}>{part} </span>
                                ))}
                              </span>
                            )}
                            {activity.species[0].sex && activity.species[0].sex !== 'null' && (
                              <div className="mt-2 inline-block">
                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                  activity.species[0].sex === 'Mâle' ? 'bg-blue-100 text-blue-800' :
                                  activity.species[0].sex === 'Femelle' ? 'bg-pink-100 text-pink-800' :
                                  'bg-stone-200 text-stone-700'
                                }`}>
                                  Sexe: {activity.species[0].sex}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xl sm:text-2xl font-serif text-stone-800 font-bold">Espèce inconnue</span>
                        )}
                      </div>

                      <div className="flex justify-center sm:justify-end">
                        {(activity.photoAvailable && activity.reportId) ? (
                          <div className="relative group rounded-xl overflow-hidden shadow-md border border-stone-900 w-full sm:w-auto max-w-[12rem]">
                            <Dialog>
                              <DialogTrigger asChild>
                                <div className="relative cursor-zoom-in">
                                  <img
                                    src={resolveApiUrl(`/api/hunting-activities/${activity.reportId}/photo${token ? `?token=${token}` : ''}`)}
                                    alt={activity.species[0]?.name && activity.species[0].name !== 'null' ? `Photo: ${activity.species[0].name}` : "Photo de l'espèce déclarée"}
                                    className="w-full h-36 sm:h-44 object-cover transition-transform duration-300 group-hover:scale-105"
                                  />
                                  <div className="absolute bottom-0 left-0 right-0 bg-white/85 p-1 border-t border-stone-200">
                                    <p className="text-stone-900 text-[10px] sm:text-xs font-bold text-center">
                                      Heure: {safeFormatDate(activity.date, 'HH:mm')}
                                    </p>
                                  </div>
                                </div>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl p-1 bg-transparent border-none shadow-none transition-all duration-300 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95">
                                <DialogTitle className="sr-only">Photo du prélèvement</DialogTitle>
                                <DialogDescription className="sr-only">Vue agrandie de la photo du prélèvement</DialogDescription>
                                <img
                                  src={resolveApiUrl(`/api/hunting-activities/${activity.reportId}/photo${token ? `?token=${token}` : ''}`)}
                                  alt={activity.species[0]?.name && activity.species[0].name !== 'null' ? `Photo: ${activity.species[0].name}` : "Photo de l'espèce déclarée"}
                                  className="w-full h-auto max-h-[85vh] object-contain rounded-xl bg-black/50 backdrop-blur-sm"
                                />
                              </DialogContent>
                            </Dialog>
                          </div>
                        ) : (
                          <div className="w-full h-24 sm:w-36 sm:h-36 bg-stone-100 rounded-xl flex items-center justify-center border border-dashed border-stone-300 text-stone-400 text-xs">
                            Aucune photo
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Notes section if present */}
                  {activity.notes && (
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-900 shadow-sm text-xs sm:text-sm">
                      <h4 className="font-semibold mb-1 flex items-center gap-1.5 text-xs sm:text-sm">
                        <span className="bg-amber-200 p-0.5 rounded">📝</span> Notes
                      </h4>
                      <p className="italic text-amber-800">{activity.notes}</p>
                    </div>
                  )}
                  
                </div>

                <div className="bg-stone-200/50 p-3 pb-safe sm:pb-3 border-t border-stone-200 flex flex-col sm:flex-row gap-2 justify-between items-center sticky bottom-0 z-10">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-amber-300 text-amber-800 bg-white text-xs sm:text-sm h-9"
                    onClick={() => setSelectedActivityIndex(Math.max(0, selectedActivityIndex - 1))}
                    disabled={selectedActivityIndex === 0}
                  >
                    ← Précédent
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto border-amber-300 text-amber-800 bg-white text-xs sm:text-sm h-9"
                    onClick={() => setSelectedActivityIndex(Math.min(sortedActivities.length - 1, selectedActivityIndex + 1))}
                    disabled={selectedActivityIndex === sortedActivities.length - 1}
                  >
                    Suivant →
                  </Button>
                  
                  <Button
                    variant="default"
                    className="w-full sm:w-auto bg-stone-700 hover:bg-stone-800 text-white text-xs sm:text-sm h-9"
                    onClick={() => setSelectedActivityIndex(null)}
                  >
                    Fermer
                  </Button>
                </div>
              </DialogContent>
            );
          })()
        )}
      </Dialog>
    </div>
  );
}
