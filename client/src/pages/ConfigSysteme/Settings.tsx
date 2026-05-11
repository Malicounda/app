import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, CheckCircle2, Edit, FileText, Info, Loader2, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaGlobeEurope, FaLeaf, FaMapMarkedAlt, FaTree } from "react-icons/fa";
// removed RadioGroup import; using Switch toggles for status controls



const formatPrice = (value: string | number): string => {
  if (value === null || value === undefined || value === '') return '';
  // Supprime tous les caractères non numériques sauf la virgule ou le point pour la saisie
  const num = Number(String(value).replace(/\s/g, ''));
  if (isNaN(num)) return '';
  // 'fr-FR' utilise un espace comme séparateur de milliers
  return num.toLocaleString('fr-FR');
};

// Helpers pour formater/parsing des prix XOF avec séparateur de milliers
const formatXof = (n: number): string => {
  try {
    return Number(n).toLocaleString('fr-FR');
  } catch {
    return String(n ?? '');
  }
};
const parseXof = (s: string): number | null => {
  const digits = (s || '').replace(/[^0-9]/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  return isNaN(n) ? null : n;
};

const sanitizeFileForUpload = (file: File): File => {
  const dotIndex = file.name.lastIndexOf('.');
  const base = dotIndex === -1 ? file.name : file.name.slice(0, dotIndex);
  const ext = dotIndex === -1 ? '' : file.name.slice(dotIndex);

  const sanitizedBase = base
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9\s._-]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$|\.+$/g, '')
    .toLowerCase() || 'document';

  const sanitizedExt = ext
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9.]/g, '')
    .toLowerCase();

  const sanitizedName = `${sanitizedBase}${sanitizedExt}`;
  return new File([file], sanitizedName, { type: file.type, lastModified: file.lastModified });
};

