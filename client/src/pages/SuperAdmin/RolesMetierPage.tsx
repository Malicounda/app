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
import { Trash2 } from "lucide-react";
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

export default function RolesMetierPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/roles-metier"],
    queryFn: () => apiRequest<RoleMetier[]>({ url: "/api/roles-metier", method: "GET" }),
  });

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

  const [roleToDelete, setRoleToDelete] = useState<RoleMetier | null>(null);

  const [defaultRoleIds, setDefaultRoleIds] = useState<number[]>([]);

  const roles = useMemo(() => {
    return Array.isArray(data)
      ? data.map((r: any) => ({ ...r, isDefault: !!r.isDefault, isSupervisor: !!r.isSupervisor }))
      : [];
  }, [data]);

  useEffect(() => {
    const defs = roles.filter((r: RoleMetier) => r.isDefault).map((r: RoleMetier) => r.id);
    setDefaultRoleIds(defs);
  }, [roles]);

  const normalizeCode = (value: string) => {
    return value
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .toUpperCase();
  };

  const codeToLabel = (value: string) => {
    const parts = value
      .trim()
      .replace(/_+/g, "_")
      .split("_")
      .filter(Boolean)
      .map((p) => p.toLowerCase());
    const base = parts.join(" ");
    if (!base) return "";
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

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

  return (
    <main className="page-frame-container">
      <div className="page-frame-inner container mx-auto px-4 py-4 space-y-4 max-w-6xl">
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
                    setEditLabelFr(e.target.value);
                  }}
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
            <CardTitle>Rôles métier par défaut</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Les agents créés sans domaine spécifique recevront automatiquement l'un de ces rôles métier.
              Ils pourront se connecter uniquement avec leur matricule (sans mot de passe).
              Vous pouvez sélectionner plusieurs rôles par défaut.
            </p>
            <div className="relative">
              <select
                multiple
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[80px] max-h-[160px]"
                value={defaultRoleIds.map(String)}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                  // Determine which were added/removed
                  const added = selected.filter(id => !defaultRoleIds.includes(id));
                  const removed = defaultRoleIds.filter(id => !selected.includes(id));
                  added.forEach(id => setDefaultMutation.mutate({ id, isDefault: true }));
                  removed.forEach(id => setDefaultMutation.mutate({ id, isDefault: false }));
                }}
              >
                {roles.filter((r) => r.isActive && !r.isSupervisor).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.labelFr} ({r.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Maintenez Ctrl pour sélectionner plusieurs rôles.</p>
            </div>
          </CardContent>
        </Card>

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
                  setLabelFr(e.target.value);
                }}
                placeholder="Chef de division"
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !code || !labelFr}>
                Créer
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Liste</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-6">Chargement...</div>
            ) : (
              <div className={roles.length > 5 ? "max-h-[320px] overflow-y-auto" : ""}>
                <Table>
                  <TableHeader>
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
                            variant={r.isSupervisor ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSupervisorMutation.mutate({ id: r.id, isSupervisor: !r.isSupervisor })}
                            disabled={setSupervisorMutation.isPending || r.isDefault}
                            title={r.isDefault ? "Le rôle par défaut ne peut pas être superviseur" : ""}
                          >
                            {r.isSupervisor ? 'Oui' : 'Non'}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="secondary" size="sm" onClick={() => openEdit(r)} disabled={r.isDefault} title={r.isDefault ? "Impossible de modifier le rôle par défaut" : ""}>
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
      </div>

      <AlertDialog open={!!roleToDelete} onOpenChange={(open) => (!open ? setRoleToDelete(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer ce rôle métier ?
            </AlertDialogDescription>
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
    </main>
  );
}
