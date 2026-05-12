import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/usePagination";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { User, TrendingUp, MapPin, UserCheck, AlertTriangle, MoreVertical, Filter, Download, PlusCircle, Edit } from "lucide-react";
import { useMemo, useState } from "react";

type Affectation = {
  id: number;
  agentId: number;
  domaineId: number;
  agentMatricule?: string | null;
  domaineNom?: string | null;
  niveauHierarchique: "NATIONAL" | "REGIONAL" | "SECTEUR";
  roleMetierId?: number | null;
  codeZone: string;
  active: boolean;
  dateAffectation?: string | null;
};

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

export default function AffectationsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/affectations"],
    queryFn: () => apiRequest<Affectation[]>({ url: "/api/affectations", method: "GET" }),
  });

  const { data: domainesData, isLoading: isLoadingDomaines } = useQuery({
    queryKey: ["/api/domaines"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines", method: "GET" }),
  });

  const affectations = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const domaines = useMemo(() => (Array.isArray(domainesData) ? domainesData : []), [domainesData]);

  const [searchMatricule, setSearchMatricule] = useState("");

  const filtered = useMemo(() => {
    const q = searchMatricule.trim().toLowerCase();
    if (!q) return affectations;
    return affectations.filter((a) => String(a.agentMatricule || "").toLowerCase().includes(q));
  }, [affectations, searchMatricule]);

  const pagination = usePagination(filtered, { pageSize: 10 });

  const [agentId, setAgentId] = useState("");
  const [domaineId, setDomaineId] = useState("");
  const [codeZone, setCodeZone] = useState("");
  const [niveauHierarchique, setNiveauHierarchique] = useState<Affectation["niveauHierarchique"]>("REGIONAL");

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<Affectation>({
        url: "/api/affectations",
        method: "POST",
        data: {
          agentId: Number(agentId),
          domaineId: Number(domaineId),
          niveauHierarchique,
          codeZone,
        },
      });
    },
    onSuccess: async () => {
      setAgentId("");
      setDomaineId("");
      setCodeZone("");
      await qc.invalidateQueries({ queryKey: ["/api/affectations"] });
      toast({ title: "Affectation créée" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Création impossible", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { id: number; active: boolean }) => {
      return apiRequest<Affectation>({ url: `/api/affectations/${vars.id}/active/${vars.active ? "true" : "false"}`, method: "PATCH" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/affectations"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Mise à jour impossible", variant: "destructive" });
    },
  });

  const activeCount = affectations.filter(a => a.active).length;
  const zonesCount = new Set(affectations.map(a => a.codeZone)).size;
  const agentsCount = new Set(affectations.map(a => a.agentId)).size;

  return (
    <main className="page-frame-container min-h-screen">
      <div className="page-frame-inner max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Dashboard Stats Header (Bento Style) */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Affectations Actives</span>
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold tracking-tight text-foreground">{activeCount}</span>
              <span className="text-teal-400 flex items-center text-sm font-bold">
                <TrendingUp className="w-4 h-4 mr-1" /> {affectations.length ? Math.round((activeCount/affectations.length)*100) : 0}%
              </span>
            </div>
          </div>
          <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Zones Couvertes</span>
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold tracking-tight text-foreground">{zonesCount}</span>
              <span className="text-muted-foreground text-sm font-medium">National</span>
            </div>
          </div>
          <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Agents Déployés</span>
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold tracking-tight text-foreground">{agentsCount}</span>
              <span className="text-teal-400 flex items-center text-sm font-bold">
                <UserCheck className="w-4 h-4 mr-1" /> OK
              </span>
            </div>
          </div>
          <div className="bg-card border border-border p-6 rounded-xl flex flex-col gap-2 shadow-sm">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Alertes Réseau</span>
            <div className="flex items-end justify-between">
              <span className="text-4xl font-bold tracking-tight text-foreground">0</span>
              <span className="text-amber-500 flex items-center text-sm font-bold">
                <AlertTriangle className="w-4 h-4 mr-1" /> Normal
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Contrôle des Affectations Form */}
        <section className="bg-card border border-border rounded-xl overflow-hidden shadow-md">
          <div className="p-6 border-b border-border flex justify-between items-center bg-muted/20">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Contrôle des Affectations</h2>
              <p className="text-muted-foreground text-sm mt-1">Administration centrale - Configuration des affectations territoriales</p>
            </div>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8">
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Agent</Label>
                <Input value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="ID de l'agent" className="py-5" />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Domaine</Label>
                <Select value={domaineId} onValueChange={(v) => setDomaineId(v)} disabled={isLoadingDomaines}>
                  <SelectTrigger className="py-5">
                    <SelectValue placeholder={isLoadingDomaines ? "Chargement..." : "Sélectionner"} />
                  </SelectTrigger>
                  <SelectContent>
                    {domaines.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.nomDomaine}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Niveau</Label>
                <Select value={niveauHierarchique} onValueChange={(v) => setNiveauHierarchique(v as any)}>
                  <SelectTrigger className="py-5">
                    <SelectValue placeholder="Niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NATIONAL">NATIONAL</SelectItem>
                    <SelectItem value="REGIONAL">REGIONAL</SelectItem>
                    <SelectItem value="SECTEUR">SECTEUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Code zone</Label>
                <Input value={codeZone} onChange={(e) => setCodeZone(e.target.value)} placeholder="ex: SN-DKR-01" className="py-5" />
              </div>
              <div className="md:col-span-4 flex justify-end mt-2">
                <Button 
                  onClick={() => createMutation.mutate()}
                  disabled={createMutation.isPending || !agentId || !domaineId || !codeZone}
                  className="bg-teal-500 text-teal-950 hover:bg-teal-400 px-8 py-6 rounded-lg font-bold flex items-center gap-3 transition-all shadow-[0_0_15px_rgba(107,216,203,0.15)] hover:shadow-[0_0_20px_rgba(107,216,203,0.3)]"
                >
                  <PlusCircle className="w-5 h-5" />
                  Créer l'Affectation
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Data Table */}
        <section className="bg-card border border-border rounded-xl overflow-hidden shadow-md">
          <div className="p-6 border-b border-border flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-muted/20">
            <h3 className="text-lg font-semibold text-foreground">Journal des Affectations Récentes</h3>
            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Input
                  placeholder="Rechercher par matricule..."
                  value={searchMatricule}
                  onChange={(e) => {
                    setSearchMatricule(e.target.value);
                    pagination.setPage(1);
                  }}
                  className="h-10 pl-3 pr-4"
                />
              </div>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                <Filter className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0">
                <Download className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 text-center text-muted-foreground animate-pulse">Chargement des données...</div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent border-border">
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground">Agent</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground">Domaine</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground">Niveau</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground">Zone</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground text-center">Statut</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/50">
                  {pagination.currentItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">Aucune affectation trouvée.</TableCell>
                    </TableRow>
                  ) : pagination.currentItems.map((a) => (
                    <TableRow key={a.id} className="hover:bg-muted/40 transition-colors border-border/50">
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                            {a.agentMatricule ? a.agentMatricule.substring(0, 2).toUpperCase() : 'AG'}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{a.agentMatricule || "Inconnu"}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">ID: #{a.agentId}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-sm text-foreground">{a.domaineNom || "-"}</TableCell>
                      <TableCell className="py-4 px-6 text-sm text-muted-foreground">{a.niveauHierarchique}</TableCell>
                      <TableCell className="py-4 px-6 text-sm font-mono font-medium text-teal-400">{a.codeZone}</TableCell>
                      <TableCell className="py-4 px-6 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={!!a.active}
                            onCheckedChange={(next) => toggleMutation.mutate({ id: a.id, active: next })}
                            className="data-[state=checked]:bg-teal-500"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-teal-400 hover:bg-teal-500/10">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          
          {!isLoading && (
            <div className="px-6 py-4 border-t border-border bg-muted/10 flex items-center justify-between">
              <span className="text-sm text-muted-foreground font-medium">
                Affichage {(pagination.page - 1) * 10 + (filtered.length > 0 ? 1 : 0)}-{Math.min(pagination.page * 10, filtered.length)} sur {filtered.length} affectations
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => pagination.prevPage()} disabled={pagination.page <= 1} className="text-muted-foreground hover:text-foreground">
                  Précédent
                </Button>
                <Button variant="default" size="sm" className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-bold min-w-[32px]">
                  {pagination.page}
                </Button>
                <Button variant="outline" size="sm" onClick={() => pagination.nextPage()} disabled={pagination.page >= pagination.pageCount} className="text-muted-foreground hover:text-foreground">
                  Suivant
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
