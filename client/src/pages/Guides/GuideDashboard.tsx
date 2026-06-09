import { useEffect, useState } from "react";
import AgentTopHeader from "@/components/layout/AgentTopHeader";
import AlerteDomainActionCard from "@/components/alerte/AlerteDomainActionCard";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { LinkIcon, Search, User, Users, Eye, BadgeCheck, XCircle, Target, Crosshair, Home, ClipboardList, Plus, X, User as UserIcon, FileText, UserPlus, BookOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import PermitCard from "@/components/permits/PermitCard";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import AssociateHunters from "@/components/guides/AssociateHunters";
import { apiRequest } from "@/lib/queryClient";
import { getAppLogo } from "@/utils/environment";

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
  const [activeTab, setActiveTab] = useState<'home' | 'hunters' | 'declarations'>('home');
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    document.title = "Espace Guide de Chasse | SCoDiPP - Systeme de Control";
  }, []);

  // Sync activeTab with URL path
  useEffect(() => {
    if (location === '/guide/hunters') {
      setActiveTab('hunters');
    } else if (location === '/guide/declarations') {
      setActiveTab('declarations');
    } else if (location === '/guide' || location === '/guide/home') {
      setActiveTab('home');
    }
  }, [location]);

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
          } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
      <AgentTopHeader />

      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain px-4 pb-20 pt-4">
        {/* Contenu selon l'onglet actif */}
        {activeTab === 'home' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            {/* Logo and Title */}
            <div className="flex flex-col items-center gap-3 pb-2 pt-2">
              <img
                src="/assets/logoprojets/Sans fond_Scodi/android-chrome-512x512.png"
                alt="ScoDi"
                className="h-16 object-contain"
              />
              <p className="max-w-xs text-center text-[11px] font-bold leading-tight text-gray-700">
                Système de Contrôle et de Digitalisation
              </p>
            </div>

            {/* Action Cards Grid */}
            <div className="relative z-10 mx-auto w-full max-w-md pt-2">
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {/* Associer un chasseur */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setShowAssociateModal(true)}
                  className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-50 p-4 text-center transition-all duration-200 hover:shadow-md hover:shadow-emerald-500/10 hover:border-emerald-200 active:bg-emerald-100"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-shadow">
                    <UserPlus className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Associer</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">un chasseur</span>
                  </div>
                </motion.button>

                {/* Nouveau prélèvement */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setLocation('/hunting-reports')}
                  className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-4 text-center transition-all duration-200 hover:shadow-md hover:shadow-amber-500/10 hover:border-amber-200 active:bg-amber-100"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25 group-hover:shadow-amber-500/40 transition-shadow">
                    <Target className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Prélèvement</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">nouveau rapport</span>
                  </div>
                </motion.button>

                {/* Chasseurs associés */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setLocation('/guides/associate-hunters')}
                  className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-center transition-all duration-200 hover:shadow-md hover:shadow-blue-500/10 hover:border-blue-200 active:bg-blue-100"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25 group-hover:shadow-blue-500/40 transition-shadow">
                    <Users className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Mes chasseurs</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">{associatedHunters.length} associé{associatedHunters.length !== 1 ? 's' : ''}</span>
                  </div>
                </motion.button>

                {/* Déclarations & Rapports */}
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { setActiveTab('declarations'); setLocation('/guide/declarations'); }}
                  className="group relative flex flex-col items-center gap-2.5 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 p-4 text-center transition-all duration-200 hover:shadow-md hover:shadow-violet-500/10 hover:border-violet-200 active:bg-violet-100"
                >
                  <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25 group-hover:shadow-violet-500/40 transition-shadow">
                    <BookOpen className="h-6 w-6 text-white" strokeWidth={2} />
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-slate-800 leading-tight">Déclarations</span>
                    <span className="block text-[10px] font-medium text-slate-500 mt-0.5">taxes & rapports</span>
                  </div>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'hunters' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-600" /> Mes Chasseurs Associés
            </h2>
            <div className="mt-4">
            {isLoading || loadingPermits ? (
              <div className="py-8 text-center text-muted-foreground bg-white rounded-lg border">Chargement…</div>
            ) : filteredHunters.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground bg-white rounded-lg border">Aucun chasseur associé</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                      <div key={`${assoc.id}-${permit.id}`} className={`p-3 rounded-xl border ${isActive ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-800">N° {permit.permitNumber}</span>
                          {isActive ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-green-100 text-green-800 border border-green-200">
                              Actif
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[10px] text-slate-500 mb-2">Catégorie: {cat}</div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100/50">
                          <div className="text-[11px] font-medium text-slate-700 truncate max-w-[70%]">
                            {assoc.hunter?.firstName} {assoc.hunter?.lastName}
                          </div>
                          <button onClick={() => openPermitDialog(permit, assoc.hunter)} className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                            <Eye className="h-3 w-3" /> Voir
                          </button>
                        </div>
                      </div>
                    );
                  });
                })}
              </div>
            )}
        </div>
        </motion.div>
        )}

        {activeTab === 'declarations' && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-green-600" /> Déclarations & Taxes
              </h2>
            </div>

            <div className="w-full mt-4 space-y-3">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="mb-3">
                  <h3 className="font-bold text-slate-800 text-sm">Paiements des taxes d'abattage ({declarations.length})</h3>
                  <p className="text-[11px] text-slate-500">Historique des taxes payées par vos chasseurs associés.</p>
                </div>
                {isLoadingDeclarations ? (
                   <div className="text-center text-slate-500 py-6">Chargement...</div>
                ) : declarations.length === 0 ? (
                   <div className="text-center text-slate-500 py-6">Aucune taxe trouvée</div>
                ) : (
                   <div className="space-y-2">
                     {declarations.map(tax => {
                       let permitNumber = "Non spécifié";
                       if (tax.hunterId && (permitsByHunter as any)[tax.hunterId]) {
                         const hunterPermits = (permitsByHunter as any)[tax.hunterId] as any[];
                         const permit = hunterPermits.find(p => p.id === tax.permitId);
                         if (permit) {
                           permitNumber = permit.permitNumber;
                         } else if (hunterPermits.length > 0) {
                           permitNumber = hunterPermits[0].permitNumber;
                         }
                       }

                       return (
                         <div key={tax.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100/50 transition-colors">
                           <div>
                             <p className="font-bold text-slate-800 text-sm">
                               Espèce : <span className="text-emerald-700">{tax.animalType}</span> <span className="font-normal text-slate-500 ml-1">x{tax.quantity}</span>
                             </p>
                             <p className="text-[11px] text-slate-500 mt-1">
                               Chasseur : <span className="font-medium text-slate-700">{tax.hunterFirstName} {tax.hunterLastName}</span>
                             </p>
                             <p className="text-[11px] text-slate-500">
                               Permis N° : <span className="font-semibold text-slate-700">{permitNumber}</span>
                             </p>
                           </div>
                           <div className="text-right flex flex-col justify-center items-end">
                             <Badge variant="outline" className="text-green-700 bg-green-50 border-green-200 text-xs font-bold mb-1">
                               {Number(tax.amount).toLocaleString()} FCFA
                             </Badge>
                             {(tax.createdAt || tax.issueDate) && (
                               <span className="text-[9px] text-slate-400">
                                 {new Date(tax.createdAt || tax.issueDate || '').toLocaleDateString('fr-FR')}
                               </span>
                             )}
                           </div>
                         </div>
                       );
                     })}
                   </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Footer Blasons only on home */}
        {activeTab === 'home' && (
          <div className="mt-6 flex items-center justify-center gap-6 pb-6 pt-4 border-t border-slate-200">
            <img src="/icon-blason.svg" alt="Blason" className="h-16 object-contain opacity-70" />
            <img
              src={getAppLogo()}
              alt="Eaux et Forets"
              className="h-16 object-contain mix-blend-multiply opacity-70"
            />
          </div>
        )}

      </div>

      {/* FAB Button itself */}
      <motion.button 
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white active:scale-95 transition-colors z-[80] bg-green-600 shadow-green-600/30"
        onClick={() => setLocation('/hunting-reports?new=true')}
        aria-label="Actions rapides"
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </motion.button>

      {/* Dialog Quitus - Bottom Sheet */}
      <Dialog open={openPermit} onOpenChange={setOpenPermit}>
        <DialogContent className="max-w-full m-0 p-0 h-[95vh] rounded-t-2xl sm:rounded-2xl sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col fixed bottom-0 left-0 right-0 sm:relative translate-y-0 data-[state=closed]:translate-y-full transition-transform duration-300">
          <div className="bg-slate-50 flex-1 overflow-y-auto no-scrollbar">
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Quitus du Permis</h2>
                <p className="text-xs text-slate-500">{selectedHunter?.firstName} {selectedHunter?.lastName}</p>
              </div>
              <button onClick={() => setOpenPermit(false)} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            
          {selectedPermit ? (
            <div className="p-4 pb-24">
              <PermitCard permit={selectedPermit as any} hunter={selectedHunter as any} />
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">Aucun permis à afficher</div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Associer un chasseur */}
      {guideInfo?.id && (
        <AssociateHunters 
          guideId={String(guideInfo.id)} 
          open={showAssociateModal} 
          onOpenChange={setShowAssociateModal} 
        />
      )}
    </div>
  );
}