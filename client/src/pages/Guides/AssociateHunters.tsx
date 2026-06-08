import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequestBlob } from "@/lib/api";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import AssociateHunters from "@/components/guides/AssociateHunters";
import PermitCard from "@/components/permits/PermitCard";
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
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BadgeCheck, Eye, FileText, Loader2, Phone, XCircle, Plus, Users, Trash2 } from "lucide-react";

// Types pour les données
interface Hunter {
  id: number;
  lastName: string;
  firstName: string;
  phone: string;
  idNumber: string;
  region: string | null;
  zone: string | null; // legacy
  departement?: string | null; // canonical key returned by API
  nationality?: string | null;
  photo?: string | null;
}

interface GuideHunter {
  id: number;
  guideId: number;
  hunterId: number;
  associatedAt: string;
  hunter?: Hunter;
}

interface GuideMeInfo {
  id: number;
  userId: number;
  lastName: string;
  firstName: string;
  phone?: string | null;
}

// Utilitaire: initiales pour l'avatar
const getInitials = (firstName?: string, lastName?: string) => {
  const f = (firstName || '').trim();
  const l = (lastName || '').trim();
  const fi = f ? f[0] : '';
  const li = l ? l[0] : '';
  return (fi + li).toUpperCase() || 'CH';
};

export default function AssociateHuntersPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // Vérifier si l'utilisateur est un guide de chasse
  const isHuntingGuide = user?.role === "hunting-guide";

  // Récupérer les informations du guide connecté
  const { data: guideInfo, isLoading: isLoadingGuide } = useQuery<GuideMeInfo>({
    queryKey: ["/api/guides", user?.id],
    queryFn: () => apiRequest<GuideMeInfo>({ url: `/api/guides/${user?.id}`, method: "GET" }),
    enabled: !!user?.id && isHuntingGuide,
  });

  

  

  // Récupérer les chasseurs déjà associés au guide
  const { data: associatedHunters = [], isLoading: isLoadingAssociations } = useQuery<GuideHunter[]>({
    queryKey: ["/api/guides", guideInfo?.id, "hunters"],
    queryFn: () => apiRequest<GuideHunter[]>({ url: `/api/guides/${guideInfo?.id}/hunters`, method: "GET" }),
    enabled: !!guideInfo && !!(guideInfo as GuideMeInfo).id,
  });


  // Mutation pour dissocier un chasseur
  const removeHunterAssociationMutation = useMutation({
    mutationFn: (hunterId: number) =>
      apiRequest({
        url: `/api/guides/${guideInfo?.id}/hunters/${hunterId}`,
        method: "DELETE",
      }),
    onSuccess: () => {
      toast({
        title: "Chasseur dissocié",
        description: "Le chasseur a été retiré de votre liste.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/guides", guideInfo?.id, "hunters"] });
    },
    onError: (error) => {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors du retrait du chasseur.",
        variant: "destructive",
      });
      console.error("Erreur lors du retrait du chasseur:", error);
    },
  });

  // Gestionnaire pour la dissociation d'un chasseur
  const handleRemoveHunter = (hunterId: number) => {
    if (confirm("Êtes-vous sûr de vouloir retirer ce chasseur de votre liste ?")) {
      removeHunterAssociationMutation.mutate(hunterId);
    }
  };

  if (!isHuntingGuide) {
    return (
      <div className="container mx-auto px-4 pt-24 pb-20">
        <Card>
          <CardHeader>
            <CardTitle>Accès non autorisé</CardTitle>
            <CardDescription>
              Cette page est réservée aux guides de chasse.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>Vous devez être connecté en tant que guide de chasse pour accéder à cette fonctionnalité.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoadingGuide || isLoadingAssociations) {
    return (
      <div className="container mx-auto pt-24 pb-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="w-full sm:container sm:mx-auto px-0 sm:px-4 mt-[-1.5rem] sm:mt-0 pb-20 sm:pb-24">
      {/* Barre d'action sticky (remplace l'ancien titre) */}
      <div className="px-4 py-3 sm:py-4 sticky top-0 z-40 bg-[#f8fafc] border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm mb-4">
        <p className="text-xs sm:text-sm text-slate-600 max-w-md leading-relaxed">
          En tant que guide de chasse, vous pouvez associer des chasseurs à votre compte pour faciliter le suivi de leurs activités.
        </p>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          {/* Badge texte inactif (Ancien bouton) */}
          <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-2 rounded-md text-sm font-medium shadow-sm cursor-default">
            <Users className="h-4 w-4 text-emerald-600" />
            Associer des chasseurs
          </div>
          
          {/* Nouveau bouton Plus actif */}
          {guideInfo?.id ? (
            <AssociateHunters
              guideId={String(guideInfo.id)}
              onAssociationComplete={() => {
                queryClient.invalidateQueries({ queryKey: ["/api/guides", guideInfo?.id, "hunters"] });
              }}
              trigger={
                <Button size="icon" className="h-10 w-10 rounded-full bg-emerald-600 hover:bg-emerald-700 shadow-md transition-transform hover:scale-105">
                  <Plus className="h-5 w-5 text-white" />
                </Button>
              }
            />
          ) : (
            <Button size="icon" disabled className="h-10 w-10 rounded-full bg-slate-200">
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            </Button>
          )}
        </div>
      </div>

      <Card className="rounded-none sm:rounded-xl border-x-0 border-t-0 sm:border-x sm:border-t shadow-none sm:shadow-sm m-0">
        <CardContent className="p-0 sm:p-4 md:p-6">
          {associatedHunters && associatedHunters.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {associatedHunters.map((assoc: GuideHunter) => (
                <HunterAssociationRow
                  key={assoc.id}
                  assoc={assoc}
                  onRemove={() => handleRemoveHunter(assoc.hunterId)}
                  removing={removeHunterAssociationMutation.isPending}
                />
              ))}
            </div>
          ) : (
            <div className="py-4 sm:py-8 text-center">
              <p className="text-muted-foreground text-xs sm:text-sm">
                Vous n'avez pas encore de chasseurs associés à votre compte.
              </p>
            </div>
          )}
        </CardContent>
        {/* Bouton déplacé dans l'entête */}
      </Card>

    </div>
  );
}

