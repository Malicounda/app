import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
// removed user association feature (no DB column)
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { departmentsByRegion } from "@/lib/constants";

// Types d'aide pour les listes armes
type WeaponOption = { id: string; code: string; label: string; isActive?: boolean; weaponTypeId?: string };

import { countriesList, getNationality } from "@/lib/countries";

// Fonction de validation des fichiers
const validateFile = (file: File | string | undefined): boolean => {
  if (!file) return true; // Champ optionnel
  if (file instanceof File) {
    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!validTypes.includes(file.type)) {
      return false;
    }

    if (file.size > maxSize) {
      return false;
    }
  }
  return true;
};

// Fonction de validation des dates d'expiration
const validateExpiryDate = (date: string | undefined): boolean => {
  if (!date) return true; // Champ optionnel
  const expiryDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiryDate >= today;
};

// Fonction utilitaire pour convertir une URL en Blob
const urlToBlob = async (url: string): Promise<Blob> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur lors du téléchargement du fichier: ${response.statusText}`);
    }
    return await response.blob();
  } catch (error) {
    console.error('Erreur lors de la conversion URL vers Blob:', error);
    throw error;
  }
};

// Fonction utilitaire pour ajouter un fichier au FormData
const addFileToFormData = async (
  formData: FormData,
  fieldName: string,
  file: File | string | undefined,
  expiryDate?: string | null
) => {
  if (!file) return;

  try {
    // Si c'est une URL (chaîne de caractères), on la convertit en Blob
    if (typeof file === 'string') {
      // Vérifie si c'est une URL valide ou une chaîne base64
      if (file.startsWith('http') || file.startsWith('blob:')) {
        const blob = await urlToBlob(file);
        const filename = file.split('/').pop() || `${fieldName}.${blob.type.split('/')[1] || 'bin'}`;
        formData.append(fieldName, blob, filename);
      } else if (file.startsWith('data:')) {
        // Gestion des données base64
        const base64Response = await fetch(file);
        const blob = await base64Response.blob();
        const filename = `${fieldName}.${blob.type.split('/')[1] || 'bin'}`;
        formData.append(fieldName, blob, filename);
      }
    }
    // Si c'est un objet File, on l'ajoute directement
    else if (file instanceof File) {
      formData.append(fieldName, file, file.name);
    }

    // Ajout de la date d'expiration si fournie
    if (expiryDate) {
      formData.append(`${fieldName}ExpiryDate`, expiryDate);
    }
  } catch (error: unknown) {
    console.error(`Erreur lors de l'ajout du fichier ${fieldName}:`, error);
    const errorMessage = error instanceof Error
      ? error.message
      : 'Une erreur inconnue est survenue';
    throw new Error(`Impossible de traiter le fichier ${fieldName}: ${errorMessage}`);
  }
};

// Utilitaires de normalisation pour détecter les armes "spéciales"
const normalizeStr = (s: string) => s
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-');

const SPECIAL_WEAPON_CODES = new Set([
  'arbalete', // arbalète
  'arc',
  'lance-pierre', 'lancepierre', 'lance_pierre'
]);

const hunterFormSchema = z.object({
  // Informations personnelles
  lastName: z.string().min(2, { message: "Le nom est requis" })
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, { message: "Le nom ne peut contenir que des lettres" }),
  firstName: z.string().min(2, { message: "Le prénom est requis" })
    .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, { message: "Le prénom ne peut contenir que des lettres" }),
  dateOfBirth: z.string().min(1, { message: "La date de naissance est requise" })
    .refine(val => !isNaN(Date.parse(val)), { message: "Date de naissance invalide" })
    .refine(val => {
      const birthDate = new Date(val);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Calcul précis de l'âge
      const exactAge = age - (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? 1 : 0);

      return exactAge >= 18;
    }, { message: "L'âge minimum est de 18 ans" }),
  idNumber: z.string().min(5, { message: "Le numéro de pièce d'identité est requis" }),
  pays: z.string().min(1, { message: "Le pays est requis" }),
  nationality: z.string().min(1, { message: "La nationalité est requise" }),
  // Téléphone et adresse: optionnels si catégorie = 'touristique' (touriste)
  phone: z.string().optional(),
  address: z.string().optional(),
  experience: z.coerce.number().min(0, { message: "L'expérience ne peut pas être négative" }),
  profession: z.string().min(2, { message: "La profession est requise" }),
  category: z.enum(["resident", "coutumier", "touristique"], { message: "Veuillez sélectionner une catégorie valide" }),
  region: z.string().min(1, { message: "La région est requise" }),
  departement: z.string().min(1, { message: "Le département est requis" }),

  // Informations sur l'arme
  weaponType: z.string().min(1, { message: "Le type d'arme est requis" }),
  weaponBrand: z.string().default(''),
  weaponReference: z.string().default(''),
  weaponCaliber: z.string().default(''),
  weaponOtherDetails: z.string().optional(),

  // Documents obligatoires avec validation
  idCardDocument: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  idCardExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  weaponPermit: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  weaponPermitExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  hunterPhoto: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  hunterPhotoExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  treasuryStamp: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  treasuryStampExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  weaponReceipt: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  weaponReceiptExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  insurance: z.any()
    .refine(file => validateFile(file), {
      message: "Format de fichier non supporté ou taille supérieure à 5MB"
    }),
  insuranceExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    }),

  // Document optionnel
  moralCertificate: z.any().optional(),
  moralCertificateExpiryDate: z.string().optional()
    .refine(date => !date || validateExpiryDate(date), {
      message: "Le document a expiré"
    })
}).superRefine((vals, ctx) => {
  // Rendre adresse obligatoire sauf pour la catégorie 'touristique'
  const cat = (vals.category || '').toString().trim().toLowerCase();
  const isTourist = cat === 'touristique' || cat.startsWith('tour');
  if (!isTourist) {
    const address = (vals.address || '').toString().trim();
    if (!address || address.length < 5) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['address'], message: "L'adresse est requise (sauf pour la catégorie 'touristique')" });
    }
  }

  // Rendre les champs non obligatoires pour arbalète / arc / lance-pierre
  const code = vals.weaponType || '';
  const normalized = normalizeStr(code);
  const isSpecial = SPECIAL_WEAPON_CODES.has(normalized);
  if (!isSpecial) {
    if (!vals.weaponBrand || vals.weaponBrand.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weaponBrand'], message: "La marque de l'arme est requise" });
    }
    if (!vals.weaponReference || vals.weaponReference.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weaponReference'], message: "La référence de l'arme est requise" });
    }
    if (!vals.weaponCaliber || vals.weaponCaliber.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['weaponCaliber'], message: "Le calibre de l'arme est requis" });
    }
  }
});

