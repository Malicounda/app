import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, MapPin, Target, Trash2 } from "lucide-react";
import { useState } from "react";

interface HunterCarnetModalProps {
  hunterId: number;
  hunterName: string;
  open: boolean;
  onClose: () => void;
}

export default function HunterCarnetModal({ hunterId, hunterName, open, onClose }: HunterCarnetModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [hunterPhotoError, setHunterPhotoError] = useState(false);
  const itemsPerPage = 5;

  // Récupérer les activités de chasse
  const { data: activities, isLoading: activitiesLoading } = useQuery<any[]>({
    queryKey: [`/api/hunting-activities/hunter/${hunterId}`],
    queryFn: () => apiRequest({ url: `/api/hunting-activities/hunter/${hunterId}`, method: "GET" }),
    enabled: open && !!hunterId,
  });

  // Récupérer les infos du chasseur pour connaître sa catégorie
  const { data: hunterInfo } = useQuery<any>({
    queryKey: ["/api/hunters", hunterId],
    queryFn: async () => apiRequest({ url: `/api/hunters/${hunterId}`, method: "GET" }),
    enabled: open && !!hunterId,
    staleTime: 60_000,
  });

  const totalPages = activities ? Math.ceil(activities.length / itemsPerPage) : 0;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedActivities = activities ? activities.slice(startIndex, endIndex) : [];

  // Catégorie du chasseur (normalisée sur les catégories principales)
  const normalizeCategory = (raw?: string | null): string | null => {
    if (!raw) return null;
    const s = String(raw).toLowerCase();
    if (s.includes('touris')) return 'Touriste'; // ex: Touristique
    if (s.includes('résiden') || s.includes('residen')) return 'Résident';
    if (s.includes('coutum')) return 'Coutumier';
    if (s.includes('oisel') || s.includes('oiseau')) return 'Oisellerie';
    if (s.includes('scienti') || s.includes('recherche')) return 'Scientifique';
    if (s.includes('commer') || s.includes('capture')) return 'Capture commerciale';
    // Par défaut, capitaliser la première lettre
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };

  const computedPermitCategory: string | null = normalizeCategory((hunterInfo as any)?.category ?? null);

  // Nom à afficher: utilise la prop puis retombe sur les champs de hunterInfo
  const displayName = (() => {
    if (hunterName && hunterName.trim()) return hunterName;
    const hi: any = hunterInfo || {};
    const first = hi.firstName || hi.first_name || hi.prenom || "";
    const last = hi.lastName || hi.last_name || hi.nom || "";
    const combined = `${first} ${last}`.trim();
    return combined || hi.name || "";
  })();

  // Mutation pour supprimer une activité
  const deleteActivityMutation = useMutation({
    mutationFn: async (activity: any) => {
      // Supprimer selon le type d'activité
      if (activity.source_type === 'direct_declaration' || activity.source_type === 'guide_declaration') {
        // Supprimer de declaration_especes
        return apiRequest({
          url: `/api/declaration-especes/${activity.id}`,
          method: "DELETE",
        });
      } else {
        // Supprimer de hunting_activities
        return apiRequest({
          url: `/api/hunting-activities/${activity.id}`,
          method: "DELETE",
        });
      }
    },
    onSuccess: () => {
      toast({
        title: "Activité supprimée",
        description: "L'activité a été supprimée avec succès.",
      });
      // Rafraîchir la liste
      queryClient.invalidateQueries({ queryKey: [`/api/hunting-activities/hunter/${hunterId}`] });
    },
    onError: (error: any) => {
      toast({
        title: "Erreur",
        description: error?.response?.data?.message || "Impossible de supprimer l'activité.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteClick = (activity: any) => {
    // Suppression immédiate, sans confirmation
    deleteActivityMutation.mutate(activity);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-[596px] h-[85vh] overflow-hidden p-0">
        <DialogTitle className="sr-only">Carnet de chasse</DialogTitle>
        {/* En-tête du carnet - Style couverture */}
        <div className="bg-gradient-to-br from-emerald-500 via-emerald-400 to-emerald-600 text-white p-8 relative overflow-hidden">

          {/* Contenu de la couverture */}
          <div className="relative z-10 text-center">
            <h1 className="text-4xl font-bold mb-6 tracking-wider">CARNET DE CHASSE</h1>

            {/* Photo du chasseur (fallback icône) */}
            <div className="flex justify-center mb-6">
              <div className="w-32 h-32 rounded-full bg-white/90 flex items-center justify-center shadow-lg overflow-hidden">
                {!hunterPhotoError ? (
                  <img
                    src={`/api/attachments/${hunterId}/hunter_photo`}
                    alt={`Photo du chasseur ${hunterName}`}
                    className="w-32 h-32 object-cover"
                    onError={() => setHunterPhotoError(true)}
                  />
                ) : (
                  <svg className="w-20 h-20 text-green-800" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
                  </svg>
                )}
              </div>
            </div>

            <div className="mt-2 flex items-baseline justify-center gap-2">
              <span className="text-xl">Chasseur:</span>
              <span className="text-2xl md:text-3xl font-bold">{displayName || "—"}</span>
            </div>
          </div>

          {/* Catégorie du permis (badge bas-droite) */}
          {computedPermitCategory && (
            <div className="absolute bottom-3 right-3 z-10">
              <span className="inline-block px-3 py-1 rounded-md border border-red-200 bg-red-50 text-red-700 text-sm shadow-sm">
                {computedPermitCategory}
              </span>
            </div>
          )}
        </div>

        {/* Section des activités de chasse */}
        <div className={`relative z-0 p-6 pr-2 overflow-y-auto h-[calc(85vh-300px)] bg-amber-50 ${activities && activities.length > 0 && totalPages > 1 ? 'pb-16' : 'pb-6'}`}>
          {/* En-tête avec titre et pagination */}
          <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-green-600">
            <h2 className="text-2xl font-bold text-green-800 flex items-center gap-2">
              <FileText className="h-6 w-6" />
              Activités de Chasse
              {Array.isArray(activities) && (
                <span className="ml-2 text-sm font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                  {activities.length} au total
                </span>
              )}
            </h2>

            {/* Pagination compacte */}
            {activities && activities.length > 0 && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">
                  {currentPage}/{totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="h-7 w-7 p-0"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {activitiesLoading ? (
            <div className="text-center py-12 text-gray-500">
              <div className="animate-spin mx-auto mb-3 h-10 w-10 border-4 border-green-600 border-t-transparent rounded-full"></div>
              <p className="text-lg">Chargement des activités...</p>
            </div>
          ) : !activities || activities.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-white rounded-lg border-2 border-dashed border-gray-300">
              <Calendar className="h-20 w-20 mx-auto mb-4 text-gray-300" />
              <p className="text-xl font-medium text-gray-700">Aucune activité de chasse enregistrée</p>
              <p className="text-sm mt-2 text-gray-500">Ce chasseur n'a pas encore d'activités dans son carnet</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {paginatedActivities.map((activity: any, index: number) => (
                <div key={activity.id || index} className="bg-white border-l-4 border-green-600 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
                  {/* En-tête de l'activité */}
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-gray-200">
                    <div>
                      <h3 className="text-lg font-bold text-gray-800">{activity.species_name || "Espèce non définie"}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-gray-600">
                          Quantité prélevée: <span className="font-semibold text-green-700">{activity.quantity || 0}</span>
                        </p>
                        {activity.guide_name ? (
                          <span className="inline-block max-w-[220px] truncate px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800" title={`Déclaré par Guide: ${activity.guide_name}`}>
                            Déclaré par Guide: {activity.guide_name}
                          </span>
                        ) : activity.activity_number ? (
                          <span className="inline-block px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 whitespace-nowrap">
                            N° Activité: {activity.activity_number}
                          </span>
                        ) : null}
                      </div>
                      {activity.sex && (
                        <p className="text-xs text-gray-500 mt-1">Sexe: {activity.sex}</p>
                      )}
                    </div>
                    <div className="text-right flex items-start gap-3 flex-wrap justify-end">
                      <div className="flex items-center gap-1 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          {activity.hunting_date ? format(new Date(activity.hunting_date), "dd MMM yyyy", { locale: fr }) : "Date non définie"}
                        </span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {activity.status && (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs ${
                            activity.status === 'approved' ? 'bg-green-100 text-green-800' :
                            activity.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {activity.status === 'approved' ? 'Validé' : activity.status === 'pending' ? 'En attente' : activity.status}
                          </span>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleDeleteClick(activity)}
                          disabled={deleteActivityMutation.isPending}
                          title="Supprimer cette activité"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Détails de l'activité - Grille optimisée */}
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    {/* Colonne gauche */}
                    <div className="space-y-3">
                      {(activity.region_name || activity.departement_name || activity.location || (activity.lat && activity.lon)) && (
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs text-gray-500 font-medium">Localisation</p>
                            {activity.region_name || activity.departement_name ? (
                              <p className="text-sm text-gray-700">
                                {(activity.region_name || '')}{activity.departement_name ? ` / ${activity.departement_name}` : ''}
                              </p>
                            ) : (activity.lat && activity.lon) ? (
                              <p className="text-sm text-gray-700 font-mono">
                                GPS: {activity.lat.toFixed(6)}, {activity.lon.toFixed(6)}
                              </p>
                            ) : (
                              <p className="text-sm text-gray-700">{activity.location}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {activity.scientific_name && (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Nom scientifique</p>
                          <p className="text-sm text-gray-700 bg-gray-50 px-2 py-1 rounded italic">{activity.scientific_name}</p>
                        </div>
                      )}

                      {(activity.lat && activity.lon) ? (
                        <div>
                          <p className="text-xs text-gray-500 font-medium mb-1">Coordonnées</p>
                          <p className="text-sm text-gray-700 bg-amber-50 px-2 py-1 rounded font-mono text-xs">
                            {activity.lat.toFixed(6)}, {activity.lon.toFixed(6)}
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Colonne droite */}
                    {activity.permit_number && (
                      <div className="flex items-start gap-2">
                        <Target className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-gray-500 font-medium">N° Permis</p>
                          <p className="text-sm text-gray-700 mb-2">{activity.permit_number}</p>

                          {/* Photo miniature sous le numéro de permis */}
                          {activity.photo_data && (
                            <div
                              className="relative w-32 rounded border border-green-200 overflow-hidden cursor-pointer hover:border-green-400 transition-colors shadow-sm bg-white"
                              onClick={() => setSelectedPhoto(`data:${activity.photo_mime || 'image/jpeg'};base64,${activity.photo_data}`)}
                            >
                              <img
                                src={`data:${activity.photo_mime || 'image/jpeg'};base64,${activity.photo_data}`}
                                alt={`Photo de ${activity.species_name}`}
                                className="w-full h-20 object-contain hover:opacity-90 transition-opacity"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/20 transition-colors">
                                <ImageIcon className="h-5 w-5 text-white opacity-0 hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>


                </div>
              ))}
              </div>
            </>
          )}
        </div>
      </DialogContent>

      {/* Modal d'agrandissement de photo */}
      {selectedPhoto && (
        <Dialog open={!!selectedPhoto} onOpenChange={() => setSelectedPhoto(null)}>
          <DialogContent hideClose className="p-2 sm:p-3 md:p-4 w-[80vw] sm:w-[75vw] md:w-[60vw] lg:w-[45vw] xl:w-[35vw] h-[70vh] max-w-none">
            <DialogTitle className="sr-only">Photo agrandie</DialogTitle>
            <div className="relative flex items-center justify-center w-full h-full bg-white rounded-lg border shadow overflow-hidden">
              <img src={selectedPhoto} alt="Photo agrandie" className="block mx-auto w-full h-full object-contain object-center" />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => setSelectedPhoto(null)}
              >
                Fermer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Suppression directe: plus de boîte de confirmation */}
    </Dialog>
  );
}
