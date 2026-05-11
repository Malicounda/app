import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

interface NurseryType {
  id: number;
  label: string;
  code: string;
  departement: string | null;
  isActive: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departements?: string[];
  fixedDepartement?: string | null;
}

export function NurseryTypeManager({ open, onOpenChange, departements = [], fixedDepartement = null }: Props) {
  const { toast } = useToast();
  const [editingType, setEditingType] = useState<NurseryType | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newDept, setNewDept] = useState<string>("ALL");

  const deptFixed = typeof fixedDepartement === 'string' && fixedDepartement.trim().length > 0;

  const normalizeDept = (value: unknown) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  useEffect(() => {
    if (!deptFixed) return;
    setNewDept(fixedDepartement as string);
  }, [deptFixed, fixedDepartement]);

  const { data: types = [], isLoading } = useQuery<NurseryType[]>({
    queryKey: ["/api/reboisement/nursery-types"],
  });

  const normalizedAllowedDepts = (departements || []).map((d) => normalizeDept(d)).filter((d) => !!d);
  const filteredTypes = (types || []).filter((t) => {
    // Toujours inclure les types globaux
    if (!t?.departement) return true;

    // Si on est en mode département fixé, ne montrer que ceux du département fixé
    if (deptFixed) {
      return normalizeDept(t.departement) === normalizeDept(fixedDepartement);
    }

    // Sinon, filtrer par périmètre (départements de la région) si fourni
    if (normalizedAllowedDepts.length > 0) {
      return normalizedAllowedDepts.includes(normalizeDept(t.departement));
    }

    // Pas de périmètre fourni => tout afficher
    return true;
  });

  const addMutation = useMutation({
    mutationFn: (data: { label: string; departement: string | null }) =>
      apiRequest({ url: "/api/reboisement/nursery-types", method: "POST", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/nursery-types"] });
      setNewLabel("");
      setNewDept("ALL");
      toast({ title: "Succès", description: "Type de pépinière ajouté." });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; label: string; departement: string | null }) =>
      apiRequest({ url: `/api/reboisement/nursery-types/${data.id}`, method: "PUT", data: { id: data.id, label: data.label, departement: deptFixed ? fixedDepartement : data.departement } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/nursery-types"] });
      setEditingType(null);
      toast({ title: "Succès", description: "Type de pépinière mis à jour." });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest({ url: `/api/reboisement/nursery-types/${id}`, method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/nursery-types"] });
      toast({ title: "Succès", description: "Type de pépinière supprimé." });
    }
  });

  const handleAdd = () => {
    if (!newLabel) return;
    addMutation.mutate({
      label: newLabel,
      departement: deptFixed ? (fixedDepartement as string) : (newDept === "ALL" ? null : newDept),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Gestion des types de pépinières</DialogTitle>
          <DialogDescription>
            Ajoutez ou modifiez les types de pépinières disponibles dans les rapports.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Formulaire d'ajout */}
          <div className={`grid grid-cols-1 ${deptFixed ? 'md:grid-cols-2' : 'md:grid-cols-3'} gap-4 items-end bg-slate-50 p-4 rounded-lg border border-slate-200`}>
            <div className="space-y-2">
              <Label htmlFor="type-label">Type de pépinière</Label>
              <Input
                id="type-label"
                placeholder="Ex: Régie, Scolaire..."
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
            </div>
            {!deptFixed && (
              <div className="space-y-2">
                <Label htmlFor="type-dept">Département</Label>
                <Select value={newDept} onValueChange={setNewDept}>
                  <SelectTrigger id="type-dept">
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les départements</SelectItem>
                    {departements.filter(d => !!d).map(d => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={handleAdd} disabled={addMutation.isPending || !newLabel} className="bg-emerald-600 hover:bg-emerald-700">
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Ajouter</>}
            </Button>
          </div>

          {/* Liste des types */}
          <div className="border rounded-md overflow-hidden">
            <div className={filteredTypes.length > 5 ? 'max-h-[340px] overflow-y-auto' : ''}>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b sticky top-0 z-10">
                <tr>
                  <th className="text-left p-3 font-semibold">Libellé</th>
                  {!deptFixed && <th className="text-left p-3 font-semibold">Département</th>}
                  <th className="text-right p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={deptFixed ? 2 : 3} className="p-8 text-center text-slate-400">Chargement...</td></tr>
                ) : filteredTypes.length === 0 ? (
                  <tr><td colSpan={deptFixed ? 2 : 3} className="p-8 text-center text-slate-400">Aucun type défini.</td></tr>
                ) : (
                  filteredTypes.map(type => (
                    <tr key={type.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        {editingType?.id === type.id ? (
                          <Input
                            value={editingType.label}
                            onChange={(e) => setEditingType({...editingType, label: e.target.value})}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-medium">{type.label}</span>
                        )}
                      </td>
                      {!deptFixed && (
                        <td className="p-3">
                          {editingType?.id === type.id ? (
                            <Select
                              value={editingType.departement || "ALL"}
                              onValueChange={(val) => setEditingType({...editingType, departement: val === "ALL" ? null : val})}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ALL">Tous</SelectItem>
                                {departements.filter(d => !!d).map(d => (
                                  <SelectItem key={d} value={d}>{d}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-slate-500">{type.departement || "Tous"}</span>
                          )}
                        </td>
                      )}
                      <td className="p-3 text-right">
                        {editingType?.id === type.id ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="ghost" onClick={() => setEditingType(null)}>Annuler</Button>
                            <Button
                              size="sm"
                              className="bg-emerald-600"
                              onClick={() =>
                                updateMutation.mutate({
                                  id: editingType.id,
                                  label: editingType.label,
                                  departement: deptFixed ? (fixedDepartement as string) : (editingType.departement ?? null),
                                })
                              }
                            >
                              Sauver
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setEditingType(type)} className="text-blue-600">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" className="text-red-600">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent overlayClassName="bg-transparent">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Voulez-vous vraiment supprimer le type de pépinière <strong>"{type.label}"</strong> ?
                                    Cette action pourra impacter les rapports futurs utilisant ce type.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(type.id)}
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                  >
                                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmer"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
