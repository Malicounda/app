import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Eye, EyeOff, Loader2, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";

const CATEGORIES = ["Forestière", "Fruitier-forestière", "Fruitière", "Ornementale", "Médicinale", "Fourragère"];

interface CatalogSpecies {
  id: number;
  name: string;
  category: string;
  createdAt?: string;
}

interface CatalogCategory {
  id: number;
  name: string;
  color?: string;
}

// Composant interne pour gérer les catégories
function CategoryManagerModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  // États pour la suppression sécurisée
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [categoryToDelete, setCategoryToDelete] = useState<{id: number, name: string} | null>(null);
  const [emptyCategoryToDelete, setEmptyCategoryToDelete] = useState<{id: number, name: string} | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { data: categories = [], isLoading } = useQuery<CatalogCategory[]>({
    queryKey: ["/api/reboisement/species-categories"],
  });

  const { data: species = [] } = useQuery<CatalogSpecies[]>({
    queryKey: ["/api/reboisement/species-catalog"],
  });

  const addCat = useMutation({
    mutationFn: (name: string) => apiRequest<any>({ method: "POST", url: "/api/reboisement/species-categories", data: { name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-categories"] });
      setNewName("");
      toast({ title: "Catégorie ajoutée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" })
  });

  const updateCat = useMutation({
    mutationFn: (data: { id: number, name: string }) => apiRequest<any>({ method: "PUT", url: `/api/reboisement/species-categories/${data.id}`, data: { name: data.name } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-catalog"] });
      setEditingId(null);
      toast({ title: "Catégorie modifiée" });
    },
    onError: (err: any) => toast({ title: "Erreur", description: err.message, variant: "destructive" })
  });

  const deleteCat = useMutation({
    mutationFn: (id: number) => apiRequest<any>({ method: "DELETE", url: `/api/reboisement/species-categories/${id}` }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-catalog"] });
      toast({ title: "Catégorie supprimée" });
      setPasswordModalOpen(false);
      setCategoryToDelete(null);
      setEmptyCategoryToDelete(null);
      setPassword("");
    },
    onError: (err: any) => toast({ title: "Erreur", description: "Impossible de supprimer.", variant: "destructive" })
  });

  const handleDeleteClick = (cat: CatalogCategory) => {
    // Vérifier si des espèces utilisent cette catégorie
    const hasSpecies = species.some(s => s.category === cat.name);

    if (hasSpecies) {
      setCategoryToDelete(cat);
      setPasswordModalOpen(true);
    } else {
      setEmptyCategoryToDelete(cat);
    }
  };

  const handleSecureDelete = async () => {
    if (!password || !categoryToDelete) return;
    setIsVerifying(true);
    try {
      await apiRequest<any>({
        method: "POST",
        url: "/api/auth/verify-password",
        data: { password }
      });
      // Si on arrive ici, le mot de passe est correct
      deleteCat.mutate(categoryToDelete.id);
    } catch (err: any) {
      toast({ title: "Erreur", description: "Mot de passe incorrect.", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => {
        if (!val && (passwordModalOpen || !!emptyCategoryToDelete)) return;
        onOpenChange(val);
    }}>
      <DialogContent
        className="sm:max-w-[425px]"
        onInteractOutside={(e) => {
          if (passwordModalOpen || !!emptyCategoryToDelete) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Gérer les catégories</DialogTitle>
          <DialogDescription>
            Ajoutez, modifiez ou supprimez les catégories d'espèces. Attention, la modification d'une catégorie impactera toutes les espèces liées.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mt-4">
          <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nouvelle catégorie..." className="h-9" />
          <Button onClick={() => addCat.mutate(newName.trim())} disabled={!newName.trim() || addCat.isPending} className="h-9">
            {addCat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-2">
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-400" /> : categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-2 border rounded-md bg-gray-50">
              {editingId === cat.id ? (
                <Input autoFocus value={editName} onChange={e => setEditName(e.target.value)} className="h-8" />
              ) : (
                <span className="text-sm font-medium">{cat.name}</span>
              )}

              <div className="flex items-center gap-1">
                {editingId === cat.id ? (
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => updateCat.mutate({ id: cat.id, name: editName.trim() })}>OK</Button>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-blue-600" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-2 text-gray-500 hover:text-red-600" onClick={() => handleDeleteClick(cat)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
      <DialogContent className="sm:max-w-[425px]" overlayClassName="bg-transparent">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" />
            Suppression sensible
          </DialogTitle>
          <DialogDescription>
            La catégorie <strong>"{categoryToDelete?.name}"</strong> est actuellement utilisée par des espèces dans le catalogue.
            <strong>ATTENTION :</strong> Sa suppression entraînera la suppression définitive de toutes les espèces qui y sont rattachées.
            <br/><br/>
            Veuillez entrer votre mot de passe pour confirmer cette action radicale.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 relative">
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Votre mot de passe..."
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSecureDelete()}
            autoComplete="new-password"
            className="pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-4 h-9 w-9 p-0 text-gray-500 hover:text-gray-700"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPasswordModalOpen(false)}>Annuler</Button>
          <Button variant="destructive" onClick={handleSecureDelete} disabled={!password || isVerifying || deleteCat.isPending}>
            {isVerifying || deleteCat.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Confirmer la suppression
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modale de confirmation pour catégorie vide */}
    <AlertDialog open={!!emptyCategoryToDelete} onOpenChange={(open) => !open && setEmptyCategoryToDelete(null)}>
      <AlertDialogContent overlayClassName="bg-transparent">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmation de suppression</AlertDialogTitle>
          <AlertDialogDescription>
            Êtes-vous sûr de vouloir supprimer la catégorie vide <strong>"{emptyCategoryToDelete?.name}"</strong> ?
            Cette action est irréversible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => emptyCategoryToDelete && deleteCat.mutate(emptyCategoryToDelete.id)}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteCat.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}


// Lire un fichier texte en essayant UTF-8 puis Latin-1 (Windows-1252) comme fallback
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const tryEncoding = (encoding: string) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Si le texte contient des caractères de remplacement Unicode (UTF-8 decode fail)
        if (encoding === 'utf-8' && text.includes('\uFFFD')) {
          // Réessayer en Latin-1
          tryEncoding('windows-1252');
        } else {
          resolve(text);
        }
      };
      reader.onerror = () => reject(new Error("Erreur de lecture du fichier"));
      reader.readAsText(file, encoding);
    };
    tryEncoding('utf-8');
  });
}

// Normaliser une catégorie importée vers les catégories reconnues
function normalizeCategory(raw: string): string {
  const r = raw.trim().toLowerCase();
  if (r.includes('fruit') && r.includes('forest')) return 'Fruitier-forestière';
  if (r.includes('forest')) return 'Forestière';
  if (r.includes('fruit')) return 'Fruitière';
  if (r.includes('ornem')) return 'Ornementale';
  if (r.includes('medic') || r.includes('médic')) return 'Médicinale';
  if (r.includes('fourrag')) return 'Fourragère';
  return raw.trim();
}

export function SpeciesCatalogManager() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Forestière");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [isImporting, setIsImporting] = useState(false);

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  const { data: species = [], isLoading } = useQuery<CatalogSpecies[]>({
    queryKey: ["/api/reboisement/species-catalog"],
  });

  const { data: dbCategories = [] } = useQuery<CatalogCategory[]>({
    queryKey: ["/api/reboisement/species-categories"],
  });

  const addMutation = useMutation({
    mutationFn: (data: { name: string; category: string }) =>
      apiRequest<any>({ method: "POST", url: "/api/reboisement/species-catalog", data }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-catalog"] });
      setNewName("");
      toast({ title: "Espèce ajoutée ✓", description: `"${vars.name}" ajoutée au catalogue.` });
    },
    onError: (err: any) => {
      toast({ title: "Erreur", description: err.message || "Doublon ou erreur serveur.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<any>({ method: "DELETE", url: `/api/reboisement/species-catalog/${id}` }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-catalog"] });
      toast({ title: "Espèce supprimée" });
    },
    onError: () => {
      toast({ title: "Erreur de suppression", variant: "destructive" });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addMutation.mutate({ name: newName.trim(), category: newCategory });
  };

  // Import CSV avec gestion de l'encodage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    try {
      const text = await readFileAsText(file);
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

      // Détecter et sauter la ligne d'entête
      const startIdx = lines[0]?.toLowerCase().replace(/[^a-z]/g, '').includes('esp') ||
                       lines[0]?.toLowerCase().includes('name') ||
                       lines[0]?.toLowerCase().includes('cat') ? 1 : 0;

      const items: { name: string; category: string }[] = [];
      for (const line of lines.slice(startIdx)) {
        const sep = line.includes(";") ? ";" : ",";
        const parts = line.split(sep).map(s => s.trim().replace(/^"|"$/g, ""));
        const name = parts[0];
        const rawCategory = parts[1] || "Forestière";
        const category = normalizeCategory(rawCategory);
        if (name) items.push({ name, category });
      }

      if (!items.length) {
        toast({
          title: "Fichier vide ou format incorrect",
          description: "Le fichier doit contenir: Espèce;Catégorie",
          variant: "destructive"
        });
        return;
      }

      const res = await apiRequest<any>({
        method: "POST",
        url: "/api/reboisement/species-catalog/bulk",
        data: { items }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/species-catalog"] });
      toast({
        title: "Import terminé ✓",
        description: `${res?.inserted ?? items.length} espèces importées sur ${items.length} (doublons ignorés).`,
      });
    } catch (err) {
      toast({ title: "Erreur d'import", description: "Vérifiez le format de votre fichier.", variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Filtrage
  const filtered = species.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || s.category === filterCat;
    return matchSearch && matchCat;
  });

  // Catégories présentes dans les données (dynamique depuis base de données + espèces)
  const allCategories = Array.from(new Set([
    ...dbCategories.map(c => c.name),
    ...species.map(s => s.category)
  ])).sort();

  // Grouper par catégorie - toutes les catégories présentes
  const grouped = allCategories
    .map(cat => ({ cat, items: filtered.filter(s => s.category === cat) }))
    .filter(g => g.items.length > 0);

  const catColors: Record<string, string> = {
    "Forestière": "bg-green-100 text-green-800 border-green-300",
    "Fruitier-forestière": "bg-lime-100 text-lime-800 border-lime-300",
    "Fruitière": "bg-orange-100 text-orange-800 border-orange-300",
    "Ornementale": "bg-purple-100 text-purple-800 border-purple-300",
    "Médicinale": "bg-blue-100 text-blue-800 border-blue-300",
    "Fourragère": "bg-yellow-100 text-yellow-800 border-yellow-300",
  };

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* En-tête */}
      <div className="flex-none flex items-center gap-3 mb-6">
        <BookOpen className="w-6 h-6 text-green-700" />
        <div>
          <h2 className="text-xl font-bold text-green-900">Catalogue des espèces</h2>
          <p className="text-sm text-gray-500">{species.length} espèces enregistrées — utilisées dans la Fiche F3</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Panneau gauche : Ajout */}
        <div className="space-y-4 overflow-y-auto pr-1 pb-4 scrollbar-thin scrollbar-thumb-gray-300">
          {/* Formulaire d'ajout manuel */}
          <Card className="border-green-200">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base text-green-800">Ajouter une espèce</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-gray-500 hover:text-green-700 hover:bg-green-50"
                onClick={() => setIsCategoryModalOpen(true)}
                title="Gérer les catégories"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAdd} className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Nom de l'espèce *</label>
                  <Input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Ex: Acacia senegal"
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie *</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={!newName.trim() || addMutation.isPending}
                  className="w-full bg-green-700 hover:bg-green-800 text-white h-9">
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                  Ajouter
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Import CSV */}
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-blue-800">Import CSV</CardTitle>
              <CardDescription className="text-xs">
                Format attendu : <code className="bg-white px-1 rounded">Espèce;Catégorie</code><br/>
                Une ligne par espèce. La première ligne (entête) est ignorée automatiquement.<br/>
                <strong>Encodage UTF-8 ou Latin-1 supporté.</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
                id="species-file-input"
              />
              <Button
                variant="outline"
                className="w-full border-blue-300 text-blue-700 hover:bg-blue-100 h-9"
                onClick={() => fileRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Import en cours...</>
                  : <><Upload className="w-4 h-4 mr-1" />Choisir un fichier CSV</>
                }
              </Button>
              <p className="text-[11px] text-blue-600">
                💡 Les doublons existants sont ignorés automatiquement.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Panneau droit : Liste */}
        <div className="lg:col-span-2 flex flex-col min-h-0">
          {/* Filtres */}
          <div className="flex-none flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher une espèce..."
                className="pl-9 h-9"
              />
            </div>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="Toutes catégories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {allCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Liste groupée avec défilement interne */}
          <div className="flex-1 overflow-y-auto pr-2 pb-4 scrollbar-thin scrollbar-thumb-gray-300">
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>
          ) : filtered.length === 0 && species.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-gray-400">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Aucune espèce dans le catalogue.</p>
                <p className="text-sm">Ajoutez des espèces ou importez un fichier CSV.</p>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center text-gray-400">
                <p className="text-sm">Aucun résultat pour votre recherche.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ cat, items }) => (
                <Card key={cat} className="border-gray-200">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center gap-2">
                      <Badge className={`${catColors[cat] || "bg-gray-100 text-gray-700 border-gray-300"} border text-xs`}>{cat}</Badge>
                      <span className="text-xs text-gray-400">{items.length} espèce{items.length > 1 ? "s" : ""}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {items.map(sp => (
                        <div key={sp.id}
                          className="flex items-center justify-between px-3 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 group">
                          <span className="text-sm text-gray-800 italic">{sp.name}</span>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent overlayClassName="bg-transparent">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Voulez-vous vraiment supprimer "{sp.name}" ? Cette action est irréversible.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-red-600 hover:bg-red-700"
                                  onClick={() => deleteMutation.mutate(sp.id)}
                                >
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Modale de gestion des catégories */}
      <CategoryManagerModal open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen} />
    </div>
  );
}

export default SpeciesCatalogManager;

