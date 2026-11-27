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
import { departmentsByRegion, regionEnum } from "@/lib/constants";
import { apiRequest } from "@/lib/queryClient";
import { exportArrayToCsv } from "@/utils/export";
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
  agentNom?: string | null;
  agentPrenom?: string | null;
  agentRegion?: string | null;
  agentDepartement?: string | null;
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

  // Normalize a string for comparison (remove accents, lowercase)
  const normalizeStr = (s: string) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[-_\s]+/g, "");

  // Déduit le nom de la région d'un agent (même si seul le département est renseigné)
  const resolveRegionName = (rawRegion?: string | null, rawDepartement?: string | null): string => {
    const cleanReg = String(rawRegion || "").trim();
    if (cleanReg) {
      const normReg = normalizeStr(cleanReg);
      if (normReg === "national") return "NATIONAL";
      const found = regionEnum.find(
        (r) => normalizeStr(r.value) === normReg || normalizeStr(r.label) === normReg
      );
      return found ? found.label : cleanReg.toUpperCase();
    }

    const cleanDep = String(rawDepartement || "").trim();
    if (cleanDep) {
      const normDep = normalizeStr(cleanDep.replace(/^secteur\s+/i, ""));
      const entries = Object.entries(departmentsByRegion) as [string, { value: string; label: string }[]][];
      for (const [regKey, depts] of entries) {
        const foundDep = depts.find(
          (d) =>
            normalizeStr(d.value) === normDep ||
            normalizeStr(d.label.replace(/^secteur\s+/i, "")) === normDep ||
            normalizeStr(d.label) === normDep
        );
        if (foundDep) {
          const foundReg = regionEnum.find((r) => r.value === regKey);
          return foundReg ? foundReg.label : regKey.toUpperCase();
        }
      }
    }

    return "";
  };

  // Auto-filled fields from selected agent
  const selectedAgent = useMemo(() => {
    if (!selectedAgentId) return null;
    return agentsList.find((a: AgentInfo) => String(a.idAgent) === selectedAgentId) || null;
  }, [selectedAgentId, agentsList]);

  const selectedAgentRegion = useMemo(() => {
    if (!selectedAgent) return "";
    return resolveRegionName(selectedAgent.region, selectedAgent.departement);
  }, [selectedAgent]);

  // Auto-fill when agent changes
  useEffect(() => {
    if (selectedAgent) {
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
      if (!selectedAgent || !selectedDomaineId || !selectedNiveau) {
        throw new Error("Veuillez remplir tous les champs obligatoires (Agent, Domaine, Niveau)");
      }
      const autoZone =
        selectedAgentRegion ||
        selectedAgent.region ||
        selectedAgent.departement ||
        (selectedNiveau === "NATIONAL" ? "NATIONAL" : "NON DÉFINI");
      return apiRequest({
        url: "/api/affectations",
        method: "POST",
        data: {
          agentId: selectedAgent.idAgent,
          domaineId: Number(selectedDomaineId),
          niveauHierarchique: selectedNiveau,
          codeZone: String(autoZone).toUpperCase(),
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
    <div className="max-w-[1440px] w-full min-w-0 mx-auto px-1 sm:px-6 py-4 sm:py-6 space-y-6">
        {/* Dashboard Stats Header (Bento Style) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          <div className="bg-card border border-border p-4 sm:p-6 rounded-xl flex flex-col gap-2 shadow-sm min-w-0">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Affectations Actives</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">{activeCount}</span>
              <span className="text-teal-500 flex items-center text-xs sm:text-sm font-bold shrink-0">
                <TrendingUp className="w-4 h-4 mr-1" /> {affectations.length ? Math.round((activeCount/affectations.length)*100) : 0}%
              </span>
            </div>
          </div>
          <div className="bg-card border border-border p-4 sm:p-6 rounded-xl flex flex-col gap-2 shadow-sm min-w-0">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Zones Couvertes</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">{zonesCount}</span>
              <span className="text-muted-foreground text-xs sm:text-sm font-medium shrink-0">National</span>
            </div>
          </div>
          <div className="bg-card border border-border p-4 sm:p-6 rounded-xl flex flex-col gap-2 shadow-sm min-w-0">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Agents Déployés</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">{agentsCount}</span>
              <span className="text-teal-500 flex items-center text-xs sm:text-sm font-bold shrink-0">
                <UserCheck className="w-4 h-4 mr-1" /> OK
              </span>
            </div>
          </div>
          <div className="bg-card border border-border p-4 sm:p-6 rounded-xl flex flex-col gap-2 shadow-sm min-w-0">
            <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Alertes Réseau</span>
            <div className="flex items-end justify-between gap-2">
              <span className="text-2xl sm:text-4xl font-bold tracking-tight text-foreground">0</span>
              <span className="text-amber-500 flex items-center text-xs sm:text-sm font-bold shrink-0">
                <AlertTriangle className="w-4 h-4 mr-1" /> Normal
              </span>
            </div>
          </div>
        </div>

        {/* Section 1: Contrôle des Affectations Form */}
        <section className="bg-card border border-border rounded-xl overflow-hidden shadow-md min-w-0">
          <div className="px-4 sm:px-6 py-3.5 border-b border-border bg-muted/20">
            <h2 className="text-lg font-semibold text-foreground">
              Contrôle des Affectations
            </h2>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              Administration centrale - Configuration des affectations territoriales et restrictions GPS
            </p>
          </div>
          <div className="p-4 sm:p-5 space-y-4">
            {/* Row 1: Agent, Domaine, Niveau Hiérarchique sur une seule ligne fluide */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Agent (Liste déroulante) */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <Label className="text-sm font-semibold text-foreground">Agent <span className="text-red-500">*</span></Label>
                <Select value={selectedAgentId} onValueChange={(v) => setSelectedAgentId(v)} disabled={isLoadingAgents}>
                  <SelectTrigger className="h-10">
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
              <div className="flex flex-col gap-1.5 min-w-0">
                <Label className="text-sm font-semibold text-foreground">Domaine <span className="text-red-500">*</span></Label>
                <Select value={selectedDomaineId} onValueChange={setSelectedDomaineId} disabled={isLoadingDomaines}>
                  <SelectTrigger className="h-10">
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

              {/* Niveau Hiérarchique */}
              <div className="flex flex-col gap-1.5 min-w-0">
                <Label className="text-sm font-semibold text-foreground">Niveau Hiérarchique <span className="text-red-500">*</span></Label>
                <Select value={selectedNiveau} onValueChange={setSelectedNiveau}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Choisir le niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NATIONAL">National</SelectItem>
                    <SelectItem value="REGIONAL">Régional</SelectItem>
                    <SelectItem value="SECTEUR">Secteur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Infos Agent auto-remplies (Région, Département, Commune, Arrondissement) */}
            {selectedAgent && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-3.5 py-2.5 bg-muted/20 rounded-lg border border-border/60">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Région</Label>
                  <span className="text-sm font-medium text-foreground truncate">{selectedAgentRegion || selectedAgent.region || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Département</Label>
                  <span className="text-sm font-medium text-foreground truncate">{selectedAgent.departement || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Commune</Label>
                  <span className="text-sm font-medium text-foreground truncate">{selectedAgent.commune || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <Label className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Arrondissement</Label>
                  <span className="text-sm font-medium text-foreground truncate">{selectedAgent.arrondissement || <span className="text-muted-foreground italic">Non renseigné</span>}</span>
                </div>
              </div>
            )}

            {/* Row 3: Restriction GPS + Actions sur une barre fluide */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-3 border-t border-border">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
                <div className="flex items-center gap-2.5">
                  <Shield className="w-4 h-4 text-orange-500 shrink-0" />
                  <Label className="text-sm font-semibold text-foreground whitespace-nowrap">
                    Restriction GPS
                  </Label>
                  <Switch
                    checked={geoRestrictionEnabled}
                    onCheckedChange={setGeoRestrictionEnabled}
                    className="data-[state=checked]:bg-orange-500"
                  />
                  <span className={`text-xs font-medium whitespace-nowrap ${geoRestrictionEnabled ? 'text-orange-600' : 'text-muted-foreground'}`}>
                    {geoRestrictionEnabled ? "Activée" : "Désactivée"}
                  </span>
                </div>

                {geoRestrictionEnabled && (
                  <div className="w-full sm:w-56">
                    <Select value={restrictionType} onValueChange={setRestrictionType}>
                      <SelectTrigger className="h-9 border-orange-300 focus:ring-orange-500">
                        <SelectValue placeholder="Zone de restriction" />
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

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                <Button
                  onClick={() => applyGeoRestrictionMutation.mutate()}
                  disabled={applyGeoRestrictionMutation.isPending || !selectedAgent || (geoRestrictionEnabled && !restrictionType)}
                  variant="outline"
                  className="w-full sm:w-auto h-10 px-4 rounded-lg font-semibold flex items-center justify-center gap-2 border-orange-500 text-orange-600 hover:bg-orange-50"
                >
                  <Shield className="w-4 h-4 shrink-0" />
                  Mettre à jour Restriction GPS
                </Button>

                <Button
                  onClick={() => saveAffectationMutation.mutate()}
                  disabled={saveAffectationMutation.isPending || !selectedAgent || !selectedDomaineId || !selectedNiveau}
                  className="w-full sm:w-auto h-10 px-5 bg-teal-600 text-white hover:bg-teal-700 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  {saveAffectationMutation.isPending ? "Enregistrement..." : "Enregistrer l'Affectation"}
                </Button>
              </div>
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
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                title="Exporter en CSV"
                onClick={() => {
                  const header = ["Matricule", "Nom et Prénom", "Domaine", "Niveau", "Zone (Région)", "Date", "Statut"];
                  const rows = filtered.map((a) => {
                    const matchedAgent = agentsList.find((ag: AgentInfo) => ag.idAgent === a.agentId);
                    const fullName = [
                      a.agentNom ?? matchedAgent?.nom,
                      a.agentPrenom ?? matchedAgent?.prenom,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const regionDisplay =
                      resolveRegionName(
                        a.agentRegion ?? matchedAgent?.region,
                        a.agentDepartement ?? matchedAgent?.departement
                      ) ||
                      a.agentRegion ||
                      matchedAgent?.region ||
                      a.codeZone ||
                      "-";
                    return [
                      a.agentMatricule || "",
                      fullName,
                      a.domaineNom || "",
                      a.niveauHierarchique || "",
                      regionDisplay,
                      a.dateAffectation ? new Date(a.dateAffectation).toLocaleDateString("fr-FR") : "",
                      a.active ? "Actif" : "Inactif",
                    ];
                  });
                  exportArrayToCsv("affectations_agents.csv", header, rows);
                }}
              >
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
                  ) : pagination.currentItems.map((a) => {
                    const matchedAgent = agentsList.find((ag: AgentInfo) => ag.idAgent === a.agentId);
                    const fullName = [
                      a.agentNom ?? matchedAgent?.nom,
                      a.agentPrenom ?? matchedAgent?.prenom,
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const regionDisplay =
                      resolveRegionName(
                        a.agentRegion ?? matchedAgent?.region,
                        a.agentDepartement ?? matchedAgent?.departement
                      ) ||
                      a.agentRegion ||
                      matchedAgent?.region ||
                      a.codeZone ||
                      "-";

                    return (
                    <TableRow key={a.id} className="hover:bg-muted/40 transition-colors border-border/50">
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 font-bold text-xs">
                            {a.agentMatricule ? a.agentMatricule.substring(0, 2).toUpperCase() : 'AG'}
                          </div>
                          <div>
                            <div className="font-medium text-foreground">{a.agentMatricule || "Inconnu"}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">{fullName || "-"}</div>
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
                          {regionDisplay}
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
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
          
          {!isLoading && (
            <div className="px-4 sm:px-6 py-4 border-t border-border bg-muted/10 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
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
