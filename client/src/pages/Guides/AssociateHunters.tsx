import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
import { BadgeCheck, Eye, FileText, Loader2, User as UserIcon, XCircle } from "lucide-react";

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
      <div className="container mx-auto py-8">
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
      <div className="container mx-auto py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
      <Card>
        <CardHeader className="p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <CardTitle className="text-lg sm:text-xl md:text-2xl">Gestion des Chasseurs Associés</CardTitle>
            {guideInfo?.id ? (
              <AssociateHunters
                guideId={String(guideInfo.id)}
                onAssociationComplete={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/guides", guideInfo?.id, "hunters"] });
                }}
              />
            ) : (
              <Button disabled>Chargement du guide…</Button>
            )}
          </div>
          <CardDescription className="text-xs sm:text-sm">
            En tant que guide de chasse, vous pouvez associer des chasseurs à votre compte pour faciliter le suivi de leurs activités.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 md:p-6">
          {associatedHunters && associatedHunters.length > 0 ? (
            <>
              {(() => {
                const totalPages = Math.max(1, Math.ceil(associatedHunters.length / pageSize));
                const currentPage = Math.min(page, totalPages);
                const start = (currentPage - 1) * pageSize;
                const end = start + pageSize;
                const slice = associatedHunters.slice(start, end);
                return (
                  <>
                    <div className="divide-y divide-slate-200">
                      {slice.map((assoc: GuideHunter) => (
                        <HunterAssociationRow
                          key={assoc.id}
                          assoc={assoc}
                          onRemove={() => handleRemoveHunter(assoc.hunterId)}
                          removing={removeHunterAssociationMutation.isPending}
                        />
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-slate-500">
                        Page {currentPage} / {totalPages} • {associatedHunters.length} chasseur(s)
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          className="text-xs"
                        >
                          Précédent
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((p) => p + 1)}
                          className="text-xs"
                        >
                          Suivant
                        </Button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </>
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
  removing,
}: {
  assoc: GuideHunter;
  onRemove: () => void;
  removing: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<any | null>(null);
  const [openTaxes, setOpenTaxes] = useState(false);
  const [remainingBySpecies, setRemainingBySpecies] = useState<Record<string, number>>({});

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
      <div className={`py-3 px-1 sm:px-2 ${rowClass}`}>
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-semibold">
            {getInitials(assoc.hunter?.firstName, assoc.hunter?.lastName)}
          </div>
          {/* Infos principales */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-800 text-sm sm:text-base truncate">
                {assoc.hunter?.firstName} {assoc.hunter?.lastName}
              </span>
              {assoc.hunter?.nationality ? (
                <Badge variant="outline" className="text-[10px] sm:text-xs">{assoc.hunter.nationality}</Badge>
              ) : null}
            </div>
            <div className="text-[11px] sm:text-xs text-slate-500 truncate">
              CNI: {assoc.hunter?.idNumber || '—'}{assoc.hunter?.phone ? ` • ${assoc.hunter.phone}` : ''}
            </div>
            {/* Statut permis + taxes */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {loadingPermits ? (
                <span className="text-[11px] text-muted-foreground">Chargement permis…</span>
              ) : hasActive ? (
                <>
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-[10px] sm:text-xs whitespace-nowrap">
                    <BadgeCheck className="h-3 w-3 mr-1" /> Actif
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => handleViewPermit(activePermit!)} className="text-[11px] h-7 px-2">
                    <Eye className="h-3 w-3 mr-1" /> Quitus
                  </Button>
                </>
              ) : hasPermits ? (
                <>
                  <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-[10px] sm:text-xs whitespace-nowrap">
                    <XCircle className="h-3 w-3 mr-1" /> Non actif
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => handleViewPermit(permits[0])} className="text-[11px] h-7 px-2">
                    <Eye className="h-3 w-3 mr-1" /> Voir
                  </Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Aucun permis</span>
              )}

              {loadingTaxes ? (
                <span className="text-[11px] text-muted-foreground">Chargement taxes…</span>
              ) : taxes.length > 0 ? (
                <>
                  <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 text-[10px] sm:text-xs">{taxes.length} taxe(s)</Badge>
                  <Button size="sm" variant="outline" onClick={() => setOpenTaxes(true)} className="text-[11px] h-7 px-2">
                    <FileText className="h-3 w-3 mr-1" /> Voir
                  </Button>
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Aucune taxe</span>
              )}
            </div>
          </div>
          {/* Actions droites */}
          <div className="flex items-center gap-2">
            {assoc.hunter?.phone ? (
              <a
                href={`tel:${assoc.hunter.phone}`}
                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-amber-200 bg-amber-100 hover:bg-amber-100/80"
                title="Appeler le chasseur"
              >
                <UserIcon className="h-4 w-4 text-amber-600" />
              </a>
            ) : (
              <div className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-amber-200 bg-amber-100" title="Coordonnées indisponibles">
                <UserIcon className="h-4 w-4 text-amber-600" />
              </div>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={onRemove}
              disabled={removing}
              className="text-[11px] h-8 px-2 sm:px-3"
            >
              {removing ? (
                <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <span>Retirer</span>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog Quitus */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
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