export default function Settings() {
  const toastHook = useToast();
  const toast = toastHook?.toast || (() => {});
  // Lecture CSV simple UTF-8 (caractères tels quels)
  const readFileAsText = useCallback(async (file: File): Promise<string> => {
    // Lecture binaire puis décodage avec détection d'encodage (UTF-8 -> fallback CP1252)
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);

    const hasUtf8BOM = u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF;

    const tryDecode = (label: string): string | null => {
      try {
        const dec = new TextDecoder(label as any, { fatal: false });
        let out = dec.decode(u8);
        // Retirer BOM si UTF-8
        if (hasUtf8BOM && label.toLowerCase() === 'utf-8' && out.charCodeAt(0) === 0xFEFF) {
          out = out.slice(1);
        }
        return out;
      } catch {
        return null;
      }
    };

    // 1) Tenter UTF-8
    let txt = tryDecode('utf-8') ?? '';

    // 2) Heuristique: si motifs typiques de mauvais décodage (mojibake), tenter CP1252
    const looksMojibake = /Ã.|�{1,}/.test(txt);
    if (looksMojibake) {
      const cp = tryDecode('windows-1252') || tryDecode('iso-8859-1');
      if (cp) txt = cp;
    }

    return txt;
  }, []);
  // NOTE: Les états loadingRegionalFilter et enableRegionalFilterProtectedZones existent déjà plus bas (l.151-152)

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoadingRegionalFilter(true);
        const res = await apiRequest<{ enabled: boolean }>('GET', '/api/settings/regional-filter-protected-zones');
        if (mounted && res?.ok && typeof (res.data as any)?.enabled === 'boolean') {
          setEnableRegionalFilterProtectedZones((res.data as any).enabled);
        }
      } catch (e) {
        console.warn('[settings] load regional filter failed', e);
      } finally {
        setLoadingRegionalFilter(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const onToggleRegionalFilter = useCallback(async (next: boolean) => {
    try {
      setLoadingRegionalFilter(true);
      const res = await apiRequest('POST', '/api/settings/regional-filter-protected-zones', { enabled: next });
      if (!res.ok) throw new Error(res.error || 'save failed');
      setEnableRegionalFilterProtectedZones(next);
      toast({ title: next ? 'Filtrage régional activé' : 'Filtrage régional désactivé' });
    } catch (e: any) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder le paramètre', variant: 'destructive' });
    } finally {
      setLoadingRegionalFilter(false);
    }
  }, [toast]);

  // Charger les items de codes (nature/article)
  const loadCodeItems = useCallback(async () => {
    setLoadingCodeItems(true);
    try {
      const resp = await apiRequest<any>('GET', '/api/infractions/codes/items');
      if (resp.ok && Array.isArray(resp.data)) {
        setCodeItems(resp.data);
      } else {
        throw new Error(resp.error || 'Erreur chargement items');
      }
    } catch (e: any) {
      console.error('[SETTINGS] load code items error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Chargement des items impossible', variant: 'destructive' });
    } finally {
      setLoadingCodeItems(false);
    }
  }, [toast]);
  const initialTab = (() => {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const t = (params.get('tab') || '').toLowerCase();
      if (t === 'codes') return 'codes-infractions';
      if (t === 'regions') return 'regions-zones';
      if (t === 'taxes') return 'hunting-taxes';
      if (t === 'prices') return 'permit-prices';
      if (t === 'season') return 'hunting-season';
      if (t === 'zones') return 'zones-config';
      if (t === 'periods') return 'specific-periods';
    } catch {}
    return 'hunting-season';
  })();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [loading, setLoading] = useState(false);
  const [zones, setZones] = useState<Record<string, any>>({});
  const [regions, setRegions] = useState<any[]>([]);

  // États pour l'upload de shapefile
  const [shapefileDestTable, setShapefileDestTable] = useState<string>("");
  const [shapefileLayerName, setShapefileLayerName] = useState<string>("");

  const [protectedZoneType, setProtectedZoneType] = useState<string>("");

  // États pour la suppression de couches
  const [deleteLayerTable, setDeleteLayerTable] = useState<string>("");
  const [deleteLayerEntities, setDeleteLayerEntities] = useState<any[]>([]);
  const [selectedDeleteEntities, setSelectedDeleteEntities] = useState<number[]>([]);
  const [loadingDeleteEntities, setLoadingDeleteEntities] = useState<boolean>(false);
  const [deletingEntities, setDeletingEntities] = useState<boolean>(false);
  const [deleteEntitiesConfirmOpen, setDeleteEntitiesConfirmOpen] = useState<boolean>(false);
  // Compteur cohérent des sélections sur la liste visible
  const selectedDeleteCountInView = useMemo(() => {
    try {
      if (!Array.isArray(deleteLayerEntities) || !Array.isArray(selectedDeleteEntities)) return 0;
      return deleteLayerEntities.reduce((acc, e) => acc + (selectedDeleteEntities.includes(e.id) ? 1 : 0), 0);
    } catch {
      return selectedDeleteEntities.length;
    }
  }, [deleteLayerEntities, selectedDeleteEntities]);

  // États pour la gestion des types de zones protégées
  type ProtectedZoneTypeItem = {
    id?: number;
    key: string;
    label: string;
    isActive: boolean;
  };
  const [protectedZoneTypes, setProtectedZoneTypes] = useState<ProtectedZoneTypeItem[]>([
    // Types de zones de chasse (affichage via boutons Carte)
    { key: 'amodiee', label: 'Amodiée', isActive: true },
    { key: 'zic', label: 'ZIC', isActive: true },
    { key: 'parc_visite', label: 'Parc de visite', isActive: true },
    { key: 'regulation', label: 'Régulation', isActive: true },
    // Types de zones protégées génériques
    { key: 'foret_classee', label: 'Forêt classée', isActive: true },
    { key: 'reserve', label: 'Réserve', isActive: true },
    { key: 'parc_national', label: 'Parc national', isActive: true },
    { key: 'aire_communautaire', label: 'Aire communautaire', isActive: true },
    { key: 'zone_tampon', label: 'Zone tampon', isActive: true },
    { key: 'amp', label: 'Aire marine protégée (AMP)', isActive: true },
    { key: 'empietement', label: 'Empiétement', isActive: true },
    { key: 'feux_brousse', label: 'Feux de brousse', isActive: true },
    { key: 'carriere', label: 'Carrière', isActive: true },
    { key: 'concession_miniere', label: 'Concession minière', isActive: true },
    { key: 'autre', label: 'Autre', isActive: true },
  ]);
  const [newProtectedTypeOpen, setNewProtectedTypeOpen] = useState<boolean>(false);
  const [editProtectedTypeOpen, setEditProtectedTypeOpen] = useState<boolean>(false);
  const [selectedProtectedType, setSelectedProtectedType] = useState<ProtectedZoneTypeItem | null>(null);
  const [newProtectedType, setNewProtectedType] = useState<Partial<ProtectedZoneTypeItem>>({
    key: '',
    label: '',
    isActive: true
  });
  const [selectedProtectedTypesToDelete, setSelectedProtectedTypesToDelete] = useState<string[]>([]);
  const [deleteProtectedTypesConfirmOpen, setDeleteProtectedTypesConfirmOpen] = useState<boolean>(false);
  const [deletingProtectedTypes, setDeletingProtectedTypes] = useState<boolean>(false);

  // État pour le filtrage régional des zones protégées
  const [enableRegionalFilterProtectedZones, setEnableRegionalFilterProtectedZones] = useState<boolean>(false);
  const [loadingRegionalFilter, setLoadingRegionalFilter] = useState<boolean>(false);

  // États pour la gestion des codes d'infractions
  type CodeInfraction = {
    id?: number;
    code: string;
    nature: string;
    article_code: string;
    created_at?: string;
    updated_at?: string;
  };
  const [codesInfractions, setCodesInfractions] = useState<CodeInfraction[]>([]);
  const [loadingCodes, setLoadingCodes] = useState<boolean>(false);
  const [newCodeOpen, setNewCodeOpen] = useState<boolean>(false);
  const [editCodeOpen, setEditCodeOpen] = useState<boolean>(false);
  const [selectedCode, setSelectedCode] = useState<CodeInfraction | null>(null);
  const [newCode, setNewCode] = useState<Partial<CodeInfraction>>({
    code: '',
    nature: '',
    article_code: ''
  });
  const [newCodeFiles, setNewCodeFiles] = useState<File[]>([]);
  const [searchCodeTerm, setSearchCodeTerm] = useState<string>('');
  // Import CSV
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importRows, setImportRows] = useState<Array<{ code: string; nature: string; article: string; par_defaut?: boolean }>>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState<boolean>(false);
  // Items de code (nature/article multiples par code)
  type CodeItem = {
    id: number;
    code_infraction_id: number;
    code: string;
    nature: string;
    article_code: string;
    is_default: boolean;
  };
  // Unités
  type UnitDef = { id: number; key: string; label: string };
  const [units, setUnits] = useState<UnitDef[]>([]);
  const [loadingUnits, setLoadingUnits] = useState<boolean>(false);
  const [newUnit, setNewUnit] = useState<{ key: string; label: string }>({ key: '', label: '' });
  const [editingUnitId, setEditingUnitId] = useState<number | null>(null);
  const [editingUnit, setEditingUnit] = useState<{ key: string; label: string }>({ key: '', label: '' });
  const [codesSubTab, setCodesSubTab] = useState<'items' | 'saisie'>('items');

  // Configuration des unités par item (dialog)
  const [unitConfigOpen, setUnitConfigOpen] = useState<boolean>(false);
  const [unitConfigItem, setUnitConfigItem] = useState<CodeItem | null>(null);
  const [unitConfigMode, setUnitConfigMode] = useState<'fixed' | 'choices'>('choices');
  const [unitConfigAllowed, setUnitConfigAllowed] = useState<string[]>([]);
  const [unitConfigFixed, setUnitConfigFixed] = useState<string>('');

  // Dialog de confirmation générique
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');
  const [confirmMessage, setConfirmMessage] = useState<string>('');

  // API Units
  const loadUnits = useCallback(async () => {
    setLoadingUnits(true);
    try {
      const resp = await apiRequest<any>('GET', '/api/infractions/units');
      if (resp.ok && Array.isArray(resp.data)) {
        setUnits(resp.data as UnitDef[]);
      } else {
        setUnits([]);
      }
    } catch {
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  }, []);

  const createUnit = useCallback(async () => {
    if (!newUnit.key.trim() || !newUnit.label.trim()) { toast({ title: 'Champs requis', description: 'Clé et libellé sont requis', variant: 'destructive' }); return; }
    const payload = { key: newUnit.key.trim(), label: newUnit.label.trim() };
    const resp = await apiRequest<any>('POST', '/api/infractions/units', payload);
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Création unité impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Unité ajoutée' });
    setNewUnit({ key: '', label: '' });
    await loadUnits();
  }, [newUnit, loadUnits, toast]);

  const saveEditUnit = useCallback(async () => {
    if (!editingUnitId) return;
    if (!editingUnit.key.trim() || !editingUnit.label.trim()) { toast({ title: 'Champs requis', description: 'Clé et libellé sont requis', variant: 'destructive' }); return; }
    const resp = await apiRequest<any>('PUT', `/api/infractions/units/${editingUnitId}`, { key: editingUnit.key.trim(), label: editingUnit.label.trim() });
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Mise à jour impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Unité mise à jour' });
    setEditingUnitId(null);
    await loadUnits();
  }, [editingUnitId, editingUnit, loadUnits, toast]);

  const deleteUnit = useCallback(async (id: number) => {
    const resp = await apiRequest<any>('DELETE', `/api/infractions/units/${id}`);
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Suppression unité impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Unité supprimée' });
    await loadUnits();
  }, [loadUnits, toast]);

  // Charger les données quand l'onglet principal "Codes Infractions" est actif
  useEffect(() => {
    if (activeTab !== 'codes-infractions') return;
    if (codesSubTab === 'saisie') {
      void loadSaisieItems();
    } else {
      void loadCodesInfractions?.();
      void loadCodeItems();
    }
  }, [activeTab, codesSubTab, loadCodeItems]);
  const [codeItems, setCodeItems] = useState<CodeItem[]>([]);
  const [loadingCodeItems, setLoadingCodeItems] = useState<boolean>(false);
  const [newItemOpen, setNewItemOpen] = useState<boolean>(false);
  const [newItem, setNewItem] = useState<{ codeLabel: string; nature: string; article_code: string; is_default?: boolean }>({ codeLabel: '', nature: '', article_code: '', is_default: false });
  // Inline form pour ajouter un item sans modal
  const [inlineNewItemCode, setInlineNewItemCode] = useState<string>('');
  const [inlineNature, setInlineNature] = useState<string>('');
  const [inlineArticle, setInlineArticle] = useState<string>('');
  const [creatingInlineItem, setCreatingInlineItem] = useState<boolean>(false);
  // Inline import CSV pour items d'un code
  const [inlineImportCode, setInlineImportCode] = useState<string>('');
  const [inlineImportFileName, setInlineImportFileName] = useState<string>('');
  const [inlineImportErrors, setInlineImportErrors] = useState<string[]>([]);
  const [inlineImportRows, setInlineImportRows] = useState<Array<{ nature: string; article: string; par_defaut?: boolean }>>([]);
  const [inlineImporting, setInlineImporting] = useState<boolean>(false);
  const confirmActionRef = useRef<null | (() => Promise<void> | void)>(null);
  // Sélection multiple d'items (nature/article)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const toggleSelectItem = useCallback((id: number, checked: boolean) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);
  const clearItemSelection = useCallback(() => setSelectedItemIds(new Set()), []);

  // Saisie Items (observations)
  type SaisieItem = {
    id: number;
    key: string;
    label: string;
    is_active: boolean;
    quantity_enabled: boolean;
    unit_mode: 'none' | 'fixed' | 'choices' | 'free';
    unit_fixed_key?: string | null;
    unit_allowed?: string[] | null;
    group_key?: string | null;
  };
  type SaisieGroup = {
    id: number;
    key: string;
    label: string;
    color?: string | null;
    is_active: boolean;
  };
  const [saisieItems, setSaisieItems] = useState<SaisieItem[]>([]);
  const [loadingSaisie, setLoadingSaisie] = useState<boolean>(false);
  const [saisieGroups, setSaisieGroups] = useState<SaisieGroup[]>([]);
  const [loadingSaisieGroups, setLoadingSaisieGroups] = useState<boolean>(false);
  const [selectedSaisieGroupKey, setSelectedSaisieGroupKey] = useState<string | null>(null);
  const [newSaisie, setNewSaisie] = useState<Partial<SaisieItem>>({ key: '', label: '', is_active: true, quantity_enabled: false, unit_mode: 'none', unit_fixed_key: '', unit_allowed: [], group_key: null });
  const [editingSaisieId, setEditingSaisieId] = useState<number | null>(null);
  const [editingSaisie, setEditingSaisie] = useState<Partial<SaisieItem>>({});
  const [groupManagerOpen, setGroupManagerOpen] = useState<boolean>(false);
  const [groupFormMode, setGroupFormMode] = useState<'create' | 'edit'>('create');
  const [groupForm, setGroupForm] = useState<{ key: string; label: string; is_active: boolean }>({ key: '', label: '', is_active: true });
  const [groupFormSubmitting, setGroupFormSubmitting] = useState<boolean>(false);
  const [groupFormOriginalKey, setGroupFormOriginalKey] = useState<string | null>(null);

  const resetGroupForm = useCallback(() => {
    setGroupForm({ key: '', label: '', is_active: true });
    setGroupFormMode('create');
    setGroupFormOriginalKey(null);
    setGroupFormSubmitting(false);
  }, []);

  const loadSaisieGroups = useCallback(async () => {
    setLoadingSaisieGroups(true);
    try {
      const resp = await apiRequest<any>('GET', '/api/infractions/saisie-groups');
      if (resp.ok && Array.isArray(resp.data)) {
        const rows = resp.data as SaisieGroup[];
        setSaisieGroups(rows);
        if (rows.length > 0 && selectedSaisieGroupKey && !rows.some(g => g.key === selectedSaisieGroupKey)) {
          setSelectedSaisieGroupKey(null);
        }
      } else {
        setSaisieGroups([]);
      }
    } catch {
      setSaisieGroups([]);
    } finally {
      setLoadingSaisieGroups(false);
    }
  }, [selectedSaisieGroupKey]);

  const loadSaisieItems = useCallback(async () => {
    setLoadingSaisie(true);
    try {
      const resp = await apiRequest<any>('GET', '/api/infractions/saisie-items');
      if (resp.ok && Array.isArray(resp.data)) setSaisieItems(resp.data as SaisieItem[]); else setSaisieItems([]);
    } catch {
      setSaisieItems([]);
    } finally {
      setLoadingSaisie(false);
    }
  }, []);

  useEffect(() => {
    if (codesSubTab === 'saisie') {
      void loadSaisieGroups();
    }
  }, [codesSubTab, loadSaisieGroups]);

  const createSaisieItem = useCallback(async () => {
    const payload: any = {
      key: (newSaisie.key || '').trim(),
      label: (newSaisie.label || '').trim(),
      is_active: newSaisie.is_active ?? true,
      quantity_enabled: !!newSaisie.quantity_enabled,
      unit_mode: (newSaisie.unit_mode as any) || 'none',
      unit_fixed_key: (newSaisie.unit_mode === 'fixed' ? (newSaisie.unit_fixed_key || '').trim() : null) || null,
      unit_allowed: newSaisie.unit_mode === 'choices' ? (Array.isArray(newSaisie.unit_allowed) ? newSaisie.unit_allowed : []) : [],
      group_key: newSaisie.group_key ? String(newSaisie.group_key) : null,
    };
    if (!payload.key || !payload.label) { toast({ title: 'Champs requis', description: 'Clé et Libellé sont requis', variant: 'destructive' }); return; }
    const resp = await apiRequest<any>('POST', '/api/infractions/saisie-items', payload);
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Création impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Item créé' });
    setNewSaisie({ key: '', label: '', is_active: true, quantity_enabled: false, unit_mode: 'none', unit_fixed_key: '', unit_allowed: [], group_key: selectedSaisieGroupKey });
    await loadSaisieItems();
  }, [newSaisie, loadSaisieItems, toast, selectedSaisieGroupKey]);

  const saveEditSaisie = useCallback(async () => {
    if (!editingSaisieId) return;
    const payload: any = {
      key: (editingSaisie.key || '').trim(),
      label: (editingSaisie.label || '').trim(),
      is_active: editingSaisie.is_active ?? true,
      quantity_enabled: !!editingSaisie.quantity_enabled,
      unit_mode: (editingSaisie.unit_mode as any) || 'none',
      unit_fixed_key: editingSaisie.unit_mode === 'fixed' ? (editingSaisie.unit_fixed_key || '').trim() : null,
      unit_allowed: editingSaisie.unit_mode === 'choices' ? (Array.isArray(editingSaisie.unit_allowed) ? editingSaisie.unit_allowed : []) : [],
      group_key: editingSaisie.group_key ? String(editingSaisie.group_key) : null,
    };
    if (!payload.key || !payload.label) { toast({ title: 'Champs requis', description: 'Clé et Libellé sont requis', variant: 'destructive' }); return; }
    const resp = await apiRequest<any>('PUT', `/api/infractions/saisie-items/${editingSaisieId}`, payload);
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Mise à jour impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Item mis à jour' });
    setEditingSaisieId(null);
    await loadSaisieItems();
  }, [editingSaisieId, editingSaisie, loadSaisieItems, toast]);

  const deleteSaisieItem = useCallback(async (id: number) => {
    const resp = await apiRequest<any>('DELETE', `/api/infractions/saisie-items/${id}`);
    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Suppression impossible', variant: 'destructive' }); return; }
    toast({ title: 'Succès', description: 'Item supprimé' });
    await loadSaisieItems();
  }, [loadSaisieItems, toast]);

  const filteredSaisieItems = useMemo(() => {
    if (!selectedSaisieGroupKey) return saisieItems;
    return saisieItems.filter(item => (item.group_key || null) === selectedSaisieGroupKey);
  }, [saisieItems, selectedSaisieGroupKey]);

  const groupedSaisieItems = useMemo(() => {
    const groupMap = new Map(saisieGroups.map(g => [g.key, g] as const));
    const groups: Record<string, { group: SaisieGroup | null; items: SaisieItem[] }> = {};
    for (const item of filteredSaisieItems) {
      const key = item.group_key || 'autre';
      if (!groups[key]) {
        groups[key] = { group: groupMap.get(item.group_key || '') || null, items: [] };
      }
      groups[key].items.push(item);
    }
    return Object.entries(groups)
      .map(([key, value]) => ({ key, group: value.group, items: value.items }))
      .sort((a, b) => (a.group?.label || a.key).localeCompare(b.group?.label || b.key, 'fr'));
  }, [filteredSaisieItems, saisieGroups]);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of saisieItems) {
      const key = item.group_key || 'autre';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [saisieItems]);

  const redChipClasses = 'border border-red-200 bg-red-50 text-red-700';
  const NO_GROUP_VALUE = '__no_group__';

  const groupMap = useMemo(() => new Map(saisieGroups.map(group => [group.key, group] as const)), [saisieGroups]);

  const formatGroupLabel = useCallback((key: string, group?: SaisieGroup | null) => {
    if (group?.label) return group.label;
    if (key === 'autre') return 'Sans groupe';
    return key.replace(/_/g, ' ').replace(/(^|\s)([a-zà-ÿ])/g, (_, space: string, char: string) => `${space}${char.toUpperCase()}`);
  }, []);

  const openCreateGroup = useCallback(() => {
    resetGroupForm();
    setGroupManagerOpen(true);
  }, [resetGroupForm]);

  const openEditGroup = useCallback((group: SaisieGroup) => {
    setGroupFormMode('edit');
    setGroupForm({ key: group.key, label: group.label, is_active: group.is_active });
    setGroupFormOriginalKey(group.key);
    setGroupManagerOpen(true);
  }, []);

  const submitGroupForm = useCallback(async () => {
    if (!groupForm.key.trim() || !groupForm.label.trim()) {
      toast({ title: 'Champs requis', description: 'Clé et libellé sont requis pour le groupe', variant: 'destructive' });
      return;
    }
    setGroupFormSubmitting(true);
    try {
      const payload = {
        key: groupForm.key.trim(),
        label: groupForm.label.trim(),
        is_active: groupForm.is_active,
      };
      const resp = groupFormMode === 'create'
        ? await apiRequest<any>('POST', '/api/infractions/saisie-groups', payload)
        : await apiRequest<any>('PUT', `/api/infractions/saisie-groups/${encodeURIComponent(groupFormOriginalKey || groupForm.key)}`, payload);
      if (!resp.ok) {
        toast({ title: 'Erreur', description: resp.error || 'Opération impossible', variant: 'destructive' });
        return;
      }
      toast({ title: 'Succès', description: groupFormMode === 'create' ? 'Groupe créé' : 'Groupe mis à jour' });
      setGroupManagerOpen(false);
      resetGroupForm();
      await loadSaisieGroups();
    } catch (e) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder le groupe', variant: 'destructive' });
    } finally {
      setGroupFormSubmitting(false);
    }
  }, [groupForm, groupFormMode, toast, loadSaisieGroups, groupFormOriginalKey, resetGroupForm]);

  const deleteGroup = useCallback(async (key: string) => {
    const resp = await apiRequest<any>('DELETE', `/api/infractions/saisie-groups/${encodeURIComponent(key)}`);
    if (!resp.ok) {
      toast({ title: 'Erreur', description: resp.error || 'Suppression impossible', variant: 'destructive' });
      return;
    }
    toast({ title: 'Succès', description: 'Groupe supprimé' });
    if (selectedSaisieGroupKey === key) setSelectedSaisieGroupKey(null);
    await Promise.all([loadSaisieGroups(), loadSaisieItems()]);
  }, [loadSaisieGroups, loadSaisieItems, selectedSaisieGroupKey, toast]);


  // Normalisation pour recherche uniquement (sans accents, insensible casse)
  const normalizeForSearch = useCallback((s: string) => (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim(), []);

  // Fonction pour comparer en gardant les accents dans l'affichage
  const normalize = useCallback((s: string) => (s || '').toLowerCase().trim(), []);
  const [uploadedFiles, setUploadedFiles] = useState<{
    shp: File | null;
    shx: File | null;
    dbf: File | null;
    prj: File | null;
  }>({
    shp: null,
    shx: null,
    dbf: null,
    prj: null,
  });
  // Espèces et Taxes d'abattage - Gestion dynamique
  type Species = {
    id: number;
    nom: string;
    nom_scientifique?: string;
    groupe: string;
    statut_protection: string;
    chassable: boolean;
    taxable: boolean;
    photo_url?: string;
    is_active?: boolean;
  };

  type HuntingTax = {
    id?: number | null;
    espece_id: number;
    prix_xof: number;
    taxable?: boolean;
    is_active?: boolean;
    espece_nom: string;
    espece_code?: string;
    groupe: string;
  };

  const [species, setSpecies] = useState<Species[]>([]);
  const [huntingTaxes, setHuntingTaxes] = useState<HuntingTax[]>([]);
  const [editTaxesMode, setEditTaxesMode] = useState<boolean>(false);
  const [taxEdits, setTaxEdits] = useState<Record<number, string>>({}); // key: espece_id
  const [savingTaxEspeceId, setSavingTaxEspeceId] = useState<number | null>(null);
  const [loadingSpecies, setLoadingSpecies] = useState<boolean>(false);
  const [loadingTaxes, setLoadingTaxes] = useState<boolean>(false);

  // Armes: types, marques, calibres
  type WeaponType = { id: string; code?: string; label: string; isActive?: boolean };
  type WeaponBrand = { id: string; code?: string; label: string; isActive?: boolean; weaponTypeId: string };
  type WeaponCaliber = { id: string; code?: string; label: string; isActive?: boolean; weaponTypeId: string };

  const [weaponTypes, setWeaponTypes] = useState<WeaponType[]>([]);
  const [selectedWeaponTypeId, setSelectedWeaponTypeId] = useState<string>('');
  const [openTypeIds, setOpenTypeIds] = useState<string[]>([]);
  const [weaponBrands, setWeaponBrands] = useState<WeaponBrand[]>([]);
  const [weaponCalibers, setWeaponCalibers] = useState<WeaponCaliber[]>([]);
  const [loadingWeapons, setLoadingWeapons] = useState<boolean>(false);
  // Cache des marques/calibres par type
  const [brandsByType, setBrandsByType] = useState<Record<string, WeaponBrand[]>>({});
  const [calibersByType, setCalibersByType] = useState<Record<string, WeaponCaliber[]>>({});
  const [newTypeLabel, setNewTypeLabel] = useState<string>('');
  const [newBrandLabel, setNewBrandLabel] = useState<string>('');
  const [newCaliberLabel, setNewCaliberLabel] = useState<string>('');

  const loadWeaponTypes = useCallback(async () => {
    try {
      const resp = await apiRequest<any>('GET', '/weapons/types');
      if (resp.ok) {
        const rows = Array.isArray(resp.data) ? resp.data : (resp.data?.rows || []);
        const isFirstLoad = weaponTypes.length === 0;
        setWeaponTypes(rows);
        // par défaut fermé seulement au premier chargement
        if (isFirstLoad) {
          setOpenTypeIds([]);
          setSelectedWeaponTypeId('');
        }
      }
    } catch (e) {
      console.error('[SETTINGS] loadWeaponTypes error:', e);
    }
  }, [weaponTypes.length]);

  const loadBrandsAndCalibers = useCallback(async (typeId: string) => {
    if (!typeId) { setWeaponBrands([]); setWeaponCalibers([]); return; }
    setLoadingWeapons(true);
    try {
      const [brandsResp, calibersResp] = await Promise.all([
        apiRequest<any>('GET', `/weapons/brands?typeId=${encodeURIComponent(typeId)}`),
        apiRequest<any>('GET', `/weapons/calibers?typeId=${encodeURIComponent(typeId)}`),
      ]);
      if (brandsResp.ok) {
        const rows = Array.isArray(brandsResp.data) ? brandsResp.data : (brandsResp.data?.rows || []);
        setWeaponBrands(rows);
        setBrandsByType(prev => ({ ...prev, [typeId]: rows }));
      }
      if (calibersResp.ok) {
        const rows = Array.isArray(calibersResp.data) ? calibersResp.data : (calibersResp.data?.rows || []);
        setWeaponCalibers(rows);
        setCalibersByType(prev => ({ ...prev, [typeId]: rows }));
      }
    } catch (e) {
      console.error('[SETTINGS] loadBrandsAndCalibers error:', e);
    } finally {
      setLoadingWeapons(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'hunting-season') {
      void loadWeaponTypes();
    }
  }, [activeTab, loadWeaponTypes]);

  useEffect(() => {
    if (selectedWeaponTypeId) { void loadBrandsAndCalibers(selectedWeaponTypeId); }
  }, [selectedWeaponTypeId, loadBrandsAndCalibers]);

  // Charger les données pour chaque type ouvert
  useEffect(() => {
    openTypeIds.forEach(typeId => {
      if (!brandsByType[typeId] && !calibersByType[typeId]) {
        void loadBrandsAndCalibers(typeId);
      }
    });
  }, [openTypeIds, brandsByType, calibersByType, loadBrandsAndCalibers]);

  const addWeaponType = async () => {
    const label = newTypeLabel.trim();
    if (!label) { toast({ title: 'Libellé requis', description: 'Veuillez saisir le libellé du type', variant: 'destructive' }); return; }
    try {
      const resp = await apiRequest<any>('POST', '/weapons/types', { label });
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      setNewTypeLabel('');
      toast({ title: 'Succès', description: 'Type créé' });
      await loadWeaponTypes();
    } catch (e: any) {
      console.error('[SETTINGS] addWeaponType error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Création impossible', variant: 'destructive' });
    }
  };

  const addWeaponBrand = async () => {
    const label = newBrandLabel.trim();
    if (!selectedWeaponTypeId) { toast({ title: 'Type requis', description: 'Choisissez un type', variant: 'destructive' }); return; }
    if (!label) { toast({ title: 'Libellé requis', description: 'Veuillez saisir la marque', variant: 'destructive' }); return; }
    try {
      const resp = await apiRequest<any>('POST', '/weapons/brands', { weaponTypeId: selectedWeaponTypeId, label });
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      setNewBrandLabel('');
      toast({ title: 'Succès', description: 'Marque créée' });
      await loadBrandsAndCalibers(selectedWeaponTypeId);
    } catch (e: any) {
      console.error('[SETTINGS] addWeaponBrand error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Création impossible', variant: 'destructive' });
    }
  };

  const addWeaponCaliber = async () => {
    const label = newCaliberLabel.trim();
    if (!selectedWeaponTypeId) { toast({ title: 'Type requis', description: 'Choisissez un type', variant: 'destructive' }); return; }
    if (!label) { toast({ title: 'Libellé requis', description: 'Veuillez saisir le calibre', variant: 'destructive' }); return; }
    try {
      const resp = await apiRequest<any>('POST', '/weapons/calibers', { weaponTypeId: selectedWeaponTypeId, label });
      if (!resp.ok) throw new Error(resp.error || 'Création impossible');
      setNewCaliberLabel('');
      toast({ title: 'Succès', description: 'Calibre créé' });
      await loadBrandsAndCalibers(selectedWeaponTypeId);
    } catch (e: any) {
      console.error('[SETTINGS] addWeaponCaliber error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Création impossible', variant: 'destructive' });
    }
  };

  const deleteWeaponBrand = async (id: string) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/weapons/brands/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Suppression impossible');
      toast({ title: 'Succès', description: 'Marque supprimée' });
      await loadBrandsAndCalibers(selectedWeaponTypeId);
    } catch (e: any) {
      console.error('[SETTINGS] deleteWeaponBrand error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  const deleteWeaponCaliber = async (id: string) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/weapons/calibers/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Suppression impossible');
      toast({ title: 'Succès', description: 'Calibre supprimé' });
      await loadBrandsAndCalibers(selectedWeaponTypeId);
    } catch (e: any) {
      console.error('[SETTINGS] deleteWeaponCaliber error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  const deleteWeaponType = async (id: string) => {
    if (!id) return;
    try {
      const resp = await apiRequest<any>('DELETE', `/weapons/types/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Suppression impossible');
      toast({ title: 'Succès', description: "Type d'arme supprimé" });
      setSelectedWeaponTypeId('');
      await loadWeaponTypes();
      setWeaponBrands([]);
      setWeaponCalibers([]);
    } catch (e: any) {
      console.error('[SETTINGS] deleteWeaponType error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  // Confirmation suppression (armes)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState<boolean>(false);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ kind: 'type' | 'brand' | 'caliber'; id: string; label?: string } | null>(null);

  const openDeleteConfirm = (kind: 'type' | 'brand' | 'caliber', id: string, label?: string) => {
    setConfirmDeleteTarget({ kind, id, label });
    setConfirmDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    const t = confirmDeleteTarget;
    if (!t) { setConfirmDeleteOpen(false); return; }
    try {
      if (t.kind === 'type') {
        await deleteWeaponType(t.id);
      } else if (t.kind === 'brand') {
        await deleteWeaponBrand(t.id);
      } else if (t.kind === 'caliber') {
        await deleteWeaponCaliber(t.id);
      }
    } finally {
      setConfirmDeleteOpen(false);
      setConfirmDeleteTarget(null);
    }
  };

  // États pour les modals
  const [newSpeciesOpen, setNewSpeciesOpen] = useState<boolean>(false);
  const [editSpeciesOpen, setEditSpeciesOpen] = useState<boolean>(false);
  const [newTaxOpen, setNewTaxOpen] = useState<boolean>(false);
  const [selectedSpecies, setSelectedSpecies] = useState<Species | null>(null);

  // États pour les nouveaux éléments
  const [newSpecies, setNewSpecies] = useState<Partial<Species>>({
    groupe: 'petite_chasse',
    statut_protection: 'Aucun',
    chassable: true,
    taxable: true,
  });
  const [newTax, setNewTax] = useState<{ espece_id: number | null; prix_xof: string }>({ espece_id: null, prix_xof: '' });

  // Dialog d'information (validation campagne)
  const [campaignInfoModal, setCampaignInfoModal] = useState<{ open: boolean; title: string; description: string; variant?: 'info' | 'success' }>({ open: false, title: '', description: '', variant: 'info' });

  // Charger les espèces depuis l'API
  const loadSpecies = useCallback(async () => {
    setLoadingSpecies(true);
    try {
      const resp = await apiRequest<{ok: boolean, data: Species[], error?: string}>('GET', '/settings/species');
      console.log('[DEBUG Settings] loadSpecies response:', resp);
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        setSpecies(serverResponse.data);
      } else {
        throw new Error(serverResponse?.error || resp.error || 'Erreur chargement espèces');
      }
    } catch (e: any) {
      console.error('[SETTINGS] load species error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Chargement des espèces impossible', variant: 'destructive' });
    } finally {
      setLoadingSpecies(false);
    }
  }, [toast]);

  // (moved commitAllTaxEdits and handleToggleEditTaxes below after saveHuntingTax)

  // Charger les taxes d'abattage depuis l'API
  const loadHuntingTaxes = useCallback(async () => {
    setLoadingTaxes(true);
    try {
      const resp = await apiRequest<{ok: boolean, data: HuntingTax[], error?: string}>('GET', '/settings/hunting-taxes');
      console.log('[DEBUG Settings] loadHuntingTaxes response:', resp);
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        const list = serverResponse.data as HuntingTax[];
        setHuntingTaxes(list);
        // initialize local edits (formatted) for inline editing
        setTaxEdits(() => {
          const next: Record<number, string> = {};
          list.forEach(row => {
            const val = Number(row.prix_xof || 0);
            next[row.espece_id] = formatXof(val);
          });
          return next;
        });
      } else {
        throw new Error(serverResponse?.error || resp.error || 'Erreur chargement taxes');
      }
    } catch (e: any) {
      console.error('[SETTINGS] load hunting taxes error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Chargement des taxes impossible', variant: 'destructive' });
    } finally {
      setLoadingTaxes(false);
    }
  }, [toast]);

  // Sauvegarder une espèce
  const saveSpecies = async (speciesData: Partial<Species>, isEdit = false) => {
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/settings/species/${speciesData.id}` : '/settings/species';
      const resp = await apiRequest<any>(method, url, speciesData);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde espèce');

      toast({ title: 'Succès', description: isEdit ? 'Espèce mise à jour' : 'Espèce créée' });
      await loadSpecies();
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save species error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Sauvegarde impossible', variant: 'destructive' });
      return false;
    }
  };

  // Supprimer une espèce
  const deleteSpecies = async (id: number) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/settings/species/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Erreur suppression espèce');

      toast({ title: 'Succès', description: 'Espèce désactivée' });
      await loadSpecies();
    } catch (e: any) {
      console.error('[SETTINGS] delete species error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  // Sauvegarder une taxe d'abattage
  const saveHuntingTax = async (taxData: { espece_id: number; prix_xof: number }, opts?: { silent?: boolean }) => {
    try {
      const resp = await apiRequest<any>('POST', '/settings/hunting-taxes', taxData);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde taxe');
      if (!opts?.silent) {
        toast({ title: 'Succès', description: 'Taxe d\'abattage enregistrée' });
      }
      await loadHuntingTaxes();
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save hunting tax error:', e);
      if (!opts?.silent) {
        toast({ title: 'Erreur', description: e?.message || 'Sauvegarde impossible', variant: 'destructive' });
      }
      return false;
    }
  };

  // Commit all edits when toggling edit mode OFF (redeclared here after saveHuntingTax)
  const commitAllTaxEdits = useCallback(async () => {
    const list = [...huntingTaxes];
    for (const row of list) {
      const txt = taxEdits[row.espece_id];
      const parsed = parseXof(txt ?? '');
      const newVal = parsed ?? 0;
      if (Number(row.prix_xof || 0) !== newVal) {
        setSavingTaxEspeceId(row.espece_id);
        try {
          await saveHuntingTax({ espece_id: row.espece_id, prix_xof: newVal }, { silent: true });
        } catch {
          // handled inside saveHuntingTax toast
        } finally {
          setSavingTaxEspeceId(null);
        }
      }
    }
    // reload list to reflect saved values
    await loadHuntingTaxes();
  }, [huntingTaxes, taxEdits, saveHuntingTax, loadHuntingTaxes]);

  // Toggle handler for edit mode to commit changes on disable
  const handleToggleEditTaxes = useCallback(async (on: boolean) => {
    if (!on) {
      await commitAllTaxEdits();
    }
    setEditTaxesMode(on);
  }, [commitAllTaxEdits]);

  // Supprimer une taxe d'abattage
  const deleteHuntingTax = async (id: number) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/settings/hunting-taxes/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Erreur suppression taxe');

      toast({ title: 'Succès', description: 'Taxe d\'abattage supprimée' });
      await loadHuntingTaxes();
    } catch (e: any) {
      console.error('[SETTINGS] delete hunting tax error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  // Handlers Zones (placeholders simples pour éviter erreurs TS)
  const handleAddZone = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Implémentation réelle à brancher sur l'API ou la source de données
  };
  const handleAddPoint = (containerId: string, latInputId: string, lngInputId: string) => {
    // Placeholder: ajoute un affichage simple des coordonnées saisies, si présentes
    try {
      const container = document.getElementById(containerId);
      const latEl = document.getElementById(latInputId) as HTMLInputElement | null;
      const lngEl = document.getElementById(lngInputId) as HTMLInputElement | null;
      if (container && latEl && lngEl) {
        const lat = latEl.value || "";
        const lng = lngEl.value || "";
        const item = document.createElement('div');
        item.className = 'text-sm text-gray-600 flex items-center gap-2 py-1';
        item.textContent = lat && lng ? `Point: ${lat}, ${lng}` : 'Point ajouté';
        container.appendChild(item);
      }
    } catch (e) {
      console.warn('[Settings] handleAddPoint placeholder error:', e);
    }
  };
  const handleRemovePoint = (e: React.MouseEvent<HTMLDivElement>) => {
    // Placeholder: retire le dernier enfant si existe
    const container = e.currentTarget;
    if (container && container.lastChild) {
      container.removeChild(container.lastChild);
    }
  };
  const handleUpdateZone = () => {
    // Mettre à jour une zone (exemple)
  };
  const handleUpdateRegion = () => {
    // Mettre à jour une région (exemple)
  };
  const handleDeleteZone = () => {
    // Supprimer une zone (exemple)
  };

  // Charger les entités d'une table pour suppression
  const loadDeleteLayerEntities = useCallback(async (table: string) => {
    if (!table) return;
    setLoadingDeleteEntities(true);
    try {
      let endpoint = '';
      switch (table) {
        case 'regions':
          endpoint = '/api/regions';
          break;
        case 'departements':
          endpoint = '/api/departements';
          break;
        case 'communes':
          endpoint = '/api/communes';
          break;
        case 'arrondissements':
          endpoint = '/api/arrondissements';
          break;
        case 'eco_geographie_zones':
          endpoint = '/api/eco-zones';
          break;
        case 'protected_zones':
          endpoint = '/api/protected-zones';
          break;
        default:
          throw new Error('Table non supportée');
      }

      const resp = await apiRequest<any>('GET', endpoint);
      if (!resp.ok) throw new Error(resp.error || 'Erreur chargement des entités');

      // Extraire les features du GeoJSON
      const data = resp.data;
      let entities = [];

      if (data?.features && Array.isArray(data.features)) {
        // Format GeoJSON
        entities = data.features.map((f: any, idx: number) => {
          const rawId = (f.properties?.id ?? f.id ?? f.properties?.code ?? f.properties?.nom ?? f.properties?.name);
          let idNum: number | undefined;
          if (typeof rawId === 'number') {
            idNum = rawId;
          } else if (typeof rawId === 'string') {
            const parsed = Number(rawId);
            idNum = Number.isFinite(parsed) ? parsed : undefined;
          }
          const safeId = (idNum !== undefined && !Number.isNaN(idNum)) ? idNum : (idx + 1); // Fallback index to ensure uniqueness
          return {
            id: safeId,
            name: f.properties?.nom || f.properties?.name || f.properties?.code || `ID: ${safeId}`,
            type: f.properties?.type || f.properties?.zone_type || '',
          };
        });
      } else if (Array.isArray(data)) {
        // Format tableau direct
        entities = data.map((item: any, idx: number) => {
          const rawId = (item.id ?? item.code ?? item.nom ?? item.name);
          let idNum: number | undefined;
          if (typeof rawId === 'number') {
            idNum = rawId;
          } else if (typeof rawId === 'string') {
            const parsed = Number(rawId);
            idNum = Number.isFinite(parsed) ? parsed : undefined;
          }
          const safeId = (idNum !== undefined && !Number.isNaN(idNum)) ? idNum : (idx + 1);
          return {
            id: safeId,
            name: item.nom || item.name || item.code || `ID: ${safeId}`,
            type: item.type || item.zone_type || '',
          };
        });
      }

      setDeleteLayerEntities(entities);
      setSelectedDeleteEntities([]);
    } catch (e: any) {
      console.error('[SETTINGS] load delete entities error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Chargement des entités impossible',
        variant: 'destructive'
      });
      setDeleteLayerEntities([]);
    } finally {
      setLoadingDeleteEntities(false);
    }
  }, [toast]);

  // Supprimer les entités sélectionnées
  const handleDeleteSelectedEntities = async () => {
    if (selectedDeleteEntities.length === 0) {
      toast({
        title: 'Aucune sélection',
        description: 'Veuillez sélectionner au moins une entité à supprimer',
        variant: 'destructive'
      });
      return;
    }

    setDeletingEntities(true);
    try {
      let endpoint = '';
      switch (deleteLayerTable) {
        case 'regions':
          endpoint = '/api/regions';
          break;
        case 'departements':
          endpoint = '/api/departements';
          break;
        case 'communes':
          endpoint = '/api/communes';
          break;
        case 'arrondissements':
          endpoint = '/api/arrondissements';
          break;
        case 'eco_geographie_zones':
          endpoint = '/api/eco-zones';
          break;
        case 'protected_zones':
          endpoint = '/api/protected-zones';
          break;
        default:
          throw new Error('Table non supportée');
      }

      let successCount = 0;
      let errorCount = 0;

      for (const id of selectedDeleteEntities) {
        try {
          const resp = await apiRequest<any>('DELETE', `${endpoint}/${id}`);
          if (resp.ok) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (e) {
          errorCount++;
          console.error(`Erreur suppression entité ${id}:`, e);
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Succès',
          description: `${successCount} entité(s) supprimée(s) avec succès${errorCount > 0 ? ` (${errorCount} erreur(s))` : ''}`
        });

        // Recharger la liste
        await loadDeleteLayerEntities(deleteLayerTable);
      } else {
        throw new Error('Aucune entité n\'a pu être supprimée');
      }
    } catch (e: any) {
      console.error('[SETTINGS] delete entities error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Suppression impossible',
        variant: 'destructive'
      });
    } finally {
      setDeletingEntities(false);
    }
  };

  // Charger les types de zones protégées depuis l'API
  const loadProtectedZoneTypes = useCallback(async () => {
    try {
      const resp = await apiRequest<any>('GET', '/settings/protected-zone-types');
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        const rows = serverResponse.data as any[];
        const mapped = rows.map((r) => ({
          id: Number(r.id),
          key: String(r.key),
          label: String(r.label),
          isActive: !!(r.isActive ?? r.is_active),
        })) as ProtectedZoneTypeItem[];
        // Fusionner avec les valeurs par défaut pour garantir la présence des types de chasse (amodiée, zic, parc_visite, regulation)
        setProtectedZoneTypes((prevDefaults) => {
          const byKey: Record<string, ProtectedZoneTypeItem> = {};
          // commencer par les valeurs par défaut actuelles
          for (const t of prevDefaults) byKey[t.key] = t;
          // écraser/ajouter avec celles du serveur
          for (const t of mapped) byKey[t.key] = t;
          return Object.values(byKey);
        });
      }
    } catch (e: any) {
      console.error('[SETTINGS] load protected zone types error:', e);
      // Garder les valeurs par défaut en cas d'erreur
    }
  }, []);

  // Fonctions pour la gestion des codes d'infractions
  const loadCodesInfractions = useCallback(async () => {
    setLoadingCodes(true);
    try {
      const resp = await apiRequest<any>('GET', '/api/infractions/codes');
      if (resp.ok && Array.isArray(resp.data)) {
        console.log('[SETTINGS] Codes chargés:', resp.data.length, 'codes');
        setCodesInfractions(resp.data);
      } else {
        throw new Error(resp.error || 'Erreur chargement codes');
      }
    } catch (e: any) {
      console.error('[SETTINGS] load codes infractions error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Chargement des codes impossible', variant: 'destructive' });
    } finally {
      setLoadingCodes(false);
    }
  }, [toast]);

  const saveCodeInfraction = async (codeData: Partial<CodeInfraction>, isEdit = false) => {
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/api/infractions/codes/${codeData.id}` : '/api/infractions/codes';
      const resp = await apiRequest<any>(method, url, codeData);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde code');

      toast({ title: 'Succès', description: isEdit ? 'Code mis à jour' : 'Code créé' });
      await loadCodesInfractions();
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save code infraction error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Sauvegarde impossible', variant: 'destructive' });
      return false;
    }
  };

  const deleteCodeInfraction = async (id: number) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/api/infractions/codes/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Erreur suppression code');

      toast({ title: 'Succès', description: 'Code supprimé' });
      await loadCodesInfractions();
    } catch (e: any) {
      console.error('[SETTINGS] delete code infraction error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Suppression impossible', variant: 'destructive' });
    }
  };

  // Charger les codes d'infractions au montage du composant
  useEffect(() => {
    if (activeTab === 'codes-infractions') {
      void loadCodesInfractions();
      void loadCodeItems();
      void loadUnits();
    }
  }, [activeTab, loadCodesInfractions, loadCodeItems, loadUnits]);

  // Filtrer les codes d'infractions selon le terme de recherche
  const filteredCodesInfractions = useMemo(() => {
    const term = normalizeForSearch(searchCodeTerm || '');
    if (!term) return codesInfractions;
    return codesInfractions.filter(code =>
      normalizeForSearch(code.code || '').includes(term) ||
      normalizeForSearch(code.nature || '').includes(term) ||
      normalizeForSearch(code.article_code || '').includes(term)
    );
  }, [codesInfractions, searchCodeTerm, normalizeForSearch]);

  // Filtrer les items selon recherche (par nature/article) et regrouper par code
  const filteredCodeItems = useMemo(() => {
    const term = normalizeForSearch(searchCodeTerm || '');
    if (!term) return codeItems;
    return codeItems.filter(ci =>
      normalizeForSearch(ci.nature || '').includes(term) ||
      normalizeForSearch(ci.article_code || '').includes(term) ||
      normalizeForSearch(ci.code || '').includes(term)
    );
  }, [codeItems, searchCodeTerm, normalizeForSearch]);

  const groupsFromItems = useMemo(() => {
    const map: Record<string, { label: string; items: CodeItem[] }> = {};
    for (const it of filteredCodeItems) {
      const raw = String(it.code || '').trim();
      const key = normalize(raw);
      if (!map[key]) map[key] = { label: raw, items: [] };
      map[key].items.push(it);
    }
    return Object.entries(map)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([_, v]) => v);
  }, [filteredCodeItems, normalize]);

  // Fusionner les codes avec et sans items pour affichage complet
  const allGroups = useMemo(() => {
    const map: Record<string, { label: string; items: CodeItem[] }> = {};

    // D'abord, ajouter tous les codes (même sans items)
    for (const c of filteredCodesInfractions) {
      const raw = String(c.code || '').trim();
      const key = normalize(raw);
      if (!map[key]) map[key] = { label: raw, items: [] };
    }

    // Ensuite, ajouter les items aux codes correspondants
    for (const group of groupsFromItems) {
      const key = normalize(group.label);
      if (map[key]) {
        map[key].items = group.items;
      } else {
        // Si le code n'existe pas dans filteredCodesInfractions, l'ajouter quand même
        map[key] = group;
      }
    }

    return Object.entries(map)
      .sort((a,b) => a[0].localeCompare(b[0]))
      .map(([_, v]) => v);
  }, [filteredCodesInfractions, groupsFromItems, normalize]);

  // Charger le paramètre de filtrage régional
  const loadRegionalFilterSetting = useCallback(async () => {
    try {
      const resp = await apiRequest<any>('GET', '/settings/regional-filter-protected-zones');
      if (resp.ok && resp.data) {
        setEnableRegionalFilterProtectedZones(resp.data.enabled || false);
      }
    } catch (e: any) {
      console.error('[SETTINGS] load regional filter setting error:', e);
    }
  }, []);

  // Sauvegarder le paramètre de filtrage régional
  const saveRegionalFilterSetting = async (enabled: boolean) => {
    setLoadingRegionalFilter(true);
    try {
      const resp = await apiRequest<any>('POST', '/settings/regional-filter-protected-zones', { enabled });
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde paramètre');

      toast({
        title: 'Succès',
        description: enabled
          ? 'Filtrage régional activé : les agents verront uniquement les zones de leur région'
          : 'Filtrage régional désactivé : tous les agents verront toutes les zones protégées'
      });
      setEnableRegionalFilterProtectedZones(enabled);
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save regional filter setting error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Sauvegarde impossible',
        variant: 'destructive'
      });
      return false;
    } finally {
      setLoadingRegionalFilter(false);
    }
  };

  // Sauvegarder un type de zone protégée
  const saveProtectedZoneType = async (typeData: Partial<ProtectedZoneTypeItem>, isEdit = false) => {
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/settings/protected-zone-types/${typeData.id}` : '/settings/protected-zone-types';
      const resp = await apiRequest<any>(method, url, typeData);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde type de zone protégée');

      toast({
        title: 'Succès',
        description: isEdit ? 'Type de zone protégée mis à jour' : 'Type de zone protégée créé'
      });
      await loadProtectedZoneTypes();
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save protected zone type error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Sauvegarde impossible',
        variant: 'destructive'
      });
      return false;
    }
  };

  // Supprimer un type de zone protégée
  const deleteProtectedZoneType = async (id: number) => {
    try {
      const resp = await apiRequest<any>('DELETE', `/settings/protected-zone-types/${id}`);
      if (!resp.ok) throw new Error(resp.error || 'Erreur suppression type de zone protégée');

      toast({ title: 'Succès', description: 'Type de zone protégée supprimé' });
      await loadProtectedZoneTypes();
    } catch (e: any) {
      console.error('[SETTINGS] delete protected zone type error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Suppression impossible',
        variant: 'destructive'
      });
    }
  };

  // Supprimer plusieurs types de zones protégées
  const deleteSelectedProtectedTypes = async () => {
    if (selectedProtectedTypesToDelete.length === 0) return;

    setDeletingProtectedTypes(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const key of selectedProtectedTypesToDelete) {
        const type = protectedZoneTypes.find(t => t.key === key);
        if (type?.id) {
          try {
            const resp = await apiRequest<any>('DELETE', `/settings/protected-zone-types/${type.id}`);
            if (resp.ok) {
              successCount++;
            } else {
              errorCount++;
            }
          } catch (e) {
            errorCount++;
            console.error(`Erreur suppression type ${key}:`, e);
          }
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Succès',
          description: `${successCount} type(s) supprimé(s)${errorCount > 0 ? ` (${errorCount} erreur(s))` : ''}`
        });
        await loadProtectedZoneTypes();
        setSelectedProtectedTypesToDelete([]);
      } else {
        throw new Error('Aucun type n\'a pu être supprimé');
      }
    } catch (e: any) {
      console.error('[SETTINGS] delete protected types error:', e);
      toast({
        title: 'Erreur',
        description: e?.message || 'Suppression impossible',
        variant: 'destructive'
      });
    } finally {
      setDeletingProtectedTypes(false);
      setDeleteProtectedTypesConfirmOpen(false);
    }
  };

  // -----------------------------
  // Fonctions pour Paramètres Zones
  // -----------------------------

  // Charger les types de zones
  const loadZoneTypes = useCallback(async () => {
    try {
      const resp = await apiRequest<any>('GET', '/settings/zone-types');
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        const rows = serverResponse.data as any[];
        const mapped = rows.map((r) => ({
          id: Number(r.id),
          key: String(r.key),
          label: String(r.label),
          color: String(r.color ?? '#0ea5e9'),
          isActive: !!(r.isActive ?? r.is_active),
        })) as ZoneType[];
        setZoneTypes(mapped);
      } else {
        console.warn('[SETTINGS] loadZoneTypes unexpected response format:', resp);
      }
    } catch (e: any) {
      console.error('[SETTINGS] load zone types error:', e);
      // Ne pas afficher de toast d'erreur si c'est juste que les routes ne sont pas encore disponibles
      if (!e.message?.includes('Route non trouvée') && !e.message?.includes('404')) {
        toast({ title: 'Erreur', description: e?.message || 'Chargement des types de zones impossible', variant: 'destructive' });
      }
      // Garder les données par défaut si le chargement échoue
    }
  }, [toast]);

  // Charger les statuts de zones
  const loadZoneStatuses = useCallback(async () => {
    try {
      console.log('[DEBUG] Loading zone statuses...');
      const resp = await apiRequest<any>('GET', '/settings/zone-statuses');
      console.log('[DEBUG] Zone statuses response:', resp);
      const serverResponse = resp.data as any;
      if (resp.ok && serverResponse?.ok && Array.isArray(serverResponse.data)) {
        const rows = serverResponse.data as any[];
        const mapped = rows.map((r) => ({
          id: Number(r.id),
          key: String(r.key),
          label: String(r.label),
          isActive: !!(r.isActive ?? r.is_active),
        })) as ZoneStatus[];
        console.log('[DEBUG] Setting zone statuses:', mapped);
        setZoneStatuses(mapped);
      } else {
        console.warn('[DEBUG] Invalid zone statuses response structure:', resp);
      }
    } catch (e: any) {
      console.error('[SETTINGS] load zone statuses error:', e);
      // Ne pas afficher de toast d'erreur si c'est juste que les routes ne sont pas encore disponibles
      if (!e.message?.includes('Route non trouvée') && !e.message?.includes('404')) {
        toast({ title: 'Erreur', description: e?.message || 'Chargement des statuts de zones impossible', variant: 'destructive' });
      }
      // Garder les données par défaut si le chargement échoue
    }
  }, [toast]);

  // Charger la configuration des zones (fonction combinée)
  const loadZoneConfig = useCallback(async () => {
    setLoadingZoneConfig(true);
    try {
      await Promise.all([loadZoneTypes(), loadZoneStatuses()]);
    } catch (error) {
      console.error('Erreur lors du chargement de la configuration des zones:', error);
    } finally {
      setLoadingZoneConfig(false);
    }
  }, [loadZoneTypes, loadZoneStatuses]);

  // Sauvegarder un type de zone
  const saveZoneType = async (typeData: Partial<ZoneType>, isEdit = false) => {
    try {
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/settings/zone-types/${typeData.id}` : '/settings/zone-types';
      const resp = await apiRequest<any>(method, url, typeData);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde type de zone');

      toast({ title: 'Succès', description: isEdit ? 'Type de zone mis à jour' : 'Type de zone créé' });
      try {
        await loadZoneTypes();
      } catch (reloadError) {
        console.warn('Erreur lors du rechargement des types de zones:', reloadError);
      }
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save zone type error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Sauvegarde impossible', variant: 'destructive' });
      return false;
    }
  };

  // Sauvegarder un statut de zone
  const saveZoneStatus = async (statusData: Partial<ZoneStatus>, isEdit = false) => {
    try {
      console.log('[DEBUG] Saving zone status:', { statusData, isEdit });
      const method = isEdit ? 'PUT' : 'POST';
      const url = isEdit ? `/settings/zone-statuses/${statusData.id}` : '/settings/zone-statuses';
      const resp = await apiRequest<any>(method, url, statusData);
      console.log('[DEBUG] Save zone status response:', resp);
      if (!resp.ok) throw new Error(resp.error || 'Erreur sauvegarde statut de zone');

      toast({ title: 'Succès', description: isEdit ? 'Statut de zone mis à jour' : 'Statut de zone créé' });
      try {
        console.log('[DEBUG] Reloading zone statuses after save...');
        await loadZoneStatuses();
      } catch (reloadError) {
        console.warn('Erreur lors du rechargement des statuts de zones:', reloadError);
      }
      return true;
    } catch (e: any) {
      console.error('[SETTINGS] save zone status error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Sauvegarde impossible', variant: 'destructive' });
      return false;
    }
  };

  // Supprimer un type de zone
  const deleteZoneType = async (id: number, typeName?: string) => {
    // Ouvrir le modal de confirmation
    setDeleteZoneTypeConfirm({ open: true, id, name: typeName || 'ce type' });
    setDeleteZoneTypeMode('delete-zones');
    setDeleteZoneTypeTargetId(null);
    // Charger les zones et calculer l'utilisation
    try {
      const resp = await apiRequest<any>('GET', '/api/zones');
      const fc = resp?.data as any;
      const features = Array.isArray(fc?.features) ? fc.features : [];
      // Trouver les zones dont le type correspond à l'ID en cours (via key) ou mapping serveur
      // On compare par key si disponible dans zoneTypes
      const currentType = zoneTypes.find(t => t.id === id) || null;
      const key = currentType?.key?.toString() || '';
      const matched = features.filter((f: any) => {
        const t = (f?.properties?.type || f?.properties?.zone_type || '').toString();
        return key ? t.toLowerCase() === key.toLowerCase() : false;
      });
      const ids = matched.map((f: any) => Number(f?.properties?.id)).filter((n: any) => !isNaN(n));
      setDeleteZoneTypeUsageCount(matched.length);
      setDeleteZoneTypeUsageIds(ids);
      setDeleteZoneTypeUsageItems(
        matched.map((f: any) => ({ id: Number(f?.properties?.id), name: String(f?.properties?.name || f?.properties?.nom || f?.properties?.code || `Zone ${f?.properties?.id}`) }))
      );
      setDeleteZoneTypeConfirmCascadeAck(false);
      // Pré-sélectionner une cible différente si possible
      const firstOther = zoneTypes.find(t => t.id !== id);
      setDeleteZoneTypeTargetId(firstOther ? firstOther.id : null);
    } catch (e) {
      setDeleteZoneTypeUsageCount(0);
      setDeleteZoneTypeUsageIds([]);
    }
  };

  // Confirmer la suppression d'un type de zone
  const confirmDeleteZoneType = async () => {
    const { id, name } = deleteZoneTypeConfirm;
    if (!id) return;

    console.log('[DELETE TYPE] Début suppression:', { id, name, usageCount: deleteZoneTypeUsageCount });

    try {
      // Utiliser la route consolidée côté serveur
      let resp: any;
      if (deleteZoneTypeUsageCount > 0) {
        if (deleteZoneTypeMode === 'reassign') {
          if (!deleteZoneTypeTargetId || deleteZoneTypeTargetId === id) {
            throw new Error('Veuillez choisir un type cible différent pour la réaffectation.');
          }
          resp = await apiRequest<any>('DELETE', `/api/settings/zone-types/${id}`, {
            mode: 'reassign',
            targetTypeId: deleteZoneTypeTargetId,
          });
        } else {
          // delete-zones (cascade)
          resp = await apiRequest<any>('DELETE', `/api/settings/zone-types/${id}`, {
            mode: 'cascade',
          });
        }
      } else {
        // Aucun usage: supprimer simplement le type (route backend fait une désactivation logique)
        console.log('[DELETE TYPE] Appel DELETE sans body:', { url: `/api/settings/zone-types/${id}` });
        resp = await apiRequest<any>('DELETE', `/api/settings/zone-types/${id}`);
        console.log('[DELETE TYPE] Réponse:', { ok: resp.ok, error: resp.error });
      }
      if (!resp.ok) {
        const errorMsg = resp.error || 'Erreur suppression type de zone';
        throw new Error(errorMsg);
      }
      console.log('[DELETE TYPE] Suppression réussie');

      toast({
        title: '✅ Succès',
        description: `Le type de zone "${name}" a été supprimé avec succès.`
      });

      setDeleteZoneTypeConfirm({ open: false, id: null, name: '' });

      try {
        await loadZoneTypes();
      } catch (reloadError) {
        console.warn('Erreur lors du rechargement des types de zones:', reloadError);
      }
    } catch (e: any) {
      console.error('[SETTINGS] delete zone type error:', e);

      const errorMessage = e?.message || 'Suppression impossible';
      const isInUseError = errorMessage.toLowerCase().includes('utilisé') ||
                          errorMessage.toLowerCase().includes('zones existantes');

      if (isInUseError && deleteZoneTypeConfirm.id) {
        try {
          // 1) si on n'a pas déjà les IDs, on recharge les zones et filtre par clé du type
          let zoneIds = deleteZoneTypeUsageIds;
          if (!zoneIds || zoneIds.length === 0) {
            const resp = await apiRequest<any>('GET', '/api/zones');
            const fc = resp?.data as any;
            const features = Array.isArray(fc?.features) ? fc.features : [];
            const currentType = zoneTypes.find(t => t.id === deleteZoneTypeConfirm.id) || null;
            const key = currentType?.key?.toString() || '';
            const matched = features.filter((f: any) => {
              const t = (f?.properties?.type || f?.properties?.zone_type || '').toString();
              return key ? t.toLowerCase() === key.toLowerCase() : false;
            });
            zoneIds = matched.map((f: any) => Number(f?.properties?.id)).filter((n: any) => !isNaN(n));
          }

          // 2) suppression en cascade des zones
          for (const zId of zoneIds) {
            try {
              await apiRequest<any>('DELETE', `/api/zones/${zId}`);
            } catch (inner) {
              console.warn('Cascade delete failed for zone', zId, inner);
            }
          }

          // 3) retenter la suppression du type
          const resp2 = await apiRequest<any>('DELETE', `/api/settings/zone-types/${deleteZoneTypeConfirm.id}`);
          if (!resp2.ok) throw new Error(resp2.error || 'Suppression du type impossible après suppression des zones');

          toast({
            title: '✅ Supprimé',
            description: `Le type de zone "${name}" et ses zones associées ont été supprimés.`,
          });

          setDeleteZoneTypeConfirm({ open: false, id: null, name: '' });
          try { await loadZoneTypes(); } catch {}
          return;
        } catch (cascadeErr: any) {
          console.error('[SETTINGS] cascade delete failed:', cascadeErr);
          // tombe dans le toast d'erreur générique ci-dessous
        }
      }

      toast({
        title: '❌ Suppression impossible',
        description: errorMessage,
        variant: 'destructive',
        duration: 8000,
      });

      setDeleteZoneTypeConfirm({ open: false, id: null, name: '' });
    }
  };

  // Supprimer un statut de zone
  const deleteZoneStatus = async (id: number, statusName?: string) => {
    // Ouvrir le modal de confirmation
    setDeleteZoneStatusConfirm({ open: true, id, name: statusName || 'ce statut' });
  };

  // Confirmer la suppression d'un statut de zone
  const confirmDeleteZoneStatus = async () => {
    const { id, name } = deleteZoneStatusConfirm;
    if (!id) return;

    try {
      console.log('[DEBUG] Deleting zone status with id:', id);
      const resp = await apiRequest<any>('DELETE', `/settings/zone-statuses/${id}`);
      console.log('[DEBUG] Delete zone status response:', resp);
      if (!resp.ok) {
        const errorMsg = resp.error || 'Erreur suppression statut de zone';
        throw new Error(errorMsg);
      }

      toast({
        title: '✅ Succès',
        description: `Le statut "${name}" a été supprimé avec succès.`
      });

      setDeleteZoneStatusConfirm({ open: false, id: null, name: '' });

      try {
        console.log('[DEBUG] Reloading zone statuses after deletion...');
        await loadZoneStatuses();
      } catch (reloadError) {
        console.warn('Erreur lors du rechargement des statuts de zones:', reloadError);
      }
    } catch (e: any) {
      console.error('[SETTINGS] delete zone status error:', e);

      const errorMessage = e?.message || 'Suppression impossible';
      const isInUseError = errorMessage.toLowerCase().includes('utilisé') ||
                          errorMessage.toLowerCase().includes('zones existantes');

      toast({
        title: '❌ Suppression impossible',
        description: isInUseError
          ? `Ce statut est actuellement utilisé par des zones existantes. Vous devez d'abord modifier ou supprimer ces zones avant de pouvoir supprimer ce statut.`
          : errorMessage,
        variant: 'destructive',
        duration: 8000
      });

      setDeleteZoneStatusConfirm({ open: false, id: null, name: '' });
    }
  };

  // Gestion de la campagne cynégétique
  const [huntingSeason, setHuntingSeason] = useState({
    startDate: new Date(),
    endDate: new Date(),
    bigGameStartDate: new Date(),
    bigGameEndDate: new Date(),
    waterGameStartDate: new Date(),
    waterGameEndDate: new Date(),
    bigGameEnabled: true,
    bigGameDerogation: false,
    waterGameEnabled: true,
    waterGameDerogation: false,
    isActive: true,
  });

  // Périodes spécifiques dynamiques (CRUD)
  type PeriodRow = { code: string; name: string; startDate: Date; endDate: Date; derogationEnabled: boolean; groupe?: string; genre?: string };
  const [specificPeriods, setSpecificPeriods] = useState<PeriodRow[]>([]);
  const [newPeriodOpen, setNewPeriodOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState<PeriodRow>({ code: "", name: "", startDate: new Date(), endDate: new Date(), derogationEnabled: false, groupe: "", genre: "" });

  type CategoryPeriodRow = { categoryKey: string; startDate: Date; endDate: Date; derogationEnabled: boolean };
  const [categoryPeriods, setCategoryPeriods] = useState<CategoryPeriodRow[]>([]);
  const [newCategoryPeriodOpen, setNewCategoryPeriodOpen] = useState(false);
  const [newCategoryPeriod, setNewCategoryPeriod] = useState<CategoryPeriodRow>({ categoryKey: '', startDate: new Date(), endDate: new Date(), derogationEnabled: false });

  // Helpers saison
  const computeSeason = (start?: Date, end?: Date) => {
    const sY = (start || huntingSeason.startDate).getFullYear();
    const eY = (end || huntingSeason.endDate).getFullYear();
    return `${sY}-${eY}`;
  };
  const seasonYear = useMemo(() => computeSeason(), [huntingSeason.startDate, huntingSeason.endDate]);

  // -----------------------------
  // Modifier Statuts (régions, départements, communes, arrondissements)
  // -----------------------------
  type StatusLevel = 'region' | 'departement' | 'commune' | 'arrondissement';
  type StatusEntity = { id: string | number; name: string; statut?: string; color?: string };

  const [statusLevel, setStatusLevel] = useState<StatusLevel | ''>('');
  const [statusEntities, setStatusEntities] = useState<StatusEntity[]>([]);
  const [regionsList, setRegionsList] = useState<StatusEntity[]>([]);
  const [departementsList, setDepartementsList] = useState<StatusEntity[]>([]);
  const [communesList, setCommunesList] = useState<StatusEntity[]>([]);
  const [arrondissementsList, setArrondissementsList] = useState<StatusEntity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedEntityName, setSelectedEntityName] = useState<string>('');
  const [selectedRegionId, setSelectedRegionId] = useState<string>('');
  const [selectedDepartementId, setSelectedDepartementId] = useState<string | null>(null);
  const [statusChoice, setStatusChoice] = useState<string>('open');
  const [colorChoice, setColorChoice] = useState<string>('#808080');
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);
  const [loadingStatusEntities, setLoadingStatusEntities] = useState<boolean>(false);

  // Mapping de couleurs par défaut selon statut (fourni par l'utilisateur)
  const STATUS_COLOR: Record<string, string> = useMemo(() => ({
    open: '#10b981',
    closed: '#ff0000',
    partial: '#fbbf24',
    unknown: '#808080',
  }), []);

  // Quand le statut change, appliquer une couleur par défaut (modifiable ensuite)
  useEffect(() => {
    const mapped = STATUS_COLOR[statusChoice] || STATUS_COLOR.unknown;
    setColorChoice(mapped);
  }, [statusChoice, STATUS_COLOR]);

  // Charge la liste des entités pour un niveau donné avec fallback pour régions
  const loadRegionsList = useCallback(async () => {
    try {
      const r = await apiRequest<any>('GET', '/api/regions');
      if (r.ok) {
        const features = r.data?.features ?? [];
        const list = features.map((f: any) => ({ id: f.properties?.id ?? f.properties?.code ?? f.properties?.nom, name: f.properties?.nom ?? f.properties?.name ?? f.properties?.code } as StatusEntity));
        setRegionsList(list);
      }
    } catch (e) {
      // silencieux
    }
  }, []);

  const loadStatusEntities = useCallback(async (level: StatusLevel) => {
    try {
      console.log(`[DEBUG FRONTEND] loadStatusEntities called with level: ${level}`);
      console.log(`[DEBUG FRONTEND] Current state - selectedRegionId: ${selectedRegionId}, selectedDepartementId: ${selectedDepartementId}`);

      setLoadingStatusEntities(true);
      let items: StatusEntity[] = [];
      if (level === 'region') {
        // 1) Charger les régions (id + nom)
        console.log(`[DEBUG FRONTEND] Loading regions from /api/regions`);
        const r = await apiRequest<any>('GET', '/api/regions');
        console.log(`[DEBUG FRONTEND] Regions API response:`, r);
        let regionIdByName = new Map<string, string | number>();
        if (r.ok) {
          const features = r.data?.features ?? [];
          console.log(`[DEBUG FRONTEND] Found ${features.length} region features`);
          const list = features.map((f: any) => ({ id: f.properties?.id ?? f.properties?.code ?? f.properties?.nom, name: f.properties?.nom ?? f.properties?.name ?? f.properties?.code } as StatusEntity));
          console.log(`[DEBUG FRONTEND] Mapped regions list:`, list.slice(0, 3));
          setRegionsList(list);
          for (const it of list) {
            const key = (it.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            regionIdByName.set(key, it.id);
          }
        }
        // 2) Charger statuts des régions
        console.log(`[DEBUG FRONTEND] Loading region statuses from /api/statuses/regions`);
        let resp = await apiRequest<any>('GET', '/api/statuses/regions');
        console.log(`[DEBUG FRONTEND] Region statuses API response:`, resp);
        if (resp.ok) {
          const data = resp.data;
          if (Array.isArray(data)) {
            items = data.map((r: any) => ({ id: r.id ?? r.name ?? r.region_name, name: r.name ?? r.region_name ?? String(r.id), statut: r.status ?? r.statut ?? r.statut_chasse ?? 'unknown', color: r.color || '#808080' }));
          } else if (data && typeof data === 'object') {
            items = Object.keys(data).map((k) => {
              const key = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
              const id = regionIdByName.get(key) ?? k;
              return { id, name: k, statut: data[k]?.status ?? 'unknown', color: data[k]?.color || '#808080' };
            });
          }
        }
        console.log(`[DEBUG FRONTEND] Final regions items:`, items.slice(0, 3));
      } else if (level === 'departement') {
        if (!selectedRegionId) {
          console.log(`[DEBUG FRONTEND] No selectedRegionId, clearing departements list`);
          setStatusEntities([]);
          return;
        }
        console.log(`[DEBUG FRONTEND] Loading departements with regionId: ${selectedRegionId}`);
        const resp = await apiRequest<any>('GET', `/api/statuses/departements?regionId=${encodeURIComponent(selectedRegionId)}`);
        console.log(`[DEBUG FRONTEND] Departements API response:`, resp);
        items = resp.ok && Array.isArray(resp.data) ? resp.data : [];
        console.log(`[DEBUG FRONTEND] Final departements items:`, items.slice(0, 3));
        setDepartementsList(items);
      } else if (level === 'commune') {
        if (!selectedDepartementId) {
          console.log(`[DEBUG FRONTEND] No selectedDepartementId, clearing communes list`);
          setStatusEntities([]);
          return;
        }
        console.log(`[DEBUG FRONTEND] Loading communes with departementId: ${selectedDepartementId}`);
        const resp = await apiRequest<any>('GET', `/api/statuses/communes?departementId=${encodeURIComponent(selectedDepartementId)}`);
        console.log(`[DEBUG FRONTEND] Communes API response:`, resp);
        items = resp.ok && Array.isArray(resp.data) ? resp.data : [];
        console.log(`[DEBUG FRONTEND] Final communes items:`, items.slice(0, 3));
        setCommunesList(items);
      } else if (level === 'arrondissement') {
        if (!selectedDepartementId) {
          console.log(`[DEBUG FRONTEND] No selectedDepartementId, clearing arrondissements list`);
          setStatusEntities([]);
          return;
        }
        console.log(`[DEBUG FRONTEND] Loading arrondissements with departementId: ${selectedDepartementId}`);
        const resp = await apiRequest<any>('GET', `/api/statuses/arrondissements?departementId=${encodeURIComponent(selectedDepartementId)}`);
        console.log(`[DEBUG FRONTEND] Arrondissements API response:`, resp);
        items = resp.ok && Array.isArray(resp.data) ? resp.data : [];
        console.log(`[DEBUG FRONTEND] Final arrondissements items:`, items.slice(0, 3));
        setArrondissementsList(items);
      }
      console.log(`[DEBUG FRONTEND] Setting statusEntities with ${items.length} items`);
      setStatusEntities(items);
    } catch (e: any) {
      console.error('[DEBUG FRONTEND] loadStatusEntities error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Chargement des statuts impossible', variant: 'destructive' });
      setStatusEntities([]);
    } finally {
      setLoadingStatusEntities(false);
    }
  }, [toast, selectedRegionId, selectedDepartementId]);

  // Charger automatiquement les régions quand on sélectionne commune ou arrondissement
  useEffect(() => {
    if (statusLevel === 'commune' || statusLevel === 'arrondissement') {
      console.log(`[DEBUG FRONTEND] Loading regions for ${statusLevel} level`);
      void loadRegionsList();
    }
  }, [statusLevel, loadRegionsList]);

  // useEffect pour gérer la cascade quand on change de région ou département
  useEffect(() => {
    if (!statusLevel) return;

    // Si on change de région, recharger les départements pour tous les niveaux qui en ont besoin
    if (selectedRegionId && (statusLevel === 'departement' || statusLevel === 'commune' || statusLevel === 'arrondissement')) {
      console.log(`[DEBUG FRONTEND] Region changed to ${selectedRegionId} for level ${statusLevel}, loading departements`);
      void loadStatusEntities('departement');
    }

    // Si on change de département, recharger les entités finales
    if (selectedDepartementId && (statusLevel === 'commune' || statusLevel === 'arrondissement')) {
      console.log(`[DEBUG FRONTEND] Departement changed to ${selectedDepartementId} for level ${statusLevel}, loading ${statusLevel}s`);
      void loadStatusEntities(statusLevel);
    }
  }, [selectedRegionId, selectedDepartementId, statusLevel, loadStatusEntities]);

  // useEffect pour gérer la cascade complète et la cohérence des sélections
  useEffect(() => {
    if (!statusLevel) return;

    console.log(`[DEBUG FRONTEND] Status level changed to ${statusLevel}`);

    // Nettoyer les sélections qui ne sont plus pertinentes pour le nouveau niveau
    if (statusLevel === 'region') {
      // Pour les régions, rien à nettoyer
      setSelectedDepartementId(null);
    } else if (statusLevel === 'departement') {
      // Pour les départements, on peut garder la région sélectionnée
      // mais on nettoie les sélections de niveau inférieur
    } else if (statusLevel === 'commune' || statusLevel === 'arrondissement') {
      // Pour les communes/arrondissements, on nettoie tout ce qui est en dessous
      // mais on garde la sélection de département si elle existe
    }

    // Logique de cascade selon le niveau sélectionné
    if (statusLevel === 'region') {
      // Pour les régions, pas de dépendance
      void loadStatusEntities('region');
    } else if (statusLevel === 'departement') {
      // Pour les départements, charger automatiquement si une région est sélectionnée
      if (selectedRegionId) {
        console.log(`[DEBUG FRONTEND] Region already selected (${selectedRegionId}), loading departements`);
        void loadStatusEntities('departement');
      } else {
        console.log(`[DEBUG FRONTEND] No region selected, clearing departements`);
        setStatusEntities([]);
      }
    } else if (statusLevel === 'commune') {
      // Pour les communes, charger automatiquement si un département est sélectionné
      if (selectedDepartementId) {
        console.log(`[DEBUG FRONTEND] Departement already selected (${selectedDepartementId}), loading communes`);
        void loadStatusEntities('commune');
      } else {
        console.log(`[DEBUG FRONTEND] No departement selected, clearing communes`);
        setStatusEntities([]);
      }
    } else if (statusLevel === 'arrondissement') {
      // Pour les arrondissements, charger automatiquement si un département est sélectionné
      if (selectedDepartementId) {
        console.log(`[DEBUG FRONTEND] Departement already selected (${selectedDepartementId}), loading arrondissements`);
        void loadStatusEntities('arrondissement');
      } else {
        console.log(`[DEBUG FRONTEND] No departement selected, clearing arrondissements`);
        setStatusEntities([]);
      }
    }
  }, [statusLevel, selectedRegionId, selectedDepartementId, loadStatusEntities]);

  // Initialiser le niveau par défaut à 'region' quand on ouvre l'onglet Régions et Zones
  useEffect(() => {
    if (activeTab === 'regions-zones' && !statusLevel) {
      console.log(`[DEBUG FRONTEND] Initializing status level to 'region' for regions-zones tab`);
      setStatusLevel('region');
    }
  }, [activeTab, statusLevel]);

  const handleUpdateStatus = useCallback(async () => {
    if (!statusLevel || !selectedEntityId) return;
    setUpdatingStatus(true);
    try {
      let ok = false;
      if (statusLevel === 'region') {
        const resp = await apiRequest<any>('PUT', `/api/statuses/regions/${encodeURIComponent(selectedEntityId)}`, { id: selectedEntityId, name: selectedEntityName || selectedEntityId, status: statusChoice, color: colorChoice });
        ok = resp.ok;
      } else {
        const plural = statusLevel === 'departement' ? 'departements' : (statusLevel === 'arrondissement' ? 'arrondissements' : 'communes');
        const resp = await apiRequest<any>('PUT', `/api/statuses/${plural}/${encodeURIComponent(selectedEntityId)}`, { id: selectedEntityId, name: selectedEntityName || undefined, statut_chasse: statusChoice, color: colorChoice });
        ok = resp.ok;
      }
      if (!ok) throw new Error('Mise à jour impossible (endpoint non disponible)');
      // Rafraîchir la liste
      await loadStatusEntities(statusLevel);
      toast({ title: 'Succès', description: 'Statut mis à jour' });
    } catch (e: any) {
      console.error('[SETTINGS] update status error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Mise à jour impossible', variant: 'destructive' });
    } finally {
      setUpdatingStatus(false);
    }
  }, [statusLevel, selectedEntityId, selectedEntityName, statusChoice, colorChoice, toast]);

  // États pour le mini-CRUD des catégories (filtrage + modal ajout)
  const [newCatOpen, setNewCatOpen] = useState<boolean>(false);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterGroupe, setFilterGroupe] = useState<string>("all");
  const [filterGenre, setFilterGenre] = useState<string>("all");
  const [filterActive, setFilterActive] = useState<string>("all");

  // Types et états pour catégories de permis (onglet Tarifs des Permis)
  type PermitCategoryRow = {
    id: number;
    key: string;
    labelFr: string;
    groupe: string;
    genre: string;
    sousCategorie?: string | null;
    defaultValidityDays?: number | null;
    displayOrder?: number | null;
    isActive: boolean;
    priceXof?: number | null; // prix pour la saison courante
  };
  const [categories, setCategories] = useState<PermitCategoryRow[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [newCat, setNewCat] = useState<Partial<PermitCategoryRow>>({ genre: "resident", groupe: "petite-chasse", isActive: true });
  // État local pour l'affichage des prix formatés par ligne
  const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
  // Mode édition pour l'onglet Tarifs
  const [editPrices, setEditPrices] = useState<boolean>(false);

  // -----------------------------
  // États pour Paramètres Zones
  // -----------------------------
  type ZoneType = {
    id: number;
    key: string;
    label: string;
    color: string;
    isActive: boolean;
  };

  type ZoneStatus = {
    id: number;
    key: string;
    label: string;
    isActive: boolean;
  };

  const [zoneTypes, setZoneTypes] = useState<ZoneType[]>([
  ]);
  const [zoneStatuses, setZoneStatuses] = useState<ZoneStatus[]>([
  ]);
  const [loadingZoneConfig, setLoadingZoneConfig] = useState<boolean>(false);

  // Modals pour types de zones
  const [newZoneTypeOpen, setNewZoneTypeOpen] = useState<boolean>(false);
  const [editZoneTypeOpen, setEditZoneTypeOpen] = useState<boolean>(false);
  const [selectedZoneType, setSelectedZoneType] = useState<ZoneType | null>(null);
  const [newZoneType, setNewZoneType] = useState<Partial<ZoneType>>({
    key: '',
    label: '',
    color: '#0ea5e9',
    isActive: true
  });

  // Modals pour statuts de zones
  const [newZoneStatusOpen, setNewZoneStatusOpen] = useState<boolean>(false);
  const [editZoneStatusOpen, setEditZoneStatusOpen] = useState<boolean>(false);
  const [selectedZoneStatus, setSelectedZoneStatus] = useState<ZoneStatus | null>(null);
  const [newZoneStatus, setNewZoneStatus] = useState<Partial<ZoneStatus>>({
    key: '',
    label: '',
    isActive: true,
  });

  // Modals de confirmation de suppression
  const [deleteZoneTypeConfirm, setDeleteZoneTypeConfirm] = useState<{ open: boolean; id: number | null; name: string }>({
    open: false,
    id: null,
    name: ''
  });
  // Données pour migration/suppression des zones utilisant un type
  const [deleteZoneTypeUsageCount, setDeleteZoneTypeUsageCount] = useState<number>(0);
  const [deleteZoneTypeUsageIds, setDeleteZoneTypeUsageIds] = useState<number[]>([]);
  const [deleteZoneTypeMode, setDeleteZoneTypeMode] = useState<'reassign' | 'delete-zones'>('reassign');
  const [deleteZoneTypeTargetId, setDeleteZoneTypeTargetId] = useState<number | null>(null);
  const [deleteZoneStatusConfirm, setDeleteZoneStatusConfirm] = useState<{ open: boolean; id: number | null; name: string }>({
    open: false,
    id: null,
    name: ''
  });
  // Liste détaillée et confirmation explicite pour suppression en cascade
  const [deleteZoneTypeUsageItems, setDeleteZoneTypeUsageItems] = useState<{ id: number; name: string }[]>([]);
  const [deleteZoneTypeConfirmCascadeAck, setDeleteZoneTypeConfirmCascadeAck] = useState<boolean>(false);

  const distinctGroupes = useMemo<string[]>(() => {
    const set = new Set<string>();
    categories.forEach(c => c.groupe && set.add(c.groupe));
    return Array.from(set).sort();
  }, [categories]);
  const distinctGenres = useMemo<string[]>(() => {
    const set = new Set<string>();
    categories.forEach(c => c.genre && set.add(c.genre));
    return Array.from(set).sort();
  }, [categories]);

  // Genres par groupe (pour filtrer le Select genre quand un groupe est choisi)
  const genresByGroup = useMemo<Record<string, string[]>>(() => {
    const map: Record<string, Set<string>> = {} as any;
    categories.forEach(c => {
      const g = c.groupe || '';
      const genre = c.genre || '';
      if (!g || !genre) return;
      if (!map[g]) map[g] = new Set<string>();
      map[g].add(genre);
    });
    const out: Record<string, string[]> = {};
    Object.keys(map).forEach(g => { out[g] = Array.from(map[g]).sort(); });
    return out;
  }, [categories]);

  // Charge les catégories avec prix pour la saison courante
  const loadCategories = useCallback(async (activeOnly = false) => {
    setLoadingCategories(true);
    try {
      const s = seasonYear;
      const url = `/permit-categories?activeOnly=${activeOnly ? 'true' : 'false'}&season=${encodeURIComponent(s)}`;
      const resp = await apiRequest<any>('GET', url);
      if (!resp.ok) throw new Error(resp.error || 'Impossible de charger les catégories de permis');
      const rows: PermitCategoryRow[] = (resp.data || []).map((c: any) => ({
        id: Number(c.id),
        key: String(c.key),
        labelFr: String(c.labelFr ?? c.label_fr ?? ''),
        groupe: String(c.groupe ?? c.group ?? ''),
        genre: String(c.genre ?? ''),
        sousCategorie: c.sousCategorie ?? c.subcategory ?? null,
        defaultValidityDays: c.defaultValidityDays ?? c.validityDays ?? null,
        displayOrder: c.displayOrder ?? null,
        isActive: Boolean(c.isActive ?? c.active ?? false),
        // Pré-remplissage du prix depuis les champs possibles renvoyés par l'API
        priceXof: (
          c.priceXof ??
          c.tarifXof ??
          c.price ??
          c.tarif ??
          c.lastPriceXof ??
          c.lastTarifXof ??
          null
        ),
      }));
      // Préserver les prix saisis localement si présents pour éviter qu'ils ne disparaissent sur un reload
      setCategories(prev => rows.map(r => {
        const prevCat = prev.find(p => p.id === r.id);
        if (prevCat && (prevCat.priceXof ?? null) !== null) {
          return { ...r, priceXof: prevCat.priceXof };
        }
        return r;
      }));
      // Initialiser/rafraîchir les valeurs affichées formatées
      setPriceEdits(prev => {
        const next: Record<number, string> = { ...prev };
        rows.forEach(r => {
          const formatted = (r.priceXof ?? null) !== null ? formatXof(Number(r.priceXof)) : '';
          if (formatted !== '') next[r.id] = formatted; else delete next[r.id];
        });
        return next;
      });
    } catch (e) {
      console.error('[SETTINGS] loadCategories error:', e);
      toast({ title: 'Erreur', description: 'Chargement des catégories impossible', variant: 'destructive' });
    } finally {
      setLoadingCategories(false);
    }
  }, [seasonYear, toast]);

  // Charger les paramètres de la campagne à partir de l'API au chargement de la page
  useEffect(() => {
    const loadCampaign = async () => {
      setLoading(true);
      try {
        const resp = await apiRequest<any>('GET', '/api/settings/campaign');
        if (!resp.ok) throw new Error(resp.error || "Erreur lors de la récupération des paramètres de campagne");
        const data = resp.data as any;
        console.log("Campaign data loaded:", data);
        if (data && data.startDate && data.endDate) {
          setHuntingSeason(prevState => ({
            ...prevState,
            startDate: new Date(data.startDate),
            endDate: new Date(data.endDate),
            bigGameStartDate: data.bigGameStartDate ? new Date(data.bigGameStartDate) : new Date(),
            bigGameEndDate: data.bigGameEndDate ? new Date(data.bigGameEndDate) : new Date(),
            waterGameStartDate: data.waterGameStartDate ? new Date(data.waterGameStartDate) : new Date(),
            waterGameEndDate: data.waterGameEndDate ? new Date(data.waterGameEndDate) : new Date(),
            // Default flags if backend doesn't send periods
            bigGameEnabled: typeof data.bigGameEnabled === 'boolean' ? data.bigGameEnabled : true,
            bigGameDerogation: typeof data.bigGameDerogation === 'boolean' ? data.bigGameDerogation : false,
            waterGameEnabled: typeof data.waterGameEnabled === 'boolean' ? data.waterGameEnabled : true,
            waterGameDerogation: typeof data.waterGameDerogation === 'boolean' ? data.waterGameDerogation : false,
            isActive: typeof data.isActive === 'boolean' ? data.isActive : prevState.isActive,
          }));

          // If API already returns dynamic periods, map them to state
          if (Array.isArray((data as any).periods)) {
            const periods = (data as any).periods as Array<any>;
            const big = periods.find(p => p.code === 'big_game');
            const water = periods.find(p => p.code === 'waterfowl');
            setHuntingSeason(prev => ({
              ...prev,
              bigGameStartDate: big?.startDate ? new Date(big.startDate) : prev.bigGameStartDate,
              bigGameEndDate: big?.endDate ? new Date(big.endDate) : prev.bigGameEndDate,
              bigGameEnabled: typeof big?.enabled === 'boolean' ? big.enabled : prev.bigGameEnabled,
              bigGameDerogation: typeof big?.derogationEnabled === 'boolean' ? big.derogationEnabled : prev.bigGameDerogation,
              waterGameStartDate: water?.startDate ? new Date(water.startDate) : prev.waterGameStartDate,
              waterGameEndDate: water?.endDate ? new Date(water.endDate) : prev.waterGameEndDate,
              waterGameEnabled: typeof water?.enabled === 'boolean' ? water.enabled : prev.waterGameEnabled,
              waterGameDerogation: typeof water?.derogationEnabled === 'boolean' ? water.derogationEnabled : prev.waterGameDerogation,
            }));

            // Store full list for CRUD (groupe/genre optionnels côté UI)
            setSpecificPeriods(periods.map(p => ({
              code: String(p.code || ''),
              name: String(p.name || ''),
              startDate: p.startDate ? new Date(p.startDate) : new Date(),
              endDate: p.endDate ? new Date(p.endDate) : new Date(),
              derogationEnabled: !!p.derogationEnabled,
              groupe: (p as any).groupe || '',
              genre: (p as any).genre || '',
            })));
          } else {
            // Fallback: initialize with two conventional periods from current season state
            setSpecificPeriods([
              { code: 'big_game', name: 'Grande chasse', startDate: new Date(), endDate: new Date(), derogationEnabled: false },
              { code: 'waterfowl', name: "Gibier d'Eau", startDate: new Date(), endDate: new Date(), derogationEnabled: false },
            ]);
          }

          if (Array.isArray((data as any).categoryPeriods)) {
            setCategoryPeriods(((data as any).categoryPeriods as any[]).map((p: any) => ({
              categoryKey: String(p.categoryKey || p.category_key || ''),
              startDate: p.startDate ? new Date(p.startDate) : new Date(),
              endDate: p.endDate ? new Date(p.endDate) : new Date(),
              derogationEnabled: !!p.derogationEnabled,
            })).filter((p: any) => p.categoryKey));
          } else {
            setCategoryPeriods([]);
          }
        }
      } catch (err) {
        console.error("Error loading campaign settings:", err);
        toast({
          title: "Erreur",
          description: "Impossible de charger les paramètres de campagne",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    loadCampaign();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Charger automatiquement les catégories quand on ouvre l'onglet Tarifs OU Périodes spécifiques
  useEffect(() => {
    if (activeTab === 'permit-prices' || activeTab === 'specific-periods') {
      loadCategories(false);
    }
    // Charger les espèces et taxes pour l'onglet Taxes d'abattage
    if (activeTab === 'hunting-taxes') {
      loadSpecies();
      loadHuntingTaxes();
    }
    // Charger les paramètres de zones pour l'onglet Paramètres Zones
    if (activeTab === 'zones-config') {
      console.log('[DEBUG] Loading zone config for zones-config tab');
      loadZoneConfig();
    }
    // Charger les types de zones protégées pour l'onglet Régions et Zones
    if (activeTab === 'regions-zones') {
      loadProtectedZoneTypes();
      loadRegionalFilterSetting();
    }
  }, [activeTab, seasonYear, loadCategories, loadSpecies, loadHuntingTaxes, loadZoneConfig, loadProtectedZoneTypes, loadRegionalFilterSetting]);

  // Chargement initial des données de zones au montage du composant
  useEffect(() => {
    console.log('[DEBUG] Initial component mount - loading zone config');
    loadZoneConfig();
  }, [loadZoneConfig]);

  // Chargement initial au montage si la liste est vide (pour alimenter les Selects groupe/catégorie)
  useEffect(() => {
    if (categories.length === 0) {
      loadCategories(false);
    }
  }, [categories.length, loadCategories]);

  // ... rest of the code remains the same ...

  // Auto-compléter groupe/genre des périodes spécifiques après chargement des catégories
  // Objectif: si l'API campagne ne renvoie pas groupe/genre, on déduit à partir des catégories
  useEffect(() => {
    if (!Array.isArray(specificPeriods) || specificPeriods.length === 0) return;
    if (!Array.isArray(categories) || categories.length === 0) return;

    // Construire des index pour matcher rapidement
    const byGenre = new Map<string, typeof categories[number]>();
    const byLabel = new Map<string, typeof categories[number]>();
    for (const c of categories) {
      const gKey = String(c.genre || '').toLowerCase();
      const lKey = String(c.labelFr || '').toLowerCase();
      if (gKey) byGenre.set(gKey, c);
      if (lKey) byLabel.set(lKey, c);
    }

    let changed = false;
    const next = specificPeriods.map((p) => {
      const hasGroup = !!(p.groupe && p.groupe.trim() !== '');
      const hasGenre = !!(p.genre && p.genre.trim() !== '');
      if (hasGroup && hasGenre) return p;

      const nameKey = String(p.name || '').toLowerCase();
      const genreKey = String(p.genre || '').toLowerCase();

      // Priorité: match sur genre, sinon sur labelFr
      const matched = (genreKey && byGenre.get(genreKey)) || (nameKey && byLabel.get(nameKey));
      if (matched) {
        changed = true;
        return {
          ...p,
          groupe: hasGroup ? p.groupe : (matched.groupe || ''),
          genre: hasGenre ? p.genre : (matched.genre || ''),
          name: p.name || matched.genre || matched.labelFr || '',
        };
      }
      return p;
    });

    if (changed) {
      setSpecificPeriods(next);
    }
  }, [categories, specificPeriods]);

  // Sauvegarde d'une catégorie (incluant le prix) sans reload
  const saveCategoryRow = async (rowId: number) => {
    const row = categories.find(c => c.id === rowId);
    if (!row) return;
    setSavingRowId(rowId);
    try {
      const upResp = await apiRequest<any>('PUT', `/permit-categories/${row.id}`, {
        labelFr: row.labelFr,
        groupe: row.groupe,
        genre: row.genre,
        sousCategorie: row.sousCategorie ?? null,
        defaultValidityDays: row.defaultValidityDays ?? null,
        isActive: row.isActive,
      });
      if (!upResp.ok) throw new Error(upResp.error || 'Erreur mise à jour');
      const s = seasonYear || computeSeason();
      if ((row.priceXof ?? null) !== null) {
        await apiRequest<any>('POST', '/permit-categories/prices', {
          categoryId: row.id,
          seasonYear: s,
          tarifXof: row.priceXof || 0,
          priceXof: row.priceXof || 0,
          isActive: true,
        });
      }
      toast({ title: 'Enregistré', description: 'Catégorie mise à jour' });
    } catch (e: any) {
      console.error('[SETTINGS] auto-save price error:', e);
      toast({ title: 'Erreur', description: e?.message || 'Mise à jour impossible', variant: 'destructive' });
    } finally {
      setSavingRowId(null);
    }
  };

  // Fonction de sauvegarde des paramètres
  const saveSettings = async () => {
    setLoading(true);
    try {
      // Validation client: campagne end >= start
      const start = huntingSeason.startDate;
      const end = huntingSeason.endDate;
      if (end.getTime() < start.getTime()) {
        setCampaignInfoModal({
          open: true,
          title: "Information",
          description: "La date de fermeture ne peut pas être antérieure à la date d'ouverture.",
        });
        return;
      }
      const settingsPayload = {
        huntingSeason,
        // Nettoyer les propriétés côté client: ne garder que les champs utiles
        huntingTaxes: huntingTaxes.map(t => ({
          id: t.id,
          espece_id: t.espece_id,
          prix_xof: t.prix_xof,
          is_active: t.is_active,
        })),
      };

      // Calcul automatique du champ year pour la campagne
      const startYear = huntingSeason.startDate.getFullYear();
      const endYear = huntingSeason.endDate.getFullYear();
      const campaignWithYear = {
        ...settingsPayload.huntingSeason,
        year: `${startYear}-${endYear}`
      };

      // Build specific periods payload from CRUD list (compatible with new backend)
      const periods = specificPeriods.map(p => ({
        code: p.code,
        name: p.name,
        groupe: p.groupe,
        genre: p.genre,
        startDate: p.startDate,
        endDate: p.endDate,
        enabled: true,
        derogationEnabled: p.derogationEnabled,
      }));

      const categoryPeriodsPayload = categoryPeriods
        .filter(p => p.categoryKey && p.categoryKey.trim() !== '')
        .map(p => ({
          categoryKey: p.categoryKey,
          startDate: p.startDate,
          endDate: p.endDate,
          enabled: true,
          derogationEnabled: p.derogationEnabled,
        }));

      // Validation client: chaque période end >= start
      const invalidPeriod = periods.find(p => new Date(p.endDate).getTime() < new Date(p.startDate).getTime());
      if (invalidPeriod) {
        setCampaignInfoModal({
          open: true,
          title: "Information",
          description: `La date de fermeture de la période '${invalidPeriod.code}' ne peut pas être antérieure à sa date d'ouverture.`,
        });
        return;
      }

      const resp = await apiRequest<any>('POST', '/api/settings/campaign', { ...campaignWithYear, periods, categoryPeriods: categoryPeriodsPayload });
      if (!resp.ok) throw new Error(resp.error || 'Erreur lors de la sauvegarde des paramètres');

      setCampaignInfoModal({
        open: true,
        title: 'Sauvegarde réussie',
        description: 'Les paramètres ont été enregistrés.',
        variant: 'success',
      });
    } catch (error) {
      console.error("Save settings error:", error);
      toast({
        title: "Erreur",
        description: (error as any)?.message || "Erreur lors de la sauvegarde",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-frame-container bg-white">
  <div className="page-frame-inner container mx-auto px-3 sm:px-6 pt-4 sm:pt-2 pb-2 space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-green-800">Configuration du Système</h1>
          <Button onClick={saveSettings} disabled={loading} className="w-full sm:w-auto">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? "Sauvegarde en cours..." : "Sauvegarder les Paramètres"}
          </Button>
        </div>

        {/* Filtrage régional: affiché uniquement dans l'onglet "Régions et Shp" pour éviter la redondance */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full flex overflow-x-auto whitespace-nowrap gap-2 text-xs sm:text-sm">
            <TabsTrigger value="hunting-season" className="px-2 sm:px-3">Campagne Cynégétique</TabsTrigger>
            <TabsTrigger value="permit-prices" className="px-2 sm:px-3">Tarifs des Permis</TabsTrigger>
            <TabsTrigger value="specific-periods" className="px-2 sm:px-3">Périodes Spécifiques</TabsTrigger>
            <TabsTrigger value="hunting-taxes" className="px-2 sm:px-3">Taxes d'abattage</TabsTrigger>
            <TabsTrigger value="zones-config" className="px-2 sm:px-3">Types Zones</TabsTrigger>
            <TabsTrigger value="regions-zones" className="px-2 sm:px-3">Régions et Shp</TabsTrigger>
            <TabsTrigger value="codes-infractions" className="px-2 sm:px-3">Codes Infractions</TabsTrigger>
          </TabsList>

          <Dialog open={campaignInfoModal.open} onOpenChange={(o) => setCampaignInfoModal(prev => ({ ...prev, open: o }))}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {campaignInfoModal.variant === 'success' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Info className="h-5 w-5 text-blue-600" />
                  )}
                  {campaignInfoModal.title || 'Information'}
                </DialogTitle>
                <DialogDescription>{campaignInfoModal.description}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setCampaignInfoModal({ open: false, title: '', description: '', variant: 'info' })}>Fermer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Onglet Campagne Cynégétique */}
          <TabsContent value="hunting-season">
            {/* Modal Import CSV (via portal) */}
            {importOpen && createPortal(
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-black/10">
                <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border-2 border-blue-500">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <Plus className="h-5 w-5 text-blue-600" /> Importer Codes et Items (CSV)
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setImportOpen(false)}>✕</Button>
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Format attendu (en-têtes): code,nature,article,par_defaut. Séparateur virgule. Encodage UTF-8.
                  </p>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Fichier CSV</Label>
                      <Input type="file" accept=".csv" onChange={async (e) => {
                        try {
                          setImportErrors([]);
                          setImportRows([]);
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setImportFileName(f.name);
                          let txt = await readFileAsText(f);
                          const rawLines = txt.split(/\r?\n/).filter((l: string) => l.trim() !== '');
                          if (rawLines.length === 0) { setImportErrors(['Fichier vide']); return; }

                        // Détection du séparateur (en-tête)
                        const headerRaw = rawLines[0];
                        const candidates = [',',';','\t','|'];
                        const delim = candidates.reduce((best, d) => {
                          const count = headerRaw.split(d).length;
                          return count > (best.count) ? { d, count } : best;
                        }, { d: ',', count: 0 as number }).d as string;

                        // Parser une ligne CSV avec guillemets
                        const parseLine = (line: string, sep: string) => {
                          const cells: string[] = [];
                          let current = '';
                          let inQuotes = false;
                          for (let i = 0; i < line.length; i++) {
                            const ch = line[i];
                            if (ch === '"') {
                              // Doubles quotes -> escape
                              if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
                              else { inQuotes = !inQuotes; }
                            } else if (ch === sep && !inQuotes) {
                              cells.push(current);
                              current = '';
                            } else {
                              current += ch;
                            }
                          }
                          cells.push(current);
                          return cells.map(c => c.trim());
                        };

                        const headers = parseLine(headerRaw, delim).map(h => h.toLowerCase());
                        const idxCode = headers.indexOf('code');
                        const idxNature = headers.indexOf('nature');
                        const idxArticle = headers.indexOf('article');
                        const idxDef = headers.indexOf('par_defaut');
                        if (idxCode < 0 || idxNature < 0 || idxArticle < 0) { setImportErrors([`En-têtes requis: code,nature,article[,par_defaut]. Trouvé: ${headers.join(', ')}`]); return; }

                        const rows: Array<{ code: string; nature: string; article: string; par_defaut?: boolean }> = [];
                        for (let i = 1; i < rawLines.length; i++) {
                          const row = rawLines[i];
                          const cells = parseLine(row, delim);
                          const code = (cells[idxCode] || '').replace(/^\uFEFF/, '').trim();
                          const nature = (cells[idxNature] || '').trim();
                          const article = (cells[idxArticle] || '').trim();
                          const defRaw = idxDef >= 0 ? (cells[idxDef] || '').trim() : '';
                          const par_defaut = /^(true|1|oui|yes)$/i.test(defRaw);
                          if (!code && !nature && !article) continue;
                          rows.push({ code, nature, article, par_defaut });
                        }
                        if (rows.length === 0) { setImportErrors(['Aucune ligne valide détectée']); return; }
                        setImportRows(rows);
                      } catch (err: any) {
                        setImportErrors([err?.message || 'Erreur de lecture du fichier']);
                      }
                    }} />
                    {importFileName && (
                      <div className="text-xs text-gray-600">Fichier: {importFileName}</div>
                    )}
                  </div>
                  {importErrors.length > 0 && (
                    <div className="text-sm text-red-600 space-y-1">
                      {importErrors.map((e, i) => (<div key={i}>• {e}</div>))}
                    </div>
                  )}
                  {importRows.length > 0 && (
                    <div className="text-sm text-gray-700">
                      Aperçu: {importRows.length} ligne(s) prête(s) à l'import.
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={() => { setImportOpen(false); setImportRows([]); setImportFileName(''); setImportErrors([]); }}>
                    Fermer
                  </Button>
                  <Button disabled={importing || importRows.length === 0}
                    onClick={async () => {
                      try {
                        setImporting(true);
                        const resp = await apiRequest<any>('POST', '/api/infractions/codes/import', importRows);
                        if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Import échoué', variant: 'destructive' }); return; }
                        const r = resp.data?.report;
                        toast({ title: 'Import terminé', description: `Codes créés: ${r?.codes_crees || 0}, existants: ${r?.codes_existants || 0}, items créés: ${r?.items_crees || 0}, ignorés: ${r?.items_ignores || 0}` });
                        setImportOpen(false);
                        setImportRows([]);
                        setImportFileName('');
                        await loadCodesInfractions();
                        await loadCodeItems();
                      } catch (e: any) {
                        toast({ title: 'Erreur', description: e?.message || 'Import échoué', variant: 'destructive' });
                      } finally {
                        setImporting(false);
                      }
                    }}>
                    {importing ? 'Import...' : 'Importer'}
                  </Button>
                </div>
              </div>
              {/* Badge debug visuel */}
              <div className="fixed bottom-4 right-4 bg-blue-600 text-white text-xs px-2 py-1 rounded shadow">Import CSV ouvert</div>
            </div>,
            document.body
          )}

          {/* Dialog Nouvel Item (nature/article) */}
          <Dialog open={newItemOpen} onOpenChange={setNewItemOpen} modal={false}>
            <DialogContent className="sm:max-w-[500px] z-[1000]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-blue-600" />
                  Ajouter une nature/article
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input value={newItem.codeLabel} readOnly className="bg-gray-100" />
                </div>
                <div className="space-y-2">
                  <Label>Nature *</Label>
                  <Input value={newItem.nature} onChange={(e) => setNewItem(prev => ({ ...prev, nature: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Article *</Label>
                  <Input value={newItem.article_code} onChange={(e) => setNewItem(prev => ({ ...prev, article_code: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewItemOpen(false)}>Annuler</Button>
                <Button
                  onClick={async () => {
                    const target = codesInfractions.find(c => normalize(c.code) === normalize(newItem.codeLabel));
                    if (!target) { toast({ title: 'Erreur', description: 'Code introuvable', variant: 'destructive' }); return; }
                    if (!newItem.nature?.trim() || !newItem.article_code?.trim()) { toast({ title: 'Champs requis', description: 'Nature et Article sont requis', variant: 'destructive' }); return; }
                    const resp = await apiRequest<any>('POST', `/api/infractions/codes/${target.id}/items`, { nature: newItem.nature.trim(), article_code: newItem.article_code.trim(), is_default: false });
                    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Création impossible', variant: 'destructive' }); return; }
                    toast({ title: 'Succès', description: 'Élément ajouté' });
                    setNewItemOpen(false);
                    setNewItem({ codeLabel: '', nature: '', article_code: '', is_default: false });
                    await loadCodeItems();
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle>Campagne Cynégétique de Chasse</CardTitle>
              <CardDescription>
                Définissez ici les dates d'ouverture et de fermeture de la campagne. Les périodes spécifiques doivent rester dans cet intervalle, sauf dérogation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Start Date Picker */}
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="startDate">Date d'ouverture de la Campagne</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !huntingSeason.startDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {huntingSeason.startDate ? (
                          format(huntingSeason.startDate, "dd/MM/yyyy")
                        ) : (
                          <span>Choisissez une date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[10020]">
                      <Calendar
                        mode="single"
                        selected={huntingSeason.startDate}
                        onSelect={(day) =>
                          setHuntingSeason((prev) => ({ ...prev, startDate: day || new Date() }))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-sm text-muted-foreground">Date officielle d'ouverture de la campagne</p>
                </div>

                {/* End Date Picker */}
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="endDate">Date de fermeture de la Campagne</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !huntingSeason.endDate && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {huntingSeason.endDate ? (
                          format(huntingSeason.endDate, "dd/MM/yyyy")
                        ) : (
                          <span>Choisissez une date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[10020]">
                      <Calendar
                        mode="single"
                        selected={huntingSeason.endDate}
                        onSelect={(day) =>
                          setHuntingSeason((prev) => ({
                            ...prev,
                            endDate: day || prev.endDate,
                          }))
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-sm text-muted-foreground">Date officielle de fermeture de la campagne</p>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex flex-col space-y-1.5 max-w-xs">
                  <Label>Statut de la campagne</Label>
                  <div className="flex items-center gap-2">
                    <Switch id="campaign-active" checked={huntingSeason.isActive} onCheckedChange={(v) => setHuntingSeason({ ...huntingSeason, isActive: v })} />
                    <Label htmlFor="campaign-active">Active</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Section Armes: Types, Marques, Calibres */}
          <Card className="bg-white border-green-200 mt-6">
            <CardHeader>
              <CardTitle>Référentiel des Armes</CardTitle>
              <CardDescription>Gérer les types d'armes et leurs marques et calibres associés.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="Nouveau type (libellé)" value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} />
                <Button onClick={addWeaponType}>Ajouter</Button>
              </div>
              <Accordion
                type="multiple"
                value={openTypeIds}
                onValueChange={(vals) => {
                  const v = (vals as string[]);
                  setOpenTypeIds(v);
                  // Sélectionner le premier type ouvert pour charger ses données
                  if (v.length > 0 && !v.includes(selectedWeaponTypeId)) {
                    setSelectedWeaponTypeId(v[0]);
                  } else if (v.length === 0) {
                    setSelectedWeaponTypeId('');
                  }
                }}
              >
                {weaponTypes.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Aucun type d'arme. Ajoutez un type pour commencer.</div>
                ) : (
                  weaponTypes.map((t) => (
                    <AccordionItem key={t.id} value={String(t.id)}>
                      <AccordionTrigger className="flex items-center pr-8">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{t.label}</span>
                          {t.isActive === false && <Badge variant="secondary">Inactif</Badge>}
                        </div>
                        <div className="ml-auto flex items-center">
                          <span
                            role="button"
                            tabIndex={0}
                            className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            onClick={(e) => { e.stopPropagation(); openDeleteConfirm('type', String(t.id), t.label); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openDeleteConfirm('type', String(t.id), t.label); } }}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {(() => {
                          const typeId = String(t.id);
                          const brands = brandsByType[typeId] || [];
                          const calibers = calibersByType[typeId] || [];
                          const isLoading = !brandsByType[typeId] && !calibersByType[typeId];
                          const isSelected = String(selectedWeaponTypeId) === typeId;

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Marques</Label>
                                {isLoading ? (
                                  <div className="p-3 text-center text-sm"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
                                ) : (
                                  <div className="space-y-1">
                                    {brands.length === 0 ? (
                                      <div className="text-sm text-muted-foreground">Aucune marque</div>
                                    ) : (
                                      brands.map((b) => (
                                        <div key={b.id} className="flex items-center justify-between rounded-md border px-3 py-2 bg-white">
                                          <span>{b.label}</span>
                                          <Button variant="ghost" size="icon" onClick={() => { setSelectedWeaponTypeId(typeId); openDeleteConfirm('brand', b.id, b.label); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                                <div className="flex gap-2 pt-1">
                                  <Input placeholder="Nouvelle marque" value={isSelected ? newBrandLabel : ''} onChange={(e) => { setSelectedWeaponTypeId(typeId); setNewBrandLabel(e.target.value); }} />
                                  <Button onClick={() => { setSelectedWeaponTypeId(typeId); addWeaponBrand(); }}>Ajouter</Button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <Label>Calibres</Label>
                                {isLoading ? (
                                  <div className="p-3 text-center text-sm"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
                                ) : (
                                  <div className="space-y-1">
                                    {calibers.length === 0 ? (
                                      <div className="text-sm text-muted-foreground">Aucun calibre</div>
                                    ) : (
                                      calibers.map((c) => (
                                        <div key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 bg-white">
                                          <span>{c.label}</span>
                                          <Button variant="ghost" size="icon" onClick={() => { setSelectedWeaponTypeId(typeId); openDeleteConfirm('caliber', c.id, c.label); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                                <div className="flex gap-2 pt-1">
                                  <Input placeholder="Nouveau calibre" value={isSelected ? newCaliberLabel : ''} onChange={(e) => { setSelectedWeaponTypeId(typeId); setNewCaliberLabel(e.target.value); }} />
                                  <Button onClick={() => { setSelectedWeaponTypeId(typeId); addWeaponCaliber(); }}>Ajouter</Button>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </AccordionContent>
                    </AccordionItem>
                  ))
                )}
              </Accordion>
            </CardContent>
          </Card>
          {/* Dialog de confirmation suppression (armes) */}
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirmer la suppression</DialogTitle>
                <DialogDescription>
                  {confirmDeleteTarget?.kind === 'type' && "Cette action supprimera le type d'arme sélectionné et ses éléments associés."}
                  {confirmDeleteTarget?.kind === 'brand' && "Cette action supprimera la marque d'arme sélectionnée."}
                  {confirmDeleteTarget?.kind === 'caliber' && "Cette action supprimera le calibre d'arme sélectionné."}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 text-sm">
                {confirmDeleteTarget?.label ? (
                  <span>Élément: <b>{confirmDeleteTarget.label}</b></span>
                ) : null}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Annuler</Button>
                <Button variant="destructive" onClick={handleConfirmDelete}>Supprimer</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Onglet Périodes Spécifiques */}
        <TabsContent value="specific-periods">
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle>Périodes Spécifiques</CardTitle>
              <CardDescription>Définir, ajouter ou supprimer des périodes spécifiques. Utilisez "dérogation" pour autoriser une période hors campagne.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-3 border rounded-md bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">Liste des périodes</div>
                  <Button size="sm" onClick={() => { setNewCategoryPeriod({ categoryKey: '', startDate: huntingSeason.startDate, endDate: huntingSeason.endDate, derogationEnabled: false }); setNewCategoryPeriodOpen(true); }}>Nouvelle période</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-green-100">
                      <tr>
                        <th className="p-2 text-left">Catégorie</th>
                        <th className="p-2 text-left">Ouverture</th>
                        <th className="p-2 text-left">Fermeture</th>
                        <th className="p-2 text-left">Dérogation</th>
                        <th className="p-2 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryPeriods.length === 0 ? (
                        <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Aucune période définie</td></tr>
                      ) : (
                        categoryPeriods.map((row, idx) => (
                          <tr key={`${row.categoryKey}-${idx}`} className={idx % 2 ? 'bg-white' : 'bg-green-50'}>
                            <td className="p-2">
                              <Select value={row.categoryKey || ''} onValueChange={(v) => setCategoryPeriods(ps => ps.map((p,i) => i===idx ? { ...p, categoryKey: v } : p))}>
                                <SelectTrigger><SelectValue placeholder="Catégorie" /></SelectTrigger>
                                <SelectContent>
                                  {categories.map(c => (
                                    <SelectItem key={c.key} value={c.key}>{c.labelFr} ({c.key})</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal")}>{format(row.startDate, "dd/MM/yyyy")}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[10020]"><Calendar mode="single" selected={row.startDate} onSelect={(d) => d && setCategoryPeriods(ps => ps.map((p,i) => i===idx ? { ...p, startDate: d } : p))} initialFocus /></PopoverContent>
                              </Popover>
                            </td>
                            <td className="p-2">
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal")}>{format(row.endDate, "dd/MM/yyyy")}</Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 z-[10020]"><Calendar mode="single" selected={row.endDate} onSelect={(d) => d && setCategoryPeriods(ps => ps.map((p,i) => i===idx ? { ...p, endDate: d } : p))} initialFocus /></PopoverContent>
                              </Popover>
                            </td>
                            <td className="p-2">
                              <Switch checked={row.derogationEnabled} onCheckedChange={(v) => setCategoryPeriods(ps => ps.map((p,i) => i===idx ? { ...p, derogationEnabled: v } : p))} />
                            </td>
                            <td className="p-2">
                              <Button size="sm" variant="destructive" onClick={() => setCategoryPeriods(ps => ps.filter((_,i) => i!==idx))}>Supprimer</Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <Dialog open={newCategoryPeriodOpen} onOpenChange={setNewCategoryPeriodOpen}>
                <DialogContent className="max-w-[720px]">
                  <DialogHeader>
                    <DialogTitle>Nouvelle période spécifique</DialogTitle>
                    <CardDescription>Ajoutez une période spécifique supplémentaire (ex: autre espèce).</CardDescription>
                  </DialogHeader>
                  <Card className="border-0 shadow-none">

                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 gap-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          <Select value={newCategoryPeriod.categoryKey || undefined} onValueChange={(v) => setNewCategoryPeriod(prev => ({ ...prev, categoryKey: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Catégorie (depuis Tarifs)" />
                            </SelectTrigger>
                            <SelectContent>
                              {categories.map(c => (
                                <SelectItem key={c.key} value={c.key}>{c.labelFr} ({c.key})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input placeholder="Clé catégorie" value={newCategoryPeriod.categoryKey} onChange={(e) => setNewCategoryPeriod({ ...newCategoryPeriod, categoryKey: e.target.value })} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal")}>Ouverture: {format(newCategoryPeriod.startDate, "dd/MM/yyyy")}</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[10020]">
                              <Calendar
                                mode="single"
                                selected={newCategoryPeriod.startDate}
                                onSelect={(d) => d && setNewCategoryPeriod({ ...newCategoryPeriod, startDate: d })}
                                initialFocus
                                disabled={newCategoryPeriod.derogationEnabled ? (() => false) : (date => date < huntingSeason.startDate || date > huntingSeason.endDate)}
                              />
                            </PopoverContent>
                          </Popover>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal")}>Fermeture: {format(newCategoryPeriod.endDate, "dd/MM/yyyy")}</Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 z-[10020]">
                              <Calendar
                                mode="single"
                                selected={newCategoryPeriod.endDate}
                                onSelect={(d) => d && setNewCategoryPeriod({ ...newCategoryPeriod, endDate: d })}
                                initialFocus
                                disabled={newCategoryPeriod.derogationEnabled ? (() => false) : (date => date < huntingSeason.startDate || date > huntingSeason.endDate)}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch checked={newCategoryPeriod.derogationEnabled} onCheckedChange={(v) => setNewCategoryPeriod({ ...newCategoryPeriod, derogationEnabled: v })} />
                          <Label>Dérogation</Label>
                          <span className="text-xs text-muted-foreground">Permet de choisir des dates en dehors de la campagne</span>
                        </div>
                      </div>
                    </CardContent>
                    <div className="flex justify-end gap-2 px-6 pb-4">
                      <Button variant="outline" onClick={() => setNewCategoryPeriodOpen(false)}>Annuler</Button>
                      <Button onClick={() => {
                        const key = (newCategoryPeriod.categoryKey || '').trim();
                        if (!key) {
                          toast({ title: 'Catégorie requise', description: 'Veuillez choisir une catégorie (clé) pour la période.', variant: 'destructive' });
                          return;
                        }
                        // Dates valides: start <= end
                        if (newCategoryPeriod.startDate > newCategoryPeriod.endDate) {
                          toast({ title: 'Dates invalides', description: "La date d'ouverture doit être antérieure ou égale à la date de fermeture.", variant: 'destructive' });
                          return;
                        }
                        // Si pas de dérogation: contrainte dans l'intervalle de campagne
                        const withinCampaign = (d: Date) => d >= huntingSeason.startDate && d <= huntingSeason.endDate;
                        if (!newCategoryPeriod.derogationEnabled && (!withinCampaign(newCategoryPeriod.startDate) || !withinCampaign(newCategoryPeriod.endDate))) {
                          toast({ title: 'Hors campagne', description: "Les dates doivent être dans l'intervalle de la campagne, sauf dérogation.", variant: 'destructive' });
                          return;
                        }
                        const toAdd = { ...newCategoryPeriod, categoryKey: key };
                        setCategoryPeriods(ps => [...ps, toAdd]);
                        setNewCategoryPeriodOpen(false);
                      }}>Ajouter</Button>
                    </div>
                  </Card>
                </DialogContent>
              </Dialog>

            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Tarifs des Permis - Mini-CRUD dynamique */}
        <TabsContent value="permit-prices">
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle>Tarifs des Permis (XOF) — Saison {seasonYear || computeSeason()}</CardTitle>
              <CardDescription>Gérer dynamiquement les catégories et leurs prix par saison. Les modifications s'appliquent à la saison en cours.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Barre d'actions et filtres */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-base">Catégories de permis — Saison {seasonYear || computeSeason()}</div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch id="edit-prices" checked={editPrices} onCheckedChange={setEditPrices} />
                      <Label htmlFor="edit-prices">Mode édition (auto-enregistrement)</Label>
                    </div>
                    <Button onClick={() => setNewCatOpen(true)}>Nouvelle catégorie</Button>
                  </div>
                </div>
                <div className="p-3 border rounded-md bg-white/60">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <Input placeholder="Recherche (clé ou libellé)" value={filterQuery} onChange={(e) => setFilterQuery(e.target.value)} />
                    <Select value={filterGroupe} onValueChange={setFilterGroupe}>
                      <SelectTrigger><SelectValue placeholder="Groupe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        {distinctGroupes.map(g => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterGenre} onValueChange={setFilterGenre}>
                      <SelectTrigger><SelectValue placeholder="Catégorie" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toutes</SelectItem>
                        {distinctGenres.map(g => (
                          <SelectItem key={g} value={g}>{g}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={filterActive} onValueChange={setFilterActive}>
                      <SelectTrigger><SelectValue placeholder="Actif ?" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tous</SelectItem>
                        <SelectItem value="true">Actifs</SelectItem>
                        <SelectItem value="false">Inactifs</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => { setFilterGroupe("all"); setFilterGenre("all"); setFilterActive("all"); setFilterQuery(""); }}>Réinitialiser</Button>
                      <Button onClick={() => loadCategories(false)} variant="secondary">Rafraîchir</Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tableau des catégories */}
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-green-100">
                    <tr>
                      <th className="p-2 text-left">Libellé</th>
                      <th className="p-2 text-left">Groupe</th>
                      <th className="p-2 text-left">Catégorie</th>
                      <th className="p-2 text-left">Sous-cat.</th>
                      <th className="p-2 text-left">Validité (jours)</th>
                      <th className="p-2 text-left">Actif</th>
                      <th className="p-2 text-left">Prix {seasonYear || computeSeason()}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories
                      .filter(c => {
                        const q = filterQuery.trim().toLowerCase();
                        const matchQuery = q === '' || c.key.toLowerCase().includes(q) || c.labelFr.toLowerCase().includes(q);
                        const matchGroupe = filterGroupe === 'all' || c.groupe.toLowerCase() === filterGroupe.toLowerCase();
                        const matchGenre = filterGenre === 'all' || c.genre.toLowerCase() === filterGenre.toLowerCase();
                        const matchActive = filterActive === 'all' || String(c.isActive) === filterActive;
                        return matchQuery && matchGroupe && matchGenre && matchActive;
                      })
                      .map((row, idx) => (
                      <tr key={row.id} className={idx % 2 ? 'bg-white' : 'bg-green-50'}>
                        <td className="p-2">{row.labelFr}</td>
                        <td className="p-2">{row.groupe}</td>
                        <td className="p-2">{row.genre}</td>
                        <td className="p-2">{row.sousCategorie || ''}</td>
                        <td className="p-2">{row.defaultValidityDays ?? ''}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <Switch id={`cat-active-${row.id}`} checked={row.isActive} onCheckedChange={(v) => setCategories(cs => cs.map(c => c.id === row.id ? { ...c, isActive: v } : c))} disabled={!editPrices} />
                            <Label htmlFor={`cat-active-${row.id}`}>{row.isActive ? 'Actif' : 'Inactif'}</Label>
                          </div>
                        </td>
                        <td className="p-2">
                          <Input
                            inputMode="numeric"
                            value={priceEdits[row.id] ?? (row.priceXof ?? '')}
                            onChange={(e) => {
                              const raw = e.target.value;
                              // mettre à jour l'affichage formaté au fil de la saisie
                              const n = parseXof(raw);
                              setPriceEdits(prev => ({ ...prev, [row.id]: raw }));
                              setCategories(cs => cs.map(c => c.id === row.id ? { ...c, priceXof: n } : c));
                            }}
                            onBlur={(e) => {
                              const n = parseXof(e.target.value);
                              setCategories(cs => cs.map(c => c.id === row.id ? { ...c, priceXof: n } : c));
                              setPriceEdits(prev => ({ ...prev, [row.id]: n === null ? '' : formatXof(n) }));
                              // auto-save
                              if (editPrices) { void saveCategoryRow(row.id); }
                            }}
                            placeholder="Prix (XOF)"
                            disabled={!editPrices}
                          />
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Modal d'ajout de catégorie */}
              <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
                <DialogContent className="max-w-[900px]">
                  <DialogHeader>
                    <DialogTitle>Nouvelle catégorie</DialogTitle>
                    <DialogDescription>
                      Créer une nouvelle catégorie de permis et (optionnellement) définir son prix pour la saison {seasonYear || computeSeason()}.
                    </DialogDescription>
                  </DialogHeader>
                  <Card className="border-0 shadow-none">
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                        <Input placeholder="Clé (ex: resident-gibier-eau)" value={newCat.key || ''} onChange={(e) => setNewCat({ ...newCat, key: e.target.value })} />
                        <Input placeholder="Libellé (fr)" value={newCat.labelFr || ''} onChange={(e) => setNewCat({ ...newCat, labelFr: e.target.value })} />
                        <Input placeholder="Groupe (petite-chasse/grande-chasse/gibier-eau/autre)" value={newCat.groupe || ''} onChange={(e) => setNewCat({ ...newCat, groupe: e.target.value })} />
                        <Input placeholder="Genre (resident/touriste/coutumier/scientifique/commercial/oisellerie)" value={newCat.genre || ''} onChange={(e) => setNewCat({ ...newCat, genre: e.target.value })} />
                        <Input placeholder="Sous-catégorie (ex: 2-semaines)" value={newCat.sousCategorie || ''} onChange={(e) => setNewCat({ ...newCat, sousCategorie: e.target.value })} />
                        <Input placeholder="Validité (jours)" type="number" value={newCat.defaultValidityDays ?? ''} onChange={(e) => setNewCat({ ...newCat, defaultValidityDays: e.target.value ? parseInt(e.target.value, 10) : undefined })} />
                      </div>
                      <Input placeholder={`Prix ${seasonYear || computeSeason()} (XOF)`} type="number" value={newCat.priceXof ?? ''} onChange={(e) => setNewCat({ ...newCat, priceXof: e.target.value ? parseInt(e.target.value, 10) : undefined })} />
                    </CardContent>
                    <div className="flex items-center justify-end gap-2 px-6 pb-4">
                      <Button variant="outline" onClick={() => setNewCatOpen(false)}>Annuler</Button>
                      <Button
                        onClick={async () => {
                          try {
                            if (!newCat.key || !newCat.labelFr || !newCat.groupe || !newCat.genre) {
                              toast({ title: 'Champs requis', description: 'Clé, Libellé, Groupe et Genre sont requis', variant: 'destructive' });
                              return;
                            }
                            const resp = await apiRequest<any>('POST', '/permit-categories', {
                              key: newCat.key,
                              labelFr: newCat.labelFr,
                              groupe: newCat.groupe,
                              genre: newCat.genre,
                              sousCategorie: newCat.sousCategorie || null,
                              defaultValidityDays: newCat.defaultValidityDays ?? null,
                              isActive: true,
                            });
                            if (!resp.ok) throw new Error(resp.error || 'Erreur création catégorie');
                            const createdId = resp.data?.id;
                            const s = seasonYear || computeSeason();
                            if (createdId && (newCat.priceXof ?? null) !== null) {
                              await apiRequest<any>('POST', '/permit-categories/prices', {
                                categoryId: createdId,
                                seasonYear: s,
                                tarifXof: newCat.priceXof || 0,
                                isActive: true,
                              });
                            }
                            toast({ title: 'Succès', description: 'Catégorie créée' });
                            setNewCat({ genre: 'resident', groupe: 'petite-chasse', isActive: true, priceXof: undefined });
                            setNewCatOpen(false);
                            await loadCategories(false);
                          } catch (e: any) {
                            console.error('[SETTINGS] create category error:', e);
                            toast({ title: 'Erreur', description: e?.message || 'Création impossible', variant: 'destructive' });
                          }
                        }}
                      >Ajouter</Button>
                    </div>
                  </Card>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Taxes d'abattage */}
        <TabsContent value="hunting-taxes">
          <div className="space-y-6">
            {/* Section Taxes d'Abattage */}
            <Card className="bg-green-50 border-green-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Taxes d'Abattage (XOF)</CardTitle>
                    <CardDescription>
                      Gérer les taxes pour chaque espèce chassable.
                      <br />
                      <span className="text-blue-600 font-medium">
                        💡 Pour gérer les espèces, utilisez la page dédiée "Espèces Fauniques" dans le menu.
                      </span>
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="edit-taxes-toggle" className="text-sm">Activer l'édition</Label>
                    <Switch id="edit-taxes-toggle" checked={editTaxesMode} onCheckedChange={handleToggleEditTaxes} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingTaxes ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    <p>Chargement des taxes...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-md">
                    <table className="min-w-full text-sm">
                      <thead className="bg-green-100">
                        <tr>
                          <th className="p-2 text-left">Espèce</th>
                          <th className="p-2 text-left">Prix (XOF)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {huntingTaxes.length === 0 ? (
                          <tr><td colSpan={2} className="p-3 text-center text-muted-foreground">Aucune espèce taxable</td></tr>
                        ) : huntingTaxes.map((tax, idx) => {
                          const key = tax.id ?? tax.espece_id;
                          const editVal = taxEdits[tax.espece_id] ?? '';
                          return (
                            <tr key={key} className={idx % 2 ? 'bg-white' : 'bg-green-50'}>
                              <td className="p-2 font-medium">{tax.espece_nom}</td>
                              <td className="p-2">
                                {editTaxesMode ? (
                                  <Input
                                    inputMode="numeric"
                                    value={editVal}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      // autoriser chiffres et espaces
                                      setTaxEdits(prev => ({ ...prev, [tax.espece_id]: raw }));
                                    }}
                                    onBlur={async (e) => {
                                      // reformatter et sauvegarder si modifié
                                      const parsed = parseXof(e.target.value);
                                      const formatted = parsed === null ? '' : formatXof(parsed);
                                      setTaxEdits(prev => ({ ...prev, [tax.espece_id]: formatted }));
                                      const newVal = parsed ?? 0;
                                      if (Number(tax.prix_xof || 0) !== newVal) {
                                        setSavingTaxEspeceId(tax.espece_id);
                                        try {
                                          await saveHuntingTax({ espece_id: tax.espece_id, prix_xof: newVal });
                                        } finally {
                                          setSavingTaxEspeceId(null);
                                        }
                                      }
                                    }}
                                    placeholder="0"
                                    className="max-w-[180px]"
                                  />
                                ) : (
                                  <span className="font-mono">{formatXof(tax.prix_xof || 0)}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Modal Nouvelle Espèce */}
          <Dialog open={newSpeciesOpen} onOpenChange={setNewSpeciesOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Ajouter une Nouvelle Espèce</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nom *</Label>
                  <Input
                    value={newSpecies.nom || ''}
                    onChange={(e) => setNewSpecies(prev => ({ ...prev, nom: e.target.value }))}
                    placeholder="Nom de l'espèce"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nom Scientifique</Label>
                  <Input
                    value={newSpecies.nom_scientifique || ''}
                    onChange={(e) => setNewSpecies(prev => ({ ...prev, nom_scientifique: e.target.value }))}
                    placeholder="Nom scientifique"
                  />
                </div>
                <div className="space-y-2">
                  {/* Champ supprimé: Nom Anglais (non utilisé) */}
                </div>
                <div className="space-y-2">
                  {/* Champ supprimé: Code (non utilisé) */}
                </div>
                <div className="space-y-2">
                  <Label>Groupe *</Label>
                  <Select value={newSpecies.groupe} onValueChange={(v: any) => setNewSpecies(prev => ({ ...prev, groupe: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {distinctGroupes.length > 0 ? (
                        distinctGroupes.map(g => (
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
                  <Label>Statut de Protection</Label>
                  <Select value={newSpecies.statut_protection} onValueChange={(v: any) => setNewSpecies(prev => ({ ...prev, statut_protection: v }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Aucun">Aucun</SelectItem>
                      <SelectItem value="Partiel">Partiel</SelectItem>
                      <SelectItem value="Intégral">Intégral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>URL Photo</Label>
                  <Input
                    value={newSpecies.photo_url || ''}
                    onChange={(e) => setNewSpecies(prev => ({ ...prev, photo_url: e.target.value }))}
                    placeholder="URL de la photo"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newSpecies.chassable}
                      onCheckedChange={(v) => setNewSpecies(prev => ({ ...prev, chassable: v }))}
                    />
                    <Label>Chassable</Label>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newSpecies.taxable}
                      onCheckedChange={(v) => setNewSpecies(prev => ({ ...prev, taxable: v }))}
                    />
                    <Label>Taxable (apparaîtra dans l'onglet Taxes d'Abattage)</Label>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setNewSpeciesOpen(false);
                  setNewSpecies({ groupe: 'petite_chasse', statut_protection: 'Aucun', chassable: true, taxable: true });
                }}>
                  Annuler
                </Button>
                <Button onClick={async () => {
                  if (!newSpecies.nom || !newSpecies.groupe) {
                    toast({ title: 'Erreur', description: 'Nom et catégorie sont requis', variant: 'destructive' });
                    return;
                  }
                  const success = await saveSpecies(newSpecies);
                  if (success) {
                    setNewSpeciesOpen(false);
                    setNewSpecies({ groupe: 'petite_chasse', statut_protection: 'Aucun', chassable: true, taxable: true });
                  }
                }}>
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal Édition Espèce */}
          <Dialog open={editSpeciesOpen} onOpenChange={setEditSpeciesOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Modifier l'Espèce</DialogTitle>
              </DialogHeader>
              {selectedSpecies && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input
                      value={selectedSpecies.nom}
                      onChange={(e) => setSelectedSpecies(prev => prev ? ({ ...prev, nom: e.target.value }) : null)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Nom Scientifique</Label>
                    <Input
                      value={selectedSpecies.nom_scientifique || ''}
                      onChange={(e) => setSelectedSpecies(prev => prev ? ({ ...prev, nom_scientifique: e.target.value }) : null)}
                    />
                  </div>
                  {/* Champ supprimé: Code (non utilisé) */}
                  <div className="space-y-2">
                    <Label>Groupe</Label>
                    <Select value={selectedSpecies.groupe} onValueChange={(v: any) => setSelectedSpecies(prev => prev ? ({ ...prev, groupe: v }) : null)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="petite_chasse">Petite Chasse</SelectItem>
                        <SelectItem value="grande_chasse">Grande Chasse</SelectItem>
                        <SelectItem value="gibier_eau">Gibier d'Eau</SelectItem>
                        <SelectItem value="protege">Protégé</SelectItem>
                        <SelectItem value="autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={selectedSpecies.chassable}
                          onCheckedChange={(v) => setSelectedSpecies(prev => prev ? ({ ...prev, chassable: v }) : null)}
                        />
                        <Label>Chassable</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          checked={selectedSpecies.taxable}
                          onCheckedChange={(v) => setSelectedSpecies(prev => prev ? ({ ...prev, taxable: v }) : null)}
                        />
                        <Label>Taxable</Label>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditSpeciesOpen(false)}>
                  Annuler
                </Button>
                <Button onClick={async () => {
                  if (selectedSpecies) {
                    const success = await saveSpecies(selectedSpecies, true);
                    if (success) {
                      setEditSpeciesOpen(false);
                      setSelectedSpecies(null);
                    }
                  }
                }}>
                  Sauvegarder
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Modal Nouvelle Taxe (conservé mais non utilisé quand l'édition est active) */}
          <Dialog open={newTaxOpen} onOpenChange={setNewTaxOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter une Taxe d'Abattage</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Espèce *</Label>
                  <Select value={newTax.espece_id?.toString() || ''} onValueChange={(v) => setNewTax(prev => ({ ...prev, espece_id: parseInt(v) }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une espèce" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(species) ? species : [])
                        .filter(sp => Boolean(sp?.chassable) && Boolean(sp?.taxable))
                        .map(sp => {
                          const cat = (sp?.groupe ?? '').toString();
                          const catText = cat ? cat.replace('_', ' ') : '-';
                          return (
                            <SelectItem key={sp.id} value={String(sp.id)}>
                              {String(sp.nom || '')} ({catText})
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prix (XOF) *</Label>
                  <Input
                    inputMode="numeric"
                    value={newTax.prix_xof}
                    onChange={(e) => setNewTax(prev => ({ ...prev, prix_xof: e.target.value }))}
                    placeholder="Prix en XOF"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setNewTaxOpen(false);
                  setNewTax({ espece_id: null, prix_xof: '' });
                }}>
                  Annuler
                </Button>
                <Button onClick={async () => {
                  if (!newTax.espece_id || !newTax.prix_xof) {
                    toast({ title: 'Erreur', description: 'Espèce et prix sont requis', variant: 'destructive' });
                    return;
                  }
                  const prix = parseXof(newTax.prix_xof);
                  if (prix === null) {
                    toast({ title: 'Erreur', description: 'Prix invalide', variant: 'destructive' });
                    return;
                  }
                  const success = await saveHuntingTax({ espece_id: newTax.espece_id, prix_xof: prix });
                  if (success) {
                    setNewTaxOpen(false);
                    setNewTax({ espece_id: null, prix_xof: '' });
                  }
                }}>
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Onglet Paramètres Zones */}
        <TabsContent value="zones-config">
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle>Paramètres des Zones de Chasse</CardTitle>
              <CardDescription>
                Gérez les types de zones, statuts et couleurs utilisés dans le système de gestion des zones de chasse.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">

                {/* Section Types de Zones */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-gray-800">Types de Zones</h3>
                    </div>
                    <Dialog open={newZoneTypeOpen} onOpenChange={setNewZoneTypeOpen}>
                      <DialogTrigger asChild>
                        <Button className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Nouveau Type
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Créer un Nouveau Type de Zone</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Clé (identifiant technique) *</Label>
                            <Input
                              value={newZoneType.key || ''}
                              onChange={(e) => setNewZoneType(prev => ({ ...prev, key: e.target.value }))}
                              placeholder="zic, amodiee, parc_visite..."
                            />
                          </div>
                          <div>
                            <Label>Libellé (affiché à l'utilisateur) *</Label>
                            <Input
                              value={newZoneType.label || ''}
                              onChange={(e) => setNewZoneType(prev => ({ ...prev, label: e.target.value }))}
                              placeholder="ZIC, Amodiée, Parc de visite..."
                            />
                          </div>
                          <div>
                            <Label>Couleur par défaut</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                value={newZoneType.color || '#0ea5e9'}
                                onChange={(e) => setNewZoneType(prev => ({ ...prev, color: e.target.value }))}
                                className="w-16 h-10"
                              />
                              <div className="flex-1 h-10 rounded border" style={{ backgroundColor: newZoneType.color || '#0ea5e9' }} />
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={newZoneType.isActive}
                              onCheckedChange={(v) => setNewZoneType(prev => ({ ...prev, isActive: v }))}
                            />
                            <Label>Actif</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setNewZoneTypeOpen(false);
                            setNewZoneType({ key: '', label: '', color: '#0ea5e9', isActive: true });
                          }}>
                            Annuler
                          </Button>
                          <Button onClick={async () => {
                            if (!newZoneType.key || !newZoneType.label) {
                              toast({ title: 'Erreur', description: 'Clé et libellé sont requis', variant: 'destructive' });
                              return;
                            }
                            const success = await saveZoneType(newZoneType);
                            if (success) {
                              setNewZoneTypeOpen(false);
                              setNewZoneType({ key: '', label: '', color: '#0ea5e9', isActive: true });
                            }
                          }}>
                            Créer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {loadingZoneConfig ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Chargement des types de zones...</p>
                    </div>
                  ) : (
                    <div className="border border-green-200 rounded-lg overflow-hidden bg-white">
                      <div className="divide-y">
                        {(zoneTypes || []).map((type) => (
                          <div
                            key={type.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                          >
                            <div className="flex items-start gap-3 sm:flex-1">
                              <div
                                className="mt-1 h-3.5 w-3.5 rounded-full border border-white shadow"
                                style={{ backgroundColor: type.color }}
                              />
                              <div className="space-y-1 text-sm text-gray-700">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-gray-900">{type.label}</span>
                                  <Badge variant={type.isActive ? "default" : "secondary"} className="text-xs">
                                    {type.isActive ? "Actif" : "Inactif"}
                                  </Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">
                                    <span className="font-medium text-gray-700">Clé:</span>
                                    <code className="rounded bg-gray-100 px-2 py-0.5">{type.key}</code>
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <span className="font-medium text-gray-700">Couleur:</span>
                                    <span className="font-mono">{type.color}</span>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedZoneType(type);
                                  setEditZoneTypeOpen(true);
                                }}
                                className="flex items-center gap-1"
                              >
                                <Edit className="h-3 w-3" />
                                <span className="text-xs">Éditer</span>
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteZoneType(type.id, type.label)}
                                className="flex items-center gap-1"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span className="text-xs">Suppr.</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Modal d'édition des types de zones */}
                  <Dialog open={editZoneTypeOpen} onOpenChange={setEditZoneTypeOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Modifier le Type de Zone</DialogTitle>
                      </DialogHeader>
                      {selectedZoneType && (
                        <div className="space-y-4">
                          <div>
                            <Label>Clé (identifiant technique) *</Label>
                            <Input
                              value={selectedZoneType.key}
                              onChange={(e) => setSelectedZoneType(prev => prev ? ({ ...prev, key: e.target.value }) : null)}
                            />
                          </div>
                          <div>
                            <Label>Libellé (affiché à l'utilisateur) *</Label>
                            <Input
                              value={selectedZoneType.label}
                              onChange={(e) => setSelectedZoneType(prev => prev ? ({ ...prev, label: e.target.value }) : null)}
                            />
                          </div>
                          <div>
                            <Label>Couleur par défaut</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="color"
                                value={selectedZoneType.color}
                                onChange={(e) => setSelectedZoneType(prev => prev ? ({ ...prev, color: e.target.value }) : null)}
                                className="w-16 h-10"
                              />
                              <div className="flex-1 h-10 rounded border" style={{ backgroundColor: selectedZoneType.color }} />
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={selectedZoneType.isActive}
                              onCheckedChange={(v) => setSelectedZoneType(prev => prev ? ({ ...prev, isActive: v }) : null)}
                            />
                            <Label>Actif</Label>
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setEditZoneTypeOpen(false);
                          setSelectedZoneType(null);
                        }}>
                          Annuler
                        </Button>
                        <Button onClick={async () => {
                          if (selectedZoneType) {
                            const success = await saveZoneType(selectedZoneType, true);
                            if (success) {
                              setEditZoneTypeOpen(false);
                              setSelectedZoneType(null);
                            }
                          }
                        }}>
                          Sauvegarder
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                {/* Section Statuts de Zones */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b pb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-800">Statuts de Zones</h3>
                    </div>
                    <Dialog open={newZoneStatusOpen} onOpenChange={setNewZoneStatusOpen}>
                      <DialogTrigger asChild>
                        <Button className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Nouveau Statut
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Créer un Nouveau Statut de Zone</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <Label>Clé (identifiant technique) *</Label>
                            <Input
                              value={newZoneStatus.key || ''}
                              onChange={(e) => setNewZoneStatus(prev => ({ ...prev, key: e.target.value }))}
                              placeholder="active, inactive, suspended..."
                            />
                          </div>
                          <div>
                            <Label>Libellé (affiché à l'utilisateur) *</Label>
                            <Input
                              value={newZoneStatus.label || ''}
                              onChange={(e) => setNewZoneStatus(prev => ({ ...prev, label: e.target.value }))}
                              placeholder="Actif, Inactif, Suspendu..."
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={newZoneStatus.isActive}
                              onCheckedChange={(v) => setNewZoneStatus(prev => ({ ...prev, isActive: v }))}
                            />
                            <Label>Actif</Label>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setNewZoneStatusOpen(false);
                            setNewZoneStatus({ key: '', label: '', isActive: true });
                          }}>
                            Annuler
                          </Button>
                          <Button onClick={async () => {
                            if (!newZoneStatus.key || !newZoneStatus.label) {
                              toast({ title: 'Erreur', description: 'Clé et libellé sont requis', variant: 'destructive' });
                              return;
                            }
                            const success = await saveZoneStatus(newZoneStatus);
                            if (success) {
                              setNewZoneStatusOpen(false);
                              setNewZoneStatus({ key: '', label: '', isActive: true });
                            }
                          }}>
                            Créer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {loadingZoneConfig ? (
                    <div className="text-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      <p className="text-sm text-gray-500 mt-2">Chargement des statuts de zones...</p>
                    </div>
                  ) : (
                    <div className="border border-green-200 rounded-lg overflow-hidden bg-white">
                      <div className="divide-y">
                        {(zoneStatuses || []).map((status) => (
                          <div
                            key={status.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                          >
                            <div className="space-y-1 text-sm text-gray-700 sm:flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{status.label}</span>
                                <Badge variant={status.isActive ? "default" : "secondary"} className="text-xs">
                                  {status.isActive ? "Actif" : "Inactif"}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-600">
                                <span className="font-medium text-gray-700">Clé:</span>
                                <code className="rounded bg-gray-100 px-2 py-0.5">{status.key}</code>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 sm:justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedZoneStatus(status);
                                  setEditZoneStatusOpen(true);
                                }}
                                className="flex items-center gap-1"
                              >
                                <Edit className="h-3 w-3" />
                                <span className="text-xs">Éditer</span>
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => deleteZoneStatus(status.id, status.label)}
                                className="flex items-center gap-1"
                              >
                                <Trash2 className="h-3 w-3" />
                                <span className="text-xs">Suppr.</span>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Modal d'édition des statuts de zones */}
                  <Dialog open={editZoneStatusOpen} onOpenChange={setEditZoneStatusOpen}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Modifier le Statut de Zone</DialogTitle>
                      </DialogHeader>
                      {selectedZoneStatus && (
                        <div className="space-y-4">
                          <div>
                            <Label>Clé (identifiant technique) *</Label>
                            <Input
                              value={selectedZoneStatus.key}
                              onChange={(e) => setSelectedZoneStatus(prev => prev ? ({ ...prev, key: e.target.value }) : null)}
                            />
                          </div>
                          <div>
                            <Label>Libellé (affiché à l'utilisateur) *</Label>
                            <Input
                              value={selectedZoneStatus.label}
                              onChange={(e) => setSelectedZoneStatus(prev => prev ? ({ ...prev, label: e.target.value }) : null)}
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Switch
                              checked={selectedZoneStatus.isActive}
                              onCheckedChange={(v) => setSelectedZoneStatus(prev => prev ? ({ ...prev, isActive: v }) : null)}
                            />
                            <Label>Actif</Label>
                          </div>
                        </div>
                      )}
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setEditZoneStatusOpen(false);
                          setSelectedZoneStatus(null);
                        }}>
                          Annuler
                        </Button>
                        <Button onClick={async () => {
                          if (selectedZoneStatus) {
                            const success = await saveZoneStatus(selectedZoneStatus, true);
                            if (success) {
                              setEditZoneStatusOpen(false);
                              setSelectedZoneStatus(null);
                            }
                          }
                        }}>
                          Sauvegarder
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Modal de confirmation de suppression de type de zone */}
                  <Dialog open={deleteZoneTypeConfirm.open} onOpenChange={(open) => !open && setDeleteZoneTypeConfirm({ open: false, id: null, name: '' })}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                          <Trash2 className="h-5 w-5" />
                          Confirmer la suppression
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 pt-2">
                        <p className="text-base text-gray-700">
                          Êtes-vous sûr de vouloir supprimer le type de zone <strong>"{deleteZoneTypeConfirm.name}"</strong> ?
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                          <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Attention : Cette action est irréversible
                          </p>
                          <p className="text-sm text-amber-700">
                            Si ce type est utilisé par des zones existantes, la suppression sera refusée par le système.
                          </p>
                        </div>
                        {deleteZoneTypeUsageCount > 0 && (
                          <div className="mt-2 space-y-3">
                            <div className="text-sm text-gray-700">
                              Ce type est actuellement utilisé par <strong>{deleteZoneTypeUsageCount}</strong> zone(s).
                            </div>
                            {deleteZoneTypeMode === 'delete-zones' && (
                              <div className="space-y-2">
                                <Label>Zones qui seront supprimées</Label>
                                <div className="max-h-40 overflow-auto border rounded">
                                  <ul className="text-sm divide-y">
                                    {(deleteZoneTypeUsageItems || []).map(z => (
                                      <li key={z.id} className="px-3 py-2 flex items-center justify-between">
                                        <span>{z.name}</span>
                                        <code className="text-xs text-gray-500">#{z.id}</code>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                  <input id="ack-cascade" type="checkbox" className="h-4 w-4" checked={deleteZoneTypeConfirmCascadeAck} onChange={(e) => setDeleteZoneTypeConfirmCascadeAck(e.target.checked)} />
                                  <label htmlFor="ack-cascade" className="text-sm text-gray-700">Je comprends que toutes les zones listées ci-dessus seront définitivement supprimées.</label>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <DialogFooter className="gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setDeleteZoneTypeConfirm({ open: false, id: null, name: '' })}
                        >
                          Annuler
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={confirmDeleteZoneType}
                          disabled={deleteZoneTypeUsageCount > 0 && deleteZoneTypeMode === 'delete-zones' && !deleteZoneTypeConfirmCascadeAck}
                          className="flex items-center gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer définitivement
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  {/* Modal de confirmation de suppression de statut de zone */}
                  <Dialog open={deleteZoneStatusConfirm.open} onOpenChange={(open) => !open && setDeleteZoneStatusConfirm({ open: false, id: null, name: '' })}>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-600">
                          <Trash2 className="h-5 w-5" />
                          Confirmer la suppression
                        </DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3 pt-2">
                        <p className="text-base text-gray-700">
                          Êtes-vous sûr de vouloir supprimer le statut <strong>"{deleteZoneStatusConfirm.name}"</strong> ?
                        </p>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                          <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                            <Info className="h-4 w-4" />
                            Attention : Cette action est irréversible
                          </p>
                          <p className="text-sm text-amber-700">
                            Si ce statut est utilisé par des zones existantes, la suppression sera refusée par le système.
                          </p>
                        </div>
                      </div>
                      <DialogFooter className="gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setDeleteZoneStatusConfirm({ open: false, id: null, name: '' })}
                        >
                          Annuler
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={confirmDeleteZoneStatus}
                          className="flex items-center gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer définitivement
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Régions et Zones */}
        <TabsContent value="regions-zones">
          <Card className="bg-green-50 border-green-200">
            <CardHeader>
              <CardTitle>Gestion des Régions et Zones</CardTitle>
              <CardDescription>Ajouter, modifier ou supprimer des zones et régions de chasse.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="add-shapefile" className="w-full">
                <TabsList className="grid w-full grid-cols-2 md:grid-cols-3">
                  <TabsTrigger value="add-shapefile">Ajouter une couche .shp (shapefile)</TabsTrigger>
                  <TabsTrigger value="modify-statuses">Modifier Statuts</TabsTrigger>
                  <TabsTrigger value="delete-zone">Parametres</TabsTrigger>
                </TabsList>

                {/* Ajouter une couche shapefile */}
                <TabsContent value="add-shapefile" className="pt-4 space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                    <p className="text-sm text-blue-800">
                      <span className="font-semibold">📁 Format Shapefile :</span> Téléversez un fichier .shp avec ses fichiers associés (.shx, .dbf, .prj).
                      La couche sera automatiquement ajoutée à la carte et visible dans le panneau de contrôle.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* Sélection de la table de destination */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Table de destination</Label>
                      <Select value={shapefileDestTable} onValueChange={setShapefileDestTable} required>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Sélectionner la table de destination" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="regions">
                            <div className="flex items-center gap-2">
                              <FaGlobeEurope className="w-4 h-4 text-blue-600" />
                              <span>Régions</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="departements">
                            <div className="flex items-center gap-2">
                              <FaMapMarkedAlt className="w-4 h-4 text-green-600" />
                              <span>Départements</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="communes">
                            <div className="flex items-center gap-2">
                              <FaMapMarkedAlt className="w-4 h-4 text-yellow-600" />
                              <span>Communes</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="arrondissements">
                            <div className="flex items-center gap-2">
                              <FaMapMarkedAlt className="w-4 h-4 text-purple-600" />
                              <span>Arrondissements</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="protected_zones">
                            <div className="flex items-center gap-2">
                              <FaTree className="w-4 h-4 text-green-700" />
                              <span>Zones Protégées (Forêts)</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="eco_geographie_zones">
                            <div className="flex items-center gap-2">
                              <FaLeaf className="w-4 h-4 text-teal-600" />
                              <span>Zones Éco-Géographiques</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Nom de la couche */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Nom de la couche</Label>
                      <Input
                        value={shapefileLayerName}
                        onChange={(e) => setShapefileLayerName(e.target.value)}
                        placeholder="Ex: Nouvelles régions 2025"
                        className="w-full"
                        required
                      />
                    </div>

                    {/* Type (uniquement pour zones protégées) */}
                    {shapefileDestTable === 'protected_zones' && (
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Type (zones protégées)</Label>
                        <Select value={protectedZoneType} onValueChange={setProtectedZoneType}>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Sélectionner un type normalisé" />
                          </SelectTrigger>
                          <SelectContent>
                            {protectedZoneTypes.filter(t => t.isActive).map(type => (
                              <SelectItem key={type.key} value={type.key}>
                                {type.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">Requis lorsque la table de destination est "Zones Protégées".</p>
                      </div>
                    )}

                    {/* Upload du fichier shapefile */}
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Fichiers Shapefile</Label>
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition-colors">
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-3 bg-blue-100 rounded-full">
                            <Upload className="h-6 w-6 text-blue-600" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm font-medium text-gray-700">
                              Glissez-déposez vos fichiers shapefile ici
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              ou cliquez pour parcourir
                            </p>
                          </div>
                          <Input
                            type="file"
                            accept=".shp,.shx,.dbf,.prj"
                            multiple
                            className="hidden"
                            id="shapefile-upload"
                            onChange={(e) => {
                              const files = e.target.files;
                              if (files) {
                                const newFiles = { ...uploadedFiles };
                                Array.from(files).forEach(file => {
                                  const ext = file.name.split('.').pop()?.toLowerCase();
                                  if (ext === 'shp') newFiles.shp = file;
                                  else if (ext === 'shx') newFiles.shx = file;
                                  else if (ext === 'dbf') newFiles.dbf = file;
                                  else if (ext === 'prj') newFiles.prj = file;
                                });
                                setUploadedFiles(newFiles);
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('shapefile-upload')?.click()}
                          >
                            Parcourir les fichiers
                          </Button>
                        </div>
                      </div>

                      {/* Checklist des fichiers */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-semibold text-gray-700 mb-3">📋 Fichiers détectés :</p>
                        <div className="grid grid-cols-2 gap-2">
                          {/* Fichier .shp */}
                          <div className="flex items-center gap-2">
                            {uploadedFiles.shp ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                  <span className="text-xs">✓</span>
                                </div>
                                <span className="text-sm font-medium">.shp</span>
                                <span className="text-xs text-gray-500">({uploadedFiles.shp.name})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-600">
                                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                  <span className="text-xs">✗</span>
                                </div>
                                <span className="text-sm font-medium">.shp (requis)</span>
                              </div>
                            )}
                          </div>

                          {/* Fichier .shx */}
                          <div className="flex items-center gap-2">
                            {uploadedFiles.shx ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                  <span className="text-xs">✓</span>
                                </div>
                                <span className="text-sm font-medium">.shx</span>
                                <span className="text-xs text-gray-500">({uploadedFiles.shx.name})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-600">
                                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                  <span className="text-xs">✗</span>
                                </div>
                                <span className="text-sm font-medium">.shx (requis)</span>
                              </div>
                            )}
                          </div>

                          {/* Fichier .dbf */}
                          <div className="flex items-center gap-2">
                            {uploadedFiles.dbf ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                  <span className="text-xs">✓</span>
                                </div>
                                <span className="text-sm font-medium">.dbf</span>
                                <span className="text-xs text-gray-500">({uploadedFiles.dbf.name})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-red-600">
                                <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center">
                                  <span className="text-xs">✗</span>
                                </div>
                                <span className="text-sm font-medium">.dbf (requis)</span>
                              </div>
                            )}
                          </div>

                          {/* Fichier .prj */}
                          <div className="flex items-center gap-2">
                            {uploadedFiles.prj ? (
                              <div className="flex items-center gap-2 text-green-600">
                                <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                                  <span className="text-xs">✓</span>
                                </div>
                                <span className="text-sm font-medium">.prj</span>
                                <span className="text-xs text-gray-500">({uploadedFiles.prj.name})</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-yellow-600">
                                <div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
                                  <span className="text-xs">○</span>
                                </div>
                                <span className="text-sm font-medium">.prj (optionnel)</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Validation des fichiers requis */}
                        {uploadedFiles.shp && uploadedFiles.shx && uploadedFiles.dbf ? (
                          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                            ✓ Tous les fichiers requis sont présents
                          </div>
                        ) : (
                          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                            ⚠️ Fichiers manquants : {!uploadedFiles.shp && '.shp '}{!uploadedFiles.shx && '.shx '}{!uploadedFiles.dbf && '.dbf'}
                          </div>
                        )}
                      </div>
                    </div>



                    {/* Boutons d'action */}
                    <div className="flex gap-3 pt-4">
                      <Button
                        type="button"
                        className="flex-1"
                        disabled={!uploadedFiles.shp || !uploadedFiles.shx || !uploadedFiles.dbf || !shapefileDestTable || !shapefileLayerName || (shapefileDestTable === 'protected_zones' && !protectedZoneType)}
                        onClick={async () => {
                          if (!uploadedFiles.shp || !uploadedFiles.shx || !uploadedFiles.dbf) {
                            toast({
                              title: "Fichiers manquants",
                              description: "Veuillez téléverser tous les fichiers requis (.shp, .shx, .dbf)",
                              variant: "destructive"
                            });
                            return;
                          }

                          if (!shapefileDestTable || !shapefileLayerName) {
                            toast({
                              title: "Informations manquantes",
                              description: "Veuillez sélectionner une table de destination et saisir un nom de couche",
                              variant: "destructive"
                            });
                            return;
                          }

                          if (shapefileDestTable === 'protected_zones' && !protectedZoneType) {
                            toast({
                              title: "Type requis",
                              description: "Veuillez préciser le type pour la zone protégée (ex: Forêt classée).",
                              variant: "destructive"
                            });
                            return;
                          }

                          try {
                            setLoading(true);

                            // Créer FormData pour l'upload
                            const formData = new FormData();
                            formData.append('shp', uploadedFiles.shp);
                            formData.append('shx', uploadedFiles.shx);
                            formData.append('dbf', uploadedFiles.dbf);
                            if (uploadedFiles.prj) formData.append('prj', uploadedFiles.prj);
                            formData.append('destTable', shapefileDestTable);
                            formData.append('layerName', shapefileLayerName);
                            if (shapefileDestTable === 'protected_zones' && protectedZoneType) {
                              formData.append('protectedZoneType', protectedZoneType);
                            }

                            // Envoyer au backend pour traitement
                            // Le backend va :
                            // 1. Lire les fichiers shapefile
                            // 2. Convertir en SRID 32628 (UTM 28N)
                            // 3. Calculer les géométries et centroïdes
                            // 4. Insérer dans la table choisie
                            const response = await fetch('/api/shapefile/upload', {
                              method: 'POST',
                              body: formData
                            });

                            if (!response.ok) {
                              throw new Error('Erreur lors du téléversement');
                            }

                            const result = await response.json();

                            toast({
                              title: "Succès",
                              description: `Couche "${shapefileLayerName}" ajoutée avec succès à la table ${shapefileDestTable}. ${result.count} entités importées.`,
                            });

                            // Réinitialiser le formulaire
                            setUploadedFiles({ shp: null, shx: null, dbf: null, prj: null });
                            setShapefileLayerName('');
                            setShapefileDestTable('');

                            setProtectedZoneType('');

                          } catch (error: any) {
                            toast({
                              title: "Erreur",
                              description: error.message || "Impossible de téléverser les fichiers shapefile",
                              variant: "destructive"
                            });
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {loading ? "Traitement en cours..." : "Téléverser et Ajouter à la Carte"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setUploadedFiles({ shp: null, shx: null, dbf: null, prj: null });
                          setShapefileLayerName('');
                          setShapefileDestTable('');
                        }}
                      >
                        Annuler
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* Modifier Statuts (régions, départements, communes, arrondissements) */}
                <TabsContent value="modify-statuses" className="pt-4 space-y-4">
                  {/* Sélecteur de niveau */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5">
                      <Label>Niveau</Label>
                      <Select value={statusLevel} onValueChange={(v) => {
                        setStatusLevel(v as any);
                        // Reset cascade
                        setSelectedRegionId('');
                        setSelectedDepartementId('');
                        setSelectedEntityId('');
                        setSelectedEntityName('');
                        setDepartementsList([]);
                        setCommunesList([]);
                        setArrondissementsList([]);
                        void loadStatusEntities(v as any);
                      }}>
                        <SelectTrigger id="levelSelect"><SelectValue placeholder="Choisir un niveau" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="region">Régions</SelectItem>
                          <SelectItem value="departement">Départements</SelectItem>
                          <SelectItem value="commune">Communes</SelectItem>
                          <SelectItem value="arrondissement">Arrondissements</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Pour Communes/Arrondissements, afficher d'abord la Région, puis le Département */}
                    {statusLevel && (statusLevel === 'commune' || statusLevel === 'arrondissement') ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>Région</Label>
                          <Select value={selectedRegionId} onValueChange={async (v) => {
                            setSelectedRegionId(v);
                            // Reset downstream
                            setSelectedDepartementId('');
                            setSelectedEntityId('');
                            setSelectedEntityName('');
                            setCommunesList([]);
                            setArrondissementsList([]);
                            // La cascade sera gérée par les useEffect
                          }}>
                            <SelectTrigger id="regionCascading"><SelectValue placeholder="Sélectionner une région" /></SelectTrigger>
                            <SelectContent>
                              {regionsList.map(r => (
                                <SelectItem key={String(r.id)} value={String(r.id)}>{r.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Département</Label>
                          <Select value={selectedDepartementId || undefined} onValueChange={async (v) => {
                            // Définir le département
                            setSelectedDepartementId(v);
                            // Reset entity selection
                            setSelectedEntityId('');
                            setSelectedEntityName('');
                            // La cascade sera gérée par les useEffect
                          }}>
                            <SelectTrigger id="departementCascading"><SelectValue placeholder="Sélectionner un département" /></SelectTrigger>
                            <SelectContent>
                              {departementsList.map(d => (
                                <SelectItem key={String(d.id)} value={String(d.id)}>{d.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    ) : (
                      // Pour autres niveaux, garder l'ordre Région puis (optionnellement) Département
                      <>
                        {statusLevel && statusLevel !== 'region' ? (
                          <div className="space-y-1.5">
                            <Label>Région</Label>
                            <Select value={selectedRegionId} onValueChange={async (v) => {
                              setSelectedRegionId(v);
                              // Reset downstream
                              setSelectedDepartementId('');
                              setSelectedEntityId('');
                              setSelectedEntityName('');
                              setCommunesList([]);
                              setArrondissementsList([]);
                              // La cascade sera gérée par les useEffect
                            }}>
                              <SelectTrigger id="regionCascading"><SelectValue placeholder="Sélectionner une région" /></SelectTrigger>
                              <SelectContent>
                                {regionsList.map(r => (
                                  <SelectItem key={String(r.id)} value={String(r.id)}>{r.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : (
                          <div />
                        )}
                      </>
                    )}

                    <div className="space-y-1.5">
                      <Label>Statut de chasse</Label>
                      <Select value={statusChoice} onValueChange={setStatusChoice} disabled={!selectedEntityId}>
                        <SelectTrigger id="statusChoice"><SelectValue placeholder="Statut" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Ouvert</SelectItem>
                          <SelectItem value="partial">Partiel</SelectItem>
                          <SelectItem value="closed">Fermé</SelectItem>
                          <SelectItem value="unknown">Inconnu</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Sélection de l'entité finale */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="space-y-1.5 md:col-span-3">
                      <Label>Entité</Label>
                      <Select value={selectedEntityId || ''} onValueChange={(v) => { setSelectedEntityId(v); const found = statusEntities.find(e => String(e.id) === String(v)); setSelectedEntityName(found?.name || ''); const nextStatus = (found?.statut || statusChoice) as string; setStatusChoice(nextStatus); const nextColor = found?.color || STATUS_COLOR[nextStatus] || STATUS_COLOR.unknown; setColorChoice(nextColor); }}>
                        <SelectTrigger id="entitySelect"><SelectValue placeholder={statusLevel ? `Sélectionner une ${statusLevel}` : 'Sélectionner une entité'} /></SelectTrigger>
                        <SelectContent>
                          {statusEntities.map(e => (
                            <SelectItem key={String(e.id)} value={String(e.id)}>{e.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div className="space-y-1.5">
                      <Label>Couleur</Label>
                      <Input type="color" value={colorChoice || '#808080'} onChange={(e) => setColorChoice(e.target.value)} disabled={!selectedEntityId} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Aperçu</Label>
                      <div className="h-10 w-full rounded border" style={{ backgroundColor: colorChoice || '#808080' }} />
                    </div>
                    <div className="flex md:justify-end">
                      <Button onClick={() => void handleUpdateStatus()} disabled={!selectedEntityId || updatingStatus}>
                        {updatingStatus ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {updatingStatus ? 'Mise à jour...' : 'Enregistrer les modifications'}
                      </Button>
                    </div>
                  </div>

                  {/* Info: liste actuelle */}
                  <div className="p-3 border rounded-md bg-white/70">
                    <div className="font-medium mb-2">
                      {loadingStatusEntities ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Chargement en cours...
                        </div>
                      ) : (
                        `${statusLevel ? `Liste (${statusLevel}s) chargée: ${statusEntities.length}` : 'Sélectionner un niveau pour charger la liste'}`
                      )}
                    </div>
                    <div className="max-h-64 overflow-auto text-sm">
                      {statusEntities.length === 0 ? (
                        <div className="text-muted-foreground">Aucune entité</div>
                      ) : (
                        <table className="min-w-full text-sm">
                          <thead className="bg-green-100 sticky top-0">
                            <tr>
                              <th className="p-2 text-left">Nom</th>
                              <th className="p-2 text-left">Statut</th>
                              <th className="p-2 text-left">Couleur</th>
                            </tr>
                          </thead>
                          <tbody>
                            {statusEntities.map((e, idx) => (
                              <tr key={String(e.id)} className={idx % 2 ? 'bg-white' : 'bg-green-50'}>
                                <td className="p-2">{e.name}</td>
                                <td className="p-2">{e.statut || 'unknown'}</td>
                                <td className="p-2"><span className="inline-block h-4 w-6 rounded" style={{ backgroundColor: e.color || '#808080' }} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </TabsContent>

                {/* Supprimer une zone */}
                <TabsContent value="delete-zone" className="pt-4 space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                    <p className="text-red-700 font-semibold flex items-center gap-2">
                      <Trash2 className="h-5 w-5" />
                      Attention : Action irréversible
                    </p>
                    <p className="text-sm text-red-600">
                      La suppression de couches est définitive et peut affecter les données liées.
                    </p>
                  </div>

                  {/* Layout en deux colonnes */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Section 1: Supprimer des couches */}
                    <Card className="border-2 border-red-100">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Trash2 className="h-5 w-5 text-red-600" />
                        Supprimer des Couches
                      </CardTitle>
                      <CardDescription>
                        Sélectionnez une table et les entités à supprimer
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Sélection de la table */}
                      <div className="space-y-2">
                        <Label className="text-base font-semibold">Table source</Label>
                        <Select
                          value={deleteLayerTable}
                          onValueChange={(v) => {
                            setDeleteLayerTable(v);
                            setSelectedDeleteEntities([]);
                            loadDeleteLayerEntities(v);
                          }}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Sélectionner la table" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="regions">
                              <div className="flex items-center gap-2">
                                <FaGlobeEurope className="w-4 h-4 text-blue-600" />
                                <span>Régions</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="departements">
                              <div className="flex items-center gap-2">
                                <FaMapMarkedAlt className="w-4 h-4 text-green-600" />
                                <span>Départements</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="communes">
                              <div className="flex items-center gap-2">
                                <FaMapMarkedAlt className="w-4 h-4 text-yellow-600" />
                                <span>Communes</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="arrondissements">
                              <div className="flex items-center gap-2">
                                <FaMapMarkedAlt className="w-4 h-4 text-purple-600" />
                                <span>Arrondissements</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="eco_geographie_zones">
                              <div className="flex items-center gap-2">
                                <FaLeaf className="w-4 h-4 text-teal-600" />
                                <span>Zones Éco-Géographiques</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="protected_zones">
                              <div className="flex items-center gap-2">
                                <FaTree className="w-4 h-4 text-green-700" />
                                <span>Zones Protégées</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Liste des entités */}
                      {deleteLayerTable && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-base font-semibold">
                              Entités disponibles ({deleteLayerEntities.length})
                            </Label>
                            {selectedDeleteEntities.length > 0 && (
                              <Badge variant="destructive">
                                {selectedDeleteEntities.length} sélectionnée(s)
                              </Badge>
                            )}
                          </div>

                          {loadingDeleteEntities ? (
                            <div className="text-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                              <p className="text-sm text-gray-500 mt-2">Chargement des entités...</p>
                            </div>
                          ) : deleteLayerEntities.length === 0 ? (
                            <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                              <p className="text-sm text-gray-500">Aucune entité trouvée dans cette table</p>
                            </div>
                          ) : (
                            <div className="border rounded-lg max-h-96 overflow-auto">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                                      {/* Sélection globale (liste visible) */}
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                        checked={deleteLayerEntities.length > 0 && selectedDeleteCountInView === deleteLayerEntities.length}
                                        onChange={(e) => {
                                          const idsInView = deleteLayerEntities.map((x:any) => x.id);
                                          if (e.currentTarget.checked) {
                                            // Ajouter tous les ids visibles
                                            setSelectedDeleteEntities(prev => {
                                              const set = new Set(prev);
                                              idsInView.forEach((id:number) => set.add(id));
                                              return Array.from(set);
                                            });
                                          } else {
                                            // Retirer tous les ids visibles
                                            setSelectedDeleteEntities(prev => prev.filter(id => !idsInView.includes(id)));
                                          }
                                        }}
                                      />
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                      Nom
                                    </th>
                                    {deleteLayerTable === 'protected_zones' && (
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Type
                                      </th>
                                    )}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {deleteLayerEntities.map((entity) => (
                                    <tr
                                      key={entity.id}
                                      className={`hover:bg-gray-50 ${
                                        selectedDeleteEntities.includes(entity.id) ? 'bg-red-50' : ''
                                      }`}
                                    >
                                      <td className="px-4 py-3">
                                        <input
                                          type="checkbox"
                                          className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                                          checked={selectedDeleteEntities.includes(entity.id)}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            if (selectedDeleteEntities.includes(entity.id)) {
                                              setSelectedDeleteEntities(prev => prev.filter(id => id !== entity.id));
                                            } else {
                                              setSelectedDeleteEntities(prev => [...prev, entity.id]);
                                            }
                                          }}
                                        />
                                      </td>
                                      <td className="px-4 py-3 text-sm text-gray-900">
                                        {entity.name}
                                      </td>
                                      {deleteLayerTable === 'protected_zones' && (
                                        <td className="px-4 py-3 text-sm text-gray-500">
                                          {entity.type || 'Non défini'}
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Bouton de suppression */}
                          {deleteLayerEntities.length > 0 && (
                            <div className="flex justify-end pt-2">
                              <Button
                                variant="destructive"
                                onClick={() => setDeleteEntitiesConfirmOpen(true)}
                                disabled={selectedDeleteEntities.length === 0 || deletingEntities}
                                className="flex items-center gap-2"
                              >
                                {deletingEntities ? (
                                  <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Suppression en cours...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4" />
                                    Supprimer {selectedDeleteEntities.length > 0 ? `(${selectedDeleteEntities.length})` : ''}
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Modal de confirmation de suppression */}
                          <Dialog open={deleteEntitiesConfirmOpen} onOpenChange={setDeleteEntitiesConfirmOpen}>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2 text-red-600">
                                  <Trash2 className="h-5 w-5" />
                                  Confirmer la suppression
                                </DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3 pt-2">
                                <p className="text-base text-gray-700">
                                  Êtes-vous sûr de vouloir supprimer <strong>{selectedDeleteEntities.length}</strong> entité(s) de la table <strong>{deleteLayerTable}</strong> ?
                                </p>
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                                  <p className="text-sm text-red-800 font-semibold flex items-center gap-2">
                                    <Info className="h-4 w-4" />
                                    Attention : Cette action est irréversible
                                  </p>
                                  <p className="text-sm text-red-700">
                                    Les entités supprimées seront définitivement retirées de la base de données et ne pourront pas être récupérées.
                                  </p>
                                </div>
                                {selectedDeleteEntities.length > 0 && (
                                  <div className="mt-2">
                                    <Label className="text-sm font-semibold">Entités qui seront supprimées :</Label>
                                    <div className="mt-2 max-h-40 overflow-auto border rounded p-2 bg-gray-50">
                                      <ul className="text-sm space-y-1">
                                        {selectedDeleteEntities.map(id => {
                                          const entity = deleteLayerEntities.find(e => e.id === id);
                                          return (
                                            <li key={id} className="flex items-center justify-between py-1">
                                              <span>{entity?.name || `ID: ${id}`}</span>
                                              {entity?.type && (
                                                <code className="text-xs bg-gray-200 px-2 py-0.5 rounded">{entity.type}</code>
                                              )}
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <DialogFooter className="gap-2">
                                <Button
                                  variant="outline"
                                  onClick={() => setDeleteEntitiesConfirmOpen(false)}
                                  disabled={deletingEntities}
                                >
                                  Annuler
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={async () => {
                                    await handleDeleteSelectedEntities();
                                    setDeleteEntitiesConfirmOpen(false);
                                  }}
                                  disabled={deletingEntities}
                                  className="flex items-center gap-2"
                                >
                                  {deletingEntities ? (
                                    <>
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                      Suppression...
                                    </>
                                  ) : (
                                    <>
                                      <Trash2 className="h-4 w-4" />
                                      Supprimer définitivement
                                    </>
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Section 2: Gérer les types de zones protégées */}
                  <Card className="border-2 border-green-100">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FaTree className="h-5 w-5 text-green-700" />
                            Types de Zones Protégées
                          </CardTitle>
                          <CardDescription>
                            Gérer la liste des types disponibles pour les zones protégées
                          </CardDescription>
                        </div>

                        {/* Bouton de filtrage régional */}
                        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                          <div className="flex flex-col">
                            <Label htmlFor="regional-filter-toggle" className="text-sm font-semibold text-blue-900 cursor-pointer">
                              Filtrage régional
                            </Label>
                            <span className="text-xs text-blue-700">
                              {enableRegionalFilterProtectedZones
                                ? 'Agents voient leur région uniquement'
                                : 'Tous les agents voient toutes les zones'}
                            </span>
                          </div>
                          <Switch
                            id="regional-filter-toggle"
                            checked={enableRegionalFilterProtectedZones}
                            onCheckedChange={saveRegionalFilterSetting}
                            disabled={loadingRegionalFilter}
                            className="data-[state=checked]:bg-blue-600"
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Bouton d'ajout */}
                      <div className="flex justify-end">
                        <Dialog open={newProtectedTypeOpen} onOpenChange={setNewProtectedTypeOpen}>
                          <DialogTrigger asChild>
                            <Button className="flex items-center gap-2">
                              <Plus className="h-4 w-4" />
                              Ajouter un Type
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Nouveau Type de Zone Protégée</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <Label>Clé (identifiant technique) *</Label>
                                <Input
                                  value={newProtectedType.key || ''}
                                  onChange={(e) => setNewProtectedType(prev => ({ ...prev, key: e.target.value }))}
                                  placeholder="ex: reserve_naturelle"
                                />
                              </div>
                              <div>
                                <Label>Libellé (affiché à l'utilisateur) *</Label>
                                <Input
                                  value={newProtectedType.label || ''}
                                  onChange={(e) => setNewProtectedType(prev => ({ ...prev, label: e.target.value }))}
                                  placeholder="ex: Réserve naturelle"
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={newProtectedType.isActive ?? true}
                                  onCheckedChange={(v) => setNewProtectedType(prev => ({ ...prev, isActive: v }))}
                                />
                                <Label>Actif</Label>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => {
                                setNewProtectedTypeOpen(false);
                                setNewProtectedType({ key: '', label: '', isActive: true });
                              }}>
                                Annuler
                              </Button>
                              <Button onClick={async () => {
                                if (!newProtectedType.key || !newProtectedType.label) {
                                  toast({
                                    title: 'Champs requis',
                                    description: 'Veuillez remplir tous les champs obligatoires',
                                    variant: 'destructive'
                                  });
                                  return;
                                }
                                const success = await saveProtectedZoneType(newProtectedType, false);
                                if (success) {
                                  setNewProtectedTypeOpen(false);
                                  setNewProtectedType({ key: '', label: '', isActive: true });
                                }
                              }}>
                                Créer
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>

                      {/* Barre d'actions pour suppression multiple */}
                      {selectedProtectedTypesToDelete.length > 0 && (
                        <div className="flex items-center justify-between p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Badge variant="destructive">
                              {selectedProtectedTypesToDelete.length} sélectionné(s)
                            </Badge>
                            <span className="text-sm text-gray-600">
                              Types sélectionnés pour suppression
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedProtectedTypesToDelete([])}
                            >
                              Annuler
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteProtectedTypesConfirmOpen(true)}
                              className="flex items-center gap-2"
                            >
                              <Trash2 className="h-4 w-4" />
                              Supprimer ({selectedProtectedTypesToDelete.length})
                            </Button>
                          </div>
                        </div>
                      )}
                      {/* Liste des types en tableau */}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                                {/* Colonne pour les cases à cocher */}
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Nom
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {protectedZoneTypes.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                                  Aucun type de zone protégée configuré
                                </td>
                              </tr>
                            ) : (
                              protectedZoneTypes.map((type, idx) => (
                                <tr
                                  key={type.key}
                                  className={`hover:bg-gray-50 cursor-pointer ${
                                    selectedProtectedTypesToDelete.includes(type.key) ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                                  }`}
                                  onClick={() => {
                                    if (selectedProtectedTypesToDelete.includes(type.key)) {
                                      setSelectedProtectedTypesToDelete(prev => prev.filter(k => k !== type.key));
                                    } else {
                                      setSelectedProtectedTypesToDelete(prev => [...prev, type.key]);
                                    }
                                  }}
                                >
                                  <td className="px-4 py-3">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-gray-300"
                                      checked={selectedProtectedTypesToDelete.includes(type.key)}
                                      onChange={() => {}} // Géré par le onClick du tr
                                    />
                                  </td>
                                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                                    {type.label}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600">
                                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                      {type.key}
                                    </code>
                                  </td>
                                  <td className="px-4 py-3 text-sm">
                                    <Badge variant={type.isActive ? "default" : "secondary"} className="text-xs">
                                      {type.isActive ? 'Actif' : 'Inactif'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex justify-end gap-2">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setSelectedProtectedType(type);
                                          setEditProtectedTypeOpen(true);
                                        }}
                                        className="flex items-center gap-1"
                                      >
                                        <Edit className="h-3 w-3" />
                                        <span className="text-xs">Éditer</span>
                                      </Button>
                                      {type.id && (
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() => type.id && deleteProtectedZoneType(type.id)}
                                          className="flex items-center gap-1"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                          <span className="text-xs">Suppr.</span>
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Modal de confirmation de suppression multiple */}
                      <Dialog open={deleteProtectedTypesConfirmOpen} onOpenChange={setDeleteProtectedTypesConfirmOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-red-600">
                              <Trash2 className="h-5 w-5" />
                              Confirmer la suppression
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-3 pt-2">
                            <p className="text-base text-gray-700">
                              Êtes-vous sûr de vouloir supprimer <strong>{selectedProtectedTypesToDelete.length}</strong> type(s) de zone protégée ?
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                              <p className="text-sm text-amber-800 font-semibold flex items-center gap-2">
                                <Info className="h-4 w-4" />
                                Attention : Cette action est irréversible
                              </p>
                              <p className="text-sm text-amber-700">
                                Les types supprimés ne seront plus disponibles dans la liste déroulante lors de l'ajout de zones protégées.
                              </p>
                            </div>
                            {selectedProtectedTypesToDelete.length > 0 && (
                              <div className="mt-2">
                                <Label className="text-sm font-semibold">Types qui seront supprimés :</Label>
                                <div className="mt-2 max-h-40 overflow-auto border rounded p-2 bg-gray-50">
                                  <ul className="text-sm space-y-1">
                                    {selectedProtectedTypesToDelete.map(key => {
                                      const type = protectedZoneTypes.find(t => t.key === key);
                                      return (
                                        <li key={key} className="flex items-center justify-between py-1">
                                          <span>{type?.label || key}</span>
                                          <code className="text-xs bg-gray-200 px-2 py-0.5 rounded">{key}</code>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                          <DialogFooter className="gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setDeleteProtectedTypesConfirmOpen(false)}
                              disabled={deletingProtectedTypes}
                            >
                              Annuler
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={deleteSelectedProtectedTypes}
                              disabled={deletingProtectedTypes}
                              className="flex items-center gap-2"
                            >
                              {deletingProtectedTypes ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Suppression...
                                </>
                              ) : (
                                <>
                                  <Trash2 className="h-4 w-4" />
                                  Supprimer définitivement
                                </>
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {/* Modal d'édition */}
                      <Dialog open={editProtectedTypeOpen} onOpenChange={setEditProtectedTypeOpen}>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Modifier le Type de Zone Protégée</DialogTitle>
                          </DialogHeader>
                          {selectedProtectedType && (
                            <div className="space-y-4">
                              <div>
                                <Label>Clé (identifiant technique) *</Label>
                                <Input
                                  value={selectedProtectedType.key}
                                  onChange={(e) => setSelectedProtectedType(prev => prev ? ({ ...prev, key: e.target.value }) : null)}
                                />
                              </div>
                              <div>
                                <Label>Libellé (affiché à l'utilisateur) *</Label>
                                <Input
                                  value={selectedProtectedType.label}
                                  onChange={(e) => setSelectedProtectedType(prev => prev ? ({ ...prev, label: e.target.value }) : null)}
                                />
                              </div>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={selectedProtectedType.isActive}
                                  onCheckedChange={(v) => setSelectedProtectedType(prev => prev ? ({ ...prev, isActive: v }) : null)}
                                />
                                <Label>Actif</Label>
                              </div>
                            </div>
                          )}
                          <DialogFooter>
                            <Button variant="outline" onClick={() => {
                              setEditProtectedTypeOpen(false);
                              setSelectedProtectedType(null);
                            }}>
                              Annuler
                            </Button>
                            <Button onClick={async () => {
                              if (selectedProtectedType) {
                                const success = await saveProtectedZoneType(selectedProtectedType, true);
                                if (success) {
                                  setEditProtectedTypeOpen(false);
                                  setSelectedProtectedType(null);
                                }
                              }
                            }}>
                              Sauvegarder
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </CardContent>
                  </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Onglet Codes Infractions */}
        <TabsContent value="codes-infractions">
          <Card className="border-[#cfe8dc] bg-[#eef9f3]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-6 w-6 text-blue-600" />
                Gestion des Codes d'Infractions
              </CardTitle>
              <CardDescription>
                Configurez dynamiquement les codes, natures et articles d'infractions utilisés dans le système.
              </CardDescription>
              {/* Sous-onglets: Codes et Articles / Observations - Saisie */}
              <div className="mt-4">
                <Tabs value={codesSubTab} onValueChange={(v) => setCodesSubTab(v as 'items' | 'saisie')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="items">Codes et Articles</TabsTrigger>
                    <TabsTrigger value="saisie" onClick={() => { if (saisieItems.length === 0) void loadSaisieItems(); }}>Observations / Saisies</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Bloc ITEMS */}
              <div className={`${codesSubTab === 'items' ? '' : 'hidden'}`}>
              {/* Barre de recherche et bouton d'ajout */}
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                <div className="flex-1 max-w-md">
                  <Input
                    placeholder="Rechercher par code, nature ou article..."
                    value={searchCodeTerm}
                    onChange={(e) => setSearchCodeTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      setNewCode({ code: '', nature: '', article_code: '' });
                      setNewCodeOpen(true);
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nouveau Code
                  </Button>
                </div>
              </div>

              {/* Liste des codes d'infractions (groupée par code avec items) */}
              {loadingCodes || loadingCodeItems ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-2 text-gray-600">Chargement des codes...</span>
                </div>
              ) : allGroups.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">{searchCodeTerm ? 'Aucun résultat' : 'Aucun code d\'infraction'}</p>
                  <p className="text-sm">
                    {searchCodeTerm
                      ? 'Essayez avec d\'autres termes de recherche'
                      : 'Cliquez sur "Nouveau Code" pour créer le premier code d\'infraction'
                    }
                  </p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {allGroups.map(({ label: codeLabel, items }) => (
                    <AccordionItem key={codeLabel} value={codeLabel}>
                      <div className="w-full flex items-center justify-between">
                        <AccordionTrigger className="flex-1 justify-start">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">{codeLabel}</Badge>
                            <span className="text-sm text-gray-600">{items.length} élément(s)</span>
                          </div>
                        </AccordionTrigger>
                        <div className="flex items-center gap-2 mr-2">
                          <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-100"
                            onClick={(e) => {
                              e.preventDefault();
                              const target = codesInfractions.find(c => normalize(c.code) === normalize(codeLabel));
                              if (!target?.id) { toast({ title: 'Erreur', description: 'Code introuvable', variant: 'destructive' }); return; }
                              setConfirmTitle('Supprimer le code');
                              setConfirmMessage(`Supprimer définitivement le code "${codeLabel}" et tous ses éléments ?`);
                              confirmActionRef.current = async () => { await deleteCodeInfraction(target.id!); await loadCodeItems(); await loadCodesInfractions(); };
                              setConfirmOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <AccordionContent>
                        <div className="space-y-3">
                          {items.length === 0 && (
                            <div className="p-3 border rounded-lg bg-gray-50 text-sm text-gray-600">Aucun élément (nature/article) pour ce code.</div>
                          )}
                          {items.length > 0 && (
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 text-sm text-gray-600">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={items.length > 0 && items.every(it => selectedItemIds.has(it.id))}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setSelectedItemIds(prev => {
                                        const next = new Set(prev);
                                        if (checked) { items.forEach(it => next.add(it.id)); } else { items.forEach(it => next.delete(it.id)); }
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>Tout sélectionner</span>
                                </label>
                                <span>Sélection: {items.filter(it => selectedItemIds.has(it.id)).length}</span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-700 border-red-300 hover:bg-red-50"
                                disabled={items.every(it => !selectedItemIds.has(it.id))}
                                onClick={() => {
                                  const toDelete = items.filter(it => selectedItemIds.has(it.id)).map(it => it.id);
                                  if (toDelete.length === 0) return;
                                  setConfirmTitle('Supprimer la sélection');
                                  setConfirmMessage(`Supprimer définitivement ${toDelete.length} élément(s) du code "${codeLabel}" ?`);
                                  confirmActionRef.current = async () => {
                                    for (const id of toDelete) {
                                      const resp = await apiRequest<any>('DELETE', `/api/infractions/codes/items/${id}`);
                                      if (!resp.ok) {
                                        toast({ title: 'Erreur', description: resp.error || `Suppression échouée pour l'item ${id}`, variant: 'destructive' });
                                      }
                                    }
                                    clearItemSelection();
                                    await loadCodeItems();
                                  };
                                  setConfirmOpen(true);
                                }}
                              >
                                Supprimer la sélection
                              </Button>
                            </div>
                          )}
                          {items.map((item) => (
                            <div key={item.id} className="p-3 border rounded-lg bg-white flex items-start justify-between">
                              <div className="flex items-start gap-3">
                                <input type="checkbox" className="mt-1"
                                  checked={selectedItemIds.has(item.id)}
                                  onChange={(e) => toggleSelectItem(item.id, e.target.checked)}
                                />
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium text-gray-900">Nature:</span> {item.nature}
                                    {item.is_default && <Badge className="bg-green-100 text-green-800 border-green-300">par défaut</Badge>}
                                  </div>
                                  <div className="text-sm text-gray-700"><span className="font-medium text-gray-900">Article:</span> {item.article_code}</div>
                                </div>
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50"
                                  onClick={async () => {
                                    const resp = await apiRequest<any>('PATCH', `/api/infractions/codes/items/${item.id}/default`);
                                    if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Impossible de définir par défaut', variant: 'destructive' }); return; }
                                    toast({ title: 'Par défaut', description: 'Item marqué comme par défaut' });
                                    await loadCodeItems();
                                  }}>
                                  Par défaut
                                </Button>
                                <Button size="sm" variant="ghost" className="text-blue-600 hover:bg-blue-100"
                                  onClick={() => { setSelectedCode({ id: item.id, code: codeLabel, nature: item.nature, article_code: item.article_code }); setNewCode({ code: codeLabel, nature: item.nature, article_code: item.article_code }); setEditCodeOpen(true); }}>
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-100"
                                  onClick={() => {
                                    setConfirmTitle('Supprimer l\'élément');
                                    setConfirmMessage(`Supprimer la nature/article du code "${codeLabel}" ?`);
                                    confirmActionRef.current = async () => {
                                      const resp = await apiRequest<any>('DELETE', `/api/infractions/codes/items/${item.id}`);
                                      if (resp.ok) { toast({ title: 'Supprimé' }); await loadCodeItems(); }
                                      else { toast({ title: 'Erreur', description: resp.error || 'Suppression impossible', variant: 'destructive' }); }
                                    };
                                    setConfirmOpen(true);
                                  }}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="space-y-2">
                            <Button variant="outline" className="mt-1"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setInlineNewItemCode(codeLabel);
                                setInlineNature('');
                                setInlineArticle('');
                              }}>
                              <Plus className="h-4 w-4 mr-2" /> Ajouter une nature/article
                            </Button>
                            {inlineNewItemCode === codeLabel && (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 p-3 border rounded-lg bg-gray-50">
                                <div>
                                  <Label>Nature *</Label>
                                  <Input value={inlineNature} onChange={(e) => setInlineNature(e.target.value)} disabled={inlineImportCode === codeLabel} className={inlineImportCode === codeLabel ? 'bg-gray-100 cursor-not-allowed' : ''} />
                                </div>
                                <div>
                                  <Label>Article *</Label>
                                  <Input value={inlineArticle} onChange={(e) => setInlineArticle(e.target.value)} disabled={inlineImportCode === codeLabel} className={inlineImportCode === codeLabel ? 'bg-gray-100 cursor-not-allowed' : ''} />
                                </div>
                                <div className="flex items-end gap-2">
                                  <Button disabled={creatingInlineItem || inlineImportCode === codeLabel}
                                    onClick={async () => {
                                      const target = codesInfractions.find(c => normalize(c.code) === normalize(codeLabel));
                                      if (!target) { toast({ title: 'Erreur', description: 'Code introuvable', variant: 'destructive' }); return; }
                                      if (!inlineNature.trim() || !inlineArticle.trim()) { toast({ title: 'Champs requis', description: 'Nature et Article sont requis', variant: 'destructive' }); return; }
                                      try {
                                        setCreatingInlineItem(true);
                                        const resp = await apiRequest<any>('POST', `/api/infractions/codes/${target.id}/items`, { nature: inlineNature.trim(), article_code: inlineArticle.trim(), is_default: false });
                                        if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Création impossible', variant: 'destructive' }); return; }
                                        toast({ title: 'Succès', description: 'Élément ajouté' });
                                        setInlineNewItemCode('');
                                        setInlineNature('');
                                        setInlineArticle('');
                                        await loadCodeItems();
                                      } finally {
                                        setCreatingInlineItem(false);
                                      }
                                    }}>Créer</Button>
                                  <Button variant="outline" onClick={() => { setInlineNewItemCode(''); setInlineNature(''); setInlineArticle(''); }}>Annuler</Button>
                                </div>
                                {/* Import CSV d'items pour ce code */}
                                <div className="md:col-span-3 mt-2 p-3 border rounded bg-white">
                                  <div className="mb-2">
                                    <span className="text-sm font-medium">Importer CSV (items pour le code {codeLabel})</span>
                                  </div>
                                  {inlineImportCode === codeLabel && (
                                    <div className="space-y-2">
                                      <div>
                                        <Button size="sm" variant="outline" disabled className="bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed">Sélectionner</Button>
                                      </div>
                                      <Input type="file" accept=".csv" onChange={async (e) => {
                                        try {
                                          setInlineImportErrors([]);
                                          setInlineImportRows([]);
                                          const f = e.target.files?.[0];
                                          if (!f) return;
                                          setInlineImportFileName(f.name);
                                          let txt = await readFileAsText(f);
                                          const rawLines = txt.split(/\r?\n/).filter((l: string) => l.trim() !== '');
                                          if (rawLines.length === 0) { setInlineImportErrors(['Fichier vide']); return; }
                                          const headerRaw = rawLines[0];
                                          const candidates = [',',';','\t','|'];
                                          const delim = candidates.reduce((best, d) => {
                                            const count = headerRaw.split(d).length;
                                            return count > (best.count) ? { d, count } : best;
                                          }, { d: ',', count: 0 as number }).d as string;
                                          const parseLine = (line: string, sep: string) => {
                                            const cells: string[] = [];
                                            let current = '';
                                            let inQuotes = false;
                                            for (let i = 0; i < line.length; i++) {
                                              const ch = line[i];
                                              if (ch === '"') {
                                                if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
                                                else { inQuotes = !inQuotes; }
                                              } else if (ch === sep && !inQuotes) {
                                                cells.push(current); current = '';
                                              } else { current += ch; }
                                            }
                                            cells.push(current);
                                            return cells.map(c => c.trim());
                                          };
                                          const headers = parseLine(headerRaw, delim).map(h => h.toLowerCase());
                                          const idxNature = headers.indexOf('nature');
                                          const idxArticle = headers.indexOf('article');
                                          const idxDef = headers.indexOf('par_defaut');
                                          if (idxNature < 0 || idxArticle < 0) { setInlineImportErrors([`En-têtes requis: nature,article[,par_defaut]. Trouvé: ${headers.join(', ')}`]); return; }
                                          const rows: Array<{ nature: string; article: string; par_defaut?: boolean }> = [];
                                          for (let i = 1; i < rawLines.length; i++) {
                                            const cells = parseLine(rawLines[i], delim);
                                            const nature = (cells[idxNature] || '').trim();
                                            const article = (cells[idxArticle] || '').trim();
                                            const defRaw = idxDef >= 0 ? (cells[idxDef] || '').trim() : '';
                                            const par_defaut = /^(true|1|oui|yes)$/i.test(defRaw);
                                            if (!nature && !article) continue;
                                            rows.push({ nature, article, par_defaut });
                                          }
                                          if (rows.length === 0) { setInlineImportErrors(['Aucune ligne valide détectée']); return; }
                                          setInlineImportRows(rows);
                                        } catch (err: any) {
                                          setInlineImportErrors([err?.message || 'Erreur de lecture du fichier']);
                                        }
                                      }} />
                                      {inlineImportFileName && (<div className="text-xs text-gray-600">Fichier: {inlineImportFileName}</div>)}
                                      {inlineImportErrors.length > 0 && (
                                        <div className="text-xs text-red-600 space-y-1">
                                          {inlineImportErrors.map((e, i) => (<div key={i}>• {e}</div>))}
                                        </div>
                                      )}
                                      {inlineImportRows.length > 0 && (
                                        <div className="text-xs text-gray-700">{inlineImportRows.length} ligne(s) prêtes</div>
                                      )}
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="outline" className="bg-green-100 text-green-800 border-green-300 hover:bg-green-200" disabled={inlineImporting || inlineImportRows.length === 0}
                                          onClick={async () => {
                                            const target = codesInfractions.find(c => normalize(c.code) === normalize(codeLabel));
                                            if (!target?.id) { toast({ title: 'Erreur', description: 'Code introuvable', variant: 'destructive' }); return; }
                                            try {
                                              setInlineImporting(true);
                                              let created = 0;
                                              let defaultItemId: number | null = null;
                                              for (const row of inlineImportRows) {
                                                const resp = await apiRequest<any>('POST', `/api/infractions/codes/${target.id}/items`, { nature: row.nature.trim(), article_code: row.article.trim(), is_default: false });
                                                if (resp.ok) {
                                                  created++;
                                                  const it = resp.data?.id;
                                                  if (!defaultItemId && row.par_defaut && it) defaultItemId = it;
                                                }
                                              }
                                              if (defaultItemId) {
                                                await apiRequest<any>('PATCH', `/api/infractions/codes/items/${defaultItemId}/default`);
                                              }
                                              toast({ title: 'Import terminé', description: `${created} item(s) ajoutés` });
                                              setInlineImportCode('');
                                              setInlineImportFileName('');
                                              setInlineImportRows([]);
                                              await loadCodeItems();
                                            } catch (e: any) {
                                              toast({ title: 'Erreur', description: e?.message || 'Import échoué', variant: 'destructive' });
                                            } finally {
                                              setInlineImporting(false);
                                            }
                                          }}>Importer CSV</Button>
                                        <Button size="sm" variant="ghost" onClick={() => { setInlineImportCode(''); setInlineImportRows([]); setInlineImportErrors([]); setInlineImportFileName(''); }}>Annuler</Button>
                                      </div>
                                    </div>
                                  )}
                                  {inlineImportCode !== codeLabel && (
                                    <div>
                                      <Button size="sm" variant="outline" onClick={() => { setInlineImportCode(codeLabel); setInlineImportErrors([]); setInlineImportRows([]); setInlineImportFileName(''); }}>Sélectionner</Button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
              </div>

              {/* Bloc SAISIE */}
              <div className={`${codesSubTab === 'saisie' ? '' : 'hidden'} space-y-4`}>
                <div className="flex flex-wrap gap-2 items-center">
                  <Button size="sm" variant={selectedSaisieGroupKey === null ? 'default' : 'outline'}
                    className={`${selectedSaisieGroupKey === null ? 'bg-red-600 hover:bg-red-700 text-white' : redChipClasses}`}
                    onClick={() => setSelectedSaisieGroupKey(null)}>
                    Tous ({saisieItems.length})
                  </Button>
                  {loadingSaisieGroups && <span className="text-xs text-gray-500">Chargement des groupes...</span>}
                  {!loadingSaisieGroups && saisieGroups.filter(g => g.is_active !== false).map(group => (
                    <Button key={group.key} size="sm"
                      variant={selectedSaisieGroupKey === group.key ? 'default' : 'outline'}
                      className={`${selectedSaisieGroupKey === group.key ? 'bg-red-600 hover:bg-red-700 text-white' : redChipClasses}`}
                      onClick={() => setSelectedSaisieGroupKey(prev => prev === group.key ? null : group.key)}>
                      {formatGroupLabel(group.key, group)} ({groupCounts[group.key] || 0})
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-100" onClick={openCreateGroup}>
                    <Plus className="h-4 w-4 mr-1" /> Groupe
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <div>
                    <Label>Clé *</Label>
                    <Input value={newSaisie.key as any} onChange={(e) => setNewSaisie(prev => ({ ...prev, key: e.target.value }))} placeholder="ex: filet, gibier, etc." />
                  </div>
                  <div>
                    <Label>Libellé *</Label>
                    <Input value={newSaisie.label as any} onChange={(e) => setNewSaisie(prev => ({ ...prev, label: e.target.value }))} placeholder="Nom affiché" />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!newSaisie.is_active} onChange={(e) => setNewSaisie(prev => ({ ...prev, is_active: e.target.checked }))} /> Actif</label>
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!newSaisie.quantity_enabled} onChange={(e) => setNewSaisie(prev => ({ ...prev, quantity_enabled: e.target.checked }))} /> Qté</label>
                  </div>
                  <div>
                    <Label>Mode d'unité</Label>
                    <Select value={(newSaisie.unit_mode as any) || 'none'} onValueChange={(v) => setNewSaisie(prev => ({ ...prev, unit_mode: v as any }))}>
                      <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Aucune</SelectItem>
                        <SelectItem value="fixed">Fixe</SelectItem>
                        <SelectItem value="choices">Au choix</SelectItem>
                        <SelectItem value="free">Libre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Groupe</Label>
                    <Select value={newSaisie.group_key ?? NO_GROUP_VALUE} onValueChange={(value) => setNewSaisie(prev => ({ ...prev, group_key: value === NO_GROUP_VALUE ? null : value }))}>
                      <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_GROUP_VALUE}>(Aucun)</SelectItem>
                        {saisieGroups.map(group => (
                          <SelectItem key={group.key} value={group.key}>{group.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {newSaisie.unit_mode === 'fixed' && (
                    <div>
                      <Label>Unité fixe</Label>
                      <Input value={(newSaisie.unit_fixed_key as any) || ''} onChange={(e) => setNewSaisie(prev => ({ ...prev, unit_fixed_key: e.target.value }))} placeholder="ex: kg" />
                    </div>
                  )}
                  {newSaisie.unit_mode === 'choices' && (
                    <div className="md:col-span-2">
                      <Label>Unités autorisées (séparées par des virgules)</Label>
                      <Input value={(Array.isArray(newSaisie.unit_allowed) ? newSaisie.unit_allowed?.join(',') : '') as any}
                        onChange={(e) => setNewSaisie(prev => ({ ...prev, unit_allowed: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                        placeholder="ex: kg,g,pièce" />
                    </div>
                  )}
                  <div className="md:col-span-5">
                    <Button onClick={createSaisieItem} className="bg-blue-600 hover:bg-blue-700 text-white"><Plus className="h-4 w-4 mr-2" /> Ajouter</Button>
                  </div>
                </div>
                <div className="border rounded-lg">
                  {loadingSaisie ? (
                    <div className="p-4 text-sm text-gray-600">Chargement...</div>
                  ) : filteredSaisieItems.length === 0 ? (
                    <div className="p-4 text-sm text-gray-600">Aucun item pour ce filtre</div>
                  ) : (
                    <div className="divide-y">
                      {groupedSaisieItems.map(block => (
                        <div key={block.key}>
                          <div className="flex items-center justify-between bg-red-50/60 px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-red-700">{formatGroupLabel(block.key, block.group)}</span>
                              <span className="text-xs text-red-500 bg-red-100 rounded-full px-2 py-0.5">{block.items.length}</span>
                            </div>
                            {block.group && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-blue-600 hover:bg-blue-100"
                                  onClick={() => openEditGroup(block.group!)}
                                >
                                  Modifier groupe
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7 text-red-600 hover:bg-red-100"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span className="sr-only">Supprimer</span>
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Êtes-vous sûr de vouloir supprimer le groupe "{formatGroupLabel(block.key, block.group)}" ? Les items resteront enregistrés mais ne seront plus rattachés à ce groupe.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                        onClick={async () => {
                                          if (!block.group) return;
                                          await deleteGroup(block.group.key);
                                        }}
                                      >
                                        Supprimer
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </div>
                          <div className="divide-y">
                            {block.items.map((s) => (
                              <div key={s.id} className="grid grid-cols-7 items-center px-3 py-2 gap-2">
                                <div className="text-sm text-gray-800">
                                  {editingSaisieId === s.id ? (
                                    <Input value={(editingSaisie.key as any) || ''} onChange={(e) => setEditingSaisie(prev => ({ ...prev, key: e.target.value }))} />
                                  ) : s.key}
                                </div>
                                <div className="text-sm text-gray-800">
                                  {editingSaisieId === s.id ? (
                                    <Input value={(editingSaisie.label as any) || ''} onChange={(e) => setEditingSaisie(prev => ({ ...prev, label: e.target.value }))} />
                                  ) : s.label}
                                </div>
                                <div>
                                  {editingSaisieId === s.id ? (
                                    <input type="checkbox" checked={!!editingSaisie.is_active} onChange={(e) => setEditingSaisie(prev => ({ ...prev, is_active: e.target.checked }))} />
                                  ) : (
                                    <Badge variant="outline" className={s.is_active ? 'bg-green-50 text-green-700 border-green-300' : 'bg-gray-50 text-gray-600 border-gray-300'}>{s.is_active ? 'Oui' : 'Non'}</Badge>
                                  )}
                                </div>
                                <div>
                                  {editingSaisieId === s.id ? (
                                    <input type="checkbox" checked={!!editingSaisie.quantity_enabled} onChange={(e) => setEditingSaisie(prev => ({ ...prev, quantity_enabled: e.target.checked }))} />
                                  ) : (
                                    <Badge variant="outline" className={s.quantity_enabled ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-gray-50 text-gray-600 border-gray-300'}>{s.quantity_enabled ? 'Oui' : 'Non'}</Badge>
                                  )}
                                </div>
                                <div>
                                  {editingSaisieId === s.id ? (
                                    <Select value={(editingSaisie.unit_mode as any) || s.unit_mode} onValueChange={(v) => setEditingSaisie(prev => ({ ...prev, unit_mode: v as any }))}>
                                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">Aucune</SelectItem>
                                        <SelectItem value="fixed">Fixe</SelectItem>
                                        <SelectItem value="choices">Au choix</SelectItem>
                                        <SelectItem value="free">Libre</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : s.unit_mode}
                                </div>
                                <div className="text-xs text-gray-700">
                                  {editingSaisieId === s.id ? (
                                    <div className="space-y-1">
                                      {editingSaisie.unit_mode === 'fixed' && (
                                        <Input placeholder="Unité fixe" value={(editingSaisie.unit_fixed_key as any) || ''} onChange={(e) => setEditingSaisie(prev => ({ ...prev, unit_fixed_key: e.target.value }))} />
                                      )}
                                      {editingSaisie.unit_mode === 'choices' && (
                                        <Input placeholder="kg,g,pièce" value={(Array.isArray(editingSaisie.unit_allowed) ? editingSaisie.unit_allowed?.join(',') : '') as any}
                                          onChange={(e) => setEditingSaisie(prev => ({ ...prev, unit_allowed: e.target.value.split(',').map(o => o.trim()).filter(Boolean) }))} />
                                      )}
                                      <div>
                                        <Label>Groupe</Label>
                                        <Select value={editingSaisie.group_key ?? NO_GROUP_VALUE} onValueChange={(value) => setEditingSaisie(prev => ({ ...prev, group_key: value === NO_GROUP_VALUE ? null : value }))}>
                                          <SelectTrigger className="h-8"><SelectValue placeholder="Aucun" /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value={NO_GROUP_VALUE}>(Aucun)</SelectItem>
                                            {saisieGroups.map(group => (
                                              <SelectItem key={group.key} value={group.key}>{group.label}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div>
                                        {s.unit_mode === 'fixed' ? (s.unit_fixed_key || '') : (s.unit_mode === 'choices' ? (s.unit_allowed || [])?.join(', ') : '')}
                                      </div>
                                      <div className="text-[11px] text-gray-500">{formatGroupLabel(s.group_key || 'autre', groupMap.get(s.group_key || ''))}</div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  {editingSaisieId === s.id ? (
                                    <>
                                      <Button size="sm" variant="outline" className="text-green-700 border-green-300 hover:bg-green-50" onClick={saveEditSaisie}>Enregistrer</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setEditingSaisieId(null)}>Annuler</Button>
                                    </>
                                  ) : (
                                    <>
                                      <Button size="sm" variant="ghost" className="text-blue-600 hover:bg-blue-100" onClick={() => { setEditingSaisieId(s.id); setEditingSaisie({ ...s }); }}>Modifier</Button>
                                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-100" onClick={() => deleteSaisieItem(s.id)}>Supprimer</Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Résumé statistique */}
                <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
                  <div className="text-sm text-gray-600">
                    {(() => {
                      const totalItems = saisieItems.length;
                      const activeItems = saisieItems.filter(s => s.is_active !== false).length;
                      const withQuantity = saisieItems.filter(s => s.quantity_enabled).length;
                      const unitModes = {
                        none: saisieItems.filter(s => s.unit_mode === 'none').length,
                        fixed: saisieItems.filter(s => s.unit_mode === 'fixed').length,
                        choices: saisieItems.filter(s => s.unit_mode === 'choices').length,
                        free: saisieItems.filter(s => s.unit_mode === 'free').length,
                      };

                      return (
                        <div className="space-y-1">
                          <div>Total observations/saisies pré-enregistrés: <span className="font-medium">{totalItems}</span></div>
                          <div className="flex flex-wrap gap-4 text-xs">
                            {unitModes.free > 0 && <span>Unité libre: {unitModes.free}</span>}
                            {Object.entries(groupCounts).map(([key, count]) => (
                              <span key={key}>{formatGroupLabel(key, groupMap.get(key))}: {count}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              <Dialog open={groupManagerOpen} onOpenChange={(open) => {
                setGroupManagerOpen(open);
                if (!open) resetGroupForm();
              }}>
                <DialogContent className="sm:max-w-[420px]">
                  <DialogHeader>
                    <DialogTitle>{groupFormMode === 'create' ? 'Nouveau groupe' : 'Modifier le groupe'}</DialogTitle>
                    <DialogDescription>
                      Organisez les observations par groupes thématiques. Les utilisateurs verront ces groupes comme filtres.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label>Clé *</Label>
                      <Input
                        value={groupForm.key}
                        onChange={(e) => setGroupForm(prev => ({ ...prev, key: e.target.value }))}
                        disabled={groupFormMode === 'edit'}
                        placeholder="ex: faune, arme"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Libellé *</Label>
                      <Input
                        value={groupForm.label}
                        onChange={(e) => setGroupForm(prev => ({ ...prev, label: e.target.value }))}
                        placeholder="Libellé affiché"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="group-active-switch"
                        checked={groupForm.is_active}
                        onCheckedChange={(checked) => setGroupForm(prev => ({ ...prev, is_active: checked }))}
                      />
                      <Label htmlFor="group-active-switch" className="text-sm">Actif</Label>
                    </div>
                  </div>
                  <DialogFooter className="flex justify-between">
                    {groupFormMode === 'edit' && groupFormOriginalKey ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" className="text-red-600 hover:bg-red-100">
                            Supprimer
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                            <AlertDialogDescription>
                              Êtes-vous sûr de vouloir supprimer le groupe "{(groupForm.label || '').trim() || formatGroupLabel(groupFormOriginalKey, groupMap.get(groupFormOriginalKey))}" ?
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700 text-white"
                              onClick={async () => {
                                await deleteGroup(groupFormOriginalKey);
                                setGroupManagerOpen(false);
                                resetGroupForm();
                              }}
                            >
                              Supprimer
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : <span />}
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setGroupManagerOpen(false)}>Annuler</Button>
                      <Button onClick={submitGroupForm} disabled={groupFormSubmitting} className="bg-red-600 hover:bg-red-700 text-white">
                        {groupFormSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enregistrer'}
                      </Button>
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Dialog Configuration Unités par Item */}
              <Dialog open={unitConfigOpen} onOpenChange={setUnitConfigOpen}>
                <DialogContent className="sm:max-w-[520px]">
                  <DialogHeader>
                    <DialogTitle>Unités de l'élément</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="text-sm text-gray-700">{unitConfigItem ? `${unitConfigItem.nature} — ${unitConfigItem.article_code}` : ''}</div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="unitMode" checked={unitConfigMode === 'choices'} onChange={() => setUnitConfigMode('choices')} />
                        Au choix (liste d'unités)
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="radio" name="unitMode" checked={unitConfigMode === 'fixed'} onChange={() => setUnitConfigMode('fixed')} />
                        Fixe (une seule unité)
                      </label>
                    </div>
                    {unitConfigMode === 'choices' ? (
                      <div className="grid grid-cols-2 gap-2">
                        {units.map(u => (
                          <label key={u.id} className="flex items-center gap-2 text-sm border rounded px-2 py-1">
                            <input
                              type="checkbox"
                              checked={unitConfigAllowed.includes(u.key)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setUnitConfigAllowed((prev: string[]) => checked ? Array.from(new Set<string>([...prev, u.key])) : prev.filter((x: string) => x !== u.key));
                              }}
                            />
                            <span className="text-gray-800">{u.label} ({u.key})</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <Label>Unité fixe</Label>
                        <Select value={unitConfigFixed} onValueChange={setUnitConfigFixed as any}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une unité" />
                          </SelectTrigger>
                          <SelectContent>
                            {units.map(u => (<SelectItem key={u.id} value={u.key}>{u.label} ({u.key})</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setUnitConfigOpen(false)}>Fermer</Button>
                    <Button onClick={async () => {
                      if (!unitConfigItem) { setUnitConfigOpen(false); return; }
                      const payload: any = { mode: unitConfigMode };
                      if (unitConfigMode === 'choices') payload.allowed = unitConfigAllowed; else payload.fixed = unitConfigFixed;
                      const resp = await apiRequest<any>('PUT', `/api/infractions/codes/items/${unitConfigItem.id}/units-config`, payload);
                      if (!resp.ok) { toast({ title: 'Erreur', description: resp.error || 'Sauvegarde config unités impossible', variant: 'destructive' }); return; }
                      toast({ title: 'Succès', description: 'Configuration unités enregistrée' });
                      setUnitConfigOpen(false);
                    }}>Enregistrer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {/* Dialog de confirmation générique */}
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen} modal={false}>
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-600">
                      <Trash2 className="h-5 w-5" /> {confirmTitle}
                    </DialogTitle>
                    <DialogDescription>{confirmMessage}</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmOpen(false)}>Annuler</Button>
                    <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={async () => { try { await (confirmActionRef.current?.()); } finally { setConfirmOpen(false); } }}>Supprimer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Statistiques - seulement pour l'onglet Codes et Articles */}
              {codesSubTab === 'items' && !loadingCodes && !loadingCodeItems && codeItems.length > 0 && (
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Total natures d'infractions pré-enregistrées: {codeItems.length}</span>
                    {searchCodeTerm && (<span>Affiché(s): {filteredCodeItems.length} / {codeItems.length}</span>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dialog Nouveau Code */}
          <Dialog open={newCodeOpen} onOpenChange={setNewCodeOpen} modal={false}>
            <DialogContent className="sm:max-w-[500px] z-[1000]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5 text-blue-600" />
                  Nouveau Code d'Infraction
                </DialogTitle>
                <DialogDescription>
                  Renseignez le nom du code et ajoutez des pièces jointes associées au code.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Code *</Label>
                  <Input
                    value={newCode.code || ''}
                    onChange={(e) => setNewCode((prev) => ({ ...prev, code: e.target.value }))}
                    placeholder="Ex: C001, INF-001, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Pièces jointes du code (PDF/Images)</Label>
                  <Input type="file" multiple accept="application/pdf,image/*"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      const sanitized = files.map((f) => sanitizeFileForUpload(f));
                      setNewCodeFiles(sanitized as File[]);
                    }}
                  />
                  {newCodeFiles.length > 0 && (
                    <div className="text-xs text-gray-600 space-y-1">
                      {newCodeFiles.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-50 border rounded px-2 py-1">
                          <span className="truncate max-w-[300px]">{f.name}</span>
                          <button
                            type="button"
                            className="text-red-600 text-xs"
                            onClick={() => setNewCodeFiles((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            retirer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewCodeOpen(false)}>Annuler</Button>
                <Button
                  onClick={async () => {
                    if (!newCode.code?.trim()) {
                      toast({ title: 'Champs requis', description: 'Le champ Code est obligatoire', variant: 'destructive' });
                      return;
                    }
                    const payload = { code: newCode.code.trim() } as any;
                    const resp = await apiRequest<any>('POST', '/api/infractions/codes', payload);
                    if (!resp.ok) {
                      toast({ title: 'Erreur', description: resp.error || 'Création impossible', variant: 'destructive' });
                      return;
                    }
                    const created = resp.data;
                    console.log('[SETTINGS] Code créé:', created);
                    // Tentative d'upload des pièces jointes si présentes (optionnel si backend non prêt)
                    if (created?.id && newCodeFiles.length > 0) {
                      try {
                        const fd = new FormData();
                        newCodeFiles.forEach((f) => fd.append('files', f));
                        const up = await apiRequest<any>('POST', `/api/infractions/codes/${created.id}/documents`, fd);
                        if (!up.ok) {
                          toast({ title: 'Info', description: 'Code créé. Upload documents à activer (backend).', variant: 'default' });
                        } else {
                          toast({ title: 'Succès', description: 'Code et documents ajoutés' });
                        }
                      } catch {
                        toast({ title: 'Info', description: 'Code créé. Upload documents non disponible pour le moment.', variant: 'default' });
                      }
                    } else {
                      toast({ title: 'Succès', description: 'Code créé' });
                    }
                    setNewCodeOpen(false);
                    setNewCode({ code: '', nature: '', article_code: '' });
                    setNewCodeFiles([]);
                    console.log('[SETTINGS] Rechargement des codes après création...');
                    await loadCodesInfractions();
                    await loadCodeItems();
                    console.log('[SETTINGS] Rechargement terminé');
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Créer
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog Édition Code */}
          <Dialog open={editCodeOpen} onOpenChange={setEditCodeOpen}>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit className="h-5 w-5 text-orange-600" />
                  Modifier le Code d'Infraction
                </DialogTitle>
                <DialogDescription>
                  Modifiez les informations du code d'infraction sélectionné.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-code">Code *</Label>
                  <Input
                    id="edit-code"
                    placeholder="Ex: C001, INF-001, etc."
                    value={newCode.code || ''}
                    onChange={(e) => setNewCode(prev => ({ ...prev, code: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-nature">Nature de l'infraction *</Label>
                  <Input
                    id="edit-nature"
                    placeholder="Ex: Chasse sans permis, Braconnage, etc."
                    value={newCode.nature || ''}
                    onChange={(e) => setNewCode(prev => ({ ...prev, nature: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-article">Article de loi *</Label>
                  <Input
                    id="edit-article"
                    placeholder="Ex: Article 15 de la loi 98-610, etc."
                    value={newCode.article_code || ''}
                    onChange={(e) => setNewCode(prev => ({ ...prev, article_code: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditCodeOpen(false)}>
                  Annuler
                </Button>
                <Button
                  onClick={async () => {
                    if (!newCode.code?.trim() || !newCode.nature?.trim() || !newCode.article_code?.trim()) {
                      toast({ title: 'Champs requis', description: 'Veuillez remplir tous les champs', variant: 'destructive' });
                      return;
                    }
                    const success = await saveCodeInfraction({ ...newCode, id: selectedCode?.id }, true);
                    if (success) {
                      setEditCodeOpen(false);
                      setSelectedCode(null);
                      setNewCode({ code: '', nature: '', article_code: '' });
                    }
                  }}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Modifier
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        </Tabs>
      </div>
    </main>
  );
}
