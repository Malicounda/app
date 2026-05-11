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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Form, FormControl, FormField, FormItem, FormLabel
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, BarChart3, Check, CheckCircle2, Loader2, Map as MapIcon, Pencil, Plus, Save, Send, Sprout, Trash2, TreePine } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import * as z from "zod";
import { F1LocaliteRow, F1ProductionTable } from "./F1ProductionTable";
import { F2LocaliteRow, F2PlantsTable } from "./F2PlantsTable";
import { F3SpeciesTable } from "./F3SpeciesTable";
import { F4LocaliteRow, F4RealisationsTable } from "./F4RealisationsTable";
import { NurseryTypeManager } from "./NurseryTypeManager";

const SPECIES_CATEGORIES = ["Forestière","Fruitier-forestière","Fruitière","Ornementale"];
const NURSERY_TYPES = ["Régie","Villageoise/Communautaire","Individuelle/Privée","Scolaire"];
const PERIODE_LIST = [
  "Janvier - Quinzaine 1","Janvier - Quinzaine 2",
  "Février - Quinzaine 1","Février - Quinzaine 2",
  "Mars - Quinzaine 1","Mars - Quinzaine 2",
  "Avril - Quinzaine 1","Avril - Quinzaine 2",
  "Mai - Quinzaine 1","Mai - Quinzaine 2",
  "Juin - Quinzaine 1","Juin - Quinzaine 2",
  "Juillet - Quinzaine 1","Juillet - Quinzaine 2",
  "Août - Quinzaine 1","Août - Quinzaine 2",
  "Septembre - Quinzaine 1","Septembre - Quinzaine 2",
  "Octobre - Quinzaine 1","Octobre - Quinzaine 2",
];

const normalizeStr = (s: string) => (s || '')
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const reportSchema = z.object({
  reportDate: z.string().min(1, "La date est requise"),
  period: z.string().min(1, "La période est requise"),
  notes: z.string().optional(),
  species: z.array(
    z.object({
      speciesName: z.any(),
      category: z.any(),
      count: z.any(),
      localite: z.any(),
      nurseries: z.any(),
    }).superRefine((row, ctx) => {
      const nurseries = Array.isArray(row?.nurseries) ? row.nurseries : [];
      const hasAnyValue = (Number(row?.count) || 0) > 0 || nurseries.some((n: any) => (Number(n?.count) || 0) > 0);
      const hasName = !!String(row?.speciesName || '').trim();
      if (hasAnyValue && !hasName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['speciesName'],
          message: 'Nom requis',
        });
      }
    })
  ),
});

type ReportFormValues = z.infer<typeof reportSchema>;

interface Props {
  onClose: () => void;
  existingReport?: any;
  existingReports?: any[];
}

