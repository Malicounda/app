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
import { User, TrendingUp, MapPin, UserCheck, AlertTriangle, MoreVertical, Filter, Download, PlusCircle, Edit, Shield, CheckCircle, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AgentInfo = {
  idAgent: number;
  userId: number;
  matriculeSol: string;
  nom: string | null;
  prenom: string | null;
  grade: string | null;
  genre: string | null;
  roleMetierId: number | null;
  roleMetierLabel: string | null;
  region: string | null;
  departement: string | null;
  commune: string | null;
  arrondissement: string | null;
  userRole: string | null;
  geoRestrictionEnabled?: boolean;
};

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

  // ===== DATA QUERIES =====
  const { data: affectations = [], isLoading: isLoadingAffectations } = useQuery({
    queryKey: ["/api/affectations"],
    queryFn: () => apiRequest<Affectation[]>({ url: "/api/affectations", method: "GET" }),
  });

  const { data: agentsList = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ["/api/agents"],
    queryFn: () => apiRequest<AgentInfo[]>({ url: "/api/agents", method: "GET" }),
  });

  const { data: domainesList = [], isLoading: isLoadingDomaines } = useQuery({
    queryKey: ["/api/domaines"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines", method: "GET" }),
  });

  const isLoading = isLoadingAffectations || isLoadingAgents || isLoadingDomaines;

  // ===== FORM STATE =====
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedDomaineId, setSelectedDomaineId] = useState("");
  const [selectedNiveau, setSelectedNiveau] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  
  // GPS Restriction State (Legacy/Optional)
  const [geoRestrictionEnabled, setGeoRestrictionEnabled] = useState(false);
  const [restrictionType, setRestrictionType] = useState<string>("");

  // Auto-filled fields from selected agent
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agentsList.find((a: AgentInfo) => String(a.idAgent) === selectedAgentId) || null;
  }, [selectedAgentId, agentsList]);

  // Auto-fill when agent changes
  useEffect(() => {
    if (selectedAgent) {
      // Set the geo restriction status from the user
      // We'll need to fetch this - for now use the data we have
      setGeoRestrictionEnabled(false);
      setRestrictionType("");
    }
  }, [selectedAgent]);

  // ===== TABLE SEARCH/FILTER =====
  const [searchMatricule, setSearchMatricule] = useState("");

  const filtered = useMemo(() => {
    const q = searchMatricule.trim().toLowerCase();
    if (!q) return affectations;
    return affectations.filter((a) => String(a.agentMatricule || "").toLowerCase().includes(q));
  }, [affectations, searchMatricule]);

  const pagination = usePagination(filtered, { pageSize: 10 });

  const applyGeoRestrictionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent) throw new Error("Aucun agent sélectionné");
      return apiRequest({
        url: `/api/users/${selectedAgent.userId}/geo-restriction`,
        method: "PATCH",
        data: {
          geoRestrictionEnabled,
          restrictionType: restrictionType || null,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agents"] });
      toast({ title: "Restriction géographique appliquée" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Mise à jour impossible", variant: "destructive" });
    },
  });

  const saveAffectationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent || !selectedDomaineId || !selectedNiveau || !selectedZone) {
        throw new Error("Veuillez remplir tous les champs obligatoires (Agent, Domaine, Niveau, Zone)");
      }
      return apiRequest({
        url: "/api/affectations",
        method: "POST",
        data: {
          agentId: selectedAgent.idAgent,
          domaineId: Number(selectedDomaineId),
          niveauHierarchique: selectedNiveau,
          codeZone: selectedZone,
          active: true,
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/affectations"] });
      toast({ title: "Affectation enregistrée avec succès" });
      setSelectedDomaineId("");
      setSelectedNiveau("");
      setSelectedZone("");
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Enregistrement impossible", variant: "destructive" });
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

  // Helper: get restriction zone label for an agent in the table
  function getAgentRestrictionLabel(agentId: number): string {
    const agent = agentsList.find((a: AgentInfo) => a.idAgent === agentId);
    if (!agent) return "-";
    // Check from user data
    if (agent.departement) return `Département: ${agent.departement}`;
    if (agent.commune) return `Commune: ${agent.commune}`;
    if (agent.arrondissement) return `Arr.: ${agent.arrondissement}`;
    if (agent.region) return `Région: ${agent.region}`;
    return "Non défini";
  }

  // ===== STATS =====
  const activeCount = affectations.filter(a => a.active).length;
  const zonesCount = new Set(affectations.map(a => a.codeZone)).size;
  const agentsCount = new Set(affectations.map(a => a.agentId)).size;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
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
              <h2 className="text-lg font-semibold text-foreground">
                Contrôle des Affectations
              </h2>
              <p className="text-muted-foreground text-sm mt-1">Administration centrale - Configuration des affectations territoriales et restrictions GPS</p>
            </div>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 sm:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
              {/* Agent (Liste déroulante) */}
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Agent <span className="text-red-500">*</span></Label>
                <Select value={selectedAgentId} onValueChange={(v) => setSelectedAgentId(v)} disabled={isLoadingAgents}>
                  <SelectTrigger className="py-5">
                    <SelectValue placeholder={isLoadingAgents ? "Chargement..." : "Sélectionner un agent"} />
                  </SelectTrigger>
                  <SelectContent>
                    {agentsList.map((agent: AgentInfo) => (
                      <SelectItem key={agent.idAgent} value={String(agent.idAgent)}>
                        {agent.matriculeSol} — {agent.nom || ''} {agent.prenom || ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Domaine */}
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Domaine <span className="text-red-500">*</span></Label>
                <Select value={selectedDomaineId} onValueChange={setSelectedDomaineId} disabled={isLoadingDomaines}>
                  <SelectTrigger className="py-5">
                    <SelectValue placeholder={isLoadingDomaines ? "Chargement..." : "Sélectionner un domaine"} />
                  </SelectTrigger>
                  <SelectContent>
                    {domainesList.map((dom: Domaine) => (
                      <SelectItem key={dom.id} value={String(dom.id)}>
                        {dom.nomDomaine}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Niveau et Zone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-6">
              {/* Niveau Hiérarchique */}
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Niveau Hiérarchique <span className="text-red-500">*</span></Label>
                <Select value={selectedNiveau} onValueChange={setSelectedNiveau}>
                  <SelectTrigger className="py-5">
                    <SelectValue placeholder="Choisir le niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NATIONAL">National</SelectItem>
                    <SelectItem value="REGIONAL">Régional</SelectItem>
                    <SelectItem value="SECTEUR">Secteur</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Code Zone */}
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground">Code Zone <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Ex: SEN, DKR, THI, etc."
                  value={selectedZone}
                  onChange={(e) => setSelectedZone(e.target.value)}
                  className="py-5 uppercase"
                />
              </div>
            </div>

            {/* Row 3: Infos Agent auto-remplies (Région, Département, Commune, Arrondissement) */}
            {selectedAgent && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8 mt-6 p-4 bg-muted/10 rounded-lg border border-border/50">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Région</Label>
                  <span className="text-sm font-medium text-foreground">{selectedAgent.region || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Département</Label>
                  <span className="text-sm font-medium text-foreground">{selectedAgent.departement || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Commune</Label>
                  <span className="text-sm font-medium text-foreground">{selectedAgent.commune || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Arrondissement</Label>
                  <span className="text-sm font-medium text-foreground">{selectedAgent.arrondissement || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
              </div>
            )}

            {/* Row 4: Restriction GPS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 mt-6">
              {/* Restriction GPS Toggle */}
              <div className="flex flex-col gap-2">
                <Label className="font-bold text-foreground flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-500" />
                  Restriction GPS
                </Label>
                <div className="flex items-center gap-3 h-[42px]">
                  <Switch
                    checked={geoRestrictionEnabled}
                    onCheckedChange={setGeoRestrictionEnabled}
                    className="data-[state=checked]:bg-orange-500"
                  />
                  <span className={`text-sm font-medium ${geoRestrictionEnabled ? 'text-orange-600' : 'text-muted-foreground'}`}>
                    {geoRestrictionEnabled ? "Activée" : "Désactivée"}
                  </span>
                </div>
              </div>

              {/* Type de restriction */}
              {geoRestrictionEnabled && (
                <div className="flex flex-col gap-2">
                  <Label className="font-bold text-foreground">Zone de restriction</Label>
                  <Select value={restrictionType} onValueChange={setRestrictionType}>
                    <SelectTrigger className="py-5 border-orange-300 focus:ring-orange-500">
                      <SelectValue placeholder="Choisir le type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="region">Région {selectedAgent?.region ? `(${selectedAgent.region})` : ''}</SelectItem>
                      <SelectItem value="departement">Département {selectedAgent?.departement ? `(${selectedAgent.departement})` : ''}</SelectItem>
                      <SelectItem value="commune">Commune {selectedAgent?.commune ? `(${selectedAgent.commune})` : ''}</SelectItem>
                      <SelectItem value="arrondissement">Arrondissement {selectedAgent?.arrondissement ? `(${selectedAgent.arrondissement})` : ''}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Buttons Row */}
            <div className="flex flex-col sm:flex-row justify-end mt-6 gap-4 border-t border-border pt-6">
              <Button
                onClick={() => applyGeoRestrictionMutation.mutate()}
                disabled={applyGeoRestrictionMutation.isPending || !selectedAgent || (geoRestrictionEnabled && !restrictionType)}
                variant="outline"
                className="px-6 py-6 rounded-lg font-bold flex items-center gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                <Shield className="w-5 h-5" />
                Mettre à jour Restriction GPS
              </Button>

              <Button
                onClick={() => saveAffectationMutation.mutate()}
                disabled={saveAffectationMutation.isPending || !selectedAgent || !selectedDomaineId || !selectedNiveau || !selectedZone}
                className="bg-teal-600 text-white hover:bg-teal-700 px-8 py-6 rounded-lg font-bold flex items-center gap-3 transition-all shadow-[0_0_15px_rgba(13,148,136,0.2)] hover:shadow-[0_0_20px_rgba(13,148,136,0.4)]"
              >
                <CheckCircle className="w-5 h-5" />
                {saveAffectationMutation.isPending ? "Enregistrement..." : "Enregistrer l'Affectation"}
              </Button>
            </div>
          </div>
        </section>

        {/* Section 2: Journal des Affectations */}
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
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground">Date</TableHead>
                    <TableHead className="py-5 px-6 text-xs font-bold tracking-wider uppercase text-muted-foreground text-center">Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/50">
                  {pagination.currentItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Aucune affectation trouvée.</TableCell>
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
                      <TableCell className="py-4 px-6 font-medium text-sm">
                        {a.domaineNom || <span className="text-muted-foreground italic">Non défini</span>}
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <Badge variant="outline" className="text-xs">
                          {a.niveauHierarchique}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center text-sm font-medium">
                          <MapPin className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
                          {a.codeZone}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-sm text-muted-foreground">
                        {a.dateAffectation ? new Date(a.dateAffectation).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell className="py-4 px-6 text-center">
                        <div className="flex justify-center">
                          <Switch
                            checked={!!a.active}
                            onCheckedChange={(next) => toggleMutation.mutate({ id: a.id, active: next })}
                            className="data-[state=checked]:bg-teal-500"
                          />
                        </div>
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
  );
}