// Sous-composant pour une ligne de chasseur avec état des permis et coloration
function HunterAssociationRow({
  assoc,
  onRemove,
  removing
}: {
  assoc: GuideHunter;
  onRemove: () => void;
  removing: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [openTaxes, setOpenTaxes] = useState(false);
  const [openContactOptions, setOpenContactOptions] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<any>(null);
  const [remainingBySpecies, setRemainingBySpecies] = useState<Record<string, number>>({});
  
  // État pour la photo du chasseur
  const [photoUrl, setPhotoUrl] = useState<string>(assoc.hunter?.photo || "");

  // Fetch de la photo du chasseur via attachments
  const hId = assoc.hunterId || assoc.hunter?.id;
  useEffect(() => {
    if (assoc.hunter?.photo && assoc.hunter.photo.startsWith('http')) {
      setPhotoUrl(assoc.hunter.photo);
      return;
    }
    
    let prevUrl: string | null = null;
    if (hId) {
      (async () => {
        try {
          const res = await apiRequestBlob(`/attachments/${hId}/hunterPhoto?inline=1`, 'GET');
          if (res.ok && res.blob && res.blob.size > 0) {
            const url = URL.createObjectURL(res.blob);
            prevUrl = url;
            setPhotoUrl(url);
          }
        } catch (e) {
          // Silencieux - pas de photo disponible
        }
      })();
    }
    return () => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [hId, assoc.hunter?.photo]);

  const hunterId = assoc.hunterId;

  const { data: permits = [], isLoading: loadingPermits } = useQuery<any[]>({
    queryKey: ["/api/permits/hunter", hunterId],
    enabled: !!hunterId,
    queryFn: async () => {
      try {
        // Endpoint existant côté client hooks: GET /permits/hunter/:id
        const res = await apiRequest<any>({ url: `/api/permits/hunter/${hunterId}`, method: "GET" });
        return Array.isArray(res) ? res : (res?.data ?? []);
      } catch (e) {
        console.error("Erreur chargement permis du chasseur", hunterId, e);
        toast({ title: "Erreur", description: "Impossible de charger les permis de ce chasseur.", variant: "destructive" });
        return [] as any[];
      }
    }
  });

  // Taxes d'abattage pour ce chasseur
  interface Tax {
    id: number;
    taxNumber: string;
    hunterId: number;
    permitId?: number | null;
    issueDate?: string | null;
    createdAt?: string | null;
    animalType?: string | null;
    quantity?: number | null;
    location?: string | null;
    amount?: string | number | null;
  }

  const { data: taxes = [], isLoading: loadingTaxes } = useQuery<Tax[]>({
    queryKey: ["/api/taxes/hunter", hunterId],
    enabled: !!hunterId,
    queryFn: async () => {
      try {
        const res = await apiRequest<any>({ url: `/api/taxes/hunter/${hunterId}`, method: "GET" });
        return Array.isArray(res) ? res : (res?.data ?? []);
      } catch (e) {
        console.error("Erreur chargement taxes du chasseur", hunterId, e);
        toast({ title: "Erreur", description: "Impossible de charger les taxes d'abattage de ce chasseur.", variant: "destructive" });
        return [] as Tax[];
      }
    }
  });

  // Charger les activités unifiées du chasseur quand le dialog Taxes est ouvert
  const { data: hunterActivities = [] } = useQuery<any[]>({
    queryKey: ["/api/hunting-activities/hunter", hunterId, openTaxes],
    enabled: !!hunterId && openTaxes === true,
    queryFn: async () => {
      try {
        const res = await apiRequest<any>({ url: `/api/hunting-activities/hunter/${hunterId}`, method: "GET" });
        return Array.isArray(res) ? res : (res?.data ?? []);
      } catch (e) {
        console.error("Erreur chargement activités du chasseur", hunterId, e);
        return [] as any[];
      }
    }
  });

  // Helpers et calcul dynamique du restant par espèce
  const normalize = (s?: string | null) => (s || "").toString().trim().toLowerCase();
  const computeRemaining = () => {
    try {
      const usedBySpecies: Record<string, number> = {};
      (Array.isArray(hunterActivities) ? hunterActivities : []).forEach((a: any) => {
        const key = normalize(a?.species_name);
        const qte = Number(a?.quantity || 0);
        if (!key) return;
        usedBySpecies[key] = (usedBySpecies[key] || 0) + qte;
      });

      const remaining: Record<string, number> = {};
      (Array.isArray(taxes) ? taxes : []).forEach((t: any) => {
        const key = normalize(t?.animalType);
        const bought = Number(t?.quantity || 0);
        const used = usedBySpecies[key] || 0;
        remaining[key] = Math.max(0, bought - used);
      });

      setRemainingBySpecies(remaining);
    } catch (e) {
      console.warn("Impossible de calculer le restant des taxes:", e);
      setRemainingBySpecies({});
    }
  };

  useEffect(() => {
    if (openTaxes) {
      computeRemaining();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTaxes, JSON.stringify(taxes), JSON.stringify(hunterActivities)]);

  const activePermit = Array.isArray(permits) ? permits.find((p) => p.status === "active") : undefined;
  const hasPermits = Array.isArray(permits) && permits.length > 0;
  const hasActive = !!activePermit;

  const rowClass = hasActive
    ? "bg-green-50 hover:bg-green-100"
    : hasPermits
      ? "bg-red-50 hover:bg-red-100"
      : "bg-red-50 hover:bg-red-100";

  const handleViewPermit = (permit: any) => {
    setSelectedPermit(permit);
    setOpen(true);
  };

  return (
    <>
      <div 
        className="relative py-3 px-3 sm:px-4 transition-colors hover:bg-slate-50 cursor-pointer" 
        onClick={() => setOpenContactOptions(true)}
      >
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold shrink-0 overflow-hidden">
            {photoUrl ? (
              <img src={photoUrl} alt="Photo du chasseur" className="w-full h-full object-cover" />
            ) : (
              getInitials(assoc.hunter?.firstName, assoc.hunter?.lastName)
            )}
          </div>
          {/* Infos principales */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-base truncate">
                {assoc.hunter?.firstName} {assoc.hunter?.lastName}
              </span>
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">
              CNI: {assoc.hunter?.idNumber || '—'}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {loadingPermits ? (
                <span className="text-[10px] text-slate-400">Chargement...</span>
              ) : hasActive ? (
                <span className="flex items-center text-[10px] text-emerald-600 font-medium"><BadgeCheck className="w-3 h-3 mr-0.5" /> Permis actif</span>
              ) : hasPermits ? (
                <span className="flex items-center text-[10px] text-amber-600 font-medium"><XCircle className="w-3 h-3 mr-0.5" /> Permis expiré</span>
              ) : (
                <span className="text-[10px] text-slate-400">Aucun permis</span>
              )}
              {taxes.length > 0 && (
                <span className="flex items-center text-[10px] text-blue-600 font-medium ml-1"><FileText className="w-3 h-3 mr-0.5" /> {taxes.length} taxe(s)</span>
              )}
            </div>
          </div>
          {/* Retirer button */}
          <div className="shrink-0 pl-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              disabled={removing}
              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-10 px-3 rounded-xl transition-colors"
              title="Retirer le chasseur"
            >
              {removing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <div className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline text-sm font-medium">Retirer</span>
                </div>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog Options de contact */}
      <Dialog open={openContactOptions} onOpenChange={setOpenContactOptions}>
        <DialogContent className="max-w-sm w-[95vw] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-slate-50 p-5 flex flex-col items-center border-b border-slate-100">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-700 text-xl font-bold mb-3 overflow-hidden">
              {photoUrl ? (
                <img src={photoUrl} alt="Photo du chasseur" className="w-full h-full object-cover" />
              ) : (
                getInitials(assoc.hunter?.firstName, assoc.hunter?.lastName)
              )}
            </div>
            <DialogTitle className="text-lg font-bold text-slate-800 text-center">
              {assoc.hunter?.firstName} {assoc.hunter?.lastName}
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 text-center mt-1">
              CNI: {assoc.hunter?.idNumber || '—'}
            </DialogDescription>
          </div>
          
          <div className="p-4 flex flex-col gap-2">
            {hasPermits ? (
              <Button 
                variant="outline" 
                className="w-full justify-start h-12 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 border-emerald-100 rounded-xl font-medium"
                onClick={() => { setOpenContactOptions(false); handleViewPermit(activePermit || permits[0]); }}
              >
                <Eye className="w-5 h-5 mr-3 text-emerald-600" />
                Voir le Quitus du permis
              </Button>
            ) : (
              <div className="px-4 py-3 text-sm text-slate-500 text-center bg-slate-50 rounded-xl border border-slate-100 mb-2">
                Ce chasseur n'a pas de permis enregistré.
              </div>
            )}
            
            {taxes.length > 0 && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-12 text-blue-700 hover:bg-blue-50 hover:text-blue-800 border-blue-100 rounded-xl font-medium"
                onClick={() => { setOpenContactOptions(false); setOpenTaxes(true); }}
              >
                <FileText className="w-5 h-5 mr-3 text-blue-600" />
                Voir les Taxes d'abattage
              </Button>
            )}

            {assoc.hunter?.phone && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-12 text-slate-700 hover:bg-slate-50 border-slate-200 rounded-xl font-medium mt-2"
                onClick={() => {
                  if (assoc.hunter?.phone) {
                    window.location.href = `tel:${assoc.hunter.phone}`;
                  }
                }}
              >
                <Phone className="w-5 h-5 mr-3 text-slate-500" />
                Appeler le chasseur
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Quitus */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-auto p-4 sm:p-6">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-base sm:text-lg">Quitus du Permis</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Visualisation du permis du chasseur {assoc.hunter?.firstName} {assoc.hunter?.lastName}
            </DialogDescription>
          </DialogHeader>
          {selectedPermit ? (
            <div className="max-h-[60vh] sm:max-h-[70vh] overflow-auto">
              {/* PermitCard attend des types de @shared/schema; on caste pour l'affichage */}
              <PermitCard permit={selectedPermit as any} hunter={assoc.hunter as any} />
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4 sm:py-8 text-xs sm:text-sm">Aucun permis à afficher</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Taxes d'abattage */}
      <Dialog open={openTaxes} onOpenChange={setOpenTaxes}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">Taxes d'abattage</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Déclarations enregistrées pour {assoc.hunter?.firstName} {assoc.hunter?.lastName}
            </DialogDescription>
          </DialogHeader>
          {taxes.length > 0 ? (
            <div className="max-h-[60vh] overflow-auto">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs sm:text-sm">N°</TableHead>
                    <TableHead className="text-xs sm:text-sm">Date</TableHead>
                    <TableHead className="text-xs sm:text-sm">Espèce</TableHead>
                    <TableHead className="text-xs sm:text-sm">Qté</TableHead>
                    <TableHead className="text-xs sm:text-sm hidden sm:table-cell">Reste</TableHead>
                    <TableHead className="text-xs sm:text-sm">Montant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {taxes.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs sm:text-sm">{t.taxNumber}</TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{t.createdAt || t.issueDate || ""}</TableCell>
                      <TableCell className="text-xs sm:text-sm">{t.animalType || "-"}</TableCell>
                      <TableCell className="text-xs sm:text-sm font-semibold bg-green-50 text-green-800">{t.quantity ?? "-"}</TableCell>
                      <TableCell className="text-xs sm:text-sm hidden sm:table-cell font-semibold bg-red-50 text-red-800">
                        {(() => {
                          const key = normalize(t?.animalType);
                          const value = remainingBySpecies[key];
                          return (value === undefined || Number.isNaN(value)) ? "-" : String(value);
                        })()}
                      </TableCell>
                      <TableCell className="text-xs sm:text-sm whitespace-nowrap">{typeof t.amount === 'number' ? t.amount.toLocaleString() : (t.amount || '-') } FCFA</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4 sm:py-8 text-xs sm:text-sm">Aucune taxe à afficher</div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
