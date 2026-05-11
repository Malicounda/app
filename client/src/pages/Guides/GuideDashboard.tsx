import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { LinkIcon, Search, User, Users, Eye, BadgeCheck, XCircle, Target, Crosshair } from "lucide-react";
import PermitCard from "@/components/permits/PermitCard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import AssociateHunters from "@/components/guides/AssociateHunters";
import { apiRequest } from "@/lib/queryClient";

// Types basés sur l'API réelle
type Hunter = {
  id: number;
  firstName: string;
  lastName: string;
  region: string | null;
  departement?: string | null;
};

type GuideHunter = {
  id: number; // association id
  guideId: number;
  hunterId: number;
  associatedAt: string;
  hunter?: Hunter;
};

type Tax = {
  id: number;
  taxNumber: string;
  hunterId: number;
  permitId?: number | null;
  issueDate?: string | null;
  animalType: string;
  quantity: number;
  location: string;
  amount: string | number;
  createdAt?: string;
  // issuer/hunter fields may be present per backend selection, but we only need basics here
  hunterFirstName?: string | null;
  hunterLastName?: string | null;
};

// Suppression du type Alert car l'onglet Alertes est retiré

export default function GuideDashboard() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();
  const [openPermit, setOpenPermit] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<any | null>(null);
  const [selectedHunter, setSelectedHunter] = useState<any | null>(null);

  useEffect(() => {
    document.title = "Espace Guide de Chasse | SCoDiPP - Systeme de Control";
  }, []);

  // Données réelles: guide connecté puis ses chasseurs associés
  const isHuntingGuide = user?.role === "hunting-guide";
  const { data: guideInfo } = useQuery<{ id: number } | undefined>({
    queryKey: ["/api/guides", user?.id],
    queryFn: () => apiRequest({ url: `/api/guides/${user?.id}`, method: "GET" }),
    enabled: !!user?.id && isHuntingGuide,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const { data: associatedHunters = [], isLoading } = useQuery<GuideHunter[]>({
    queryKey: ["/api/guides", guideInfo?.id, "hunters"],
    queryFn: () => apiRequest({ url: `/api/guides/${guideInfo?.id}/hunters`, method: "GET" }),
    enabled: !!guideInfo?.id,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  // Déclarations (taxes) de tous les chasseurs associés au guide
  const hunterIds = associatedHunters.map(a => a.hunterId).filter(Boolean);
  const { data: declarations = [], isLoading: isLoadingDeclarations } = useQuery<Tax[]>({
    queryKey: ["/api/taxes", "by-associated-hunters", hunterIds],
    enabled: hunterIds.length > 0,
    queryFn: async () => {
      const lists: Tax[][] = await Promise.all(
        hunterIds.map((hid) => apiRequest<Tax[]>({ url: `/api/taxes/hunter/${hid}`, method: "GET" }))
      );
      const flat: Tax[] = lists.flat();
      // Trier par createdAt ou issueDate desc
      return flat.sort((a, b) => {
        const da = new Date(a.createdAt || a.issueDate || 0).getTime();
        const db = new Date(b.createdAt || b.issueDate || 0).getTime();
        return db - da;
      });
    },
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const filteredHunters = associatedHunters.filter((assoc) => {
    const fullName = `${assoc.hunter?.firstName ?? ""} ${assoc.hunter?.lastName ?? ""}`.trim().toLowerCase();
    const region = (assoc.hunter?.region ?? "").toLowerCase();
    const departement = (assoc.hunter?.departement ?? "").toLowerCase();
    const q = searchQuery.toLowerCase();
    return fullName.includes(q) || region.includes(q) || departement.includes(q);
  });

  // Récupérer les permis pour tous les chasseurs associés (batch)
  const { data: permitsByHunter = {}, isLoading: loadingPermits } = useQuery<Record<number, any[]>>({
    queryKey: ["/api/permits", "by-associated-hunters", associatedHunters.map(a => a.hunterId)],
    enabled: associatedHunters.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        associatedHunters.map(async (a) => {
          try {
            const res = await apiRequest<any>({ url: `/api/permits/hunter/${a.hunterId}`, method: "GET" });
            const list = Array.isArray(res) ? res : (res?.data ?? []);
            return [a.hunterId, list] as const;
          } catch {
            return [a.hunterId, []] as const;
          }
        })
      );
      return Object.fromEntries(entries);
    },
    placeholderData: {},
  });

  const openPermitDialog = (permit: any, hunter: any) => {
    setSelectedPermit(permit);
    setSelectedHunter(hunter);
    setOpenPermit(true);
  };

  return (
    <div className="flex flex-col min-h-screen p-4 md:p-8 pt-6">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">
            <User className="h-6 w-6 inline-block mr-2" />
            Espace Guide de Chasse
          </h2>
          {/* Compteurs compacts sur la même ligne */}
          <div className="flex gap-2 sm:gap-3">
            <Card className="p-2 flex-shrink-0">
              <div className="flex items-center space-x-1">
                <Users className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                <div className="text-lg font-bold min-w-[2ch] text-center">{associatedHunters.length}</div>
              </div>
            </Card>
            <Card className="p-2 flex-shrink-0">
              <div className="flex items-center space-x-1">
                <Crosshair className="h-4 w-4 text-yellow-600 flex-shrink-0" />
                <div className="text-lg font-bold min-w-[2ch] text-center">{isLoadingDeclarations ? '…' : declarations.length}</div>
              </div>
            </Card>
          </div>
        </div>

        {/* Permis des chasseurs associés sous forme de cards */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Permis des chasseurs associés</CardTitle>
            <CardDescription>Affichage en cartes: N° de permis et catégorie</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || loadingPermits ? (
              <div className="py-8 text-center text-muted-foreground">Chargement…</div>
            ) : filteredHunters.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">Aucun chasseur associé</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredHunters.flatMap((assoc) => {
                  const list = (permitsByHunter as any)[assoc.hunterId] as any[] | undefined;
                  if (!Array.isArray(list) || list.length === 0) return [];
                  const normalizeCategory = (p: any) => {
                    const raw = (p?.categoryId ?? p?.type ?? '').toString();
                    if (raw === 'petite-chasse' || raw === 'sportif-petite-chasse') return 'Petite chasse';
                    if (raw === 'grande-chasse') return 'Grande chasse';
                    if (raw === 'gibier-eau' || raw === 'special-gibier-eau') return "Gibier d'eau";
                    return raw || 'Catégorie';
                  };
                  return list.map((permit) => {
                    const cat = normalizeCategory(permit);
                    const isActive = permit.status === 'active';
                    return (
                      <Card key={`${assoc.id}-${permit.id}`} className={isActive ? 'border-green-300 bg-green-50' : 'border-gray-200'}>
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">N° {permit.permitNumber}</CardTitle>
                            {isActive ? (
                              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                                <BadgeCheck className="h-3 w-3 mr-1" /> Actif
                              </Badge>
                            ) : null}
                          </div>
                          <CardDescription className="mt-1">Catégorie: {cat}</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-muted-foreground truncate max-w-[70%]">
                              {assoc.hunter?.firstName} {assoc.hunter?.lastName}
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openPermitDialog(permit, assoc.hunter)}>
                              <Eye className="h-4 w-4 mr-1" /> Voir
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  });
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog Quitus */}
      <Dialog open={openPermit} onOpenChange={setOpenPermit}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Quitus du Permis</DialogTitle>
            <DialogDescription>
              Visualisation du permis du chasseur {selectedHunter?.firstName} {selectedHunter?.lastName}
            </DialogDescription>
          </DialogHeader>
          {selectedPermit ? (
            <div className="max-h-[70vh] overflow-auto">
              <PermitCard permit={selectedPermit as any} hunter={selectedHunter as any} />
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">Aucun permis à afficher</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}