type HunterFormData = z.infer<typeof hunterFormSchema>;

interface HunterFormProps {
  hunterId?: number;
  open: boolean;
  onClose: () => void;
}

export default function HunterForm({ hunterId, open, onClose }: HunterFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditing = !!hunterId;
  const initialWeaponTypeRef = useRef<string>("");
  const initialWeaponBrandRef = useRef<string>("");
  const initialWeaponCaliberRef = useRef<string>("");
  const initialDepartementRef = useRef<string>("");
  // Verrouillage individuel des champs en mode édition
  const [unlockedFields, setUnlockedFields] = useState<Set<string>>(new Set());
  const toggleFieldLock = useCallback((fieldName: string) => {
    setUnlockedFields(prev => {
      const next = new Set(prev);
      if (next.has(fieldName)) next.delete(fieldName);
      else next.add(fieldName);
      return next;
    });
  }, []);
  const isFieldLocked = useCallback((fieldName: string) => isEditing && !unlockedFields.has(fieldName), [isEditing, unlockedFields]);

  // user association removed

  const form = useForm<z.infer<typeof hunterFormSchema>>({
    resolver: zodResolver(hunterFormSchema),
    mode: "onChange",
    defaultValues: {
      lastName: "",
      firstName: "",
      dateOfBirth: "",
      pays: "Sénégal",
      nationality: "sénégalaise",
      idNumber: "",
      phone: "",
      address: "",
      experience: 0,
      profession: "",
      category: "resident",
      region: "",
      departement: "",
      weaponType: "fusil",
      weaponBrand: "",
      weaponReference: "",
      weaponCaliber: "",
      weaponOtherDetails: "",
      // Documents manquants initialisés pour rester contrôlés
      idCardDocument: "",
      weaponPermit: "",
      hunterPhoto: "",
      idCardExpiryDate: "",
      weaponPermitExpiryDate: "",
      hunterPhotoExpiryDate: "",
      treasuryStamp: "",
      treasuryStampExpiryDate: "",
      weaponReceipt: "",
      weaponReceiptExpiryDate: "",
      insurance: "",
      insuranceExpiryDate: "",
      moralCertificate: "",
      moralCertificateExpiryDate: "",
    },
  });

  // If hunterId is provided, fetch hunter data for editing
  const [isLoading, setIsLoading] = useState(isEditing);
  const [departements, setDepartements] = useState<string[]>([]);
  const watchedRegion = form.watch('region');
  const watchedPays = form.watch('pays');
  const watchedWeaponType = form.watch('weaponType');
  const isSpecialWeapon = SPECIAL_WEAPON_CODES.has(normalizeStr(watchedWeaponType || ''));
  // Etats pour les listes d'armes
  const [weaponTypes, setWeaponTypes] = useState<WeaponOption[]>([]);
  const [weaponBrands, setWeaponBrands] = useState<WeaponOption[]>([]);
  const [weaponCalibers, setWeaponCalibers] = useState<WeaponOption[]>([]);
  // Mapping code -> id pour le type sélectionné
  const [typeCodeToId, setTypeCodeToId] = useState<Record<string, string>>({});

  // Load departements data once, and initialize based on current region
  useEffect(() => {
    (async () => {
      try {
        const currentRegion = form.getValues('region');
        const map = departmentsByRegion as Record<string, { value: string; label: string }[]>;
        // Normalize the key to match departmentsByRegion keys (accents/case-insensitive)
        const keys = Object.keys(map);
        const rk = keys.find(k => normalizeStr(k) === normalizeStr(String(currentRegion || ''))) || String(currentRegion || '');
        const regionDeps = map[rk] || [];
        setDepartements(regionDeps.map((d) => d.value));
      } catch (e) {
        console.error('Failed to load departements', e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Helper: find weapon typeId by code with normalization fallback
  const findWeaponTypeId = (code?: string): string | undefined => {
    if (!code) return undefined;
    // 1) direct map
    if (typeCodeToId[code]) return typeCodeToId[code];
    // 2) try normalized comparison against available codes
    const wanted = normalizeStr(code);
    const entry = Object.keys(typeCodeToId).find(k => normalizeStr(k) === wanted);
    return entry ? typeCodeToId[entry] : undefined;
  };

  // Update departements when region changes
  useEffect(() => {
    (async () => {
      try {
        const map = departmentsByRegion as Record<string, { value: string; label: string }[]>;
        const wr = watchedRegion || "";
        const wrNorm = normalizeStr(String(wr));
        const key = Object.keys(map).find(k => normalizeStr(k) === wrNorm) || (watchedRegion || "");
        const regionDeps = map[key] || [];
        const depValues = regionDeps.map((d) => d.value);
        setDepartements(depValues);
        // Reset departement when region changes only if user actually modified region (not during initial load)
        const regionState = form.getFieldState('region');
        if (regionState.isDirty) {
          form.setValue('departement', '');
        } else if (isEditing) {
          // En mode édition, réconcilier la valeur du département avec les options disponibles
          const currentDept = form.getValues('departement');
          if (currentDept && depValues.length > 0) {
            const exactMatch = depValues.includes(currentDept);
            if (!exactMatch) {
              const wanted = normalizeStr(currentDept);
              const matched = depValues.find(d => normalizeStr(d) === wanted || normalizeStr(d).includes(wanted) || wanted.includes(normalizeStr(d)));
              if (matched) {
                form.setValue('departement', matched, { shouldValidate: true, shouldDirty: false });
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to update departements on region change', e);
      }
    })();
  }, [watchedRegion, form, isEditing]);

  // Mettre à jour automatiquement la nationalité quand le pays change
  useEffect(() => {
    if (watchedPays) {
      // Ne pas écraser la nationalité lors du chargement initial en mode édition
      const paysState = form.getFieldState('pays');
      if (paysState.isDirty) {
        const nat = getNationality(watchedPays) || watchedPays;
        form.setValue('nationality', nat, { shouldDirty: false, shouldValidate: true });
      }
    }
  }, [watchedPays, form]);

  // Charger les types d'armes au montage
  useEffect(() => {
    (async () => {
      try {
        const data = await apiRequest<WeaponOption[]>({ url: '/api/weapons/types', method: 'GET' });
        setWeaponTypes(data);
        const map: Record<string, string> = {};
        data.forEach(d => { if (d.code) map[d.code] = d.id; });
        setTypeCodeToId(map);

        // Si un type est déjà sélectionné (édition ou valeur par défaut), charger marques/calibres
        const currentTypeCode = form.getValues('weaponType');
        const typeId = currentTypeCode ? map[currentTypeCode] : undefined;
        if (typeId) {
          const [brands, calibers] = await Promise.all([
            apiRequest<WeaponOption[]>({ url: `/api/weapons/brands?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
            apiRequest<WeaponOption[]>({ url: `/api/weapons/calibers?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
          ]);
          setWeaponBrands(brands || []);
          setWeaponCalibers(calibers || []);
        }
      } catch (e) {
        console.error(e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lorsque le type d'arme change, recharger marques et calibres dépendants
  useEffect(() => {
    const subscription = form.watch(async (value, { name }) => {
      if (name === 'weaponType') {
        const selectedCode = value?.weaponType as string | undefined;
        const typeId = selectedCode ? typeCodeToId[selectedCode] : undefined;
        // Ne pas réinitialiser marque/calibre si on est en train de charger les données d'édition
        // (le form.reset déclenche ce watch, mais les valeurs seront réconciliées après)
        const isInitialLoad = isEditing && !form.getFieldState('weaponType').isDirty;
        if (!isInitialLoad) {
          form.setValue('weaponBrand', '');
          form.setValue('weaponCaliber', '');
        }
        setWeaponBrands([]);
        setWeaponCalibers([]);
        if (typeId) {
          try {
            const [brands, calibers] = await Promise.all([
              apiRequest<WeaponOption[]>({ url: `/api/weapons/brands?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
              apiRequest<WeaponOption[]>({ url: `/api/weapons/calibers?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
            ]);
            setWeaponBrands(brands || []);
            setWeaponCalibers(calibers || []);
          } catch (err) {
            console.error('Erreur chargement marques/calibres', err);
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, typeCodeToId, isEditing]);

  // Charger les données du chasseur pour l'édition
  useEffect(() => {
    if (isEditing && hunterId) {
      setIsLoading(true);
      // user association removed
      (async () => {
        try {
          const hunterData = await apiRequest<any>({ url: `/api/hunters/${hunterId}?includeDocuments=true`, method: 'GET' });
          // Format de la date pour l'input date
          const formattedDate = hunterData.dateOfBirth
            ? format(new Date(hunterData.dateOfBirth), "yyyy-MM-dd")
            : format(new Date(), "yyyy-MM-dd");

          // Préparer les données des documents
          const documentFields: Record<string, any> = {};

          // Si des documents existent, les ajouter au formulaire
          if (hunterData.documents) {
            hunterData.documents.forEach((doc: any) => {
              if (doc.documentType) {
                // Ajouter le document
                documentFields[doc.documentType] = doc.fileUrl || "";
                // Ajouter la date d'expiration si elle existe
                if (doc.expiryDate) {
                  documentFields[`${doc.documentType}ExpiryDate`] = format(new Date(doc.expiryDate), "yyyy-MM-dd");
                }
              }
            });
          }

          // Normaliser la région reçue pour correspondre aux clés de departmentsByRegion (sans accents, insensible à la casse)
          const incomingRegion = String(hunterData.region || "");
          const inNorm = normalizeStr(incomingRegion);
          const regionKey = Object.keys(departmentsByRegion).find(k => normalizeStr(k) === inNorm) || incomingRegion;

          // Normaliser la catégorie reçue vers les valeurs du Select
          const normalizeCategory = (c?: string) => {
            const v = (c || '').toString().trim().toLowerCase();
            if (['resident', 'résident'].includes(v)) return 'resident';
            if (['coutumier', 'coutumie', 'coutum'].includes(v)) return 'coutumier';
            if (['touristique', 'touriste'].includes(v)) return 'touristique';
            return v || 'resident';
          };

          // Conserver les valeurs brutes pour les réconcilier après chargement des options
          initialWeaponTypeRef.current = String(hunterData.weaponType || "");
          initialWeaponBrandRef.current = String(hunterData.weaponBrand || "");
          initialWeaponCaliberRef.current = String(hunterData.weaponCaliber || "");

          // weaponType peut être une valeur non-code tant que weaponTypes n'est pas chargé :
          // on l'écrit tel quel, puis on corrigera dès que weaponTypes sera disponible.
          const weaponTypeCodeForForm = initialWeaponTypeRef.current;

          // Trouver une valeur de département qui correspond aux options de la région sélectionnée
          let deptValueForForm = String(hunterData.departement || "");
          initialDepartementRef.current = deptValueForForm;
          try {
            const map = departmentsByRegion as Record<string, { value: string; label: string }[]>;
            // Utiliser une clé de région normalisée pour récupérer les départements
            const allKeys = Object.keys(map);
            const normalizedRegionKey = allKeys.find(k => normalizeStr(k) === normalizeStr(String(regionKey || ''))) || String(regionKey || '');
            const regionDeps = map[normalizedRegionKey] || [];
            if (deptValueForForm && regionDeps.length > 0) {
              const wantedDep = normalizeStr(deptValueForForm);
              const found = regionDeps.find(d => normalizeStr(d.value) === wantedDep || normalizeStr(d.label) === wantedDep);
              if (found) {
                deptValueForForm = found.value;
              } else {
                // Fallback: essayer de trouver par correspondance partielle
                const partial = regionDeps.find(d =>
                  normalizeStr(d.value).includes(wantedDep) ||
                  wantedDep.includes(normalizeStr(d.value)) ||
                  normalizeStr(d.label).includes(wantedDep) ||
                  wantedDep.includes(normalizeStr(d.label))
                );
                if (partial) deptValueForForm = partial.value;
              }
            }
          } catch {}

          form.reset({
            lastName: hunterData.lastName || "",
            firstName: hunterData.firstName || "",
            dateOfBirth: formattedDate,
            pays: hunterData.pays || "Sénégal",
            nationality: hunterData.nationality || getNationality(hunterData.pays) || "sénégalaise",
            idNumber: hunterData.idNumber || "",
            phone: hunterData.phone || "",
            address: hunterData.address || "",
            experience: hunterData.experience || 0,
            profession: hunterData.profession || "",
            category: normalizeCategory(hunterData.category) as any,
            // Écrire la région avec la clé normalisée utilisée pour trouver les départements
            region: (Object.keys(departmentsByRegion).find(k => normalizeStr(k) === normalizeStr(String(regionKey || ''))) || String(regionKey || "")) as any,
            // L'API renvoie 'departement'
            departement: deptValueForForm,
            // Données d'armes
            weaponType: weaponTypeCodeForForm,
            weaponBrand: hunterData.weaponBrand || "",
            weaponReference: hunterData.weaponReference || "",
            weaponCaliber: hunterData.weaponCaliber || "",
            weaponOtherDetails: hunterData.weaponOtherDetails || "",
            // Données des documents
            ...documentFields
          });
          // Préparer immédiatement la liste des départements pour afficher la valeur existante
          try {
            const map = departmentsByRegion as Record<string, { value: string; label: string }[]>;
            const keys2 = Object.keys(map);
            const rk2 = keys2.find(k => normalizeStr(k) === normalizeStr(String(regionKey || ''))) || String(regionKey || '');
            const regionDeps = map[rk2] || [];
            setDepartements(regionDeps.map((d) => d.value));
          } catch {}
          // Pré-charger marques/calibres si un type est présent
          const typeId = findWeaponTypeId(hunterData.weaponType);
          if (typeId) {
            try {
              const [brands, calibers] = await Promise.all([
                apiRequest<WeaponOption[]>({ url: `/api/weapons/brands?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
                apiRequest<WeaponOption[]>({ url: `/api/weapons/calibers?typeId=${encodeURIComponent(typeId)}`, method: 'GET' }),
              ]);
              setWeaponBrands(brands || []);
              setWeaponCalibers(calibers || []);

              // Corriger les valeurs de marque/calibre pour correspondre aux codes de la liste chargée
              const incomingBrand = String(hunterData.weaponBrand || '');
              if (incomingBrand && Array.isArray(brands) && brands.length > 0) {
                const wanted = normalizeStr(incomingBrand);
                const matchedBrand = brands.find(b =>
                  normalizeStr(b.code || '') === wanted ||
                  normalizeStr(b.label || '') === wanted
                );
                if (matchedBrand?.code) {
                  form.setValue('weaponBrand', matchedBrand.code, { shouldValidate: true, shouldDirty: false });
                }
              }
              const incomingCaliber = String(hunterData.weaponCaliber || '');
              if (incomingCaliber && Array.isArray(calibers) && calibers.length > 0) {
                const wanted = normalizeStr(incomingCaliber);
                const matchedCaliber = calibers.find(c =>
                  normalizeStr(c.code || '') === wanted ||
                  normalizeStr(c.label || '') === wanted
                );
                if (matchedCaliber?.code) {
                  form.setValue('weaponCaliber', matchedCaliber.code, { shouldValidate: true, shouldDirty: false });
                }
              }
            } catch (e) {
              console.error('Erreur de préchargement marques/calibres', e);
            }
          }
        } catch (error) {
          console.error("Erreur lors du chargement des données du chasseur:", error);
          toast({
            title: "Erreur",
            description: "Impossible de charger les informations du chasseur",
            variant: "destructive",
          });
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [hunterId, isEditing, form, toast]);

  // Réconcilier le type d'arme une fois que la liste des types est chargée
  useEffect(() => {
    if (!isEditing) return;
    const raw = (initialWeaponTypeRef.current || '').toString().trim();
    if (!raw) return;

    const current = (form.getValues('weaponType') || '').toString().trim();
    const hasOption = weaponTypes.some((t) => (t.code || '').toString().trim() === current);
    if (hasOption) return;

    const wanted = normalizeStr(raw);
    const matched = weaponTypes.find((t) => normalizeStr(t.code || '') === wanted || normalizeStr(t.label || '') === wanted);
    if (matched?.code) {
      form.setValue('weaponType', matched.code, { shouldValidate: true, shouldDirty: false });
    }
  }, [isEditing, weaponTypes, form]);

  // Réconcilier le département une fois que la liste des départements est chargée
  useEffect(() => {
    if (!isEditing) return;
    const raw = (initialDepartementRef.current || '').toString().trim();
    if (!raw) return;

    const current = (form.getValues('departement') || '').toString().trim();
    const hasOption = current && departements.includes(current);
    if (hasOption) return;

    const wanted = normalizeStr(raw);
    const matched = departements.find((d) => normalizeStr(d) === wanted || normalizeStr(d).includes(wanted) || wanted.includes(normalizeStr(d)));
    if (matched) {
      form.setValue('departement', matched, { shouldValidate: true, shouldDirty: false });
    }
  }, [isEditing, departements, form]);

  // Réconcilier la marque de l'arme une fois que la liste des marques est chargée
  useEffect(() => {
    if (!isEditing) return;
    const raw = (initialWeaponBrandRef.current || '').toString().trim();
    if (!raw || weaponBrands.length === 0) return;

    const current = (form.getValues('weaponBrand') || '').toString().trim();
    const hasOption = current && weaponBrands.some(b => (b.code || '').toString().trim() === current);
    if (hasOption) return;

    const wanted = normalizeStr(raw);
    const matched = weaponBrands.find(b => normalizeStr(b.code || '') === wanted || normalizeStr(b.label || '') === wanted);
    if (matched?.code) {
      form.setValue('weaponBrand', matched.code, { shouldValidate: true, shouldDirty: false });
    }
  }, [isEditing, weaponBrands, form]);

  // Réconcilier le calibre de l'arme une fois que la liste des calibres est chargée
  useEffect(() => {
    if (!isEditing) return;
    const raw = (initialWeaponCaliberRef.current || '').toString().trim();
    if (!raw || weaponCalibers.length === 0) return;

    const current = (form.getValues('weaponCaliber') || '').toString().trim();
    const hasOption = current && weaponCalibers.some(c => (c.code || '').toString().trim() === current);
    if (hasOption) return;

    const wanted = normalizeStr(raw);
    const matched = weaponCalibers.find(c => normalizeStr(c.code || '') === wanted || normalizeStr(c.label || '') === wanted);
    if (matched?.code) {
      form.setValue('weaponCaliber', matched.code, { shouldValidate: true, shouldDirty: false });
    }
  }, [isEditing, weaponCalibers, form]);

  // Fonction pour calculer l'âge et déterminer si le chasseur est mineur
  const calculateAge = (dateOfBirth: string): { age: number; isMinor: boolean } => {
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();

    // Calcul précis de l'âge
    const exactAge = age - (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? 1 : 0);

    return {
      age: exactAge,
      isMinor: exactAge < 18
    };
  };

  async function onSubmit(data: HunterFormData) {
    try {
      setIsSubmitting(true);
      const url = isEditing ? `/api/hunters/${hunterId}` : "/api/hunters";
      const method = isEditing ? "PUT" : "POST";

      // Extraire les champs de fichiers et de dates d'expiration
      const {
        // Extraire les champs de fichiers
        idCardDocument,
        weaponPermit,
        hunterPhoto,
        treasuryStamp,
        weaponReceipt,
        insurance,
        moralCertificate,
        // Extraire les champs de dates d'expiration
        idCardExpiryDate,
        weaponPermitExpiryDate,
        hunterPhotoExpiryDate,
        treasuryStampExpiryDate,
        weaponReceiptExpiryDate,
        insuranceExpiryDate,
        moralCertificateExpiryDate,
        // Le reste des données du chasseur
        ...hunterSpecificData
      } = data;

      // Préparer la liste des documents (fichiers sélectionnés côté client)
      const documents = [
        { name: 'idCardDocument', file: idCardDocument as File | undefined, expiryDate: idCardExpiryDate },
        { name: 'weaponPermit', file: weaponPermit as File | undefined, expiryDate: weaponPermitExpiryDate },
        { name: 'hunterPhoto', file: hunterPhoto as File | undefined, expiryDate: hunterPhotoExpiryDate },
        { name: 'treasuryStamp', file: treasuryStamp as File | undefined, expiryDate: treasuryStampExpiryDate },
        { name: 'weaponReceipt', file: weaponReceipt as File | undefined, expiryDate: weaponReceiptExpiryDate },
        { name: 'insurance', file: insurance as File | undefined, expiryDate: insuranceExpiryDate },
        { name: 'moralCertificate', file: moralCertificate as File | undefined, expiryDate: moralCertificateExpiryDate, optional: true },
      ];

      // Calculer automatiquement le statut mineur basé sur l'âge
      const { isMinor } = calculateAge(hunterSpecificData.dateOfBirth);

      // Construire le payload JSON pour la création/mise à jour du chasseur (sans fichiers)
      const { departement, ...rest } = hunterSpecificData as any;
      const payload: any = {
        ...rest,
        departement: departement || null,
        experience: Number(rest.experience),
        isMinor,
      };

      // Coercions pour garantir la persistance des modifications
      const wtCode = String(payload.weaponType || '').trim();
      const wtNorm = normalizeStr(wtCode);
      const isSpecial = SPECIAL_WEAPON_CODES.has(wtNorm);
      // Armes spéciales: rendre marque/calibre nuls (optionnels)
      if (isSpecial) {
        payload.weaponBrand = null;
        payload.weaponCaliber = null;
        if (typeof payload.weaponReference === 'string' && payload.weaponReference.trim() === '') {
          payload.weaponReference = null;
        }
      } else {
        // Non spécial: vider explicitement -> null pour forcer la mise à jour côté backend
        if (typeof payload.weaponBrand === 'string' && payload.weaponBrand.trim() === '') {
          payload.weaponBrand = null;
        }
        if (typeof payload.weaponCaliber === 'string' && payload.weaponCaliber.trim() === '') {
          payload.weaponCaliber = null;
        }
        if (typeof payload.weaponReference === 'string' && payload.weaponReference.trim() === '') {
          payload.weaponReference = null;
        }
      }

      // Appel JSON pour créer/mettre à jour le chasseur
      const createdOrUpdated = await apiRequest<any>({ url, method, data: payload });
      const targetHunterId = isEditing ? Number(hunterId) : Number(createdOrUpdated?.id);

      // Étape 2: uploader chaque document sélectionné (stockage BLOB) vers /api/attachments/:hunterId
      const requireExpiry = new Set<string>([
        'idCardDocument',
        'weaponPermit',
        'insurance',
        'weaponReceipt',
      ]);
      const uploads = documents
        .filter(d => d.file instanceof File)
        .map(async (d) => {
          if (requireExpiry.has(d.name) && (!d.expiryDate || String(d.expiryDate).trim() === '')) {
            throw new Error("La date d'expiration est obligatoire pour ce document");
          }
          const fd = new FormData();
          fd.append('file', d.file as File);
          fd.append('documentType', d.name);
          if (d.expiryDate && String(d.expiryDate).trim() !== '') {
            fd.append('expiryDate', String(d.expiryDate));
          }
          try {
            await apiRequest<void>({ url: `/api/attachments/${targetHunterId}`, method: 'POST', data: fd });
          } catch (err: any) {
            const msg = err?.body?.message || err?.message || 'Erreur upload document';
            throw new Error(msg || `Échec upload ${d.name}`);
          }
        });

      // Lancer tous les uploads en parallèle
      if (uploads.length) {
        await Promise.all(uploads);
      }

      // Invalider les caches des requêtes
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/hunters"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/stats"] }),
        // Invalider les clés utilisées par les hooks et composants: ['hunter', id] et ['/api/hunters', id]
        queryClient.invalidateQueries({ queryKey: ["hunter", targetHunterId] }),
        queryClient.invalidateQueries({ queryKey: ["/api/hunters", targetHunterId] }),
        queryClient.invalidateQueries({ queryKey: [`/api/attachments/${targetHunterId}`] }),
      ]);

      toast({
        title: isEditing ? "Chasseur mis à jour" : "Chasseur créé",
        description: uploads.length
          ? `${data.lastName} ${data.firstName} a été ${isEditing ? "mis à jour" : "ajouté"} et ${uploads.length} document(s) téléversé(s).`
          : `${data.lastName} ${data.firstName} a été ${isEditing ? "mis à jour" : "ajouté"}. Vous pourrez ajouter des documents plus tard.`,
        variant: "default",
      });

      onClose();
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du chasseur:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur inconnue est survenue",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90%] md:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center">
            {isEditing ? "Modifier un Chasseur" : "Ajouter un Chasseur"}
          </DialogTitle>
          <DialogDescription>
            {isEditing ? "Modifiez les informations du chasseur ci-dessous." : "Remplissez les informations ci-dessous pour ajouter un nouveau chasseur."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('firstName')}><Pencil className={`h-3 w-3 ${unlockedFields.has('firstName') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Prénom"
                        {...field}
                        className="font-bold"
                        disabled={isFieldLocked('firstName')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                          const capitalized = raw.charAt(0).toUpperCase() + raw.slice(1);
                          field.onChange(capitalized);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('lastName')}><Pencil className={`h-3 w-3 ${unlockedFields.has('lastName') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="NOM"
                        {...field}
                        className="uppercase font-bold"
                        disabled={isFieldLocked('lastName')}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '');
                          field.onChange(raw.toUpperCase());
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de Naissance * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('dateOfBirth')}><Pencil className={`h-3 w-3 ${unlockedFields.has('dateOfBirth') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <FormControl>
                      <Input type="date" max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]} disabled={isFieldLocked('dateOfBirth')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pays * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('pays')}><Pencil className={`h-3 w-3 ${unlockedFields.has('pays') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        // Mettre à jour automatiquement la nationalité quand le pays change
                        const nationality = getNationality(val) || '';
                        form.setValue('nationality', nationality, { shouldValidate: true });
                      }}
                      defaultValue={field.value}
                      disabled={isFieldLocked('pays')}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un pays" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countriesList.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">La nationalité sera déduite automatiquement.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="idNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Numéro de Pièce d'Identité ou de passeport * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('idNumber')}><Pencil className={`h-3 w-3 ${unlockedFields.has('idNumber') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Numéro de Pièce d'Identité ou de passeport"
                      {...field}
                      className="text-center font-bold"
                      disabled={isFieldLocked('idNumber')}
                      onChange={(e) => {
                        // Filtrer pour n'accepter que des caractères alphanumériques
                        const value = e.target.value.replace(/[^a-zA-Z0-9]/g, '');
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nationality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nationalité * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('nationality')}><Pencil className={`h-3 w-3 ${unlockedFields.has('nationality') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nationalité"
                      {...field}
                      readOnly
                      className="bg-gray-100 text-center font-bold capitalize max-w-[250px] mx-auto"
                      disabled={isFieldLocked('nationality')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Téléphone {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('phone')}><Pencil className={`h-3 w-3 ${unlockedFields.has('phone') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="XX XXX XX XX"
                      {...field}
                      className="text-center font-bold max-w-[200px] mx-auto"
                      disabled={isFieldLocked('phone')}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        // Format: XX XXX XX XX (groupes de 2, 3, 2, 2)
                        let formatted = '';
                        for (let i = 0; i < raw.length && i < 10; i++) {
                          if (i === 2 || i === 5 || i === 7) formatted += ' ';
                          formatted += raw[i];
                        }
                        field.onChange(formatted);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('address')}><Pencil className={`h-3 w-3 ${unlockedFields.has('address') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Adresse" disabled={isFieldLocked('address')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="experience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Années d'expérience de chasse * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('experience')}><Pencil className={`h-3 w-3 ${unlockedFields.has('experience') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" {...field} className="text-center font-bold max-w-[140px] mx-auto" disabled={isFieldLocked('experience')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profession"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profession * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('profession')}><Pencil className={`h-3 w-3 ${unlockedFields.has('profession') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Profession"
                      {...field}
                      className="capitalize text-center font-bold max-w-[250px] mx-auto"
                      disabled={isFieldLocked('profession')}
                      onChange={(e) => {
                        // Filtrer pour n'accepter que des lettres, espaces et tirets
                        let value = e.target.value.replace(/[^A-Za-z\u00C0-\u017F\s\-]/g, '');
                        // Première lettre en majuscule
                        if (value.length > 0) {
                          value = value.charAt(0).toUpperCase() + value.slice(1);
                        }
                        // Correction orthographique courante
                        const corrections: Record<string, string> = {
                          'fonctionnaire': 'Fonctionnaire',
                          'fonctionaire': 'Fonctionnaire',
                          'comercant': 'Commerçant',
                          'commercant': 'Commerçant',
                          'agriculteur': 'Agriculteur',
                          'enseignant': 'Enseignant',
                          'ensignant': 'Enseignant',
                          'etudiant': 'Étudiant',
                          'medecin': 'Médecin',
                          'infirmier': 'Infirmier',
                          'infirmiere': 'Infirmière',
                          'infirmièr': 'Infirmière',
                          'chauffeur': 'Chauffeur',
                          'chaufeur': 'Chauffeur',
                          'menuisier': 'Menuisier',
                          'pecheur': 'Pêcheur',
                          'eleveur': 'Éleveur',
                          'militaire': 'Militaire',
                          'retraite': 'Retraité',
                          'sans emploi': 'Sans emploi',
                          'sans-emploi': 'Sans emploi',
                          'comptable': 'Comptable',
                          'comptabl': 'Comptable',
                          'artisan': 'Artisan',
                          'artisant': 'Artisan',
                          'boutiquier': 'Boutiquier',
                          'boulanger': 'Boulanger',
                          'boulange': 'Boulanger',
                          'macon': 'Maçon',
                          'tailleur': 'Tailleur',
                          'coiffeur': 'Coiffeur',
                          'coifeur': 'Coiffeur',
                          'electricien': 'Électricien',
                          'plombier': 'Plombier',
                          'plomier': 'Plombier',
                        };
                        const lower = value.toLowerCase();
                        if (corrections[lower]) {
                          value = corrections[lower];
                        }
                        field.onChange(value);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Catégorie * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('category')}><Pencil className={`h-3 w-3 ${unlockedFields.has('category') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isFieldLocked('category')}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une catégorie" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="resident">Résident</SelectItem>
                      <SelectItem value="coutumier">Coutumier</SelectItem>
                      <SelectItem value="touristique">Touriste</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Région de résidence * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('region')}><Pencil className={`h-3 w-3 ${unlockedFields.has('region') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isFieldLocked('region')}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une région" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="dakar">DAKAR</SelectItem>
                        <SelectItem value="thies">THIÈS</SelectItem>
                        <SelectItem value="saint-louis">SAINT-LOUIS</SelectItem>
                        <SelectItem value="louga">LOUGA</SelectItem>
                        <SelectItem value="fatick">FATICK</SelectItem>
                        <SelectItem value="kaolack">KAOLACK</SelectItem>
                        <SelectItem value="kaffrine">KAFFRINE</SelectItem>
                        <SelectItem value="matam">MATAM</SelectItem>
                        <SelectItem value="tambacounda">TAMBACOUNDA</SelectItem>
                        <SelectItem value="kedougou">KÉDOUGOU</SelectItem>
                        <SelectItem value="kolda">KOLDA</SelectItem>
                        <SelectItem value="sedhiou">SÉDHIOU</SelectItem>
                        <SelectItem value="ziguinchor">ZIGUINCHOR</SelectItem>
                        <SelectItem value="diourbel">DIOURBEL</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="departement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Département * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('departement')}><Pencil className={`h-3 w-3 ${unlockedFields.has('departement') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isFieldLocked('departement') || !watchedRegion}
                    >
                      <FormControl>
                        <SelectTrigger disabled={isFieldLocked('departement') || !watchedRegion}>
                          <SelectValue placeholder={departements.length ? "Sélectionner un département" : (watchedRegion ? "Aucun département disponible" : "Sélectionner une région d'abord")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departements.map((dep) => (
                          <SelectItem key={dep} value={dep}>{dep.toUpperCase()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Section Informations sur l'Arme */}
            <div className="border-t pt-4 mt-6">
              <h3 className="text-lg font-semibold mb-4 text-green-700">Informations sur l'Arme</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="weaponType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type d'arme * {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('weaponType')}><Pencil className={`h-3 w-3 ${unlockedFields.has('weaponType') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value} disabled={isFieldLocked('weaponType')}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner le type d'arme" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {weaponTypes.length === 0 && (
                            <SelectItem value="_loading_" disabled>Chargement...</SelectItem>
                          )}
                          {weaponTypes.filter((t) => t.code && t.code.trim().length > 0).map((t) => (
                            <SelectItem key={t.id} value={t.code}>{t.label || t.code}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="weaponBrand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isSpecialWeapon ? "Marque de l'arme" : "Marque de l'arme *"} {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('weaponBrand')}><Pencil className={`h-3 w-3 ${unlockedFields.has('weaponBrand') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isFieldLocked('weaponBrand') || isSpecialWeapon || !form.getValues('weaponType') || weaponBrands.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isSpecialWeapon ? 'Optionnel pour ce type' : (form.getValues('weaponType') ? (weaponBrands.length ? 'Sélectionner une marque' : 'Aucune marque disponible') : 'Sélectionner le type d\'arme d\'abord')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {weaponBrands
                            .filter((b) => b.code && b.code.trim().length > 0)
                            .map((b) => (
                              <SelectItem key={b.id} value={b.code}>{b.label || b.code}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <FormField
                  control={form.control}
                  name="weaponCaliber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isSpecialWeapon ? "Calibre" : "Calibre *"} {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('weaponCaliber')}><Pencil className={`h-3 w-3 ${unlockedFields.has('weaponCaliber') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isFieldLocked('weaponCaliber') || isSpecialWeapon || !form.getValues('weaponType') || weaponCalibers.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={isSpecialWeapon ? 'Optionnel pour ce type' : (form.getValues('weaponType') ? (weaponCalibers.length ? 'Sélectionner un calibre' : 'Aucun calibre disponible') : 'Sélectionner le type d\'arme d\'abord')} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {weaponCalibers
                            .filter((c) => c.code && c.code.trim().length > 0)
                            .map((c) => (
                              <SelectItem key={c.id} value={c.code}>{c.label || c.code}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="weaponReference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isSpecialWeapon ? "Référence/Modèle" : "Référence/Modèle"} {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('weaponReference')}><Pencil className={`h-3 w-3 ${unlockedFields.has('weaponReference') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                      <FormControl>
                        <Input placeholder={isSpecialWeapon ? 'Optionnel pour ce type' : "Référence ou modèle de l'arme"} disabled={isSpecialWeapon || isFieldLocked('weaponReference')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="weaponOtherDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Autres détails sur l'arme {isEditing && <Button type="button" variant="ghost" size="sm" className="ml-1 h-5 w-5 p-0" onClick={() => toggleFieldLock('weaponOtherDetails')}><Pencil className={`h-3 w-3 ${unlockedFields.has('weaponOtherDetails') ? 'text-green-600' : 'text-gray-400'}`} /></Button>}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Détails supplémentaires sur l'arme"
                        className="resize-none"
                        disabled={isFieldLocked('weaponOtherDetails')}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Section Documents Justificatifs */}
            {!isEditing && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Documents Justificatifs</h3>
              <p className="text-sm text-muted-foreground">
                Téléchargez les documents requis. Les champs marqués d'un astérisque (*) sont obligatoires.
              </p>

              {/* Carte d'identité */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="idCardDocument"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Carte d'identité / Passeport *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Recto-verso en un seul document (PDF, JPG ou PNG)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('idCardDocument') && (
                    <div className="text-sm text-green-600">
                      Fichier sélectionné: {form.watch('idCardDocument').name || 'Document existant'}
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="idCardExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Permis de port d'arme */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="weaponPermit"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Permis de Port d'Arme *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('weaponPermit') && (
                    <div className="text-sm text-green-600">
                      Fichier sélectionné: {form.watch('weaponPermit').name || 'Document existant'}
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="weaponPermitExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Photo du chasseur */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="hunterPhoto"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Photo d'identité *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Photo récente, format portrait, fond neutre
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('hunterPhoto') && (
                    <div className="text-sm text-green-600">
                      Fichier sélectionné: {form.watch('hunterPhoto').name || 'Photo existante'}
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="hunterPhotoExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Timbre Impôt */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="treasuryStamp"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Timbre Impôt *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('treasuryStamp') && (
                    <div className="text-sm text-green-600">
                      Fichier sélectionné: {form.watch('treasuryStamp').name || 'Document existant'}
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="treasuryStampExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Quittance de l'arme par le Trésor */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="weaponReceipt"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Quittance de l'Arme par le Trésor *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {form.watch('weaponReceipt') && (
                    <div className="text-sm text-green-600">
                      Fichier sélectionné: {form.watch('weaponReceipt').name || 'Document existant'}
                    </div>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="weaponReceiptExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Assurance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg">
                <div className="space-y-2">
                  <FormField
                    control={form.control}
                    name="insurance"
                    render={({ field: { onChange, value, ...field } }) => (
                      <FormItem>
                        <FormLabel>Assurance *</FormLabel>
                        <FormControl>
                          <Input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                onChange(file);
                              }
                            }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="insuranceExpiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d'expiration</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          )}

            {/* user association field removed */}

            <DialogFooter className="mt-6">
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting || !form.formState.isValid || !form.formState.isDirty}>
                {isSubmitting ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
