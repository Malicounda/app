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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Briefcase,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

type RoleMetier = {
  id: number;
  code: string;
  labelFr: string;
  description?: string | null;
  isActive: boolean;
  isDefault: boolean;
  isSupervisor: boolean;
  createdAt: string;
};

type AgentGrade = {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
};

type RoleProfileType = "standard" | "default" | "supervisor";
type RoleFilter = "all" | "default" | "supervisor" | "standard" | "inactive";

function labelToCode(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function getRoleProfile(r: RoleMetier): RoleProfileType {
  if (r.isSupervisor) return "supervisor";
  if (r.isDefault) return "default";
  return "standard";
}

export default function RolesMetierPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"roles" | "grades">("roles");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ["/api/roles-metier"],
    queryFn: () => apiRequest<RoleMetier[]>({ url: "/api/roles-metier", method: "GET" }),
  });

  const { data: gradesData, isLoading: gradesLoading } = useQuery({
    queryKey: ["/api/agent-grades"],
    queryFn: () => apiRequest<AgentGrade[]>({ url: "/api/agent-grades", method: "GET" }),
  });

  const roles = useMemo(
    () =>
      (Array.isArray(rolesData) ? rolesData : [])
        .map((r: any) => ({ ...r, isDefault: !!r.isDefault, isSupervisor: !!r.isSupervisor }))
        .sort((a, b) => a.labelFr.localeCompare(b.labelFr, "fr")),
    [rolesData]
  );

  const grades = useMemo(
    () =>
      (Array.isArray(gradesData) ? gradesData : [])
        .filter((g) => g.isActive)
        .sort((a, b) => a.label.localeCompare(b.label, "fr")),
    [gradesData]
  );

  // ── Role states ──────────────────────────────────────────────────────────────
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [switchingRoleId, setSwitchingRoleId] = useState<number | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const [editingRole, setEditingRole] = useState<RoleMetier | null>(null);
  const [editRoleLabel, setEditRoleLabel] = useState("");
  const [editRoleCode, setEditRoleCode] = useState("");
  const [editRoleCodeTouched, setEditRoleCodeTouched] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<RoleMetier | null>(null);

  // ── Grade states ─────────────────────────────────────────────────────────────
  const [newGradeLabel, setNewGradeLabel] = useState("");
  const [gradeSearch, setGradeSearch] = useState("");
  const [editingGrade, setEditingGrade] = useState<AgentGrade | null>(null);
  const [editGradeLabel, setEditGradeLabel] = useState("");
  const [editGradeCode, setEditGradeCode] = useState("");
  const [editGradeCodeTouched, setEditGradeCodeTouched] = useState(false);
  const [gradeToDelete, setGradeToDelete] = useState<AgentGrade | null>(null);

  // ── Role Mutations ───────────────────────────────────────────────────────────
  const createRoleMutation = useMutation({
    mutationFn: async () => {
      const labelFr = newRoleLabel.trim().replace(/\s+/g, " ");
      const code = labelToCode(labelFr);
      if (!labelFr || !code) throw new Error("Veuillez saisir un nom de rôle valide.");
      return apiRequest<RoleMetier>({
        url: "/api/roles-metier",
        method: "POST",
        data: { code, labelFr, isActive: true },
      });
    },
    onSuccess: async () => {
      setNewRoleLabel("");
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: "Rôle métier ajouté", description: "Il est immédiatement disponible dans la liste." });
    },
    onError: (e: any) => {
      toast({ title: "Création impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (vars: { id: number; code: string; labelFr: string }) => {
      return apiRequest<RoleMetier>({
        url: `/api/roles-metier/${vars.id}`,
        method: "PUT",
        data: { code: vars.code, labelFr: vars.labelFr },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: "Rôle métier modifié" });
      setEditingRole(null);
    },
    onError: (e: any) => {
      toast({ title: "Modification impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest<RoleMetier>({ url: `/api/roles-metier/${id}/hard`, method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: "Rôle métier supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Suppression impossible", description: e?.body?.message || e?.message || "Ce rôle est peut-être utilisé.", variant: "destructive" });
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (payload: { id: number; isActive: boolean }) =>
      apiRequest<RoleMetier>({
        url: `/api/roles-metier/${payload.id}/active`,
        method: "PATCH",
        data: { isActive: payload.isActive },
      }),
    onSuccess: async (_data, vars) => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: vars.isActive ? "Rôle réactivé" : "Rôle désactivé" });
    },
    onError: (e: any) => {
      toast({ title: "Action impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  /** Bascule en 1 clic entre Standard / Terrain (Par défaut) / Superviseur */
  const handleSwitchProfile = async (role: RoleMetier, next: RoleProfileType) => {
    const current = getRoleProfile(role);
    if (current === next || switchingRoleId === role.id) return;
    setSwitchingRoleId(role.id);
    try {
      if (next === "standard") {
        if (role.isDefault) {
          await apiRequest({ url: `/api/roles-metier/${role.id}/default`, method: "PATCH", data: { isDefault: false } });
        }
        if (role.isSupervisor) {
          await apiRequest({ url: `/api/roles-metier/${role.id}/supervisor`, method: "PATCH", data: { isSupervisor: false } });
        }
      } else if (next === "default") {
        await apiRequest({ url: `/api/roles-metier/${role.id}/default`, method: "PATCH", data: { isDefault: true } });
      } else if (next === "supervisor") {
        await apiRequest({ url: `/api/roles-metier/${role.id}/supervisor`, method: "PATCH", data: { isSupervisor: true } });
      }
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
    } catch (e: any) {
      toast({
        title: "Changement impossible",
        description: e?.body?.message || e?.message || "Erreur lors de la mise à jour du profil.",
        variant: "destructive",
      });
    } finally {
      setSwitchingRoleId(null);
    }
  };

  const handleBulkDefault = async (enable: boolean) => {
    const targets = roles.filter((r) => r.isActive && !r.isSupervisor && (enable ? !r.isDefault : r.isDefault));
    if (!targets.length) return;
    setBulkPending(true);
    try {
      await Promise.all(
        targets.map((r) =>
          apiRequest({
            url: `/api/roles-metier/${r.id}/default`,
            method: "PATCH",
            data: { isDefault: enable },
          })
        )
      );
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({
        title: enable
          ? `${targets.length} rôle(s) passé(s) en Terrain (Par défaut)`
          : `${targets.length} rôle(s) retiré(s) des rôles par défaut`,
      });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Action partielle", variant: "destructive" });
    } finally {
      setBulkPending(false);
    }
  };

  // ── Grade Mutations ──────────────────────────────────────────────────────────
  const createGradeMutation = useMutation({
    mutationFn: async () => {
      const label = newGradeLabel.trim().replace(/\s+/g, " ");
      const code = labelToCode(label);
      if (!label || !code) throw new Error("Veuillez saisir un nom de grade valide.");
      return apiRequest<AgentGrade>({
        url: "/api/agent-grades",
        method: "POST",
        data: { code, label },
      });
    },
    onSuccess: async () => {
      setNewGradeLabel("");
      await qc.invalidateQueries({ queryKey: ["/api/agent-grades"] });
      toast({ title: "Grade ajouté" });
    },
    onError: (e: any) => {
      toast({ title: "Ajout impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  const updateGradeMutation = useMutation({
    mutationFn: async (vars: { id: number; code: string; label: string }) =>
      apiRequest<AgentGrade>({
        url: `/api/agent-grades/${vars.id}`,
        method: "PUT",
        data: { code: vars.code, label: vars.label },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agent-grades"] });
      toast({ title: "Grade modifié" });
      setEditingGrade(null);
    },
    onError: (e: any) => {
      toast({ title: "Modification impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  const deleteGradeMutation = useMutation({
    mutationFn: async (id: number) => apiRequest({ url: `/api/agent-grades/${id}`, method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agent-grades"] });
      toast({ title: "Grade supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Suppression impossible", description: e?.body?.message || e?.message || "Erreur serveur", variant: "destructive" });
    },
  });

  // ── Derived metrics & filtered lists ─────────────────────────────────────────
  const stats = useMemo(() => {
    const active = roles.filter((r) => r.isActive).length;
    const defaults = roles.filter((r) => r.isActive && r.isDefault).length;
    const supervisors = roles.filter((r) => r.isActive && r.isSupervisor).length;
    const standards = roles.filter((r) => r.isActive && !r.isDefault && !r.isSupervisor).length;
    const inactive = roles.filter((r) => !r.isActive).length;
    const eligibleForDefault = roles.filter((r) => r.isActive && !r.isSupervisor).length;
    return { total: roles.length, active, defaults, supervisors, standards, inactive, eligibleForDefault };
  }, [roles]);

  const filteredRoles = useMemo(() => {
    const q = roleSearch.trim().toLowerCase();
    return roles.filter((r) => {
      if (roleFilter === "default" && !(r.isActive && r.isDefault)) return false;
      if (roleFilter === "supervisor" && !(r.isActive && r.isSupervisor)) return false;
      if (roleFilter === "standard" && !(r.isActive && !r.isDefault && !r.isSupervisor)) return false;
      if (roleFilter === "inactive" && r.isActive) return false;
      if (!q) return true;
      return r.labelFr.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    });
  }, [roles, roleFilter, roleSearch]);

  const filteredGrades = useMemo(() => {
    const q = gradeSearch.trim().toLowerCase();
    if (!q) return grades;
    return grades.filter((g) => g.label.toLowerCase().includes(q) || g.code.toLowerCase().includes(q));
  }, [grades, gradeSearch]);

  const openEditRole = (r: RoleMetier) => {
    setEditingRole(r);
    setEditRoleLabel(r.labelFr || "");
    setEditRoleCode(r.code || "");
    setEditRoleCodeTouched(true); // Par défaut, préserver le code existant sauf si l'admin le modifie explicitement
  };

  const openEditGrade = (g: AgentGrade) => {
    setEditingGrade(g);
    setEditGradeLabel(g.label || "");
    setEditGradeCode(g.code || "");
    setEditGradeCodeTouched(true);
  };

  const previewRoleCode = labelToCode(newRoleLabel);
  const previewGradeCode = labelToCode(newGradeLabel);

  return (
    <div className="space-y-5 w-full min-w-0 max-w-6xl mx-auto py-3 sm:py-4">
      {/* En-tête + Onglets principaux */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Rôles métier &amp; Grades</h2>
          <p className="text-sm text-muted-foreground">
            Gérez les fonctions des agents, les accès terrain / superviseur et les grades en un seul endroit.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-xl bg-muted/70 p-1 self-start border">
          <button
            type="button"
            onClick={() => setActiveTab("roles")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "roles"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Briefcase className="h-4 w-4" />
            <span>Rôles métier</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {stats.total}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("grades")}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === "grades"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Award className="h-4 w-4" />
            <span>Grades</span>
            <Badge variant="secondary" className="text-xs px-1.5 py-0">
              {grades.length}
            </Badge>
          </button>
        </div>
      </div>

      {/* ══════════════════ ONGLET 1 : RÔLES MÉTIER ══════════════════ */}
      {activeTab === "roles" && (
        <div className="space-y-4">
          {/* 3 mini-indicateurs synthétiques */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="border-slate-200/80">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Total rôles métier</div>
                  <div className="text-xl font-bold leading-tight">
                    {stats.total}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({stats.active} actif{stats.active > 1 ? "s" : ""})
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-200/80 bg-emerald-50/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-emerald-800/80">Terrain (Par défaut)</div>
                  <div className="text-xl font-bold text-emerald-900 leading-tight">
                    {stats.defaults}{" "}
                    <span className="text-xs font-normal text-emerald-800/75">connexion matricule seul</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200/80 bg-blue-50/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Shield className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-blue-800/80">Superviseurs</div>
                  <div className="text-xl font-bold text-blue-900 leading-tight">
                    {stats.supervisors}{" "}
                    <span className="text-xs font-normal text-blue-800/75">espace Superviseur</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Barre de création rapide en 1 champ naturel */}
          <Card>
            <CardContent className="p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newRoleLabel.trim() && previewRoleCode && !createRoleMutation.isPending) {
                    createRoleMutation.mutate();
                  }
                }}
                className="flex flex-col sm:flex-row sm:items-end gap-3"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <Label htmlFor="new-role-label" className="text-sm font-medium">
                    Ajouter un nouveau rôle métier
                  </Label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Input
                      id="new-role-label"
                      value={newRoleLabel}
                      onChange={(e) => setNewRoleLabel(e.target.value)}
                      placeholder="Ex. : Chef de division, Garde forestier, Adjoint secteur..."
                      className="flex-1"
                    />
                    {previewRoleCode && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2.5 py-1.5 text-xs font-mono text-muted-foreground shrink-0 max-w-full truncate">
                        Code : {previewRoleCode}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={createRoleMutation.isPending || !newRoleLabel.trim() || !previewRoleCode}
                  className="gap-1.5 shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {createRoleMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Ajouter le rôle
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tableau unifié des Rôles métier */}
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="p-4 space-y-4">
              {/* Barre outils : filtres + recherche + actions groupées */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      { key: "all", label: `Tous (${stats.total})` },
                      { key: "default", label: `Terrain (${stats.defaults})` },
                      { key: "supervisor", label: `Superviseurs (${stats.supervisors})` },
                      { key: "standard", label: `Standard (${stats.standards})` },
                      ...(stats.inactive > 0 ? [{ key: "inactive" as const, label: `Inactifs (${stats.inactive})` }] : []),
                    ] as Array<{ key: RoleFilter; label: string }>
                  ).map((f) => (
                    <Button
                      key={f.key}
                      type="button"
                      size="sm"
                      variant={roleFilter === f.key ? "default" : "outline"}
                      onClick={() => setRoleFilter(f.key)}
                      className="h-8 text-xs"
                    >
                      {f.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 sm:flex-none sm:w-64">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      placeholder="Rechercher un rôle..."
                      className="h-8 pl-8 pr-7 text-sm"
                    />
                    {roleSearch && (
                      <button
                        type="button"
                        onClick={() => setRoleSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Effacer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={bulkPending || stats.defaults >= stats.eligibleForDefault || stats.eligibleForDefault === 0}
                    onClick={() => void handleBulkDefault(true)}
                    title="Passer tous les rôles actifs non-superviseurs en Terrain (Par défaut)"
                  >
                    Tout mettre Terrain
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={bulkPending || stats.defaults === 0}
                    onClick={() => void handleBulkDefault(false)}
                    title="Retirer tous les rôles du mode Terrain (Par défaut)"
                  >
                    Retirer Terrain
                  </Button>
                </div>
              </div>

              {/* Légende claire */}
              <p className="text-xs text-muted-foreground">
                Choisissez directement le profil de chaque rôle en 1 clic :{" "}
                <strong className="text-foreground">Standard</strong> (fiche agent classique),{" "}
                <strong className="text-emerald-700">Terrain (Par défaut)</strong> (connexion par matricule seul) ou{" "}
                <strong className="text-blue-700">Superviseur</strong> (espace superviseur).
              </p>

              {/* Table */}
              {rolesLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement des rôles métier…
                </div>
              ) : filteredRoles.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg">
                  Aucun rôle métier ne correspond à ce filtre.
                </div>
              ) : (
                <div className="w-full overflow-x-auto max-h-[min(560px,62vh)] overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur-xs">
                      <TableRow>
                        <TableHead>Rôle métier</TableHead>
                        <TableHead className="w-[310px]">Profil d&apos;accès (1 clic)</TableHead>
                        <TableHead className="text-right w-[180px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoles.map((r) => {
                        const profile = getRoleProfile(r);
                        const isBusy = switchingRoleId === r.id || bulkPending;
                        return (
                          <TableRow key={r.id} className={!r.isActive ? "opacity-60 bg-muted/20" : ""}>
                            <TableCell className="min-w-[200px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm text-foreground">{r.labelFr}</span>
                                {!r.isActive && (
                                  <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50">
                                    Inactif
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] font-mono text-muted-foreground mt-0.5 break-all">
                                {r.code}
                              </div>
                            </TableCell>

                            <TableCell>
                              <div
                                className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5 gap-0.5"
                                title={!r.isActive ? "Réactivez ce rôle pour changer son profil" : undefined}
                              >
                                <button
                                  type="button"
                                  disabled={!r.isActive || isBusy}
                                  onClick={() => void handleSwitchProfile(r, "standard")}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
                                    profile === "standard"
                                      ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-200"
                                      : "text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  Standard
                                </button>
                                <button
                                  type="button"
                                  disabled={!r.isActive || isBusy}
                                  onClick={() => void handleSwitchProfile(r, "default")}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
                                    profile === "default"
                                      ? "bg-emerald-600 text-white shadow-xs"
                                      : "text-muted-foreground hover:text-emerald-700"
                                  }`}
                                >
                                  Terrain
                                </button>
                                <button
                                  type="button"
                                  disabled={!r.isActive || isBusy}
                                  onClick={() => void handleSwitchProfile(r, "supervisor")}
                                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all disabled:opacity-50 ${
                                    profile === "supervisor"
                                      ? "bg-blue-600 text-white shadow-xs"
                                      : "text-muted-foreground hover:text-blue-700"
                                  }`}
                                >
                                  Superviseur
                                </button>
                              </div>
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 px-2.5 gap-1 text-xs"
                                  onClick={() => openEditRole(r)}
                                  title="Modifier le nom ou le code"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  <span className="hidden sm:inline">Modifier</span>
                                </Button>

                                {r.isActive ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                                    onClick={() => setActiveMutation.mutate({ id: r.id, isActive: false })}
                                    disabled={setActiveMutation.isPending || r.isDefault}
                                    title={
                                      r.isDefault
                                        ? "Passez d'abord ce rôle en Standard pour le désactiver"
                                        : "Désactiver ce rôle"
                                    }
                                  >
                                    <Power className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                                    onClick={() => setActiveMutation.mutate({ id: r.id, isActive: true })}
                                    disabled={setActiveMutation.isPending}
                                    title="Réactiver ce rôle"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}

                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => setRoleToDelete(r)}
                                  disabled={deleteRoleMutation.isPending || r.isDefault}
                                  title={
                                    r.isDefault
                                      ? "Passez d'abord ce rôle en Standard pour le supprimer"
                                      : "Supprimer ce rôle"
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ══════════════════ ONGLET 2 : GRADES ══════════════════ */}
      {activeTab === "grades" && (
        <div className="space-y-4">
          {/* Barre d'ajout rapide d'un grade */}
          <Card>
            <CardContent className="p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newGradeLabel.trim() && previewGradeCode && !createGradeMutation.isPending) {
                    createGradeMutation.mutate();
                  }
                }}
                className="flex flex-col sm:flex-row sm:items-end gap-3"
              >
                <div className="flex-1 space-y-1.5 min-w-0">
                  <Label htmlFor="new-grade-label" className="text-sm font-medium">
                    Ajouter un grade (affiché dans les fiches agents)
                  </Label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Input
                      id="new-grade-label"
                      value={newGradeLabel}
                      onChange={(e) => setNewGradeLabel(e.target.value)}
                      placeholder="Ex. : Sous-lieutenant, Capitaine, FRG..."
                      className="flex-1"
                    />
                    {previewGradeCode && (
                      <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1.5 text-xs font-mono text-muted-foreground shrink-0">
                        Code : {previewGradeCode}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={createGradeMutation.isPending || !newGradeLabel.trim() || !previewGradeCode}
                  className="gap-1.5 shrink-0 bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {createGradeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Ajouter le grade
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Liste des grades avec recherche, modification et suppression confirmée */}
          <Card className="min-w-0 overflow-hidden">
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-sm font-medium text-muted-foreground">
                  {grades.length} grade{grades.length > 1 ? "s" : ""} disponible{grades.length > 1 ? "s" : ""} dans les listes déroulantes agents
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={gradeSearch}
                    onChange={(e) => setGradeSearch(e.target.value)}
                    placeholder="Rechercher un grade..."
                    className="h-8 pl-8 pr-7 text-sm"
                  />
                  {gradeSearch && (
                    <button
                      type="button"
                      onClick={() => setGradeSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Effacer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {gradesLoading ? (
                <div className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement des grades…
                </div>
              ) : filteredGrades.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg">
                  Aucun grade trouvé.
                </div>
              ) : (
                <div className="w-full overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/60">
                      <TableRow>
                        <TableHead>Libellé du grade</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead className="text-right w-[160px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGrades.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="font-medium text-sm">{g.label}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{g.code}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2.5 gap-1 text-xs"
                                onClick={() => openEditGrade(g)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Modifier
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => setGradeToDelete(g)}
                                disabled={deleteGradeMutation.isPending}
                                title="Supprimer ce grade"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Dialog Modifier Rôle Métier ───────────────────────────────────────── */}
      <Dialog open={!!editingRole} onOpenChange={(open) => !open && setEditingRole(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le rôle métier</DialogTitle>
            <DialogDescription>
              Modifiez l&apos;intitulé affiché (ou le code technique) sans perdre les affectations existantes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-role-label">Nom du rôle</Label>
              <Input
                id="edit-role-label"
                value={editRoleLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditRoleLabel(val);
                  if (!editRoleCodeTouched) {
                    setEditRoleCode(labelToCode(val));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-role-code" className="text-xs text-muted-foreground">
                Code technique
              </Label>
              <Input
                id="edit-role-code"
                value={editRoleCode}
                onChange={(e) => {
                  setEditRoleCodeTouched(true);
                  setEditRoleCode(labelToCode(e.target.value));
                }}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingRole(null)} disabled={updateRoleMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                editingRole &&
                updateRoleMutation.mutate({
                  id: editingRole.id,
                  code: editRoleCode.trim(),
                  labelFr: editRoleLabel.trim().replace(/\s+/g, " "),
                })
              }
              disabled={updateRoleMutation.isPending || !editRoleLabel.trim() || !editRoleCode.trim()}
            >
              {updateRoleMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Modifier Grade ─────────────────────────────────────────────── */}
      <Dialog open={!!editingGrade} onOpenChange={(open) => !open && setEditingGrade(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le grade</DialogTitle>
            <DialogDescription>
              Mettez à jour le libellé ou le code de ce grade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-grade-label">Libellé du grade</Label>
              <Input
                id="edit-grade-label"
                value={editGradeLabel}
                onChange={(e) => {
                  const val = e.target.value;
                  setEditGradeLabel(val);
                  if (!editGradeCodeTouched) {
                    setEditGradeCode(labelToCode(val));
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-grade-code" className="text-xs text-muted-foreground">
                Code technique
              </Label>
              <Input
                id="edit-grade-code"
                value={editGradeCode}
                onChange={(e) => {
                  setEditGradeCodeTouched(true);
                  setEditGradeCode(labelToCode(e.target.value));
                }}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditingGrade(null)} disabled={updateGradeMutation.isPending}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                editingGrade &&
                updateGradeMutation.mutate({
                  id: editingGrade.id,
                  code: editGradeCode.trim(),
                  label: editGradeLabel.trim().replace(/\s+/g, " "),
                })
              }
              disabled={updateGradeMutation.isPending || !editGradeLabel.trim() || !editGradeCode.trim()}
            >
              {updateGradeMutation.isPending ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation suppression Rôle Métier ──────────────────────────────── */}
      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => !open && setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce rôle métier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer le rôle{" "}
              <strong className="text-foreground">{roleToDelete?.labelFr}</strong> ({roleToDelete?.code}) ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteRoleMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteRoleMutation.isPending}
              onClick={() => {
                if (!roleToDelete) return;
                deleteRoleMutation.mutate(roleToDelete.id);
                setRoleToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Confirmation suppression Grade ────────────────────────────────────── */}
      <AlertDialog open={!!gradeToDelete} onOpenChange={(open) => !open && setGradeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce grade ?</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer le grade{" "}
              <strong className="text-foreground">{gradeToDelete?.label}</strong> ({gradeToDelete?.code}) ?
              Il n&apos;apparaîtra plus dans les formulaires des agents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteGradeMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleteGradeMutation.isPending}
              onClick={() => {
                if (!gradeToDelete) return;
                deleteGradeMutation.mutate(gradeToDelete.id);
                setGradeToDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
