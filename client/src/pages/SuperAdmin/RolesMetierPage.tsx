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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

export default function RolesMetierPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/roles-metier"],
    queryFn: () => apiRequest<RoleMetier[]>({ url: "/api/roles-metier", method: "GET" }),
  });

  const { data: gradesData, isLoading: gradesLoading } = useQuery({
    queryKey: ["/api/agent-grades"],
    queryFn: () => apiRequest<AgentGrade[]>({ url: "/api/agent-grades", method: "GET" }),
  });

  const grades = useMemo(() => (Array.isArray(gradesData) ? gradesData.filter((g) => g.isActive) : []), [gradesData]);

  const updateMutation = useMutation({
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
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Modification impossible", variant: "destructive" });
    },
  });

  const [editing, setEditing] = useState<RoleMetier | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editLabelFr, setEditLabelFr] = useState("");
  const [editLabelTouched, setEditLabelTouched] = useState(false);

  const [code, setCode] = useState("");
  const [labelFr, setLabelFr] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);

  const [gradeCode, setGradeCode] = useState("");
  const [gradeLabel, setGradeLabel] = useState("");
  const [gradeLabelTouched, setGradeLabelTouched] = useState(false);

  const [roleToDelete, setRoleToDelete] = useState<RoleMetier | null>(null);
  const [defaultRoleIds, setDefaultRoleIds] = useState<number[]>([]);
  const [bulkDefaultPending, setBulkDefaultPending] = useState(false);

  const roles = useMemo(() => {
    return Array.isArray(data)
      ? data.map((r: any) => ({ ...r, isDefault: !!r.isDefault, isSupervisor: !!r.isSupervisor }))
      : [];
  }, [data]);

  const selectableDefaultRoles = useMemo(
    () => roles.filter((r) => r.isActive && !r.isSupervisor),
    [roles]
  );

  useEffect(() => {
    const defs = roles.filter((r: RoleMetier) => r.isDefault).map((r: RoleMetier) => r.id);
    setDefaultRoleIds(defs);
  }, [roles]);

  const normalizeCode = (value: string) =>
    value
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .toUpperCase();

  /** Libellé en MAJUSCULES avec espaces (comme le code mais lisible) */
  const codeToLabel = (value: string) => normalizeCode(value).replace(/_/g, " ");

  const normalizeLabelInput = (value: string) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();

  const openEdit = (r: RoleMetier) => {
    setEditing(r);
    setEditCode(r.code || "");
    setEditLabelFr(r.labelFr || "");
    setEditLabelTouched(false);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<RoleMetier>({
        url: "/api/roles-metier",
        method: "POST",
        data: { code, labelFr, isActive: true },
      });
    },
    onSuccess: async () => {
      setCode("");
      setLabelFr("");
      setLabelTouched(false);
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: "Rôle métier créé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Création impossible", variant: "destructive" });
    },
  });

  const createGradeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<AgentGrade>({
        url: "/api/agent-grades",
        method: "POST",
        data: { code: gradeCode, label: gradeLabel || codeToLabel(gradeCode) },
      });
    },
    onSuccess: async () => {
      setGradeCode("");
      setGradeLabel("");
      setGradeLabelTouched(false);
      await qc.invalidateQueries({ queryKey: ["/api/agent-grades"] });
      toast({ title: "Grade ajouté" });
    },
    onError: (e: any) => {
      toast({
        title: "Erreur",
        description: e?.body?.message || e?.message || "Ajout impossible",
        variant: "destructive",
      });
    },
  });

  const deleteGradeMutation = useMutation({
    mutationFn: async (id: number) => apiRequest({ url: `/api/agent-grades/${id}`, method: "DELETE" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/agent-grades"] });
      toast({ title: "Grade supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest<RoleMetier>({
        url: `/api/roles-metier/${id}/hard`,
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
      toast({ title: "Rôle métier supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
    },
  });

  const setActiveMutation = useMutation({
    mutationFn: async (payload: { id: number; isActive: boolean }) => {
      return apiRequest<RoleMetier>({
        url: `/api/roles-metier/${payload.id}/active`,
        method: "PATCH",
        data: { isActive: payload.isActive },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (payload: { id: number; isDefault: boolean }) => {
      return apiRequest<RoleMetier>({
        url: `/api/roles-metier/${payload.id}/default`,
        method: "PATCH",
        data: { isDefault: payload.isDefault },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" });
    },
  });

  const setSupervisorMutation = useMutation({
    mutationFn: async (payload: { id: number; isSupervisor: boolean }) => {
      return apiRequest<RoleMetier>({
        url: `/api/roles-metier/${payload.id}/supervisor`,
        method: "PATCH",
        data: { isSupervisor: payload.isSupervisor },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/roles-metier"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Action impossible", variant: "destructive" });
    },
  });

  const handleSelectAllDefaults = async () => {
    setBulkDefaultPending(true);
    try {
      for (const r of selectableDefaultRoles) {
        if (!r.isDefault) {
          await setDefaultMutation.mutateAsync({ id: r.id, isDefault: true });
        }
      }
      toast({ title: "Tous les rôles sélectionnés" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Sélection partielle", variant: "destructive" });
    } finally {
      setBulkDefaultPending(false);
    }
  };

  const handleClearAllDefaults = async () => {
    setBulkDefaultPending(true);
    try {
      for (const r of selectableDefaultRoles) {
        if (r.isDefault) {
          await setDefaultMutation.mutateAsync({ id: r.id, isDefault: false });
        }
      }
      toast({ title: "Sélection par défaut effacée" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Action partielle", variant: "destructive" });
    } finally {
      setBulkDefaultPending(false);
    }
  };

  const activeRolesCount = roles.filter((r) => r.isActive).length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">Contrôle des Rôles Métier</h2>
        <div className="text-sm text-muted-foreground">Administration centrale - Rôles métier</div>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle métier</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Code</Label>
              <Input
                value={editCode}
                onChange={(e) => {
                  const next = normalizeCode(e.target.value);
                  setEditCode(next);
                  if (!editLabelTouched) {
                    setEditLabelFr(codeToLabel(next));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Libellé</Label>
              <Input
                value={editLabelFr}
                onChange={(e) => {
                  setEditLabelTouched(true);
                  setEditLabelFr(normalizeLabelInput(e.target.value));
                }}
                onBlur={() => setEditLabelFr((v) => normalizeLabelInput(v))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                editing &&
                updateMutation.mutate({
                  id: editing.id,
                  code: editCode,
                  labelFr: editLabelFr,
                })
              }
              disabled={updateMutation.isPending || !editCode || !editLabelFr}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Créer un rôle métier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={code}
              onChange={(e) => {
                const next = normalizeCode(e.target.value);
                setCode(next);
                if (!labelTouched) {
                  setLabelFr(codeToLabel(next));
                }
              }}
              placeholder="CHEF_DIVISION"
            />
          </div>
          <div className="space-y-2">
            <Label>Libellé</Label>
            <Input
              value={labelFr}
              onChange={(e) => {
                setLabelTouched(true);
                setLabelFr(normalizeLabelInput(e.target.value));
              }}
              onBlur={() => setLabelFr((v) => normalizeLabelInput(v))}
              placeholder="CHEF DE DIVISION"
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !code || !labelFr}>
              Créer
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>Rôles métier par défaut</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkDefaultPending || selectableDefaultRoles.length === 0}
                onClick={() => void handleSelectAllDefaults()}
              >
                Tout sélectionner
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkDefaultPending || defaultRoleIds.length === 0}
                onClick={() => void handleClearAllDefaults()}
              >
                Tout désélectionner
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Les agents créés sans domaine spécifique recevront automatiquement l&apos;un de ces rôles métier.
              Connexion possible avec le matricule seul. {selectableDefaultRoles.length} rôle(s) éligible(s),{" "}
              {defaultRoleIds.length} sélectionné(s).
            </p>
            <div className="border rounded-md divide-y max-h-[280px] overflow-y-auto">
              {selectableDefaultRoles.map((r) => {
                const isSelected = defaultRoleIds.includes(r.id);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setDefaultMutation.mutate({ id: r.id, isDefault: !isSelected })}
                    disabled={setDefaultMutation.isPending || bulkDefaultPending}
                    className={`w-full flex items-center justify-between px-4 py-3 text-sm text-left transition-colors hover:bg-primary/10 hover:text-primary ${
                      isSelected ? "bg-primary/15 text-primary font-medium" : ""
                    }`}
                  >
                    <span>
                      {r.labelFr} ({r.code})
                    </span>
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded border ${
                        isSelected ? "bg-primary border-primary text-primary-foreground" : "border-input bg-background"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Cliquez sur un rôle pour l&apos;ajouter ou le retirer de la sélection par défaut.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Grades (liste déroulante agents)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Les grades ajoutés ici apparaissent dans les formulaires Ajouter / Modifier un agent.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Code grade</Label>
                <Input
                  value={gradeCode}
                  onChange={(e) => {
                    const next = normalizeCode(e.target.value);
                    setGradeCode(next);
                    if (!gradeLabelTouched) setGradeLabel(codeToLabel(next));
                  }}
                  placeholder="SOUS_LIEUTENANT"
                />
              </div>
              <div className="space-y-2">
                <Label>Libellé</Label>
                <Input
                  value={gradeLabel}
                  onChange={(e) => {
                    setGradeLabelTouched(true);
                    setGradeLabel(normalizeLabelInput(e.target.value));
                  }}
                  onBlur={() => setGradeLabel((v) => normalizeLabelInput(v))}
                  placeholder="SOUS LIEUTENANT"
                />
              </div>
            </div>
            <Button
              type="button"
              onClick={() => createGradeMutation.mutate()}
              disabled={createGradeMutation.isPending || !gradeCode.trim()}
            >
              Ajouter le grade
            </Button>
            <div className="border rounded-md divide-y max-h-[220px] overflow-y-auto">
              {gradesLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Chargement…</div>
              ) : grades.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Aucun grade défini.</div>
              ) : (
                grades.map((g) => (
                  <div key={g.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <span>
                      {g.label} <span className="text-muted-foreground">({g.code})</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteGradeMutation.mutate(g.id)}
                      disabled={deleteGradeMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">Total : {grades.length} grade(s)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle>Liste</CardTitle>
          <span className="text-sm font-medium text-muted-foreground">
            Total : {roles.length} rôle(s)
            {activeRolesCount !== roles.length ? ` (${activeRolesCount} actif(s))` : ""}
          </span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6">Chargement...</div>
          ) : (
            <div className="w-full overflow-x-auto max-h-[min(520px,60vh)] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Superviseur</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.code}</TableCell>
                      <TableCell>{r.labelFr}</TableCell>
                      <TableCell>
                        <Button
                          variant={r.isSupervisor ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSupervisorMutation.mutate({ id: r.id, isSupervisor: !r.isSupervisor })}
                          disabled={setSupervisorMutation.isPending || r.isDefault}
                          title={r.isDefault ? "Le rôle par défaut ne peut pas être superviseur" : ""}
                        >
                          {r.isSupervisor ? "Oui" : "Non"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEdit(r)}
                            disabled={r.isDefault}
                            title={r.isDefault ? "Impossible de modifier le rôle par défaut" : ""}
                          >
                            Modifier
                          </Button>
                          {r.isActive ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setActiveMutation.mutate({ id: r.id, isActive: false })}
                              disabled={setActiveMutation.isPending || r.isDefault}
                              title={r.isDefault ? "Impossible de désactiver le rôle par défaut" : ""}
                            >
                              Désactiver
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => setActiveMutation.mutate({ id: r.id, isActive: true })}
                              disabled={setActiveMutation.isPending}
                            >
                              Réactiver
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRoleToDelete(r)}
                            disabled={deleteMutation.isPending || r.isDefault}
                            title={r.isDefault ? "Impossible de supprimer le rôle par défaut" : ""}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
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

      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => (!open ? setRoleToDelete(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>Voulez-vous vraiment supprimer ce rôle métier ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!roleToDelete) return;
                deleteMutation.mutate(roleToDelete.id);
                setRoleToDelete(null);
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
