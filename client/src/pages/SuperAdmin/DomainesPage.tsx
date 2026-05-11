import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type Domaine = {
  id: number;
  nomDomaine: string;
  codeSlug: string;
  description?: string | null;
  couleurTheme?: string | null;
  isActive: boolean;
  createdAt: string;
};

type ResetDataType = {
  value: string;
  label: string;
  tables: { tableName: string; display: string }[];
};

export default function DomainesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["/api/domaines"],
    queryFn: () => apiRequest<Domaine[]>({ url: "/api/domaines", method: "GET" }),
  });

  const createDefaultMutation = useMutation({
    mutationFn: async (vars: { nomDomaine: string; codeSlug: string }) => {
      return apiRequest<Domaine>({
        url: "/api/domaines",
        method: "POST",
        data: { nomDomaine: vars.nomDomaine, codeSlug: vars.codeSlug },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/domaines"] });
      await qc.invalidateQueries({ queryKey: ["/api/domaines/public/active"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Création impossible", variant: "destructive" });
    },
  });

  const openEdit = (d: Domaine) => {
    setEditing(d);
    setEditNomDomaine(d.nomDomaine || "");
    setEditCodeSlug(d.codeSlug || "");
    setEditSlugTouched(false);
  };

  const domaines = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const [searchNom, setSearchNom] = useState("");

  const filteredDomaines = useMemo(() => {
    const q = searchNom.trim().toLowerCase();
    if (!q) return domaines;
    return domaines.filter((d) => {
      const nom = String(d?.nomDomaine || "").toLowerCase();
      const desc = String(d?.description || "").toLowerCase();
      return nom.includes(q) || desc.includes(q);
    });
  }, [domaines, searchNom]);

  const defaultDomaines = useMemo(
    () => [
      { nomDomaine: 'CHASSE', codeSlug: 'Chasse' },
      { nomDomaine: 'PRODUITS FORESTIERS', codeSlug: 'Produits_forestiers' },
      { nomDomaine: 'REBOISEMENT', codeSlug: 'Reboisement' },
      { nomDomaine: 'ALERTE', codeSlug: 'Alerte' },
    ],
    []
  );

  const missingDefaultDomaines = useMemo(() => {
    const existing = new Set(domaines.map((d) => String(d?.nomDomaine || '').trim().toUpperCase()));
    return defaultDomaines.filter((d) => !existing.has(d.nomDomaine));
  }, [defaultDomaines, domaines]);

  const [nomDomaine, setNomDomaine] = useState("");
  const [codeSlug, setCodeSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  const [editing, setEditing] = useState<Domaine | null>(null);
  const [editNomDomaine, setEditNomDomaine] = useState("");
  const [editCodeSlug, setEditCodeSlug] = useState("");
  const [editSlugTouched, setEditSlugTouched] = useState(false);

  const normalizeNom = (value: string) => {
    return value.toUpperCase();
  };

  const toSlug = (value: string) => {
    const base = value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_");
    if (!base) return base;
    return base.charAt(0).toUpperCase() + base.slice(1);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<Domaine>({
        url: "/api/domaines",
        method: "POST",
        data: { nomDomaine, codeSlug },
      });
    },
    onSuccess: async () => {
      setNomDomaine("");
      setCodeSlug("");
      setSlugTouched(false);
      await qc.invalidateQueries({ queryKey: ["/api/domaines"] });
      await qc.invalidateQueries({ queryKey: ["/api/domaines/public/active"] });
      toast({ title: "Domaine créé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Création impossible", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: number; nomDomaine: string; codeSlug: string }) => {
      return apiRequest<Domaine>({
        url: `/api/domaines/${vars.id}`,
        method: "PUT",
        data: { nomDomaine: vars.nomDomaine, codeSlug: vars.codeSlug },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/domaines"] });
      await qc.invalidateQueries({ queryKey: ["/api/domaines/public/active"] });
      toast({ title: "Domaine modifié" });
      setEditing(null);
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Modification impossible", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (vars: { id: number; isActive: boolean }) => {
      return apiRequest<Domaine>({
        url: `/api/domaines/${vars.id}/active/${vars.isActive ? "true" : "false"}`,
        method: "PATCH",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/domaines"] });
      await qc.invalidateQueries({ queryKey: ["/api/domaines/public/active"] });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Mise à jour impossible", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest<Domaine>({
        url: `/api/domaines/${id}/hard`,
        method: "DELETE",
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["/api/domaines"] });
      await qc.invalidateQueries({ queryKey: ["/api/domaines/public/active"] });
      toast({ title: "Domaine supprimé" });
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Suppression impossible", variant: "destructive" });
    },
  });

  // --- Reset Statistiques ---
  const [resetDomaine, setResetDomaine] = useState<string>("");
  const [resetTableName, setResetTableName] = useState<string>("");

  const { data: resetDataTypesRaw } = useQuery({
    queryKey: ["/api/domaines/reset-data-types"],
    queryFn: () => apiRequest<ResetDataType[]>({ url: "/api/domaines/reset-data-types", method: "GET" }),
  });

  const resetDataTypesList = useMemo(
    () => (Array.isArray(resetDataTypesRaw) ? resetDataTypesRaw : []),
    [resetDataTypesRaw]
  );

  const selectedResetDomaine = useMemo(
    () => resetDataTypesList.find((d) => d.value === resetDomaine),
    [resetDataTypesList, resetDomaine]
  );

  const resetStatsMutation = useMutation({
    mutationFn: async (vars: { domaine: string; tableName: string }) => {
      return apiRequest<any>({
        url: "/api/domaines/reset-stats",
        method: "POST",
        data: vars,
      });
    },
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["/api/stats"] });
      const deletedInfo = result?.deleted
        ? Object.entries(result.deleted)
            .filter(([, v]) => (v as number) > 0)
            .map(([k, v]) => `${k}: ${v} lignes`)
            .join(", ")
        : "aucune donnée";
      toast({ title: "Données réinitialisées", description: deletedInfo });
      setResetTableName("");
    },
    onError: (e: any) => {
      toast({ title: "Erreur", description: e?.message || "Réinitialisation impossible", variant: "destructive" });
    },
  });

  return (
    <main className="page-frame-container">
      <div className="page-frame-inner container mx-auto px-4 py-4 space-y-4 max-w-7xl">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Contrôle des Domaines</h2>
          <div className="text-sm text-muted-foreground">Administration centrale - Domaines</div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          {/* Colonne gauche : Gestion des domaines (empilé verticalement) */}
          <div className="space-y-4">
            {missingDefaultDomaines.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Domaines par défaut manquants</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {missingDefaultDomaines.map((d) => (
                      <Button
                        key={d.nomDomaine}
                        variant="outline"
                        onClick={() => createDefaultMutation.mutate(d)}
                        disabled={createDefaultMutation.isPending}
                      >
                        Ajouter {d.nomDomaine}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Créer un domaine</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Nom du domaine</Label>
                  <Input
                    value={nomDomaine}
                    onChange={(e) => {
                      const next = normalizeNom(e.target.value);
                      setNomDomaine(next);
                      if (!slugTouched) {
                        setCodeSlug(toSlug(next));
                      }
                    }}
                    placeholder="CHASSE"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Code slug</Label>
                  <Input
                    value={codeSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setCodeSlug(toSlug(e.target.value));
                    }}
                    placeholder="chasse"
                  />
                </div>
                <div className="md:col-span-2">
                  <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !nomDomaine || !codeSlug}>
                    Créer
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <CardTitle>Liste des domaines ({filteredDomaines.length})</CardTitle>
                  <div className="w-full md:max-w-sm">
                    <Input
                      placeholder="Rechercher par nom ou description"
                      value={searchNom}
                      onChange={(e) => setSearchNom(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="py-6">Chargement...</div>
                ) : (
                  <div className={filteredDomaines.length > 6 ? "max-h-[420px] overflow-y-auto" : ""}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nom du Domaine</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[160px]">Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDomaines.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell>{d.nomDomaine}</TableCell>
                            <TableCell>{d.description || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={d.isActive ? "secondary" : "outline"}
                                  className={d.isActive ? "bg-green-100 text-green-800 border-green-200" : "bg-red-50 text-red-700 border-red-200"}
                                >
                                  {d.isActive ? "Actif" : "Inactif"}
                                </Badge>
                                <Switch
                                  checked={d.isActive}
                                  onCheckedChange={(checked) => toggleMutation.mutate({ id: d.id, isActive: checked })}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end flex-wrap gap-2">
                                <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                                  Modifier
                                </Button>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" disabled={deleteMutation.isPending}>
                                      <Trash2 className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Voulez-vous vraiment supprimer le domaine "{d.nomDomaine}" ?
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteMutation.mutate(d.id)}>
                                        Supprimer
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
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

          {/* Colonne droite : Reset Statistiques */}
          <div className="space-y-4">
            <Card className="border-red-200 dark:border-red-900">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                  <RotateCcw className="h-5 w-5" />
                  Reset Statistiques
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Supprime les données statistiques du domaine choisi. Les comptes agents sont préservés.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Domaine</Label>
                  <Select value={resetDomaine} onValueChange={(val) => { setResetDomaine(val); setResetTableName(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un domaine" />
                    </SelectTrigger>
                    <SelectContent>
                      {resetDataTypesList.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedResetDomaine && (
                  <div className="space-y-2">
                    <Label>Type de données</Label>
                    <Select value={resetTableName} onValueChange={setResetTableName}>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une donnée" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedResetDomaine.tables.map((t) => (
                          <SelectItem key={t.tableName} value={t.tableName}>
                            {t.display}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {resetDomaine && resetTableName && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        className="w-full"
                        disabled={resetStatsMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Réinitialiser
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmer la réinitialisation</AlertDialogTitle>
                        <AlertDialogDescription>
                          Voulez-vous vraiment supprimer toutes les données de type
                          « {selectedResetDomaine?.tables.find((t) => t.tableName === resetTableName)?.display || resetTableName} »
                          pour le domaine « {selectedResetDomaine?.label || resetDomaine} » ?
                          <br />
                          <strong className="text-red-600">Cette action est irréversible.</strong>
                          <br />
                          Les comptes agents ne seront pas affectés, mais toutes les données statistiques correspondantes seront définitivement supprimées.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => resetStatsMutation.mutate({ domaine: resetDomaine, tableName: resetTableName })}
                        >
                          Réinitialiser
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {resetStatsMutation.isPending && (
                  <div className="text-sm text-muted-foreground animate-pulse">
                    Réinitialisation en cours...
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Modifier un domaine</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom du domaine</Label>
                <Input
                  value={editNomDomaine}
                  onChange={(e) => {
                    const next = normalizeNom(e.target.value);
                    setEditNomDomaine(next);
                    if (!editSlugTouched) {
                      setEditCodeSlug(toSlug(next));
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Code slug</Label>
                <Input
                  value={editCodeSlug}
                  onChange={(e) => {
                    setEditSlugTouched(true);
                    setEditCodeSlug(toSlug(e.target.value));
                  }}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>
                Annuler
              </Button>
              <Button
                onClick={() => {
                  if (!editing) return;
                  updateMutation.mutate({
                    id: editing.id,
                    nomDomaine: editNomDomaine,
                    codeSlug: editCodeSlug,
                  });
                }}
                disabled={updateMutation.isPending || !editNomDomaine.trim() || !editCodeSlug.trim()}
              >
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
}
