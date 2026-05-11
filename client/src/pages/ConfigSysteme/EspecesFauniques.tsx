import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { Edit, Eye, Image, Loader2, Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';

interface Species {
  id: number;
  nom: string;
  nom_scientifique?: string;
  groupe: string;
  statut_protection: string;
  chassable: boolean;
  taxable: boolean;
  quota?: number | null;
  cites_annexe?: 'I' | 'II' | 'III' | 'Non CITES' | null;
  photo_url?: string;
  photo_data?: string;
  photo_mime?: string;
  photo_name?: string;
}

const EspecesFauniques: React.FC = () => {
  const [species, setSpecies] = useState<Species[]>(() => {
    try {
      const raw = localStorage.getItem('settings_species_cache_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.data) ? parsed.data : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      return !localStorage.getItem('settings_species_cache_v1');
    } catch {
      return true;
    }
  });
  const speciesCache = useRef<{ data: Species[], timestamp: number } | null>(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const SOFT_WINDOW = 30 * 1000;
  // Cache persistant côté client (localStorage) avec TTL
  const LS_KEYS = {
    species: 'settings_species_cache_v1',
    groups: 'settings_species_groups_v1',
  };
  const readCache = (key: string): { ts: number; data: any } | null => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const writeCache = (key: string, data: any) => {
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  };
  const getCachedWithTTL = (key: string, ttl: number): { expired: boolean; data: any } | null => {
    const c = readCache(key);
    if (!c || typeof c.ts !== 'number') return null;
    const expired = (Date.now() - c.ts) > ttl;
    return { expired, data: c.data };
  };
  const removeCache = (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch {}
  };
  const [newSpeciesOpen, setNewSpeciesOpen] = useState(false);
  const [editSpeciesOpen, setEditSpeciesOpen] = useState(false);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);
  const [photoPreviewOpen, setPhotoPreviewOpen] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('settings_species_page');
      const n = raw ? parseInt(raw, 10) : 1;
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  });
  const itemsPerPage = 10;

  useEffect(() => {
    try { localStorage.setItem('settings_species_page', String(currentPage)); } catch {}
  }, [currentPage]);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Species | null>(null);

  const [newSpecies, setNewSpecies] = useState<Partial<Species>>({
    groupe: 'petite_chasse',
    statut_protection: 'Aucun',
    chassable: true,
    taxable: true,
    quota: null,
    cites_annexe: 'Non CITES',
  });

  // Charger les groupes depuis les catégories de permis (Tarifs)
  const [groupOptions, setGroupOptions] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('settings_species_groups_v1');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const arr = Array.isArray(parsed?.data) ? parsed.data : [];
      return arr;
    } catch {
      return [];
    }
  });
  const groupOptionsCache = useRef<{ data: string[], timestamp: number } | null>(null);
  
  const loadGroupOptions = useCallback(async () => {
    // Mémoire d'abord
    if (groupOptionsCache.current && (Date.now() - groupOptionsCache.current.timestamp < CACHE_DURATION)) {
      setGroupOptions(groupOptionsCache.current.data);
      return;
    }
    // localStorage ensuite
    const cachedLS = getCachedWithTTL(LS_KEYS.groups, CACHE_DURATION);
    if (cachedLS && !cachedLS.expired) {
      const data = Array.isArray(cachedLS.data) ? cachedLS.data : [];
      setGroupOptions(data);
      groupOptionsCache.current = { data, timestamp: Date.now() };
      return;
    }
    if (cachedLS && Array.isArray(cachedLS.data)) {
      // Hydratation immédiate puis rafraîchissement en arrière-plan
      setGroupOptions(cachedLS.data);
    }
    
    try {
      const resp = await apiRequest<any>('GET', '/api/permit-categories?activeOnly=false');
      if (resp.ok) {
        const rows = Array.isArray(resp.data) ? resp.data : [];
        const setG = new Set<string>();
        rows.forEach((c: any) => { if (c?.groupe) setG.add(String(c.groupe)); });
        const options = Array.from(setG).sort();
        setGroupOptions(options);
        groupOptionsCache.current = { data: options, timestamp: Date.now() };
        writeCache(LS_KEYS.groups, options);
      }
    } catch {}
  }, [CACHE_DURATION]);

  // Garde: s'assurer que species est toujours un tableau pour le rendu
  const list = useMemo(() => Array.isArray(species) ? species : [], [species]);

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(list.length / itemsPerPage));
    if (currentPage > maxPage) setCurrentPage(maxPage);
  }, [list.length, itemsPerPage, currentPage]);

  // Pagination optimisée avec useMemo
  const paginationData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedList = list.slice(startIndex, endIndex);
    const totalPages = Math.ceil(list.length / itemsPerPage);
    const displayEndIndex = Math.min(startIndex + itemsPerPage, list.length);
    
    return {
      paginatedList,
      totalPages,
      startIndex,
      endIndex: displayEndIndex
    };
  }, [list, currentPage, itemsPerPage]);

  // Rendu sécurisé d'une ligne pour éviter tout crash sur des données inattendues
  const renderSpeciesRow = useCallback((sp: Species, idx: number) => {
    try {
      const cat = (sp?.groupe ?? '').toString();
      const catText = cat ? cat.replace('_', ' ') : '-';
      const statut = (sp?.statut_protection ?? 'Aucun') as string;
      const cites = (sp?.cites_annexe ?? 'Non CITES') as string;
      const isChassable = Boolean(sp?.chassable);
      const isTaxable = Boolean(sp?.taxable);

      return (
        <tr key={sp.id} className="border-b border-gray-200 hover:bg-blue-50 transition-colors">
          <td className="p-2 sm:p-3">
            {(sp.photo_data || sp.photo_url) ? (
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" onClick={() => previewSpeciesPhoto(sp)}>
                <Eye className="h-4 w-4" />
              </Button>
            ) : (
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                <Image className="h-4 w-4 text-gray-400" />
              </div>
            )}
          </td>
          <td className="p-2 sm:p-3 font-medium text-xs sm:text-sm">{sp.nom}</td>
          <td className="p-2 sm:p-3 text-gray-600 italic text-xs sm:text-sm">{sp.nom_scientifique || '-'}</td>
          <td className="p-2 sm:p-3">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              cat === 'petite_chasse' ? 'bg-green-100 text-green-800' :
              cat === 'grande_chasse' ? 'bg-orange-100 text-orange-800' :
              cat === 'gibier_eau' ? 'bg-blue-100 text-blue-800' :
              cat === 'protege' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {catText}
            </span>
          </td>
          <td className="p-2 sm:p-3">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              statut === 'Aucun' ? 'bg-green-100 text-green-800' :
              statut === 'Partiel' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {statut}
            </span>
          </td>
          <td className="p-2 sm:p-3 text-center hidden md:table-cell">{sp.quota == null ? '-' : sp.quota}</td>
          <td className="p-2 sm:p-3 hidden lg:table-cell">{cites}</td>
          <td className="p-2 sm:p-3 hidden sm:table-cell">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${isChassable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {isChassable ? 'Oui' : 'Non'}
            </span>
          </td>
          <td className="p-2 sm:p-3 hidden lg:table-cell">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${isTaxable ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
              {isTaxable ? 'Taxable' : 'Non taxable'}
            </span>
          </td>
          <td className="p-2 sm:p-3">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => {
                setSelectedSpecies(sp);
                setEditSpeciesOpen(true);
              }}>
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-8 p-0 text-red-500 hover:bg-red-50"
                onClick={() => { setDeleteTarget(sp); setDeleteConfirmOpen(true); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </td>
        </tr>
      );
    } catch (err) {
      console.error('Erreur de rendu pour l\'espèce', sp, err);
      return null;
    }
  }, []);

  // Chargement des espèces avec cache optimisé
  const loadSpecies = useCallback(async (forceReload: boolean = false) => {
    // 1) Mémoire rapide
    if (!forceReload && speciesCache.current && (Date.now() - speciesCache.current.timestamp < CACHE_DURATION)) {
      setSpecies(speciesCache.current.data);
      setLoading(false);
      return;
    }
    // 2) Cache localStorage
    const cachedLS = getCachedWithTTL(LS_KEYS.species, CACHE_DURATION);
    let showSpinner = true;
    if (!forceReload && cachedLS && cachedLS.data) {
      const arr = Array.isArray(cachedLS.data) ? cachedLS.data : [];
      setSpecies(arr);
      setLoading(false);
      speciesCache.current = { data: arr, timestamp: Date.now() };
      if (!cachedLS.expired) {
        return; // Cache valide, pas d'appel réseau
      } else {
        showSpinner = false; // Rafraîchissement en arrière-plan
      }
    }
    
    try {
      if (showSpinner) setLoading(true);
      const resp = await apiRequest<{ok: boolean, data: Species[], error?: string}>('GET', '/api/settings/species');
      // resp.data contient {ok: true, data: [...]} du serveur
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        const speciesData = serverResponse.data;
        setSpecies(speciesData);
        // Mettre à jour les caches
        speciesCache.current = { data: speciesData, timestamp: Date.now() };
        writeCache(LS_KEYS.species, speciesData);
      } else {
        toast({ title: 'Erreur', description: serverResponse?.error || resp.error || "Impossible de charger les espèces", variant: 'destructive' });
        setSpecies([]);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des espèces:', error);
      toast({ title: 'Erreur', description: 'Impossible de charger les espèces', variant: 'destructive' });
      setSpecies([]);
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [CACHE_DURATION, toast]);

  useEffect(() => {
    loadSpecies();
    loadGroupOptions();
  }, [loadSpecies, loadGroupOptions]);

  // Sauvegarde d'une nouvelle espèce
  const saveSpecies = useCallback(async (speciesData: Partial<Species>) => {
    try {
      const resp = await apiRequest<{ok: boolean, data: { id: number }, error?: string}>('POST', '/api/settings/species', speciesData);
      console.log('[DEBUG Frontend] saveSpecies response:', resp);

      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok) {
        toast({ title: 'Succès', description: 'Espèce créée avec succès' });
        // Invalider le cache et recharger
        speciesCache.current = null;
        removeCache(LS_KEYS.species);
        loadSpecies(true);
        return true;
      }
      toast({ title: 'Erreur', description: serverResponse?.error || resp.error || "Création échouée", variant: 'destructive' });
      return false;
    } catch (error) {
      console.error('Erreur lors de la création:', error);
      toast({ title: 'Erreur', description: 'Impossible de créer l\'espèce', variant: 'destructive' });
      return false;
    }
  }, [loadSpecies, toast]);

  // Mise à jour d'une espèce
  const updateSpecies = useCallback(async (id: number, speciesData: Partial<Species>) => {
    try {
      const resp = await apiRequest<{ok: boolean, error?: string}>('PUT', `/api/settings/species/${id}`, speciesData);
      console.log('[DEBUG Frontend] updateSpecies response:', resp);

      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok) {
        toast({ title: 'Succès', description: "Espèce mise à jour avec succès" });
        // Invalider le cache et recharger
        speciesCache.current = null;
        removeCache(LS_KEYS.species);
        loadSpecies(true);
        return true;
      }
      toast({ title: 'Erreur', description: serverResponse?.error || resp.error || "Mise à jour échouée", variant: 'destructive' });
      return false;
    } catch (error) {
      console.error('Erreur lors de la mise à jour:', error);
      toast({ title: 'Erreur', description: 'Impossible de mettre à jour l\'espèce', variant: 'destructive' });
      return false;
    }
  }, [loadSpecies, toast]);

  // Suppression d'une espèce
  const deleteSpecies = useCallback(async (id: number) => {
    try {
      console.log('[DEBUG Frontend] Attempting to delete species ID:', id);
      const resp = await apiRequest<{ok: boolean, error?: string}>('DELETE', `/api/settings/species/${id}`);
      console.log('[DEBUG Frontend] deleteSpecies full response:', JSON.stringify(resp, null, 2));
      console.log('[DEBUG Frontend] resp.ok:', resp.ok);
      console.log('[DEBUG Frontend] resp.data:', resp.data);
      console.log('[DEBUG Frontend] resp.error:', resp.error);

      // resp.data contient {ok: true/false} du serveur
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok) {
        toast({ title: 'Succès', description: 'Espèce supprimée avec succès' });
        // Invalider le cache et recharger
        speciesCache.current = null;
        removeCache(LS_KEYS.species);
        loadSpecies(true);
      } else {
        const errorMsg = serverResponse?.error || resp.error || 'Suppression échouée';
        console.error('[DEBUG Frontend] Delete failed with error:', errorMsg);
        const isUsageError = typeof errorMsg === 'string' && errorMsg.includes("utilisée dans les taxes d'abattage");
        if (isUsageError) {
          const confirmForce = confirm("Cette espèce est utilisée dans les taxes d'abattage. Forcer la suppression ?\nCela supprimera aussi ses références de taxes.");
          if (confirmForce) {
            console.log('[DEBUG Frontend] Retrying delete with force=true for species ID:', id);
            const resp2 = await apiRequest<{ok: boolean, error?: string}>(
              'DELETE',
              `/api/settings/species/${id}?force=true`
            );
            console.log('[DEBUG Frontend] force delete response:', JSON.stringify(resp2, null, 2));
            const serverResponse2 = resp2.data as any;
            if (resp2.ok && serverResponse2?.ok) {
              toast({ title: 'Succès', description: 'Espèce supprimée avec succès' });
              // Invalider le cache et recharger
              speciesCache.current = null;
              removeCache(LS_KEYS.species);
              loadSpecies(true);
              return;
            }
            const err2 = serverResponse2?.error || resp2.error || 'Suppression forcée échouée';
            console.error('[DEBUG Frontend] Force delete failed with error:', err2);
            toast({ title: 'Erreur', description: err2, variant: 'destructive' });
            return;
          }
        }
        toast({ title: 'Erreur', description: errorMsg, variant: 'destructive' });
      }
    } catch (error) {
      console.error('[DEBUG Frontend] Exception during deletion:', error);
      toast({ title: 'Erreur', description: 'Impossible de supprimer l\'espèce', variant: 'destructive' });
    }
  }, [loadSpecies, toast]);

  // Upload de photo
  const handlePhotoUpload = useCallback(async (file: File, isEdit: boolean = false) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner une image', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const photoData = e.target?.result as string;
      if (isEdit && selectedSpecies) {
        setSelectedSpecies(prev => prev ? {
          ...prev,
          photo_data: photoData,
          photo_mime: file.type,
          photo_name: file.name
        } : null);
      } else {
        setNewSpecies(prev => ({
          ...prev,
          photo_data: photoData,
          photo_mime: file.type,
          photo_name: file.name
        }));
      }
    };
    reader.readAsDataURL(file);
  }, [selectedSpecies]);

  // Prévisualisation de photo
  const previewSpeciesPhoto = useCallback((species: Species) => {
    if (species.photo_data) {
      setPreviewPhoto(species.photo_data);
    } else if (species.photo_url) {
      setPreviewPhoto(species.photo_url);
    } else {
      toast({ title: 'Info', description: 'Aucune photo disponible pour cette espèce' });
      return;
    }
    setPhotoPreviewOpen(true);
  }, [toast]);

  return (
    <main className="page-frame-container bg-gray-50">
  <div className="page-frame-inner container mx-auto px-3 sm:px-6 py-2 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Espèces Fauniques</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">Gestion complète des espèces de chasse (petite chasse, grande chasse, gibier d'eau, etc.)</p>
          </div>
          <Button onClick={() => setNewSpeciesOpen(true)} className="bg-black hover:bg-gray-800 text-white w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" /> Nouvelle Espèce
          </Button>
        </div>

        <Card className="shadow-md border-0">
          <CardContent className="p-0">
            {(list.length === 0 && loading) ? (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-gray-600">Chargement des espèces...</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Photo</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Nom</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Nom Scientifique</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Groupe</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Statut Protection</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700 hidden md:table-cell">Quota</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700 hidden lg:table-cell">CITES</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700 hidden sm:table-cell">Chassable</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700 hidden lg:table-cell">Taxable</th>
                      <th className="p-2 sm:p-3 text-left font-semibold text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginationData.paginatedList.map((sp, idx) => renderSpeciesRow(sp, idx))}
                  </tbody>
                </table>
                {list.length > 0 && (
                  <div className="p-4 flex justify-between items-center text-sm bg-gray-50 border-t">
                    <div className="text-muted-foreground">
                      Affichage de {paginationData.startIndex + 1} à {paginationData.endIndex} sur {list.length} espèces
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        Précédent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage >= paginationData.totalPages}
                      >
                        Suivant
                      </Button>
                    </div>
                  </div>
                )}
                {loading && list.length > 0 && (
                  <div className="p-2 text-xs text-muted-foreground text-right">
                    Mise à jour des données...
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal Confirmation Suppression */}
        <Dialog open={deleteConfirmOpen} onOpenChange={(open) => { setDeleteConfirmOpen(open); if (!open) setDeleteTarget(null); }}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader className="border-b pb-2">
              <DialogTitle className="text-base sm:text-lg">Confirmer la suppression</DialogTitle>
            </DialogHeader>
            <div className="py-4 text-sm text-gray-700">
              {deleteTarget ? (
                <p>Voulez-vous vraiment supprimer l'espèce <span className="font-semibold">{deleteTarget.nom}</span> ? Cette action est irréversible.</p>
              ) : (
                <p>Voulez-vous vraiment supprimer cette espèce ? Cette action est irréversible.</p>
              )}
            </div>
            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }}>
                Annuler
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={async () => {
                  if (deleteTarget) {
                    await deleteSpecies(deleteTarget.id);
                  }
                  setDeleteConfirmOpen(false);
                  setDeleteTarget(null);
                }}
              >
                Supprimer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Nouvelle Espèce */}
        <Dialog open={newSpeciesOpen} onOpenChange={setNewSpeciesOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-lg sm:text-xl">Ajouter une Nouvelle Espèce</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 py-4">
              <div className="space-y-2">
                <Label className="font-medium">Nom *</Label>
                <Input
                  value={newSpecies.nom || ''}
                  onChange={(e) => setNewSpecies(prev => ({ ...prev, nom: e.target.value }))}
                  placeholder="Nom de l'espèce"
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Nom Scientifique</Label>
                <Input
                  value={newSpecies.nom_scientifique || ''}
                  onChange={(e) => setNewSpecies(prev => ({ ...prev, nom_scientifique: e.target.value }))}
                  placeholder="Nom scientifique"
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Groupe *</Label>
                <Select value={newSpecies.groupe} onValueChange={(v: any) => setNewSpecies(prev => ({ ...prev, groupe: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner un groupe" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupOptions.length > 0 ? (
                      groupOptions.map(g => (
                        <SelectItem key={g} value={g}>{g.replace('_',' ')}</SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="petite_chasse">Petite Chasse</SelectItem>
                        <SelectItem value="grande_chasse">Grande Chasse</SelectItem>
                        <SelectItem value="gibier_eau">Gibier d'Eau</SelectItem>
                        <SelectItem value="protege">Protégé</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Statut de Protection</Label>
                <Select value={newSpecies.statut_protection} onValueChange={(v: any) => setNewSpecies(prev => ({ ...prev, statut_protection: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aucun">Aucun</SelectItem>
                    <SelectItem value="Partiel">Partiel</SelectItem>
                    <SelectItem value="Intégral">Intégral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="font-medium">Quota (optionnel)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newSpecies.quota ?? ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewSpecies(prev => ({ ...prev, quota: val === '' ? null : Number(val) }));
                  }}
                  placeholder="Laisser vide pour aucun quota"
                  className="mt-1"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-medium">CITES Annexe</Label>
                <Select value={newSpecies.cites_annexe || 'Non CITES'} onValueChange={(v: any) => setNewSpecies(prev => ({ ...prev, cites_annexe: v }))}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Sélectionner une annexe CITES" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">I</SelectItem>
                    <SelectItem value="II">II</SelectItem>
                    <SelectItem value="III">III</SelectItem>
                    <SelectItem value="Non CITES">Non CITES</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-medium">Photo de l'Espèce</Label>
                <div className="flex items-center gap-4 mt-1">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePhotoUpload(file);
                    }}
                  />
                  {newSpecies.photo_data && (
                    <div className="flex items-center gap-2">
                      <img src={newSpecies.photo_data} alt="Aperçu" className="w-16 h-16 object-cover rounded-lg border" />
                      <Button size="sm" variant="outline" onClick={() => setNewSpecies(prev => ({ ...prev, photo_data: undefined, photo_mime: undefined, photo_name: undefined }))}>
                        Supprimer
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 mt-4">
                  <Switch
                    checked={newSpecies.chassable}
                    onCheckedChange={(v) => setNewSpecies(prev => ({
                      ...prev,
                      chassable: v,
                      // Si on désactive chassable, taxable doit être false
                      taxable: v ? prev.taxable : false,
                    }))}
                  />
                  <Label className="font-normal">Chassable</Label>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2 mt-4">
                  <Switch
                    checked={!!newSpecies.taxable && !!newSpecies.chassable}
                    disabled={!newSpecies.chassable}
                    onCheckedChange={(v) => setNewSpecies(prev => ({
                      ...prev,
                      taxable: prev.chassable ? v : false,
                    }))}
                  />
                  <Label className="font-normal">Taxable (apparaîtra dans l'onglet Taxes d'Abattage)</Label>
                </div>
              </div>
            </div>
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => {
                setNewSpeciesOpen(false);
                setNewSpecies({ groupe: 'petite_chasse', statut_protection: 'Aucun', chassable: true, taxable: true, quota: null, cites_annexe: 'Non CITES' });
              }}>
                Annuler
              </Button>
              <Button onClick={async () => {
                if (!newSpecies.nom || !newSpecies.groupe) {
                  toast({ title: 'Erreur', description: 'Nom et groupe sont requis', variant: 'destructive' });
                  return;
                }
                const payload = {
                  ...newSpecies,
                  taxable: newSpecies.chassable ? !!newSpecies.taxable : false,
                } as Partial<Species>;
                const success = await saveSpecies(payload);
                if (success) {
                  setNewSpeciesOpen(false);
                  setNewSpecies({ groupe: 'petite_chasse', statut_protection: 'Aucun', chassable: true, taxable: true, quota: null, cites_annexe: 'Non CITES' });
                }
              }} className="bg-black hover:bg-gray-800">
                Créer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Édition Espèce */}
        <Dialog open={editSpeciesOpen} onOpenChange={setEditSpeciesOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl md:max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b pb-4">
              <DialogTitle className="text-lg sm:text-xl">Modifier l'Espèce</DialogTitle>
            </DialogHeader>
            {selectedSpecies && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 py-4">
                <div className="space-y-2">
                  <Label className="font-medium">Nom *</Label>
                  <Input
                    value={selectedSpecies.nom}
                    onChange={(e) => setSelectedSpecies(prev => prev ? ({ ...prev, nom: e.target.value }) : null)}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Nom Scientifique</Label>
                  <Input
                    value={selectedSpecies.nom_scientifique || ''}
                    onChange={(e) => setSelectedSpecies(prev => prev ? ({ ...prev, nom_scientifique: e.target.value }) : null)}
                    className="mt-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Groupe</Label>
                  <Select value={selectedSpecies.groupe} onValueChange={(v: any) => setSelectedSpecies(prev => prev ? ({ ...prev, groupe: v }) : null)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Sélectionner un groupe" />
                    </SelectTrigger>
                    <SelectContent>
                      {(groupOptions.length > 0 ? groupOptions : ['petite_chasse','grande_chasse','gibier_eau','protege','autre']).map(g => (
                        <SelectItem key={g} value={g}>{g.replace('_',' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Statut de Protection</Label>
                  <Select value={selectedSpecies.statut_protection} onValueChange={(v: any) => setSelectedSpecies(prev => prev ? ({ ...prev, statut_protection: v }) : null)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Sélectionner un statut" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aucun">Aucun</SelectItem>
                      <SelectItem value="Partiel">Partiel</SelectItem>
                      <SelectItem value="Intégral">Intégral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Quota (optionnel)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={selectedSpecies.quota ?? ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedSpecies(prev => prev ? ({ ...prev, quota: val === '' ? null : Number(val) }) : null);
                    }}
                    placeholder="Laisser vide pour aucun quota"
                    className="mt-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">CITES Annexe</Label>
                  <Select value={selectedSpecies.cites_annexe || 'Non CITES'} onValueChange={(v: any) => setSelectedSpecies(prev => prev ? ({ ...prev, cites_annexe: v }) : null)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Sélectionner une annexe CITES" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="I">I</SelectItem>
                      <SelectItem value="II">II</SelectItem>
                      <SelectItem value="III">III</SelectItem>
                      <SelectItem value="Non CITES">Non CITES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label className="font-medium">Photo de l'Espèce</Label>
                  <div className="flex items-center gap-4 mt-1">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePhotoUpload(file, true);
                      }}
                    />
                    {(selectedSpecies.photo_data || selectedSpecies.photo_url) && (
                      <div className="flex items-center gap-2">
                        <img
                          src={selectedSpecies.photo_data || selectedSpecies.photo_url}
                          alt="Aperçu"
                          className="w-16 h-16 object-cover rounded-lg border"
                        />
                        <Button size="sm" variant="outline" onClick={() => setSelectedSpecies(prev => prev ? ({
                          ...prev,
                          photo_data: undefined,
                          photo_mime: undefined,
                          photo_name: undefined,
                          photo_url: undefined
                        }) : null)}>
                          Supprimer
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 mt-4">
                    <Switch
                      checked={selectedSpecies.chassable}
                      onCheckedChange={(v) => setSelectedSpecies(prev => prev ? ({
                        ...prev,
                        chassable: v,
                        taxable: v ? prev.taxable : false,
                      }) : null)}
                    />
                    <Label className="font-normal">Chassable</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2 mt-4">
                    <Switch
                      checked={!!selectedSpecies.taxable && !!selectedSpecies.chassable}
                      disabled={!selectedSpecies.chassable}
                      onCheckedChange={(v) => setSelectedSpecies(prev => prev ? ({
                        ...prev,
                        taxable: prev.chassable ? v : false,
                      }) : null)}
                    />
                    <Label className="font-normal">Taxable (apparaîtra dans l'onglet Taxes d'Abattage)</Label>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => {
                setEditSpeciesOpen(false);
                setSelectedSpecies(null);
              }}>
                Annuler
              </Button>
              <Button onClick={async () => {
                if (!selectedSpecies?.nom || !selectedSpecies?.groupe) {
                  toast({ title: 'Erreur', description: 'Nom et groupe sont requis', variant: 'destructive' });
                  return;
                }
                const payload = {
                  ...selectedSpecies,
                  taxable: selectedSpecies.chassable ? !!selectedSpecies.taxable : false,
                } as Partial<Species>;
                const success = await updateSpecies(selectedSpecies.id, payload);
                if (success) {
                  setEditSpeciesOpen(false);
                  setSelectedSpecies(null);
                }
              }} className="bg-black hover:bg-gray-800">
                Sauvegarder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal Prévisualisation Photo */}
        <Dialog open={photoPreviewOpen} onOpenChange={setPhotoPreviewOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Aperçu de la Photo</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center p-2">
              <img src={previewPhoto} alt="Photo de l'espèce" className="max-w-full max-h-[70vh] object-contain rounded-lg" />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </main>
  );
};

export default React.memo(EspecesFauniques);