export function CNRReportForm({ onClose, existingReport, existingReports }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("f1");
  const [f1Rows, setF1Rows] = useState<F1LocaliteRow[]>([]);
  const [f2Rows, setF2Rows] = useState<F2LocaliteRow[]>([]);
  const [f4Rows, setF4Rows] = useState<F4LocaliteRow[]>([]);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showNurseryTypeManager, setShowNurseryTypeManager] = useState(false);
  const [showAddF2Localite, setShowAddF2Localite] = useState(false);
  const [newF2Arrondissement, setNewF2Arrondissement] = useState<string>("");
  const [newF2Commune, setNewF2Commune] = useState<string>("");
  const [showAddF4Localite, setShowAddF4Localite] = useState(false);
  const [newF4Arrondissement, setNewF4Arrondissement] = useState<string>("");
  const [newF4Commune, setNewF4Commune] = useState<string>("");
  const isInitialized = useRef(false);
  const initializedWithFullReport = useRef(false);
  const hasMergedConsolidation = useRef(false);

  const isRegionalAgent = user?.role === 'agent';
  const isSectorAgent = user?.role === 'sub-agent';
  const isAdminRegionalView = user?.role === 'admin' && existingReport?.level === 'region' && !existingReport?.id;
  const isAdminNationalView = user?.role === 'admin' && existingReport?.level === 'national' && !existingReport?.id;
  const isAdminViewingExistingRegional = user?.role === 'admin' && existingReport?.level === 'region' && !!existingReport?.id;
  const regionalContextRegion = (isAdminRegionalView || isAdminViewingExistingRegional)
    ? String((existingReport as any)?.region || (existingReport as any)?.report?.region || '')
    : (user?.region || '');
  const nationalContextLabel = 'NATIONAL';
  const isRegionalContext = isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional;

  // Charger le catalogue des espèces
  const { data: catalogSpecies = [], isLoading: catalogLoading } = useQuery<{ id: number; name: string; category: string }[]>({
    queryKey: ["/api/reboisement/species-catalog"],
  });

  const { data: departementsGeo, isLoading: departementsLoading } = useQuery<any>({
    queryKey: ["/api/departements"],
    enabled: !!user,
    queryFn: async () => {
      return await apiRequest({
        url: "/api/departements",
        method: "GET",
      });
    },
  });

  const selectedDepartementFeature = useMemo(() => {
    const deptName = user?.departement;
    const features = (departementsGeo as any)?.features;
    if (!deptName || !Array.isArray(features)) return null;
    const match = features.find((f: any) => normalizeStr(f?.properties?.nom) === normalizeStr(deptName));
    return match || null;
  }, [departementsGeo, user?.departement]);

  const selectedDepartementId = useMemo(() => {
    const id = selectedDepartementFeature?.properties?.id;
    const n = Number(id);
    return Number.isFinite(n) ? n : null;
  }, [selectedDepartementFeature]);

  const { data: arrondissementsGeo = null, isLoading: arrondissementsLoading } = useQuery<any>({
    queryKey: ["/api/arrondissements", selectedDepartementId],
    enabled: !!selectedDepartementId && !isRegionalAgent,
    queryFn: async () => {
      return await apiRequest({
        url: `/api/arrondissements?departementId=${selectedDepartementId}`,
        method: "GET",
      });
    },
  });

  const { data: communesGeo = null, isLoading: communesLoading } = useQuery<any>({
    queryKey: ["/api/communes", selectedDepartementId],
    enabled: !!selectedDepartementId && !isRegionalAgent,
    queryFn: async () => {
      return await apiRequest({
        url: `/api/communes?departementId=${selectedDepartementId}&withArrondissement=1`,
        method: "GET",
      });
    },
  });

  const { data: reforestationLocalites = [], isLoading: reforestationLocalitesLoading } = useQuery<any[]>({
    queryKey: ["/api/reboisement/localites", user?.departement],
    enabled: !!user?.departement && !isRegionalAgent,
    queryFn: async () => {
      return await apiRequest<any[]>({
        url: `/api/reboisement/localites?departement=${encodeURIComponent(user?.departement || '')}`,
        method: "GET",
      });
    },
  });

  const arrondissementOptions = useMemo(() => {
    const features = (arrondissementsGeo as any)?.features;
    if (!Array.isArray(features)) return [] as string[];
    const names = features
      .map((f: any) => f?.properties?.nom as string)
      .filter(Boolean);
    names.sort((a: string, b: string) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }));
    return names;
  }, [arrondissementsGeo]);

  const catalogSpeciesGrouped = useMemo(() => {
    const byCat: Record<string, { id: number; name: string; category: string }[]> = {};
    for (const s of catalogSpecies) {
      const cat = s.category || "Non classé";
      if (!byCat[cat]) byCat[cat] = [];
      byCat[cat].push(s);
    }

    for (const cat of Object.keys(byCat)) {
      byCat[cat].sort((a, b) => (a.name || "").localeCompare(b.name || "", "fr", { sensitivity: "base" }));
    }

    const preferredOrder = [
      "Forestière",
      "Fruitier-forestière",
      "Fruitière",
      "Ornementale",
    ];

    const orderedCats = [
      ...preferredOrder.filter((c) => byCat[c]?.length),
      ...Object.keys(byCat)
        .filter((c) => !preferredOrder.includes(c))
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    ];

    return orderedCats.map((category) => ({ category, items: byCat[category] || [] }));
  }, [catalogSpecies]);

  // Charger les détails complets si on est en mode édition/vue
  // Charger les départements de la région (pour les agents régionaux)
  const { data: regionalDeptsRaw, isLoading: regionalDeptsLoading } = useQuery<any>({
    queryKey: ["/api/departements", { region: regionalContextRegion }],
    enabled: !!regionalContextRegion && (user?.role === 'agent' || user?.role === 'sub-agent' || isAdminRegionalView || isAdminViewingExistingRegional),
    queryFn: async () => {
      return await apiRequest({
        url: `/api/departements?region=${regionalContextRegion}`,
        method: "GET"
      });
    }
  });

  const regionalDepts = useMemo(() => {
    const rawDepts = (regionalDeptsRaw as any)?.features?.map((f: any) => f.properties.nom) || [];
    const depts = [...rawDepts];
    if ((user?.role === 'agent' || user?.role === 'sub-agent' || isAdminViewingExistingRegional) && regionalContextRegion?.toUpperCase() === "KAOLACK" && !depts.some(d => normalizeStr(d) === "KAOLACK")) {
      depts.push("KAOLACK");
    }
    return depts;
  }, [isAdminViewingExistingRegional, regionalContextRegion, regionalDeptsRaw, user?.role]);

  const { data: fullReport, isLoading: isReportLoading } = useQuery<any>({
    queryKey: ["/api/reboisement/reports", existingReport?.id],
    queryFn: () => apiRequest({ url: `/api/reboisement/reports/${existingReport.id}`, method: "GET" }),
    enabled: !!existingReport?.id,
  });

  // Quand on édite, on utilise toujours les données complètes (fullReport)
  // Pour un nouveau rapport, reportToUse est null
  const reportToUse = existingReport?.id
    ? (fullReport || existingReport)
    : (existingReport?.level === "region" || existingReport?.level === "national" ? existingReport : null);
  const isReadOnly =
    reportToUse?.status === "soumis"
    || reportToUse?.status === "valide"
    || isAdminRegionalView
    || isAdminNationalView;

  const globalTotalLabel = (isRegionalAgent || isAdminRegionalView)
    ? "TOTAL RÉGIONAL"
    : isAdminNationalView
      ? "TOTAL NATIONAL"
    : `Total departement de ${user?.departement || ""}`.trim();

  // Charger les types de pépinières dynamiques
  const { data: dynamicNurseryTypes = [], isLoading: nurseryTypesLoading } = useQuery<any[]>({
    queryKey: ["/api/reboisement/nursery-types"],
  });

  const nurseryTypesToUse = useMemo(() => {
    if (dynamicNurseryTypes.length > 0) {
      const reportDept = String((reportToUse as any)?.departement || (existingReport as any)?.departement || '').trim();
      const isViewingDeptReportReadOnly = !!reportDept && !!isReadOnly && String((reportToUse as any)?.level || '') === 'departement';

      // Vue NATIONALE : inclure TOUS les types dynamiques (consolidation de toutes les régions)
      if (isAdminNationalView) {
        const seen = new Set<string>();
        const all: typeof dynamicNurseryTypes = [];
        const sorted = [...dynamicNurseryTypes].sort((a, b) => {
          const idxA = NURSERY_TYPES.indexOf(a.label);
          const idxB = NURSERY_TYPES.indexOf(b.label);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.label.localeCompare(b.label);
        });
        for (const t of sorted) {
          if (!seen.has(t.label)) {
            seen.add(t.label);
            all.push(t);
          }
        }
        return all.length > 0 ? all : NURSERY_TYPES.map(label => ({ label, departement: null }));
      }

      // Normaliser pour la comparaison insensible à la casse
      const effectiveDeptUp = normalizeStr(isViewingDeptReportReadOnly ? reportDept : (user?.departement || ''));
      const regionalDeptsUp = regionalDepts.map(d => normalizeStr(d));
      // On garde les types globaux + ceux liés au bon périmètre:
      // - contexte régional/national: tous les départements de la région
      // - contexte départemental (agent secteur / lecture d'un rapport départemental): uniquement le département
      const includeRegionalDepts = isRegionalContext;
      const filtered = dynamicNurseryTypes.filter(t => {
        if (!t.departement) return true;
        const depUp = normalizeStr(String(t.departement || ''));
        if (effectiveDeptUp && depUp === effectiveDeptUp) return true;
        if (includeRegionalDepts && regionalDeptsUp.includes(depUp)) return true;
        return false;
      });
      if (filtered.length > 0) {
        return filtered.sort((a, b) => {
          const idxA = NURSERY_TYPES.indexOf(a.label);
          const idxB = NURSERY_TYPES.indexOf(b.label);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.label.localeCompare(b.label);
        });
      }
    }
    return NURSERY_TYPES.map(label => ({ label, departement: null }));
  }, [dynamicNurseryTypes, existingReport, isAdminNationalView, isReadOnly, isRegionalContext, regionalDepts, reportToUse, user?.departement]);

  const defaultF2HierarchyRows = useMemo((): F2LocaliteRow[] => {
    if (!user || isRegionalAgent) return [];
    if (!selectedDepartementId) return [];

    const arrFeatures = (arrondissementsGeo as any)?.features;
    const comFeatures = (communesGeo as any)?.features;

    const arrOrder: string[] = Array.isArray(arrFeatures)
      ? arrFeatures
        .map((f: any) => f?.properties?.nom)
        .filter(Boolean)
        .sort((a: string, b: string) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }))
      : [];

    const communesFromGeo = Array.isArray(comFeatures)
      ? comFeatures
        .map((f: any) => ({
          nom: f?.properties?.nom as string,
          arrondissementNom: (f?.properties?.arrondissement_nom as string) || "Pépinière départementale",
        }))
        .filter((c: any) => !!c.nom)
      : [];

    const communesFromCatalog = Array.isArray(reforestationLocalites)
      ? reforestationLocalites
        .map((l: any) => ({
          nom: (l?.commune as string) || "",
          arrondissementNom: (l?.arrondissement as string) || "Pépinière départementale",
        }))
        .filter((c: any) => !!c.nom)
      : [];

    const seen = new Set<string>();
    const communes = [...communesFromGeo, ...communesFromCatalog].filter((c: any) => {
      const key = `${normalizeStr(c.nom)}|${normalizeStr(c.arrondissementNom || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const byArr = new Map<string, string[]>();
    for (const c of communes) {
      const key = c.arrondissementNom || "Pépinière départementale";
      if (!byArr.has(key)) byArr.set(key, []);
      byArr.get(key)!.push(c.nom);
    }
    for (const [k, v] of byArr.entries()) {
      v.sort((a, b) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }));
      byArr.set(k, v);
    }

    const nurseryListForRow = (labelForFilter: string) => nurseryTypesToUse
      .filter(t => !t.departement || normalizeStr(t.departement) === normalizeStr(labelForFilter))
      .map(t => ({
        nurseryType: t.label,
        nbPep: 0,
        nbPlants: 0
      }));

    const rows: F2LocaliteRow[] = [];

    rows.push({
      localite: user.departement || "",
      localiteLevel: "departement",
      parentLocalite: "Pépinière départementale",
      nurseries: nurseryListForRow(user.departement || ""),
    });

    const arrKeys = Array.from(new Set([...arrOrder, ...Array.from(byArr.keys())])).filter(Boolean);
    arrKeys.sort((a, b) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }));

    for (const arrName of arrKeys) {
      const coms = byArr.get(arrName) || [];
      for (const com of coms) {
        rows.push({
          localite: com,
          localiteLevel: "commune",
          parentLocalite: arrName,
          nurseries: nurseryListForRow(com),
        });
      }
    }

    return rows;
  }, [user, isRegionalAgent, selectedDepartementId, arrondissementsGeo, communesGeo, nurseryTypesToUse, reforestationLocalites]);

  const defaultF4HierarchyRows = useMemo((): F4LocaliteRow[] => {
    if (!user || isRegionalAgent) return [];
    if (!selectedDepartementId) return [];

    const arrFeatures = (arrondissementsGeo as any)?.features;
    const comFeatures = (communesGeo as any)?.features;

    const arrOrder: string[] = Array.isArray(arrFeatures)
      ? arrFeatures
        .map((f: any) => f?.properties?.nom)
        .filter(Boolean)
        .sort((a: string, b: string) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }))
      : [];

    const communesFromGeo = Array.isArray(comFeatures)
      ? comFeatures
        .map((f: any) => ({
          nom: f?.properties?.nom as string,
          arrondissementNom: (f?.properties?.arrondissement_nom as string) || "Pépinière départementale",
        }))
        .filter((c: any) => !!c.nom)
      : [];

    const communesFromCatalog = Array.isArray(reforestationLocalites)
      ? reforestationLocalites
        .map((l: any) => ({
          nom: (l?.commune as string) || "",
          arrondissementNom: (l?.arrondissement as string) || "Pépinière départementale",
        }))
        .filter((c: any) => !!c.nom)
      : [];

    const seen = new Set<string>();
    const communes = [...communesFromGeo, ...communesFromCatalog].filter((c: any) => {
      const key = `${normalizeStr(c.nom)}|${normalizeStr(c.arrondissementNom || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const byArr = new Map<string, string[]>();
    for (const c of communes) {
      const key = c.arrondissementNom || "Pépinière départementale";
      if (!byArr.has(key)) byArr.set(key, []);
      byArr.get(key)!.push(c.nom);
    }
    for (const [k, v] of byArr.entries()) {
      v.sort((a, b) => (a || '').localeCompare(b || '', 'fr', { sensitivity: 'base' }));
      byArr.set(k, v);
    }

    const orderedParents = [...arrOrder];
    if (byArr.has('Pépinière départementale') && !orderedParents.includes('Pépinière départementale')) {
      orderedParents.push('Pépinière départementale');
    }

    const rows: F4LocaliteRow[] = [];

    for (const parentName of orderedParents) {
      const communesList = byArr.get(parentName) || [];
      for (const com of communesList) {
        rows.push({
          localite: com,
          localiteLevel: "commune",
          parentLocalite: parentName,
          pmRegieHa: 0, pmRegiePlants: 0,
          pmPriveIndivHa: 0, pmPriveIndivPlants: 0,
          pmVillagCommHa: 0, pmVillagCommPlants: 0,
          pmScolaireHa: 0, pmScolairePlants: 0,
          plAxesKm: 0, plAxesPlants: 0,
          plDelimKm: 0, plDelimPlants: 0,
          plHaieViveKm: 0, plHaieVivePlants: 0,
          plBriseVentKm: 0, plBriseVentPlants: 0,
          plParFeuKm: 0, plParFeuPlants: 0,
          rrRnaHa: 0, rrRnaPlants: 0,
          rrMiseEnDefenseHa: 0, rrMiseEnDefensePlants: 0,
          rrEnrichissementHa: 0, rrEnrichissementPlants: 0,
          rrMangroveHa: 0, rrMangrovePlants: 0,
          distribPlants: 0, distribHa: 0,
        });
      }
    }

    return rows;
  }, [user, isRegionalAgent, selectedDepartementId, arrondissementsGeo, communesGeo, reforestationLocalites]);

  const nurseryTypeLabels = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of nurseryTypesToUse) {
      const label = t.label;
      if (!label) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
    return out;
  }, [nurseryTypesToUse]);

  const nurseryTypeLabelsForDeptReportReadOnly = useMemo(() => {
    const reportDept = String((reportToUse as any)?.departement || (existingReport as any)?.departement || '').trim();
    const shouldScopeToDept = !!reportDept && String((reportToUse as any)?.level || '') === 'departement';
    const src = shouldScopeToDept
      ? nurseryTypesToUse.filter(t => !t.departement || normalizeStr(String(t.departement || '')) === normalizeStr(reportDept))
      : nurseryTypesToUse;

    const out: string[] = [];
    const seen = new Set<string>();
    for (const t of src) {
      const label = t.label;
      if (!label) continue;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
    return out;
  }, [existingReport, nurseryTypesToUse, reportToUse]);

  const f1RowsForDisplay = useMemo(() => {
    if (!(isReadOnly && reportToUse?.level === 'departement')) return f1Rows;
    const allowed = new Set(nurseryTypeLabelsForDeptReportReadOnly);
    return (f1Rows || []).map((r) => ({
      ...r,
      nurseries: (r.nurseries || []).filter((n: any) => allowed.has(String(n?.nurseryType || ''))),
    }));
  }, [f1Rows, isReadOnly, nurseryTypeLabelsForDeptReportReadOnly, reportToUse?.level]);
  // Clé stable qui change réellement quand la liste change (pour déclencher useEffect)
  const nurseryTypesKey = useMemo(() =>
    nurseryTypesToUse.map(t => `${t.label}|${t.departement ?? ''}`).join(','),
  [nurseryTypesToUse]);

  // Initialiser les lignes F1, F2, F4
  useEffect(() => {
    const isAdminViewingExistingRegional = user?.role === 'admin' && existingReport?.level === 'region' && !!existingReport?.id;
    const isAdminRegionalViewLocal = user?.role === 'admin' && existingReport?.level === 'region' && !existingReport?.id;

    // Si les données de consolidation ont déjà été fusionnées, ne pas réinitialiser
    if (hasMergedConsolidation.current && (isAdminViewingExistingRegional || isAdminRegionalViewLocal)) {
      return;
    }

    if (isInitialized.current) {
      if (existingReport?.id && fullReport && !initializedWithFullReport.current) {
        if (isAdminViewingExistingRegional) {
          initializedWithFullReport.current = true;
          return;
        }
        isInitialized.current = false;
      } else {
        return;
      }
    }

    if (!user) return;
    if ((isRegionalContext || user?.role === 'sub-agent') && regionalDeptsLoading) return;
    if (!isRegionalAgent && departementsLoading) return;
    if (!isRegionalAgent && selectedDepartementId && (arrondissementsLoading || communesLoading)) return;
    if (!isRegionalAgent && reforestationLocalitesLoading) return;
    if (nurseryTypesLoading) return;

    if (isAdminViewingExistingRegional && reportToUse?.level === 'region') {
      form.reset({
        reportDate: reportToUse.reportDate ? new Date(reportToUse.reportDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        period: reportToUse.period || "",
        notes: reportToUse.notes || "",
        species: (form.getValues("species") || []) as any,
      } as any);
      isInitialized.current = true;
      initializedWithFullReport.current = !!fullReport;
      return;
    }

    const deptsToUse = (isRegionalContext && regionalDepts.length > 0) ? regionalDepts : [];
    const defaultLocs = deptsToUse.length > 0
      ? deptsToUse
      : [(user as any).commune || (user as any).arrondissement || user.departement || user.region || "Zone 1"];

    const defaultParent = isRegionalContext ? regionalContextRegion : ((user as any).arrondissement || user.departement);

    // Fonction d'aide pour générer les lignes F1 par défaut
    const generateDefaultF1 = (): F1LocaliteRow[] => defaultLocs.map(loc => ({
      localite: loc,
      localiteLevel: (isRegionalContext ? "departement" : "commune") as F1LocaliteRow["localiteLevel"],
      parentLocalite: defaultParent,
      nurseries: nurseryTypesToUse
        .filter(t => !t.departement || normalizeStr(t.departement) === normalizeStr(loc))
        .map(t => ({
          nurseryType: t.label,
          nbPepinieresAnterieur: 0, nbPepinieresPeriode: 0,
          gainesEmpoteesAnterieur: 0, gainesEmpoteesPeriode: 0,
          gainesArrimeesAnterieur: 0, gainesArrimeesPeriode: 0,
          gainesEnsemenceesAnterieur: 0, gainesEnsemenceesPeriode: 0,
          gainesGerminationAnterieur: 0, gainesGerminationPeriode: 0,
        }))
    }));

    // Fonction d'aide pour générer les lignes F2 par défaut
    const generateDefaultF2 = (): F2LocaliteRow[] => defaultLocs.map(loc => ({
      localite: loc,
      localiteLevel: (isRegionalContext ? "departement" : "commune") as F2LocaliteRow["localiteLevel"],
      parentLocalite: defaultParent,
      nurseries: nurseryTypesToUse
        .filter(t => !t.departement || normalizeStr(t.departement) === normalizeStr(loc))
        .map(t => ({
          nurseryType: t.label,
          nbPep: 0,
          nbPlants: 0
        }))
    }));

    // Fonction d'aide pour générer les lignes F4 par défaut
    const generateDefaultF4 = (): F4LocaliteRow[] => defaultLocs.map(loc => ({
      localite: loc,
      localiteLevel: (isRegionalContext ? "departement" : "commune") as F4LocaliteRow["localiteLevel"],
      parentLocalite: defaultParent,
      pmRegieHa:0,pmRegiePlants:0,pmPriveIndivHa:0,pmPriveIndivPlants:0,
      pmVillagCommHa:0,pmVillagCommPlants:0,pmScolaireHa:0,pmScolairePlants:0,
      plAxesKm:0,plAxesPlants:0,plDelimKm:0,plDelimPlants:0,
      plHaieViveKm:0,plHaieVivePlants:0,plBriseVentKm:0,plBriseVentPlants:0,
      plParFeuKm:0,plParFeuPlants:0,
      rrRnaHa:0,rrRnaPlants:0,rrMiseEnDefenseHa:0,rrMiseEnDefensePlants:0,
      rrEnrichissementHa:0,rrEnrichissementPlants:0,rrMangroveHa:0,rrMangrovePlants:0,
      distribPlants:0,distribHa:0
    }));

    if (reportToUse) {
      // Reconstruction des données pour le formulaire
      form.reset({
        reportDate: reportToUse.reportDate ? new Date(reportToUse.reportDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
        period: reportToUse.period || "",
        notes: reportToUse.notes || "",
        species: (reportToUse.species || []).map((s: any) => {
          // S'assurer que chaque espèce a bien tous les types de pépinières requis (pour l'affichage en colonnes)
          let nurseriesRaw = s.nurseries;
          if (typeof nurseriesRaw === 'string') {
            try { nurseriesRaw = JSON.parse(nurseriesRaw); } catch (e) { nurseriesRaw = []; }
          }
          const nurseries = (nurseriesRaw && Array.isArray(nurseriesRaw)) ? [...nurseriesRaw] : [];

          nurseryTypesToUse.forEach(type => {
            if (!nurseries.some(n => n.nurseryType === type.label)) {
              nurseries.push({ nurseryType: type.label, count: 0 });
            }
          });

          return {
            ...s,
            count: parseInt(s.count as string, 10) || 0,
            nurseries: nurseries.map((n: any) => ({ ...n, count: parseInt(n.count as string, 10) || 0 })).sort((a, b) => {
              const idxA = nurseryTypeLabels.indexOf(a.nurseryType);
              const idxB = nurseryTypeLabels.indexOf(b.nurseryType);
              return (idxA !== -1 && idxB !== -1) ? idxA - idxB : 0;
            })
          };
        }),
      });

      if (reportToUse.production && reportToUse.production.length > 0) {
        const map = new Map<string, F1LocaliteRow>();
        reportToUse.production.forEach((d: any) => {
          let nurseries = d.nurseries;
          if (typeof nurseries === 'string') {
            try { nurseries = JSON.parse(nurseries); } catch (e) { nurseries = []; }
          }
          const rowData = { ...d, nurseries: Array.isArray(nurseries) ? nurseries : [] };

          if (!map.has(d.localite)) {
            map.set(d.localite, {
              localite: d.localite,
              localiteLevel: d.localiteLevel || "commune",
              parentLocalite: d.parentLocalite,
              nurseries: []
            });
          }
          map.get(d.localite)!.nurseries.push(rowData);
        });
        setF1Rows(Array.from(map.values()));
      } else {
        setF1Rows(generateDefaultF1());
      }

      if (reportToUse.plants && reportToUse.plants.length > 0) {
        // Map legacy data to new dynamic structure for backward compatibility
        const mappedPlants = reportToUse.plants.map((p: any) => {
          let nurseries = p.nurseries;
          if (typeof nurseries === 'string') {
            try { nurseries = JSON.parse(nurseries); } catch (e) { nurseries = []; }
          }
          if (!Array.isArray(nurseries) || nurseries.length === 0) {
            nurseries = [
              { nurseryType: "Régie", nbPep: p.regieNbPep || 0, nbPlants: p.regieNbPlants || 0 },
              { nurseryType: "Individuelle/Privée", nbPep: p.priveIndivNbPep || 0, nbPlants: p.priveIndivNbPlants || 0 },
              { nurseryType: "Villageoise/Communautaire", nbPep: p.villagCommNbPep || 0, nbPlants: p.villagCommNbPlants || 0 },
              { nurseryType: "Scolaire", nbPep: p.scolaireNbPep || 0, nbPlants: p.scolaireNbPlants || 0 }
            ];
          }
          return { ...p, nurseries };
        });
        setF2Rows(mappedPlants);
      } else {
        setF2Rows([]);
      }

      if (reportToUse.field && reportToUse.field.length > 0) {
        setF4Rows(reportToUse.field);
      } else {
        setF4Rows(generateDefaultF4());
      }

      isInitialized.current = true;
      initializedWithFullReport.current = !!fullReport;
    } else if (!existingReport?.id) {
      // Mode CRÉATION uniquement
      // Pour la vue nationale : démarrer avec des lignes vides (la consolidation les remplira)
      if (isAdminNationalView) {
        setF1Rows([]);
        setF2Rows([]);
        setF4Rows([]);
      } else {
        setF1Rows(generateDefaultF1());
        setF2Rows((!isRegionalAgent && defaultF2HierarchyRows.length > 0) ? defaultF2HierarchyRows : generateDefaultF2());
        setF4Rows((!isRegionalAgent && defaultF4HierarchyRows.length > 0) ? defaultF4HierarchyRows : generateDefaultF4());
      }
      isInitialized.current = true;
      initializedWithFullReport.current = false;
    }
  }, [reportToUse, fullReport, user, regionalDepts, regionalDeptsLoading, nurseryTypesLoading, nurseryTypesToUse, isReportLoading, existingReport?.id, defaultF2HierarchyRows, defaultF4HierarchyRows]);

  // Synchronisation automatique des lignes F1 avec les types de pépinières (Ajout/Suppression)
  useEffect(() => {
    if (isReadOnly) return; // En lecture seule, ne pas modifier les données consolidées
    if (f1Rows.length > 0 && nurseryTypesToUse.length > 0) {
      setF1Rows(prev => {
        let hasChanges = false;

        const newRows = prev.map(row => {
          const locUp = normalizeStr(row.localite);
          const typesForThisLoc = nurseryTypesToUse.filter(t =>
            !t.departement || normalizeStr(t.departement) === locUp
          );
          const typeLabelsForThisLoc = typesForThisLoc.map(t => t.label);

          // 1. Supprimer les types qui ne sont plus valides pour cette localité
          let updatedNurseries = row.nurseries.filter(n => typeLabelsForThisLoc.includes(n.nurseryType));
          if (updatedNurseries.length !== row.nurseries.length) {
            hasChanges = true;
          }

          // 2. Ajouter les nouveaux types manquants
          const existingLabels = updatedNurseries.map(n => n.nurseryType);
          const missingTypes = typesForThisLoc.filter(t => !existingLabels.includes(t.label));

          if (missingTypes.length > 0) {
            hasChanges = true;
            updatedNurseries = [
              ...updatedNurseries,
              ...missingTypes.map(t => ({
                nurseryType: t.label,
                nbPepinieresAnterieur: 0, nbPepinieresPeriode: 0,
                gainesEmpoteesAnterieur: 0, gainesEmpoteesPeriode: 0,
                gainesArrimeesAnterieur: 0, gainesArrimeesPeriode: 0,
                gainesEnsemenceesAnterieur: 0, gainesEnsemenceesPeriode: 0,
                gainesGerminationAnterieur: 0, gainesGerminationPeriode: 0,
              }))
            ];
          }

          if (updatedNurseries.length !== row.nurseries.length || hasChanges) {
             // Trier le résultat final pour l'affichage : types par défaut en haut
             updatedNurseries.sort((a, b) => {
               const idxA = NURSERY_TYPES.indexOf(a.nurseryType);
               const idxB = NURSERY_TYPES.indexOf(b.nurseryType);
               if (idxA !== -1 && idxB !== -1) return idxA - idxB;
               if (idxA !== -1) return -1;
               if (idxB !== -1) return 1;
               return a.nurseryType.localeCompare(b.nurseryType);
             });
             return { ...row, nurseries: updatedNurseries };
          }
          return row;
        });

        return hasChanges ? newRows : prev;
      });
    }
  }, [nurseryTypesKey, f1Rows.length]); // se déclenche au changement des types OU à l'initialisation des lignes

  // Synchronisation automatique des lignes F2 avec les types de pépinières
  useEffect(() => {
    if (isReadOnly) return; // En lecture seule, ne pas modifier les données consolidées
    if (f2Rows.length > 0 && nurseryTypesToUse.length > 0) {
      setF2Rows(prev => {
        let hasChanges = false;

        const newRows = prev.map(row => {
          const locUp = normalizeStr(row.localite);
          const typesForThisLoc = nurseryTypesToUse.filter(t =>
            !t.departement || normalizeStr(t.departement) === locUp
          );
          const typeLabelsForThisLoc = typesForThisLoc.map(t => t.label);

          let updatedNurseries = (row.nurseries || []).filter(n => typeLabelsForThisLoc.includes(n.nurseryType));
          if (updatedNurseries.length !== (row.nurseries || []).length) {
            hasChanges = true;
          }

          const existingLabels = updatedNurseries.map(n => n.nurseryType);
          const missingTypes = typesForThisLoc.filter(t => !existingLabels.includes(t.label));

          if (missingTypes.length > 0) {
            hasChanges = true;
            updatedNurseries = [
              ...updatedNurseries,
              ...missingTypes.map(t => ({
                nurseryType: t.label,
                nbPep: 0, nbPlants: 0
              }))
            ];
          }

          if (updatedNurseries.length !== (row.nurseries || []).length || hasChanges) {
             updatedNurseries.sort((a, b) => {
               const idxA = NURSERY_TYPES.indexOf(a.nurseryType);
               const idxB = NURSERY_TYPES.indexOf(b.nurseryType);
               if (idxA !== -1 && idxB !== -1) return idxA - idxB;
               if (idxA !== -1) return -1;
               if (idxB !== -1) return 1;
               return a.nurseryType.localeCompare(b.nurseryType);
             });
             return { ...row, nurseries: updatedNurseries };
          }
          return row;
        });

        return hasChanges ? newRows : prev;
      });
    }
  }, [nurseryTypesKey, f2Rows.length]);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      reportDate: new Date().toISOString().split("T")[0],
      period: "",
      notes: "",
      species: [],
    },
  });

  useEffect(() => {
    if (!isAdminRegionalView && !isAdminNationalView) return;
    const period = String((existingReport as any)?.period || "");
    const reportDate = String((existingReport as any)?.reportDate || new Date().toISOString().split("T")[0]);
    if (period) form.setValue("period", period);
    if (reportDate) form.setValue("reportDate", reportDate);
  }, [existingReport, form, isAdminNationalView, isAdminRegionalView]);

  const tdCls = "border border-gray-500 px-1.5 py-0.5 align-middle bg-white";

  const { fields: speciesFields, append: appendSpecies, remove: removeSpecies } = useFieldArray({ control: form.control, name: "species" });

  const watchedSpecies = useWatch({ control: form.control, name: "species" });

  // Synchroniser automatiquement les colonnes (nurseries) de F3 avec les types de pépinières dynamiques
  useEffect(() => {
    if (isReadOnly) return; // En lecture seule, ne pas modifier les données consolidées
    if (nurseryTypeLabels.length === 0) return;

    const current = form.getValues("species") || [];
    if (current.length === 0) return;

    let hasChanges = false;
    const next = current.map((row: any) => {
      const nurseriesRaw = Array.isArray(row?.nurseries) ? row.nurseries : [];
      const kept = nurseriesRaw.filter((n: any) => nurseryTypeLabels.includes(n.nurseryType));
      if (kept.length !== nurseriesRaw.length) hasChanges = true;

      const existing = new Set(kept.map((n: any) => n.nurseryType));
      for (const label of nurseryTypeLabels) {
        if (!existing.has(label)) {
          hasChanges = true;
          kept.push({ nurseryType: label, count: 0 });
        }
      }

      kept.sort((a: any, b: any) => {
        const idxA = nurseryTypeLabels.indexOf(a.nurseryType);
        const idxB = nurseryTypeLabels.indexOf(b.nurseryType);
        return (idxA !== -1 && idxB !== -1) ? idxA - idxB : 0;
      });

      return { ...row, nurseries: kept };
    });

    if (hasChanges) {
      form.setValue("species", next, { shouldDirty: true });
    }
  }, [nurseryTypesKey, nurseryTypeLabels.length]);

  const speciesSummary = useMemo(() => {
    const species = watchedSpecies || [];
    const summary: Record<string, { count: number, total: number }> = {
      "forestière": { count: 0, total: 0 },
      "fruitier-forestière": { count: 0, total: 0 },
      "fruitière": { count: 0, total: 0 },
      "ornementale": { count: 0, total: 0 },
    };

    species.forEach((s: any) => {
      const cat = normalizeStr(s.category || '');
      if (cat.includes("FORESTIERE") && !cat.includes("FRUITIER")) {
        summary["forestière"].count += 1;
        summary["forestière"].total += (parseInt(s.count) || 0);
      } else if (cat.includes("FRUITIER-FORESTIERE") || (cat.includes("FRUITIER") && cat.includes("FOREST"))) {
        summary["fruitier-forestière"].count += 1;
        summary["fruitier-forestière"].total += (parseInt(s.count) || 0);
      } else if (cat.includes("FRUITIERE")) {
        summary["fruitière"].count += 1;
        summary["fruitière"].total += (parseInt(s.count) || 0);
      } else if (cat.includes("ORNEMENTALE")) {
        summary["ornementale"].count += 1;
        summary["ornementale"].total += (parseInt(s.count) || 0);
      }
    });

    return summary;
  }, [watchedSpecies]);

  // Consolidation des données pour les agents régionaux
  const selectedPeriod = form.watch("period");

  const consolidationPeriod = (user?.role === 'admin' && existingReport?.level === 'region')
    ? String((reportToUse as any)?.period || (existingReport as any)?.period || '')
    : String(selectedPeriod || '');

  const consolidationRegion = (user?.role === 'admin' && existingReport?.level === 'region')
    ? String((reportToUse as any)?.region || (existingReport as any)?.region || '')
    : String(isAdminNationalView ? nationalContextLabel : (regionalContextRegion || ''));

  const { data: consolidationData, isFetching: isConsolidating } = useQuery<any>({
    queryKey: ["/api/reboisement/reports/consolidation", { period: consolidationPeriod, region: consolidationRegion }],
    enabled:
      (
        !!user?.region
        && user?.role === 'agent'
        && !!selectedPeriod
        && (
          !existingReport
          || ((existingReport as any)?.level === 'region' && !(existingReport as any)?.id)
        )
      )
      || (
        user?.role === 'admin'
        && existingReport?.level === 'region'
        && !!consolidationRegion
        && !!consolidationPeriod
      )
      || (
        user?.role === 'admin'
        && existingReport?.level === 'national'
        && !existingReport?.id
        && !!(existingReport as any)?.period
      ),
    queryFn: async () => {
      if (user?.role === 'admin' && existingReport?.level === 'region') {
        const region = String(consolidationRegion || '');
        const period = String(consolidationPeriod || '');
        return await apiRequest({
          url: `/api/reboisement/reports/consolidation?period=${encodeURIComponent(period)}&region=${encodeURIComponent(region)}`,
          method: "GET"
        });
      }
      if (user?.role === 'admin' && existingReport?.level === 'national' && !existingReport?.id) {
        const period = String((existingReport as any)?.period || '');
        return await apiRequest({
          url: `/api/reboisement/reports/consolidation?period=${encodeURIComponent(period)}`,
          method: "GET"
        });
      }
      return await apiRequest({
        url: `/api/reboisement/reports/consolidation?period=${encodeURIComponent(selectedPeriod)}`,
        method: "GET"
      });
    }
  });

  // Helper pour normaliser les noms de localités (enlever accents, espaces, tirets et mettre en majuscules)
  const normalizeLoc = (s: string) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-\s]/g, "").toUpperCase().trim() : "";

  const shouldConsolidateF3 =
    (user?.role === 'agent' && !existingReport)
    || reportToUse?.level === 'region'
    || (user?.role === 'admin' && existingReport?.level === 'region' && !existingReport?.id)
    || (user?.role === 'admin' && existingReport?.level === 'national' && !existingReport?.id);

  useEffect(() => {
    hasMergedConsolidation.current = false;
  }, [existingReport?.id, existingReport?.level]);

  useEffect(() => {
    if (
      consolidationData
      && (
        (user?.role === 'agent' && (
          !existingReport
          || ((existingReport as any)?.level === 'region' && !(existingReport as any)?.id)
        ))
        || (user?.role === 'admin' && existingReport?.level === 'region')
        || (user?.role === 'admin' && existingReport?.level === 'national' && !existingReport?.id)
      )
    ) {
      hasMergedConsolidation.current = true;
      console.log("[Frontend] Consolidation data received:", consolidationData);

      // Merge F1 Production
      // NOTE: production data from DB is FLAT (one row per nurseryType per localite, no nurseries JSON).
      // We must group flat rows by localite, treating each row as a nursery item.
      if (consolidationData.production?.length > 0) {
        const isNationalOrRegional = isAdminNationalView || isAdminRegionalView || (user?.role === 'agent' && !existingReport);
        if (isNationalOrRegional) {
          // Grouper les lignes plates par localite
          const map = new Map<string, F1LocaliteRow>();
          consolidationData.production.forEach((consItem: any) => {
            // Chaque ligne plate EST un item nursery (nurseryType + champs numériques)
            let nurseriesRaw = consItem.nurseries;
            if (typeof nurseriesRaw === 'string') {
              try { nurseriesRaw = JSON.parse(nurseriesRaw); } catch (e) { nurseriesRaw = null; }
            }
            const hasNurseriesArray = nurseriesRaw && Array.isArray(nurseriesRaw) && nurseriesRaw.length > 0;
            const key = normalizeLoc(consItem.localite);
            if (!map.has(key)) {
              map.set(key, {
                localite: consItem.localite,
                localiteLevel: isAdminNationalView ? "region" : (consItem.localiteLevel || "departement"),
                parentLocalite: consItem.parentLocalite || undefined,
                nurseries: []
              });
            }
            const existing = map.get(key)!;
            if (hasNurseriesArray) {
              // Déjà groupé (format JSON) → fusionner chaque nursery
              nurseriesRaw.forEach((n: any) => {
                const idx = existing.nurseries.findIndex((x: any) => x.nurseryType === n.nurseryType);
                if (idx !== -1) {
                  existing.nurseries[idx] = { ...existing.nurseries[idx], ...n };
                } else {
                  existing.nurseries.push(n);
                }
              });
            } else if (consItem.nurseryType) {
              // Ligne plate : chaque consItem EST un nursery item
              const nurseryItem = {
                nurseryType: consItem.nurseryType,
                nbPepinieresAnterieur: consItem.nbPepinieresAnterieur || 0,
                nbPepinieresPeriode: consItem.nbPepinieresPeriode || 0,
                gainesEmpoteesAnterieur: consItem.gainesEmpoteesAnterieur || 0,
                gainesEmpoteesPeriode: consItem.gainesEmpoteesPeriode || 0,
                gainesArrimeesAnterieur: consItem.gainesArrimeesAnterieur || 0,
                gainesArrimeesPeriode: consItem.gainesArrimeesPeriode || 0,
                gainesEnsemenceesAnterieur: consItem.gainesEnsemenceesAnterieur || 0,
                gainesEnsemenceesPeriode: consItem.gainesEnsemenceesPeriode || 0,
                gainesGerminationAnterieur: consItem.gainesGerminationAnterieur || 0,
                gainesGerminationPeriode: consItem.gainesGerminationPeriode || 0,
              };
              const idx = existing.nurseries.findIndex((x: any) => x.nurseryType === consItem.nurseryType);
              if (idx !== -1) {
                existing.nurseries[idx] = { ...existing.nurseries[idx], ...nurseryItem };
              } else {
                existing.nurseries.push(nurseryItem);
              }
            }
          });
          setF1Rows(Array.from(map.values()));
        } else {
          setF1Rows(prev => {
            const newRows = [...prev];
            consolidationData.production.forEach((consItem: any) => {
              let nurseriesRaw = consItem.nurseries;
              if (typeof nurseriesRaw === 'string') {
                try { nurseriesRaw = JSON.parse(nurseriesRaw); } catch (e) { nurseriesRaw = null; }
              }
              const hasNurseriesArray = nurseriesRaw && Array.isArray(nurseriesRaw) && nurseriesRaw.length > 0;
              const consLoc = normalizeLoc(consItem.localite);
              const idx = newRows.findIndex(r => normalizeLoc(r.localite) === consLoc);
              if (hasNurseriesArray) {
                if (idx !== -1) {
                  newRows[idx] = { ...newRows[idx], nurseries: nurseriesRaw };
                } else {
                  newRows.push({
                    localite: consItem.localite,
                    localiteLevel: "departement",
                    parentLocalite: consItem.parentLocalite,
                    nurseries: nurseriesRaw
                  });
                }
              } else if (consItem.nurseryType) {
                // Ligne plate : ajouter comme nursery item dans la ligne existante
                const nurseryItem = {
                  nurseryType: consItem.nurseryType,
                  nbPepinieresAnterieur: consItem.nbPepinieresAnterieur || 0,
                  nbPepinieresPeriode: consItem.nbPepinieresPeriode || 0,
                  gainesEmpoteesAnterieur: consItem.gainesEmpoteesAnterieur || 0,
                  gainesEmpoteesPeriode: consItem.gainesEmpoteesPeriode || 0,
                  gainesArrimeesAnterieur: consItem.gainesArrimeesAnterieur || 0,
                  gainesArrimeesPeriode: consItem.gainesArrimeesPeriode || 0,
                  gainesEnsemenceesAnterieur: consItem.gainesEnsemenceesAnterieur || 0,
                  gainesEnsemenceesPeriode: consItem.gainesEnsemenceesPeriode || 0,
                  gainesGerminationAnterieur: consItem.gainesGerminationAnterieur || 0,
                  gainesGerminationPeriode: consItem.gainesGerminationPeriode || 0,
                };
                if (idx !== -1) {
                  const nurseries = [...(newRows[idx].nurseries || [])];
                  const nIdx = nurseries.findIndex((n: any) => n.nurseryType === consItem.nurseryType);
                  if (nIdx !== -1) {
                    nurseries[nIdx] = { ...nurseries[nIdx], ...nurseryItem };
                  } else {
                    nurseries.push(nurseryItem);
                  }
                  newRows[idx] = { ...newRows[idx], nurseries };
                } else {
                  newRows.push({
                    localite: consItem.localite,
                    localiteLevel: consItem.localiteLevel || "departement",
                    parentLocalite: consItem.parentLocalite,
                    nurseries: [nurseryItem]
                  });
                }
              }
            });
            return newRows;
          });
        }
      }

      // Merge F2 Plants
      if (consolidationData.plants?.length > 0) {
        const mappedPlants = consolidationData.plants.map((p: any) => {
          let nurseriesRaw = p.nurseries;
          if (typeof nurseriesRaw === 'string') {
            try { nurseriesRaw = JSON.parse(nurseriesRaw); } catch (e) { nurseriesRaw = []; }
          }

          let nurseries = (nurseriesRaw && Array.isArray(nurseriesRaw)) ? [...nurseriesRaw] : [];

          // Legacy fallback
          if (nurseries.length === 0) {
            nurseries = [
              { nurseryType: "Régie", nbPep: p.regieNbPep || 0, nbPlants: p.regieNbPlants || 0 },
              { nurseryType: "Individuelle/Privée", nbPep: p.priveIndivNbPep || 0, nbPlants: p.priveIndivNbPlants || 0 },
              { nurseryType: "Villageoise/Communautaire", nbPep: p.villagCommNbPep || 0, nbPlants: p.villagCommNbPlants || 0 },
              { nurseryType: "Scolaire", nbPep: p.scolaireNbPep || 0, nbPlants: p.scolaireNbPlants || 0 }
            ];
          }

          // Ensure all nursery types exist
          nurseryTypesToUse.forEach(type => {
            if (!nurseries.some((n: any) => n.nurseryType === type.label)) {
              nurseries.push({ nurseryType: type.label, nbPep: 0, nbPlants: 0 });
            }
          });

          const ordered = nurseries.sort((a: any, b: any) => {
            const idxA = nurseryTypeLabels.indexOf(a.nurseryType);
            const idxB = nurseryTypeLabels.indexOf(b.nurseryType);
            return (idxA !== -1 && idxB !== -1) ? idxA - idxB : 0;
          });

          return {
            ...p,
            localite: p.localite,
            localiteLevel: isAdminNationalView ? "region" : "departement",
            parentLocalite: undefined, // pas de parent → pas de groupe redondant
            nurseries: ordered,
          };
        });

        setF2Rows(mappedPlants);
      }

      // 3. F3 Species (Overwrite is fine here as it's a simple list)
      if (consolidationData.species?.length > 0) {
        form.setValue(
          "species",
          consolidationData.species.map((s: any) => {
            let nurseriesRaw = s.nurseries;
            if (typeof nurseriesRaw === 'string') {
              try { nurseriesRaw = JSON.parse(nurseriesRaw); } catch (e) { nurseriesRaw = []; }
            }

            const nurseries = (nurseriesRaw && Array.isArray(nurseriesRaw)) ? [...nurseriesRaw] : [];
            nurseryTypesToUse.forEach(type => {
              if (!nurseries.some((n: any) => n.nurseryType === type.label)) {
                nurseries.push({ nurseryType: type.label, count: 0 });
              }
            });

            return {
              speciesName: s.speciesName,
              category: s.category,
              count: parseInt(s.count as string, 10) || 0,
              localite: s.localite,
              nurseries: nurseries.map((n: any) => ({ ...n, count: parseInt(n.count as string, 10) || 0 })).sort((a: any, b: any) => {
                const idxA = nurseryTypeLabels.indexOf(a.nurseryType);
                const idxB = nurseryTypeLabels.indexOf(b.nurseryType);
                return (idxA !== -1 && idxB !== -1) ? idxA - idxB : 0;
              })
            };
          })
        );
      }

      // Merge F4 Field
      if (consolidationData.field?.length > 0) {
        const isNationalOrRegional = isAdminNationalView || isAdminRegionalView || (user?.role === 'agent' && !existingReport);
        if (isNationalOrRegional) {
          // REMPLACER directement (pas de fusion avec placeholder)
          setF4Rows(consolidationData.field.map((consItem: any) => ({
            ...consItem,
            localiteLevel: isAdminNationalView ? "region" : "departement",
            parentLocalite: undefined, // pas de parent → pas de groupe redondant
          })));
        } else {
          setF4Rows(prev => {
            const newRows = [...prev];
            consolidationData.field.forEach((consItem: any) => {
              const consLoc = normalizeLoc(consItem.localite);
              const idx = newRows.findIndex(r => normalizeLoc(r.localite) === consLoc);
              if (idx !== -1) {
                newRows[idx] = { ...newRows[idx], ...consItem, localiteLevel: "departement" };
              } else {
                newRows.push({ ...consItem, localiteLevel: "departement" });
              }
            });
            return newRows;
          });
        }
      }

      toast({
        title: "Données consolidées",
        description: `${consolidationData.production?.length || 0} éléments consolidés pour ${selectedPeriod || consolidationPeriod}.`,
      });
    }
  }, [consolidationData, regionalContextRegion, user?.role, existingReport, form, toast, selectedPeriod]);

  // Pré-remplir depuis le dernier rapport (Antérieur)
  useEffect(() => {
    apiRequest({ method: "GET", url: "/api/reboisement/reports/last" }).then(async (res: any) => {
      if (res.ok) {
        const last = await res.json();
        // Si f1Rows est vide mais on a last.production, on pourrait reconstruire
        // Pour l'instant, on laisse la logique basique car les localités viennent de f1Rows init
      }
    }).catch(() => {});
  }, []);

  const addLocaliteRows = () => {
    const loc = "";
    const level = isRegionalAgent ? "departement" : "commune";
    const parent = (user as any)?.arrondissement || user?.departement || "";

    setF1Rows(prev => [...prev, {
      localite: loc, localiteLevel: level, parentLocalite: parent,
      nurseries: nurseryTypesToUse
        .filter(t => !t.departement || t.departement === loc)
        .map(t => ({
          nurseryType: t.label,
          nbPepinieresAnterieur: 0, nbPepinieresPeriode: 0,
          gainesEmpoteesAnterieur: 0, gainesEmpoteesPeriode: 0,
          gainesArrimeesAnterieur: 0, gainesArrimeesPeriode: 0,
          gainesEnsemenceesAnterieur: 0, gainesEnsemenceesPeriode: 0,
          gainesGerminationAnterieur: 0, gainesGerminationPeriode: 0,
        }))
    }]);

    setF2Rows(prev => [...prev, {
      localite: loc, localiteLevel: level, parentLocalite: parent,
      nurseries: nurseryTypesToUse
        .filter(t => !t.departement || t.departement === loc)
        .map(t => ({
          nurseryType: t.label,
          nbPep: 0, nbPlants: 0
        }))
    }]);

    setF4Rows(prev => [...prev, {
      localite: loc, localiteLevel: level, parentLocalite: parent,
      pmRegieHa:0,pmRegiePlants:0,pmPriveIndivHa:0,pmPriveIndivPlants:0,
      pmVillagCommHa:0,pmVillagCommPlants:0,pmScolaireHa:0,pmScolairePlants:0,
      plAxesKm:0,plAxesPlants:0,plDelimKm:0,plDelimPlants:0,
      plHaieViveKm:0,plHaieVivePlants:0,plBriseVentKm:0,plBriseVentPlants:0,
      plParFeuKm:0,plParFeuPlants:0,
      rrRnaHa:0,rrRnaPlants:0,rrMiseEnDefenseHa:0,rrMiseEnDefensePlants:0,
      rrEnrichissementHa:0,rrEnrichissementPlants:0,rrMangroveHa:0,rrMangrovePlants:0,
      distribPlants:0,distribHa:0
    }]);
  };

  const handleAddF2Localite = async () => {
    if (!newF2Commune.trim()) {
      toast({
        title: "Localité manquante",
        description: "Veuillez saisir le nom de la commune.",
        variant: "destructive",
      });
      return;
    }

    if (!newF2Arrondissement) {
      toast({
        title: "Section manquante",
        description: "Veuillez sélectionner une section (départemental ou arrondissement).",
        variant: "destructive",
      });
      return;
    }

    const communeName = newF2Commune.trim();
    const parent = newF2Arrondissement;

    try {
      await apiRequest({
        url: "/api/reboisement/localites",
        method: "POST",
        data: {
          departement: user?.departement,
          arrondissement: parent === 'Pépinière départementale' ? null : parent,
          commune: communeName,
        },
      });
    } catch (e) {
      const msg = (e as any)?.body?.message || (e as any)?.message;
      toast({
        title: "Enregistrement impossible",
        description: msg || "Erreur lors de l'enregistrement de la localité.",
        variant: "destructive",
      });
      return;
    }

    const rowToAdd: F2LocaliteRow = {
      localite: communeName,
      localiteLevel: "commune",
      parentLocalite: parent,
      nurseries: nurseryTypesToUse
        .filter(t => !t.departement || normalizeStr(t.departement) === normalizeStr(communeName))
        .map(t => ({ nurseryType: t.label, nbPep: 0, nbPlants: 0 })),
    };

    setF2Rows(prev => {
      const out = [...prev];
      const lastIdx = (() => {
        let idx = -1;
        for (let i = 0; i < out.length; i++) {
          if ((out[i].parentLocalite || "") === parent) idx = i;
        }
        return idx;
      })();

      if (lastIdx >= 0) {
        out.splice(lastIdx + 1, 0, rowToAdd);
      } else {
        out.push(rowToAdd);
      }

      return out;
    });

    setNewF2Commune("");
    setNewF2Arrondissement("");
    setShowAddF2Localite(false);
  };

  const handleAddF4Localite = async () => {
    if (!newF4Commune.trim()) {
      toast({
        title: "Localité manquante",
        description: "Veuillez saisir le nom de la commune.",
        variant: "destructive",
      });
      return;
    }

    if (!newF4Arrondissement) {
      toast({
        title: "Section manquante",
        description: "Veuillez sélectionner une section (départemental ou arrondissement).",
        variant: "destructive",
      });
      return;
    }

    const communeName = newF4Commune.trim();
    const parent = newF4Arrondissement;

    try {
      await apiRequest({
        url: "/api/reboisement/localites",
        method: "POST",
        data: {
          departement: user?.departement,
          arrondissement: parent === 'Pépinière départementale' ? null : parent,
          commune: communeName,
        },
      });
    } catch (e) {
      const msg = (e as any)?.body?.message || (e as any)?.message;
      toast({
        title: "Enregistrement impossible",
        description: msg || "Erreur lors de l'enregistrement de la localité.",
        variant: "destructive",
      });
      return;
    }

    const rowToAdd: F4LocaliteRow = {
      localite: communeName,
      localiteLevel: "commune",
      parentLocalite: parent,
      pmRegieHa: 0, pmRegiePlants: 0, pmPriveIndivHa: 0, pmPriveIndivPlants: 0,
      pmVillagCommHa: 0, pmVillagCommPlants: 0, pmScolaireHa: 0, pmScolairePlants: 0,
      plAxesKm: 0, plAxesPlants: 0, plDelimKm: 0, plDelimPlants: 0,
      plHaieViveKm: 0, plHaieVivePlants: 0, plBriseVentKm: 0, plBriseVentPlants: 0,
      plParFeuKm: 0, plParFeuPlants: 0,
      rrRnaHa: 0, rrRnaPlants: 0, rrMiseEnDefenseHa: 0, rrMiseEnDefensePlants: 0,
      rrEnrichissementHa: 0, rrEnrichissementPlants: 0, rrMangroveHa: 0, rrMangrovePlants: 0,
      distribPlants: 0, distribHa: 0,
    };

    setF4Rows(prev => {
      const out = [...prev];
      const lastIdx = (() => {
        let idx = -1;
        for (let i = 0; i < out.length; i++) {
          if ((out[i].parentLocalite || "") === parent) idx = i;
        }
        return idx;
      })();

      if (lastIdx >= 0) {
        out.splice(lastIdx + 1, 0, rowToAdd);
      } else {
        out.push(rowToAdd);
      }

      return out;
    });

    setNewF4Commune("");
    setNewF4Arrondissement("");
    setShowAddF4Localite(false);
  };

  const addF4Row = () => {
    setF4Rows(prev => [...prev, {
      localite: "", localiteLevel: "commune",
      pmRegieHa:0,pmRegiePlants:0,pmPriveIndivHa:0,pmPriveIndivPlants:0,
      pmVillagCommHa:0,pmVillagCommPlants:0,pmScolaireHa:0,pmScolairePlants:0,
      plAxesKm:0,plAxesPlants:0,plDelimKm:0,plDelimPlants:0,
      plHaieViveKm:0,plHaieVivePlants:0,plBriseVentKm:0,plBriseVentPlants:0,
      plParFeuKm:0,plParFeuPlants:0,
      rrRnaHa:0,rrRnaPlants:0,rrMiseEnDefenseHa:0,rrMiseEnDefensePlants:0,
      rrEnrichissementHa:0,rrEnrichissementPlants:0,rrMangroveHa:0,rrMangrovePlants:0,
      distribPlants:0,distribHa:0
    }]);
  };

  const [isDateEditable, setIsDateEditable] = useState(false);

  const reportDate = form.watch("reportDate");
  const monthName = new Date(reportDate).toLocaleString('fr-FR', { month: 'long' });
  const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const year = new Date(reportDate).getFullYear();
  const currentMonthPeriods = [
    `${capitalizedMonth} ${year} - Quinzaine 1`,
    `${capitalizedMonth} ${year} - Quinzaine 2`
  ];

  // Auto-set period based on date (Forceful synchronization)
  useEffect(() => {
    const isSyntheticRegional = (existingReport as any)?.level === 'region' && !(existingReport as any)?.id;
    const isSyntheticNational = (existingReport as any)?.level === 'national' && !(existingReport as any)?.id;
    if ((!existingReport || isSyntheticRegional || isSyntheticNational) && reportDate && currentMonthPeriods.length >= 2) {
      const day = new Date(reportDate).getDate();
      let periodIdx = day <= 15 ? 0 : 1;

      const p1 = currentMonthPeriods[0];
      const p2 = currentMonthPeriods[1];

      const p1Exists = existingReports?.some(r => r.period === p1 && r.createdBy === user?.id);
      const p2Exists = existingReports?.some(r => r.period === p2 && r.createdBy === user?.id);

      // Si la quinzaine par défaut existe déjà, on propose l'autre quinzaine du mois si elle est libre
      if (periodIdx === 0 && p1Exists && !p2Exists) {
        periodIdx = 1;
      } else if (periodIdx === 1 && p2Exists && !p1Exists) {
        periodIdx = 0;
      }

      form.setValue("period", currentMonthPeriods[periodIdx]);
    }
  }, [reportDate, existingReport, currentMonthPeriods, form, existingReports, user?.id]);

  const p1Exists = existingReports?.some(r => r.period === currentMonthPeriods[0] && r.createdBy === user?.id && r.level !== 'region');
  const p2Exists = existingReports?.some(r => r.period === currentMonthPeriods[1] && r.createdBy === user?.id && r.level !== 'region');
  const isSyntheticReport = ((existingReport as any)?.level === 'region' || (existingReport as any)?.level === 'national') && !(existingReport as any)?.id;
  const isMonthFull = p1Exists && p2Exists && !existingReport && !isSyntheticReport;

  const handleSubmit = async (status: "brouillon" | "soumis") => {
    console.log("Submitting CNR report with status:", status);

    if (status === "brouillon") {
      // En brouillon, on autorise des lignes incomplètes (ex: F3 espèces non sélectionnées).
      // Si des erreurs existent déjà, elles peuvent bloquer form.trigger même si on valide
      // uniquement reportDate/period. On les efface donc explicitement.
      form.clearErrors("species");
    }

    const valid = status === "soumis"
      ? await form.trigger()
      : await form.trigger(["reportDate", "period"]);
    if (!valid) {
      console.warn("Form validation failed:", form.formState.errors);
      const errors = form.formState.errors;
      let description = "Veuillez remplir tous les champs obligatoires.";

      if (errors.period) description = "Veuillez sélectionner une période (ex: Juillet - Quinzaine 1).";
      else if (errors.reportDate) description = "La date du rapport est requise.";
      else if (errors.species) {
        description = "Erreur Fiche F3: " + JSON.stringify(errors.species).substring(0, 150);
        console.error("Détail des erreurs espèces:", JSON.stringify(errors.species, null, 2));
      }

      toast({
        title: "Champs requis manquants",
        description,
        variant: "destructive"
      });
      return;
    }

    // Vérifier si au moins une table contient des données (F1, F2 ou F4)
    if (status === "soumis" && f1Rows.length === 0 && f2Rows.length === 0 && f4Rows.length === 0) {
      toast({
        title: "Données manquantes",
        description: "Veuillez ajouter au moins une localité avec des données dans les fiches F1, F2 ou F4 avant de soumettre.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    toast({
      title: "Enregistrement en cours...",
      description: status === "soumis" ? "Soumission du rapport..." : "Enregistrement du brouillon...",
    });
    try {
      const values = form.getValues();
      console.log("Form values:", values);

      const productionPayload = f1Rows.flatMap(r => r.nurseries.map(n => ({
        localite: r.localite,
        parentLocalite: r.parentLocalite,
        nurseryType: n.nurseryType,
        nbPepinieresAnterieur: n.nbPepinieresAnterieur || 0,
        nbPepinieresPeriode: n.nbPepinieresPeriode || 0,
        gainesEmpoteesAnterieur: n.gainesEmpoteesAnterieur || 0,
        gainesEmpoteesPeriode: n.gainesEmpoteesPeriode || 0,
        gainesArrimeesAnterieur: n.gainesArrimeesAnterieur || 0,
        gainesArrimeesPeriode: n.gainesArrimeesPeriode || 0,
        gainesEnsemenceesAnterieur: n.gainesEnsemenceesAnterieur || 0,
        gainesEnsemenceesPeriode: n.gainesEnsemenceesPeriode || 0,
        gainesGerminationAnterieur: n.gainesGerminationAnterieur || 0,
        gainesGerminationPeriode: n.gainesGerminationPeriode || 0,
      })));

      const plantsPayload = f2Rows.map(({ localite, parentLocalite, nurseries }) => {
        const getVal = (typeStr: string, field: 'nbPep' | 'nbPlants') => {
          const found = nurseries.find((n: any) => n.nurseryType.includes(typeStr));
          return found ? Number(found[field]) || 0 : 0;
        };

        return {
          localite,
          parentLocalite,
          nurseries,
          regieNbPep: getVal("Régie", "nbPep"),
          regieNbPlants: getVal("Régie", "nbPlants"),
          priveIndivNbPep: getVal("Privée", "nbPep"),
          priveIndivNbPlants: getVal("Privée", "nbPlants"),
          villagCommNbPep: getVal("Communautaire", "nbPep"),
          villagCommNbPlants: getVal("Communautaire", "nbPlants"),
          scolaireNbPep: getVal("Scolaire", "nbPep"),
          scolaireNbPlants: getVal("Scolaire", "nbPlants"),
        };
      });

      const shouldKeepSpeciesRow = (row: any) => {
        const nurseries = Array.isArray(row?.nurseries) ? row.nurseries : [];
        const hasAnyValue = nurseries.some((n: any) => (Number(n?.count) || 0) > 0);
        return !!row?.speciesName && hasAnyValue;
      };

      const speciesRowsToSend = status === "soumis"
        ? (values.species || []).filter(shouldKeepSpeciesRow)
        : (values.species || []);

      const speciesPayload = speciesRowsToSend.map(({ speciesName, category, count, nurseries, localite, parentLocalite }: any) => ({
        speciesName,
        category,
        count,
        nurseries,
        localite,
        parentLocalite
      }));

      const fieldPayload = f4Rows.map(r => ({
        localite: r.localite,
        localiteLevel: r.localiteLevel,
        parentLocalite: r.parentLocalite,
        pmRegieHa: r.pmRegieHa || "0",
        pmRegiePlants: r.pmRegiePlants || 0,
        pmPriveIndivHa: r.pmPriveIndivHa || "0",
        pmPriveIndivPlants: r.pmPriveIndivPlants || 0,
        pmVillagCommHa: r.pmVillagCommHa || "0",
        pmVillagCommPlants: r.pmVillagCommPlants || 0,
        pmScolaireHa: r.pmScolaireHa || "0",
        pmScolairePlants: r.pmScolairePlants || 0,
        plAxesKm: r.plAxesKm || "0",
        plAxesPlants: r.plAxesPlants || 0,
        plDelimKm: r.plDelimKm || "0",
        plDelimPlants: r.plDelimPlants || 0,
        plHaieViveKm: r.plHaieViveKm || "0",
        plHaieVivePlants: r.plHaieVivePlants || 0,
        plBriseVentKm: r.plBriseVentKm || "0",
        plBriseVentPlants: r.plBriseVentPlants || 0,
        plParFeuKm: r.plParFeuKm || "0",
        plParFeuPlants: r.plParFeuPlants || 0,
        rrRnaHa: r.rrRnaHa || "0",
        rrRnaPlants: r.rrRnaPlants || 0,
        rrMiseEnDefenseHa: r.rrMiseEnDefenseHa || "0",
        rrMiseEnDefensePlants: r.rrMiseEnDefensePlants || 0,
        rrEnrichissementHa: r.rrEnrichissementHa || "0",
        rrEnrichissementPlants: r.rrEnrichissementPlants || 0,
        rrMangroveHa: r.rrMangroveHa || "0",
        rrMangrovePlants: r.rrMangrovePlants || 0,
        distribPlants: r.distribPlants || 0,
        distribHa: r.distribHa || "0"
      }));

      const response = await apiRequest({
        method: "POST",
        url: "/api/reboisement/reports",
        data: {
          report: {
            id: existingReport?.id, // Inclus l'ID pour la mise à jour
            reportDate: values.reportDate,
            period: values.period,
            notes: values.notes,
            region: user?.region,
            departement: user?.departement,
            level: user?.role === "admin" ? "national" : user?.role === "agent" ? "region" : "departement",
            status,
          },
          production: productionPayload,
          plants: plantsPayload,
          species: speciesPayload,
          field: fieldPayload,
        }
      });

      console.log("Submission successful:", response);
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/reports"] });

      toast({
        title: status === "soumis" ? "Rapport soumis" : "Brouillon enregistré",
        description: `Le rapport pour la période ${values.period} a été sauvegardé.`,
      });

      onClose();
    } catch (err: any) {
      console.error("Submission error:", err);
      const errorMsg = err.body?.message || err.message || "Une erreur est survenue lors de l'enregistrement.";
      toast({ title: "Erreur lors de l'enregistrement", description: errorMsg, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      setIsSubmitting(true);
      await apiRequest({
        method: "PATCH",
        url: `/api/reboisement/reports/${reportToUse.id}/status`,
        data: { status: newStatus }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/reports"] });
      toast({
        title: newStatus === "valide" ? "Rapport validé" : "Rapport invalidé",
        description: `Le statut du rapport a été mis à jour avec succès.`
      });
      onClose();
    } catch (err: any) {
      console.error("Status update error:", err);
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    <Form {...form}>
      <div className="space-y-6">
        <div className="space-y-4">
        {/* En-tête du formulaire intégré au contenu */}
        <div className="bg-white border border-green-200 rounded-xl shadow-sm p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex items-center gap-2 text-green-800 font-bold text-lg border-r border-green-100 pr-6 mr-2">
              <TreePine className="w-6 h-6 text-green-600" />
              <span>
                {(
                  reportToUse?.level === 'national'
                  || isAdminNationalView
                )
                  ? 'Suivi CNR - National'
                  : (
                    user?.role === 'agent'
                    || reportToUse?.level === 'region'
                    || isAdminRegionalView
                  )
                    ? 'Suivi CNR - Régional'
                    : 'Nouveau Rapport CNR'
                }
              </span>
            </div>

            <div className="flex items-center gap-4">
              <FormField control={form.control as any} name="reportDate" render={({ field }) => (
                <FormItem className="m-0 space-y-0 flex items-center gap-2">
                  <FormLabel className="text-green-700 text-xs font-semibold uppercase tracking-wider m-0">Date</FormLabel>
                  <div className="flex items-center gap-1">
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        readOnly={!isDateEditable}
                        className={`h-9 w-36 bg-green-50/50 border-green-200 focus:ring-green-500 ${!isDateEditable ? 'cursor-not-allowed opacity-80' : ''}`}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsDateEditable(!isDateEditable)}
                      className={`h-8 w-8 text-green-600 hover:bg-green-100 ${isDateEditable ? 'bg-green-200' : ''}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                </FormItem>
              )} />

              <FormField control={form.control as any} name="period" render={({ field }) => (
                <FormItem className="m-0 space-y-0 flex items-center gap-2">
                  <FormLabel className="text-green-700 text-xs font-semibold uppercase tracking-wider m-0">Période</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isMonthFull || isReadOnly}>
                    <FormControl>
                      <SelectTrigger className="h-9 w-48 bg-green-50/50 border-green-200 focus:ring-green-500">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {currentMonthPeriods.map((p, idx) => {
                        const day = new Date(reportDate).getDate();
                        const isQ1 = day <= 15;
                        const isDisabled = (idx === 0 && !isQ1) || (idx === 1 && isQ1);
                        return (
                          <SelectItem key={p} value={p} disabled={isDisabled}>
                            {p} {isDisabled ? "(Invalide pour cette date)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {isConsolidating && (
                    <div className="flex items-center gap-2 text-emerald-600 animate-pulse ml-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-[10px] font-medium">Consolidation...</span>
                    </div>
                  )}
                </FormItem>
              )} />
            </div>
          </div>

          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose} className="bg-green-50 border-green-200 text-green-800 hover:bg-green-100 flex items-center gap-2 font-medium">
              Retour à la liste ↗
            </Button>
          )}
        </div>

        </div>

      {/* Onglets des fiches */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 bg-green-100">
          <TabsTrigger value="f1" className="data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <Sprout className="w-4 h-4 mr-1" />F1 — Suivi/Pépinières
          </TabsTrigger>
          <TabsTrigger value="f2" className="data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <TreePine className="w-4 h-4 mr-1" />F2 — Plants/Pépinière
          </TabsTrigger>
          <TabsTrigger value="f3" className="data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <BarChart3 className="w-4 h-4 mr-1" />F3 — Production par espèce
          </TabsTrigger>
          <TabsTrigger value="f4" className="data-[state=active]:bg-green-700 data-[state=active]:text-white">
            <MapIcon className="w-4 h-4 mr-1" />F4 — Réalisations physiques
          </TabsTrigger>
        </TabsList>

        {/* F1 - Production des pépinières */}
        <TabsContent value="f1">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-green-800">Fiche F1 — Suivi de la préparation des pépinières</CardTitle>
                <CardDescription>Données par type de pépinière (Antérieur = cumul validé précédent)</CardDescription>
              </div>
              {!isReadOnly && (
                <Button variant="outline" size="sm" onClick={() => setShowNurseryTypeManager(true)} className="border-green-300 text-green-700">
                  <Plus className="w-4 h-4 mr-1" /> Ajouter
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {f1Rows.length > 0 ? (
                <F1ProductionTable
                  rows={f1RowsForDisplay}
                  onChange={setF1Rows}
                  globalTotalLabel={
                    isAdminNationalView ? "TOTAL NATIONAL" :
                    (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "TOTAL RÉGIONAL" :
                    globalTotalLabel
                  }
                  localiteColumnHeader={isAdminNationalView ? "Région" : (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "Département" : "Localités"}
                  showGroupSubtotals={!(isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional)}
                  readOnly={isReadOnly}
                />
              ) : (
                <p className="text-center text-gray-400 py-8">
                  {isReadOnly ? "Aucune donnée de pépinière pour ce rapport." : "Cliquez sur \"Ajouter une localité\" pour commencer"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* F2 - Production de plants */}
        <TabsContent value="f2">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-green-800">Fiche F2 — Suivi de la production de plants</CardTitle>
              <CardDescription>Production par type d'initiateur pour chaque localité.</CardDescription>
            </div>
            {!isReadOnly && (
              <Button variant="outline" size="sm" onClick={() => setShowAddF2Localite(true)} className="border-green-300 text-green-700">
                <Plus className="w-4 h-4 mr-1" /> Ajouter une localité
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {f2Rows.length > 0 ? (
              <F2PlantsTable
                rows={f2Rows}
                onChange={setF2Rows}
                nurseryTypes={
                  (isReadOnly && reportToUse?.level === 'departement')
                    ? nurseryTypeLabelsForDeptReportReadOnly
                    : nurseryTypeLabels
                }
                globalTotalLabel={
                  isAdminNationalView ? "TOTAL NATIONAL" :
                  (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "TOTAL RÉGIONAL" :
                  globalTotalLabel
                }
                localiteColumnHeader={isAdminNationalView ? "Région" : (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "Département" : "Localités"}
                readOnly={isReadOnly}
                isRowDeletable={(row) => {
                  if (!user?.departement) return false;
                  const parent = (row.parentLocalite || '').trim();
                  const arrondissement = parent && parent !== 'Pépinière départementale' ? parent : null;
                  const match = (reforestationLocalites || []).find((l: any) =>
                    normalizeStr(l?.commune || '') === normalizeStr(row.localite || '')
                    && normalizeStr(l?.departement || '') === normalizeStr(user.departement || '')
                    && normalizeStr((l?.arrondissement || '') || '') === normalizeStr(arrondissement || '')
                  );
                  return !!match?.id;
                }}
                onDeleteRow={async (row) => {
                  try {
                    if (!user?.departement) return;
                    const parent = (row.parentLocalite || '').trim();
                    const arrondissement = parent && parent !== 'Pépinière départementale' ? parent : null;
                    const match = (reforestationLocalites || []).find((l: any) =>
                      normalizeStr(l?.commune || '') === normalizeStr(row.localite || '')
                      && normalizeStr(l?.departement || '') === normalizeStr(user.departement || '')
                      && normalizeStr((l?.arrondissement || '') || '') === normalizeStr(arrondissement || '')
                    );
                    if (match?.id) {
                      await apiRequest({
                        url: `/api/reboisement/localites/${match.id}`,
                        method: 'DELETE',
                      });
                    }
                  } catch (e) {
                    throw e;
                  }
                }}
              />
            ) : (
              <p className="text-center text-gray-400 py-8">
                {isReadOnly ? "Aucune donnée de plants pour ce rapport." : "Cliquez sur \"Ajouter une localité\" pour commencer"}
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* F3 - Espèces */}
      <TabsContent value="f3">
        <Card>
          <CardHeader className="pb-2 flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-base text-green-800 mt-1">Fiche F3 — Production par espèce</CardTitle>
            </div>

            <div className="overflow-x-auto ml-4">
              <table className="border-collapse border border-gray-400 text-[9px] w-auto">
                <thead>
                  <tr className="bg-gray-400 text-gray-900">
                    <th className="border border-gray-500 px-1.5 py-0.5 text-left w-24"></th>
                    <th className="border border-gray-500 px-1.5 py-0.5 text-center">Espèces Forestières</th>
                    <th className="border border-gray-500 px-1.5 py-0.5 text-center">Fruitier-forestières</th>
                    <th className="border border-gray-500 px-1.5 py-0.5 text-center">Espèces Fruitières</th>
                    <th className="border border-gray-500 px-1.5 py-0.5 text-center">Espèces ornementales</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="bg-gray-300 border border-gray-500 px-1.5 py-0.5 font-bold italic">Nbre Espèces</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["forestière"].count}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["fruitier-forestière"].count}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["fruitière"].count}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["ornementale"].count}</td>
                  </tr>
                  <tr>
                    <td className="bg-gray-300 border border-gray-500 px-1.5 py-0.5 font-bold italic">Nbre Total</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["forestière"].total.toLocaleString()}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["fruitier-forestière"].total.toLocaleString()}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["fruitière"].total.toLocaleString()}</td>
                    <td className="border border-gray-500 px-1.5 py-0.5 text-center font-medium bg-white">{speciesSummary["ornementale"].total.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardHeader>
          <CardContent>

            {isReadOnly || isRegionalAgent || reportToUse?.level === "region" ? (
              <F3SpeciesTable
                rows={(form.watch("species") || []).map((r: any) => ({
                  ...r,
                  speciesName: String(r?.speciesName || ""),
                  category: String(r?.category || ""),
                  count: Number(r?.count) || 0,
                }))}
                isConsolidated={shouldConsolidateF3}
                readOnly={true}
                nurseryTypes={
                  (isAdminNationalView || isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional)
                    ? nurseryTypeLabels
                    : nurseryTypeLabelsForDeptReportReadOnly
                }
                localiteColumnHeader={
                  isAdminNationalView ? "Région" :
                  (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "Département" :
                  "Localité"
                }
                globalTotalLabel={
                  isAdminNationalView ? "TOTAL NATIONAL" :
                  (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "TOTAL RÉGIONAL" :
                  "TOTAL GÉNÉRAL RÉGIONAL"
                }
              />
            ) : (
              <>
                {catalogLoading ? (
                  <div className="flex items-center gap-2 text-gray-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Chargement du catalogue...</span>
                  </div>
                ) : catalogSpecies.length === 0 ? (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 rounded-lg p-3 mb-4">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-sm">Le catalogue est vide. Demandez à votre administrateur d'ajouter des espèces.</span>
                  </div>
                ) : null}

                <div>
                  <table className="w-full text-xs border-collapse table-fixed">
                    <thead>
                      <tr>
                        <th className="bg-gray-200 text-gray-800 text-xs font-bold text-center px-2 py-2 border border-gray-300 w-56" rowSpan={2}>Espèce</th>
                        <th className="bg-gray-200 text-gray-800 text-xs font-bold text-center px-2 py-2 border border-gray-300 w-28" rowSpan={2}>Catégorie</th>
                        <th className="bg-gray-200 text-gray-800 text-xs font-bold text-center px-2 py-2 border border-gray-300" colSpan={nurseryTypesToUse.length}>Nombre de plants par type de pépinière</th>
                        <th className="bg-gray-200 text-gray-800 text-xs font-bold text-center px-2 py-2 border border-gray-300 w-20" rowSpan={2}>Total</th>
                        {!isReadOnly && <th className="bg-gray-200 text-gray-800 text-xs font-bold text-center px-2 py-2 border border-gray-300 w-16" rowSpan={2}>Action</th>}
                      </tr>
                      <tr>
                        {nurseryTypesToUse.map(type => (
                          <th key={type.label} className="bg-gray-100 text-gray-700 text-[10px] font-semibold text-center px-2 py-1 border border-gray-300 capitalize whitespace-nowrap">
                            {type.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {speciesFields.map((field, idx) => (
                        <tr key={field.id} className={idx % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                          <td className={tdCls}>
                            <FormField control={form.control} name={`species.${idx}.speciesName`} render={({ field: f }) => (
                              <FormItem className="m-0">
                                <Select
                                  value={f.value}
                                  onValueChange={(val) => {
                                    f.onChange(val);
                                    const sp = catalogSpecies.find((s) => s.name === val);
                                    if (sp) form.setValue(`species.${idx}.category`, sp.category);
                                  }}
                                >
                                  <FormControl>
                                    <SelectTrigger className="h-7 text-xs">
                                      <SelectValue placeholder="Sélectionner une espèce..." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {catalogSpeciesGrouped.map((group, gIdx) => (
                                      <Fragment key={group.category}>
                                        {gIdx > 0 && <SelectSeparator />}
                                        <SelectGroup>
                                          <SelectLabel className="bg-slate-100 text-slate-700 -mx-1 px-2 py-1 rounded-sm">
                                            {group.category}
                                          </SelectLabel>
                                          {group.items.map((s) => (
                                            <SelectItem key={s.id} value={s.name}>
                                              {s.name}
                                            </SelectItem>
                                          ))}
                                        </SelectGroup>
                                      </Fragment>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )} />
                          </td>
                          <td className={`${tdCls} text-center w-28`}>
                            {form.watch(`species.${idx}.category`) || "—"}
                          </td>
                          {nurseryTypesToUse.map(type => {
                            const nIdx = (form.watch(`species.${idx}.nurseries`) || []).findIndex((n: any) => n.nurseryType === type.label);

                            // S'assurer que le champ existe dans l'objet nurseries
                            if (nIdx === -1 && !isReadOnly) {
                              // On ne peut pas facilement append ici car on est en plein rendu,
                              // mais la synchronisation au chargement devrait l'avoir fait.
                            }

                            return (
                              <td key={type.label} className={tdCls}>
                                {nIdx !== -1 ? (
                                  <FormField control={form.control} name={`species.${idx}.nurseries.${nIdx}.count`} render={({ field: f }) => (
                                    <FormItem className="m-0">
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min={0}
                                          {...f}
                                          onChange={e => {
                                            const val = parseInt(e.target.value) || 0;
                                            f.onChange(val);
                                            // Mettre à jour le count total de la ligne
                                            const nurseries = form.getValues(`species.${idx}.nurseries`) || [];
                                            const newTotal = nurseries.reduce((acc: number, n: any, i: number) =>
                                              acc + (i === nIdx ? val : (n.count || 0)), 0);
                                            form.setValue(`species.${idx}.count`, newTotal);
                                          }}
                                          readOnly={isReadOnly}
                                          className={`h-7 w-20 text-xs text-center mx-auto ${isReadOnly ? 'border-transparent bg-transparent cursor-default shadow-none' : ''}`}
                                        />
                                      </FormControl>
                                    </FormItem>
                                  )} />
                                ) : (
                                  <div className="text-center text-gray-300">—</div>
                                )}
                              </td>
                            );
                          })}
                          <td className={`${tdCls} text-center font-bold bg-green-50/50 w-20`}>
                            {form.watch(`species.${idx}.count`) || 0}
                          </td>
                          <td className={`${tdCls} text-center w-16`}>
                            {(() => {
                              const speciesName = form.watch(`species.${idx}.speciesName`);
                              const nurseries = form.watch(`species.${idx}.nurseries`) || [];
                              const hasAnyValue = Array.isArray(nurseries) && nurseries.some((n: any) => (Number(n?.count) || 0) > 0);
                              const isEditingRow = idx === speciesFields.length - 1;
                              const showCheck = isEditingRow && !!speciesName && hasAnyValue;

                              if (showCheck) {
                                return <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto" />;
                              }

                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeSpecies(idx)}
                                  className="h-6 w-6 p-0 text-red-500"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              );
                            })()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-green-50 font-bold border-t-2 border-green-200">
                          <td className={`${tdCls} text-right pr-4 uppercase text-green-800`} colSpan={nurseryTypesToUse.length + 2}>TOTAL GÉNÉRAL</td>
                          <td className={`${tdCls} text-center text-green-900 text-sm`}>
                            {form.watch("species")?.reduce((acc: number, s: any) => acc + (parseInt(s.count) || 0), 0) || 0}
                          </td>
                          {!isReadOnly && <td className={`${tdCls} w-16`}></td>}
                        </tr>
                      </tfoot>
                    </table>
                    {!isReadOnly && (
                      <Button variant="outline" size="sm"
                        onClick={() => appendSpecies({
                          speciesName: "",
                          category: "",
                          count: 0,
                          nurseries: nurseryTypesToUse.map(t => ({ nurseryType: t.label, count: 0 }))
                        })}
                        className="mt-2 border-green-300 text-green-700"
                        disabled={catalogSpecies.length === 0}>
                        <Plus className="w-4 h-4 mr-1" /> Ajouter une espèce
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* F4 - Réalisations terrain */}
        <TabsContent value="f4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-green-800">Fiche F4 — Réalisations physiques</CardTitle>
                <CardDescription>
                  Plantations massives, linéaires, restauration/réhabilitation et distribution individuelle.
                  Chaque ligne = une localité de votre zone.
                </CardDescription>
              </div>
              {!isReadOnly && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (isRegionalAgent) addF4Row();
                    else setShowAddF4Localite(true);
                  }}
                  className="border-green-300 text-green-700"
                >
                  <Plus className="w-4 h-4 mr-1" /> Ajouter une localité
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {f4Rows.length > 0 ? (
                <F4RealisationsTable
                  rows={f4Rows}
                  onChange={setF4Rows}
                  readOnly={isReadOnly}
                  globalTotalLabel={
                    isAdminNationalView ? "TOTAL NATIONAL" :
                    (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "TOTAL RÉGIONAL" :
                    globalTotalLabel
                  }
                  localiteColumnHeader={isAdminNationalView ? "Région" : (isRegionalAgent || isAdminRegionalView || isAdminViewingExistingRegional) ? "Département" : "Localité"}
                  nurseryTypesForPM={nurseryTypeLabels}
                  isRowDeletable={(row) => {
                    if (!user?.departement) return false;
                    const parent = (row.parentLocalite || '').trim();
                    const arrondissement = parent && parent !== 'Pépinière départementale' ? parent : null;
                    const match = (reforestationLocalites || []).find((l: any) =>
                      normalizeStr(l?.commune || '') === normalizeStr(row.localite || '')
                      && normalizeStr(l?.departement || '') === normalizeStr(user.departement || '')
                      && normalizeStr((l?.arrondissement || '') || '') === normalizeStr(arrondissement || '')
                    );
                    return !!match?.id;
                  }}
                  onDeleteRow={async (row) => {
                    try {
                      if (!user?.departement) return;
                      const parent = (row.parentLocalite || '').trim();
                      const arrondissement = parent && parent !== 'Pépinière départementale' ? parent : null;
                      const match = (reforestationLocalites || []).find((l: any) =>
                        normalizeStr(l?.commune || '') === normalizeStr(row.localite || '')
                        && normalizeStr(l?.departement || '') === normalizeStr(user.departement || '')
                        && normalizeStr((l?.arrondissement || '') || '') === normalizeStr(arrondissement || '')
                      );
                      if (match?.id) {
                        await apiRequest({
                          url: `/api/reboisement/localites/${match.id}`,
                          method: 'DELETE',
                        });
                      }
                    } catch (e) {
                      throw e;
                    }
                  }}
                />
              ) : (
                <p className="text-center text-gray-400 py-8">
                   {isReadOnly ? "Aucune donnée de réalisation pour ce rapport." : "Cliquez sur \"Ajouter une localité\" pour commencer la saisie"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isMonthFull && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3 mb-4 shadow-sm animate-pulse">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">
            Les deux quinzaines de <strong>{capitalizedMonth} {year}</strong> ont déjà été saisies.
            Veuillez modifier ou supprimer l'un des rapports existants si vous souhaitez faire une nouvelle saisie pour ce mois.
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Fermer</Button>
        <div className="flex items-center gap-2">
          {/* Actions de validation/invalidation pour les supérieurs */}
          {!!reportToUse?.id && ((user?.role === "admin" && reportToUse?.level === "region") ||
            (user?.role === "agent" && reportToUse?.level === "departement" && reportToUse?.region === user?.region)) &&
            (reportToUse?.status === "soumis" || reportToUse?.status === "valide") && (
            <>
              {reportToUse.status !== "valide" && (
                <Button
                  onClick={() => handleStatusChange("valide")}
                  disabled={isSubmitting}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Check className="w-4 h-4 mr-2" /> Valider le rapport
                </Button>
              )}
              <Button
                onClick={() => handleStatusChange("rejete")}
                disabled={isSubmitting}
                variant="destructive"
              >
                <AlertTriangle className="w-4 h-4 mr-2" /> Invalider (Rejeter)
              </Button>
            </>
          )}

          {!isReadOnly && (
            <>
              <Button variant="outline" onClick={() => handleSubmit("brouillon")} disabled={isSubmitting || isMonthFull}
                className={`border-gray-400 text-gray-600 ${isMonthFull ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Enregistrer brouillon
              </Button>
              <Button onClick={() => setShowSubmitConfirm(true)} disabled={isSubmitting || isMonthFull}
                className={`bg-green-700 hover:bg-green-800 text-white ${isMonthFull ? 'opacity-50 cursor-not-allowed' : ''}`}>
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
                Soumettre le rapport
              </Button>

              <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
                <AlertDialogContent overlayClassName="bg-transparent">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la soumission</AlertDialogTitle>
                    <AlertDialogDescription>
                      Êtes-vous sûr de vouloir soumettre ce rapport ? Une fois soumis, vous ne pourrez plus le modifier à moins qu'il ne soit rejeté.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        setShowSubmitConfirm(false);
                        handleSubmit("soumis");
                      }}
                      className="bg-green-700 hover:bg-green-800"
                    >
                      Confirmer la soumission
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
      </div>
    </Form>
    <NurseryTypeManager
      open={showNurseryTypeManager}
      onOpenChange={setShowNurseryTypeManager}
      departements={regionalDepts}
      fixedDepartement={isSectorAgent ? (user?.departement || null) : null}
    />

    <AlertDialog open={showAddF2Localite} onOpenChange={setShowAddF2Localite}>
      <AlertDialogContent overlayClassName="bg-transparent">
        <AlertDialogHeader>
          <AlertDialogTitle>Ajouter une commune (F2)</AlertDialogTitle>
          <AlertDialogDescription>
            Sélectionnez l'arrondissement pour insérer la commune dans la bonne section.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Département</div>
            <Input value={user?.departement || ""} readOnly className="h-9 bg-gray-100" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Section</div>
            <select
              value={newF2Arrondissement}
              onChange={(e) => setNewF2Arrondissement(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
            >
              <option value="" disabled>Sélectionner...</option>
              <option value="Pépinière départementale">Départemental</option>
              {arrondissementOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Commune</div>
            <Input value={newF2Commune} onChange={(e) => setNewF2Commune(e.target.value)} className="h-9" />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setNewF2Commune("");
            setNewF2Arrondissement("");
          }}>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={handleAddF2Localite} className="bg-green-700 hover:bg-green-800">
            Ajouter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={showAddF4Localite} onOpenChange={setShowAddF4Localite}>
      <AlertDialogContent overlayClassName="bg-transparent">
        <AlertDialogHeader>
          <AlertDialogTitle>Ajouter une commune (F4)</AlertDialogTitle>
          <AlertDialogDescription>
            Sélectionnez l'arrondissement pour insérer la commune dans la bonne section.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Département</div>
            <Input value={user?.departement || ""} readOnly className="h-9 bg-gray-100" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Section</div>
            <select
              value={newF4Arrondissement}
              onChange={(e) => setNewF4Arrondissement(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-green-600 focus:ring-offset-2"
            >
              <option value="" disabled>Sélectionner...</option>
              <option value="Pépinière départementale">Départemental</option>
              {arrondissementOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-gray-700">Commune</div>
            <Input value={newF4Commune} onChange={(e) => setNewF4Commune(e.target.value)} className="h-9" />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setNewF4Commune("");
            setNewF4Arrondissement("");
          }}>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={handleAddF4Localite} className="bg-green-700 hover:bg-green-800">
            Ajouter
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

export default CNRReportForm;
