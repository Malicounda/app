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
import { useToast } from "@/hooks/use-toast";
import { useHunters } from "@/lib/hooks/useHunters";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Hunter } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Types pour le statut des pièces jointes
type AttachmentItem = {
  type: string;
  present: boolean;
  status?: 'expired' | 'dueSoon' | 'valid' | 'missing';
  expiryDate?: string | null;
  daysLeft?: number;
  mime?: string;
  name?: string;
};

type AttachmentsStatusResponse = {
  updatedAt: string | null;
  items: AttachmentItem[];
};

// Custom types for permit categories and prices (from backend)
interface PermitCategory {
  id: string;          // we use category key as id (e.g., 'resident-petite')
  name: string;        // label to display
  price: number;       // price from permit_category_prices for active season
  durationYears: number; // optional fallback duration (computed from default_validity_days)
}

const permitFormSchema = z.object({
  permitNumber: z.string().min(3, { message: "Numéro de permis invalide" }),
  hunterId: z.coerce.number().min(1, { message: "Veuillez sélectionner un chasseur" }),
  categoryId: z.string().min(1, { message: "Veuillez sélectionner une catégorie" }),
  // issueDate est gérée automatiquement au moment de l'enregistrement
  issueDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Date d'émission invalide" }),
  price: z.coerce.number().min(1, { message: "Le prix doit être positif" }),
  // Reçus: format canonique 'NNNNNNN/NN LL' (espace entre les 2 chiffres et les 2 lettres)
  receiptNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{7}\/[0-9]{2} [A-Z]{2}$/u, {
      message: "Format attendu: 1234567/24 AB"
    })
    .refine(v => !/PLACEDOR/i.test(v), { message: "numéro invalide" }),
});

type PermitFormData = z.infer<typeof permitFormSchema>;

interface PermitFormProps {
  permitId?: number;
  open: boolean;
  onClose: () => void;
}

export default function PermitForm({ permitId, open, onClose }: PermitFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [seasonYear, setSeasonYear] = useState<string>("");
  const { allHunters: allHunters, huntersLoading, error: huntersError } = useHunters();
  // Lire le flag override national
  const { data: nationalOverride } = useQuery<{ enabled: boolean}>({
    queryKey: ["/api/settings/national-override"],
    queryFn: async () => apiRequest<{ enabled: boolean}>({ url: "/api/settings/national-override", method: "GET" }),
    refetchOnWindowFocus: false,
  });
  // Charger la liste nationale des chasseurs si override activé
  const { data: nationalHunters = [], isLoading: nationalHuntersLoading } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters/all", nationalOverride?.enabled],
    enabled: !!nationalOverride?.enabled,
    queryFn: async () => apiRequest<Hunter[]>({ url: "/api/hunters/all", method: "GET" }),
    refetchOnWindowFocus: false,
  });

  // État pour les chasseurs éligibles (avec demandes approuvées)
  const [eligibleHunters, setEligibleHunters] = useState<Hunter[]>([]);
  const [eligibleHuntersLoading, setEligibleHuntersLoading] = useState(false);
  // Statut des pièces jointes du chasseur sélectionné
  const [attachmentsStatus, setAttachmentsStatus] = useState<AttachmentsStatusResponse | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);

  // Source chasseurs selon contexte
  // Si override national activé: utiliser la liste nationale complète
  // Sinon: privilégier les éligibles, sinon la liste scoppée
  const hunters = nationalOverride?.enabled
    ? nationalHunters
    : (eligibleHunters.length > 0 ? eligibleHunters : allHunters);
  const isEditing = !!permitId;

  // État pour stocker la catégorie du chasseur
  const [hunterCategory, setHunterCategory] = useState<string>("");
  // État pour stocker les catégories de permis chargées depuis l'API
  const [permitCategories, setPermitCategories] = useState<PermitCategory[]>([]);
  // État pour stocker les catégories filtrées
  const [filteredCategories, setFilteredCategories] = useState<PermitCategory[]>([]);
  // Modal d'erreur bloquante
  const [errorModal, setErrorModal] = useState<{ open: boolean; title: string; description: string }>(
    { open: false, title: '', description: '' }
  );

  // Fonction pour générer un numéro de permis en utilisant la nouvelle API
  const generatePermitNumber = async (hunterId: number): Promise<string> => {
    try {
      // Utiliser l'API dédiée via apiRequest (gère auth + parsing JSON)
      const data = await apiRequest<{ permitNumber: string }>({
        url: '/api/permits/generate-number',
        method: 'POST',
      });

      if (!data || !data.permitNumber) {
        throw new Error("Échec de la génération du numéro de permis");
      }

      console.log('[PermitForm] Numéro de permis généré:', data.permitNumber);

      // Récupérer les informations du chasseur pour filtrer les catégories
      const selectedHunter = hunters.find(h => h.id === hunterId);
      if (selectedHunter && selectedHunter.category) {
        setHunterCategory(selectedHunter.category);
        filterPermitCategories(selectedHunter.category.toLowerCase());
      }

      return data.permitNumber;
    } catch (error) {
      console.error("Erreur dans generatePermitNumber:", error);
      // Générer un numéro de secours si l'API échoue
      const currentYear = new Date().getFullYear();
      const timestamp = Date.now().toString().slice(-6);
      const fallbackNumber = `P-SN-${currentYear}-FB${timestamp.slice(-3)}`;
      console.log('[PermitForm] Utilisation du numéro de secours:', fallbackNumber);
      return fallbackNumber;
    }
  };

  // Fonction pour filtrer les catégories de permis en fonction du type de chasseur
  const filterPermitCategories = (category: string) => {
    let filtered: PermitCategory[] = [];

    switch(category) {
      case "resident":
        // Un résident ne peut pas choisir un permis coutumier ou touriste
        filtered = permitCategories.filter((c: PermitCategory) =>
          c.id.includes("resident") &&
          !c.id.includes("coutumier") &&
          !c.id.includes("touriste")
        );
        break;
      case "coutumier":
        // Un chasseur coutumier ne peut choisir que le permis coutumier
        filtered = permitCategories.filter((c: PermitCategory) =>
          c.id.includes("coutumier")
        );
        break;
      case "touristique":
        // Un touriste ne peut choisir que les permis touristes
        filtered = permitCategories.filter((c: PermitCategory) =>
          c.id.includes("touriste")
        );
        break;
      default:
        // Par défaut, afficher toutes les catégories
        filtered = [...permitCategories];
    }

    setFilteredCategories(filtered);

    // Si la liste filtrée n'est pas vide, sélectionner par défaut la première option
    if (filtered.length > 0) {
      form.setValue("categoryId", filtered[0].id);
      form.setValue("price", filtered[0].price);
    }
  };

  // Déterminer le groupe de catégorie (résident, coutumier, touriste)
  const getCategoryGroup = (categoryId: string): 'resident' | 'coutumier' | 'touriste' | 'autre' => {
    const c = (categoryId || '').toLowerCase();
    if (c.includes('resident')) return 'resident';
    if (c.includes('coutumier')) return 'coutumier';
    if (c.includes('touriste') || c.includes('touristique')) return 'touriste';
    return 'autre';
  };

  const form = useForm<PermitFormData>({
    resolver: zodResolver(permitFormSchema),
    mode: "onChange",
    defaultValues: {
      permitNumber: "",
      hunterId: 0,
      categoryId: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      price: 0,
      receiptNumber: "",
    },
  });

  useEffect(() => {
    // Récupérer les chasseurs éligibles au chargement du composant
    const fetchEligibleHunters = async () => {
      setEligibleHuntersLoading(true);
      try {
        const data = await apiRequest<Hunter[]>({ url: '/api/hunters/eligible-for-permit', method: 'GET' });
        setEligibleHunters(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Erreur lors de la récupération des chasseurs éligibles:', error);
      } finally {
        setEligibleHuntersLoading(false);
      }
    };

    if (open) {
      fetchEligibleHunters();
    }
  }, [open]);

  useEffect(() => {
    const initPermitNumber = async () => {
      try {
        const hunterId = form.getValues("hunterId");
        if (hunterId) {
          const number = await generatePermitNumber(hunterId);
          form.setValue("permitNumber", number);
        }
      } catch (error) {
        console.error("Error generating permit number:", error);
        toast({
          title: "Erreur",
          description: "Impossible de générer le numéro de permis",
          variant: "destructive",
        });
      }
    };

    if (!isEditing) {
      initPermitNumber();
    }

    // Charger dynamiquement les catégories de permis et leurs prix pour la saison active
    const fetchPermitCategories = async () => {
      try {
        // 1) Récupérer la campagne afin de connaître l'année de saison
        const campaign = await apiRequest<any>({ url: '/api/settings/campaign', method: 'GET' });
        const startYear = campaign?.startDate ? new Date(campaign.startDate).getFullYear() : new Date().getFullYear();
        const endYear = campaign?.endDate ? new Date(campaign.endDate).getFullYear() : new Date().getFullYear();
        const seasonYear = `${startYear}-${endYear}`;
        setSeasonYear(seasonYear);

        // 2) Charger les catégories actives avec les prix de la saison
        const cats = await apiRequest<any[]>({ url: `/api/permit-categories?activeOnly=true&season=${encodeURIComponent(seasonYear)}`, method: 'GET' });
        let mapped: PermitCategory[] = (Array.isArray(cats) ? cats : []).map((c: any) => ({
          id: String(c.key),
          name: String(c.labelFr + (c.sousCategorie ? ` (${c.sousCategorie})` : '')),
          price: Number(c.priceXof || 0),
          durationYears: c.defaultValidityDays ? Number(c.defaultValidityDays) / 365 : 0,
        }));

        // Backfill: si certains prix sont nuls car non définis pour la saison, récupérer les derniers prix actifs (sans filtre saison)
        if (mapped.some(m => !m.price || m.price <= 0)) {
          const latest = await apiRequest<any[]>({ url: `/api/permit-categories?activeOnly=true`, method: 'GET' });
          const latestMap = new Map<string, number>((Array.isArray(latest) ? latest : []).map((c: any) => [String(c.key), Number(c.priceXof || 0)]));
          mapped = mapped.map(m => (m.price && m.price > 0) ? m : { ...m, price: latestMap.get(m.id) || 0 });
        }

        // Ordonner par groupe/genre/ordre d'affichage côté backend déjà, ici juste set
        setPermitCategories(mapped);
        setFilteredCategories(mapped);

        // Initialiser catégorie/prix par défaut si nécessaire
        if (mapped.length > 0) {
          if (!form.getValues('categoryId')) {
            form.setValue('categoryId', mapped[0].id);
            form.setValue('price', mapped[0].price);
          } else {
            const current = mapped.find(m => m.id === form.getValues('categoryId'));
            if (current) form.setValue('price', current.price);
          }
        }
      } catch (error) {
        console.error('[PermitForm] Erreur chargement catégories dynamiques:', error);
        toast({
          title: 'Erreur',
          description: "Impossible de charger les catégories et tarifs de permis.",
          variant: 'destructive',
        });
      }
    };

    // Charger les catégories/ tarifs dynamiques
    fetchPermitCategories();

    // Gérer les erreurs de chargement des chasseurs
    if (huntersError) {
      toast({
        title: "Erreur",
        description: "Impossible de charger la liste des chasseurs",
        variant: "destructive",
      });
    }
  }, [toast]);

  // Charger le statut des documents quand le chasseur change
  useEffect(() => {
    const loadAttachments = async () => {
      const hunterId = form.getValues("hunterId");
      if (!hunterId || hunterId <= 0) {
        setAttachmentsStatus(null);
        return;
      }
      setAttachmentsLoading(true);
      try {
        const data = await apiRequest<AttachmentsStatusResponse>({ url: `/api/attachments/${hunterId}`, method: 'GET' });
        setAttachmentsStatus(data || null);
      } catch (e) {
        console.error('Erreur chargement pièces jointes:', e);
        setAttachmentsStatus(null);
      } finally {
        setAttachmentsLoading(false);
      }
    };
    loadAttachments();
  }, [form.watch("hunterId")]);

  // Rendu d'un badge statut
  const renderStatusBadge = (item: AttachmentItem) => {
    const status = item.status ?? (item.present ? 'valid' : 'missing');
    const cls =
      status === 'expired' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
      status === 'dueSoon' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
      status === 'valid' ? 'bg-green-100 text-green-800 border border-green-200' :
      'bg-gray-100 text-gray-700 border border-gray-200';

    const labelMap: Record<string, string> = {
      idCardDocument: "Pièce d'identité",
      weaponPermit: "Permis de Port d'Arme",
      hunterPhoto: "Photo du Chasseur",
      treasuryStamp: "Timbre Impôt",
      weaponReceipt: "Quittance Trésor (Arme)",
      insurance: "Assurance",
      moralCertificate: "Bonne Vie et Mœurs",
    };

    const statusText =
      status === 'expired' ? 'Expiré' :
      status === 'dueSoon' ? 'À mettre à jour' :
      status === 'valid' ? 'Fourni' :
      'Manquant';

    const tooltip = item.type === 'treasuryStamp' && item.expiryDate
      ? `${statusText} - Expire le ${item.expiryDate}${status === 'dueSoon' && item.daysLeft !== undefined ? ` (${item.daysLeft} j)` : ''}`
      : statusText;

    return (
      <span
        key={item.type}
        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${cls}`}
        title={tooltip}
      >
        {labelMap[item.type] || item.type}: {statusText}
      </span>
    );
  };


  // Handle category change to update price automatically
  const handleCategoryChange = (categoryId: string) => {
    const category = permitCategories.find((c: PermitCategory) => c.id === categoryId);
    if (category) {
      form.setValue("price", category.price || 0);
      // Not computing expiry here; backend will compute using category rules
    }
  };

  async function onSubmit(data: PermitFormData) {
    setIsSubmitting(true);
    try {
      // Valider les données requises
      if (!data.hunterId || !data.categoryId) {
        throw new Error("Veuillez remplir tous les champs obligatoires");
      }

      // S'assurer que le numéro de permis est défini
      if (!data.permitNumber || data.permitNumber.trim() === "") {
        // Générer un numéro de permis si non défini
        try {
          const generatedNumber = await generatePermitNumber(data.hunterId);
          form.setValue("permitNumber", generatedNumber);
          data.permitNumber = generatedNumber;
        } catch (error) {
          throw new Error("Impossible de générer le numéro de permis");
        }
      }

      // Find the selected category
      const category = permitCategories.find((c: PermitCategory) => c.id === data.categoryId);
      if (!category) {
        throw new Error("Catégorie de permis invalide");
      }

      // Vérifier si le chasseur existe dans la liste chargée
      const selectedHunter = hunters.find(h => h.id === data.hunterId);
      if (!selectedHunter) {
        throw new Error("Chasseur non trouvé dans la liste");
      }

      console.log('[PermitForm] Chasseur sélectionné:', selectedHunter);

      // Vérifier les documents obligatoires du chasseur avant création
      // Requis: Pièce d'identité, Permis de Port d'Arme, Photo du Chasseur, Timbre Impôt, Quittance Trésor (Arme), Assurance
      const requiredTypes = [
        'idCardDocument',
        'weaponPermit',
        'hunterPhoto',
        'treasuryStamp',
        'weaponReceipt',
        'insurance',
      ];
      // Considérer manquant si absent ou status "missing" ou "expired"
      const missingOrInvalid: AttachmentItem[] = (attachmentsStatus?.items || []).filter(it => {
        if (!it) return true;
        if (!requiredTypes.includes(it.type)) return false;
        const st = it.status ?? (it.present ? 'valid' : 'missing');
        return !it.present || st === 'missing' || st === 'expired';
      });
      const missingRequired = requiredTypes.filter(rt => !(attachmentsStatus?.items || []).some(it => it?.type === rt && it.present && (it.status ?? 'valid') === 'valid'));
      if (!attachmentsStatus || missingOrInvalid.length > 0 || missingRequired.length > 0) {
        // Construire un message récapitulatif lisible (optionnel)
        const labelMap: Record<string, string> = {
          idCardDocument: "Pièce d'identité",
          weaponPermit: "Permis de Port d'Arme",
          hunterPhoto: "Photo du Chasseur",
          treasuryStamp: "Timbre Impôt",
          weaponReceipt: "Quittance Trésor (Arme)",
          insurance: "Assurance",
          moralCertificate: "Bonne Vie et Mœurs",
        };
        const details = (missingRequired.length > 0 ? missingRequired : missingOrInvalid.map(it => it.type))
          .map(t => labelMap[t] || t)
          .join(', ');
        setErrorModal({
          open: true,
          title: 'Création du permis refusée',
          // Message demandé par l'utilisateur
          description: `Données chasseur obligatoire manques${details ? `: ${details}` : ''}`,
        });
        return; // Bloquer la soumission
      }

      // Vérification préalable: unicité par catégorie
      try {
        const existingPermits = await apiRequest<any[]>({ url: `/api/permits/hunter/${data.hunterId}`, method: 'GET' });
        const nowIso = new Date().toISOString().slice(0,10);
        const targetGroup = getCategoryGroup(data.categoryId);
        const isGibierEau = data.categoryId.toLowerCase().includes('gibier-eau');

        // Conflit pour gibier d'eau: interdire 2 permis gibier d'eau actifs simultanés
        if (isGibierEau) {
          const waterfowlConflict = (existingPermits || []).some((p: any) => {
            const status = (p.status || '').toLowerCase();
            const expiry = String(p.expiryDate || p.expiry_date || '');
            const catId = String(p.categoryId || p.category_id || '').toLowerCase();
            return status === 'active' && expiry >= nowIso && catId.includes('gibier-eau');
          });
          if (waterfowlConflict) {
            setErrorModal({
              open: true,
              title: "Gibier d'Eau déjà actif",
              description: "Ce chasseur détient déjà un permis de Gibier d'Eau actif non épuisé. Attendez son expiration et qu'il atteigne deux renouvellements, ou suspendez-le avant d'en créer un autre.",
            });
            return; // Bloquer la soumission
          }
        }

        // Conflit pour les grandes familles (resident/coutumier/touriste) hors gibier d'eau
        const conflict = (existingPermits || []).some((p: any) => {
          const status = (p.status || '').toLowerCase();
          const expiry = String(p.expiryDate || p.expiry_date || '');
          const catId = String(p.categoryId || p.category_id || '');
          const sameGroup = getCategoryGroup(catId) === targetGroup && targetGroup !== 'autre';
          const isExistingWaterfowl = catId.toLowerCase().includes('gibier-eau');
          // Ignorer les permis gibier d'eau dans la vérification de groupe
          return status === 'active' && expiry >= nowIso && sameGroup && !isExistingWaterfowl && !isGibierEau;
        });
        if (conflict) {
          setErrorModal({
            open: true,
            title: 'Conflit de catégorie',
            description: "Ce chasseur a déjà un permis actif dans cette grande catégorie (résident / coutumier / touriste). Attendez l'expiration ou suspendez le permis existant.",
          });
          return; // Bloquer la soumission
        }
      } catch (e) {
        // Si l'appel échoue, ne pas bloquer mais logger
        console.warn(`[PermitForm] Vérification d'unicité par catégorie échouée: ${e}`);
      }

      // Date d'émission automatique: date actuelle
      const now = new Date();
      const issueDate = now;
      form.setValue("issueDate", format(issueDate, 'yyyy-MM-dd'));

      // L'expiration est calculée côté backend selon la catégorie + périodes/campagne

      // Préparer les valeurs pour type basé sur la catégorie
      let permitType = "petite-chasse";
      if (category.id.includes('grande')) {
        permitType = "grande-chasse";
      } else if (category.id.includes('gibier-eau')) {
        permitType = "gibier-eau";
      } else if (category.id.includes('petite')) {
        permitType = "petite-chasse";
      }

      // Prepare data for API - We should match exactly what the server schema expects
      const permitData = {
        permitNumber: data.permitNumber,
        hunterId: parseInt(data.hunterId.toString()),
        issueDate: format(issueDate, 'yyyy-MM-dd'),
        status: "active",
        price: parseFloat(data.price.toString()),
        type: permitType,
        categoryId: category.id, // Utilise la key de la catégorie (ex: resident-petite)
        area: "Sénégal", // Valeur par défaut
        // Numéro de quittance saisi par l'agent
        receiptNumber: data.receiptNumber,
        weapons: category.id.includes('grande-chasse') ? "Carabine" : "Fusil",
      };

      // Log pour debug
      console.log("Envoi des données du permis:", permitData);

      const endpoint = isEditing ? `/api/permits/${permitId}` : "/api/permits";
      const method = isEditing ? "PUT" : "POST";

      // Log the data being sent to the API
      console.log("Sending permit data:", permitData);

      try {
        const result = await apiRequest<any>({ url: endpoint, method, data: permitData });
        console.log("Réponse API réussie:", result);

        // Invalidate queries directement ici
        await queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/stats"] });

        toast({
          title: isEditing ? "Permis mis à jour" : "Permis créé",
          description: `Le permis ${data.permitNumber} a été ${isEditing ? "mis à jour" : "créé"} avec succès.`,
          variant: "default",
        });

        onClose();
      } catch (error: any) {
        console.error("Erreur lors de l'envoi de la requête:", error);
        const serverMessage = error?.response?.data?.message || error?.message || "Une erreur est survenue";
        // Afficher le message clair du serveur dans une boîte de dialogue
        setErrorModal({
          open: true,
          title: "Création du permis refusée",
          description: serverMessage,
        });
        return; // Stopper ici pour éviter le toast générique de l'outer catch
      }
    } catch (error) {
      console.error("Error saving permit:", error);
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur est survenue lors de l'enregistrement du permis",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90%] md:max-w-[560px] max-h-[90vh] overflow-hidden no-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center">
            {isEditing ? "Modifier un Permis" : "Ajouter un Permis"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isEditing ? "Modifiez les informations du permis de chasse" : "Créez un nouveau permis de chasse pour un chasseur"}
            {seasonYear ? (
              <>
                <br />
                — Saison appliquée: {seasonYear}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto no-scrollbar max-h-[calc(90vh-140px)]">
        {huntersLoading || eligibleHuntersLoading ? (
          <div className="py-4 text-center">Chargement des données...</div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="hunterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sélection du chasseur</FormLabel>
                    <Select
                      onValueChange={async (value) => {
                        const hunterId = parseInt(value);
                        field.onChange(hunterId);

                        // Chercher le chasseur pour déterminer son type (résident, coutumier, etc.)
                        const selectedHunter = hunters.find(h => h.id === hunterId);
                        if (selectedHunter) {
                          // Filtrer les catégories de permis en fonction du type de chasseur
                          // On utilise la catégorie du chasseur (category) pour déterminer le type
                          filterPermitCategories(selectedHunter.category.toLowerCase());
                        }

                        // Générer automatiquement le numéro de permis lors de la sélection du chasseur
                        if (hunterId && !isEditing) {
                          try {
                            const permitNumber = await generatePermitNumber(hunterId);
                            form.setValue("permitNumber", permitNumber);
                          } catch (error) {
                            console.error("Erreur de génération du numéro de permis:", error);
                            toast({
                              title: "Erreur",
                              description: "Impossible de générer le numéro de permis",
                              variant: "destructive",
                            });
                          }
                        }
                        // Charger le statut des pièces jointes du chasseur sélectionné
                        try {
                          setAttachmentsLoading(true);
                          const data = await apiRequest<AttachmentsStatusResponse>({ url: `/api/attachments/${hunterId}`, method: 'GET' });
                          setAttachmentsStatus(data || null);
                        } catch (e) {
                          console.error('Erreur chargement pièces jointes:', e);
                          setAttachmentsStatus(null);
                        } finally {
                          setAttachmentsLoading(false);
                        }
                      }}
                      value={field.value > 0 ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ou sélectionner dans la liste complète" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hunters && hunters.length > 0 ? (
                          hunters.map((hunter) => (
                            <SelectItem key={hunter.id} value={hunter.id.toString()}>
                              {hunter.firstName} {hunter.lastName} - {hunter.idNumber}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            Aucun chasseur éligible. Validez une demande dans "Réception des Demandes de Permis".
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="permitNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numéro de Permis</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        readOnly={!isEditing}
                        aria-readonly={!isEditing}
                        placeholder="Auto-généré après sélection du chasseur"
                        className={`${!isEditing ? "bg-gray-100 text-gray-600 placeholder:text-gray-400 cursor-not-allowed" : ""} text-center font-bold text-lg md:text-xl`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Statut des pièces jointes du chasseur */}
              <div className="space-y-2 min-h-[84px]">
                <div className="text-sm font-medium">Documents du chasseur</div>
                {attachmentsLoading ? (
                  <div className="text-sm text-muted-foreground">Chargement des documents...</div>
                ) : attachmentsStatus && attachmentsStatus.items?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {attachmentsStatus.items
                      .filter(it => !!it)
                      .map((it) => renderStatusBadge(it))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Aucun document trouvé.</div>
                )}
              </div>

              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type de Permis</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                        handleCategoryChange(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un type de permis" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredCategories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prix (FCFA)</FormLabel>
                    <FormControl>
                      {(() => {
                        const n = Number(field.value || 0);
                        const formatted = Number.isFinite(n)
                          ? new Intl.NumberFormat('fr-FR').format(n)
                          : '';
                        return (
                      <Input
                        type="text"
                        readOnly
                        aria-readonly
                        value={formatted}
                        className="bg-gray-100 text-gray-600 placeholder:text-gray-400 cursor-not-allowed text-center font-bold text-lg md:text-xl"
                      />
                        );
                      })()}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="receiptNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numéro de quittance</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 select-none">N°</span>
                        <Input
                          type="text"
                          {...field}
                          placeholder="Exemple: 1234567/24 AB"
                          required
                          className="bg-yellow-50 border-yellow-200 focus:border-yellow-300 tracking-wider font-bold text-lg md:text-xl placeholder:font-normal placeholder:text-sm md:placeholder:text-base text-center"
                          onPaste={(e) => {
                            e.preventDefault();
                          }}
                          onChange={(e) => {
                            let raw = e.target.value.toUpperCase();
                            // Autoriser chiffres, lettres, '/', ' ', '.'
                            raw = raw.replace(/[^0-9A-Z\/. ]/g, '');
                            // Supprimer les points, les multiples espaces
                            raw = raw.replace(/[.]/g, '');
                            raw = raw.replace(/\s+/g, ' ');
                            // Construire format canonique NNNNNNN/NN LL
                            const only = raw.replace(/[^0-9A-Z]/g, '');
                            let digits = only.replace(/[^0-9]/g, '');
                            let letters = only.replace(/[^A-Z]/g, '');
                            digits = digits.slice(0, 9); // max 9 chiffres (7 + 2)
                            letters = letters.slice(0, 2);
                            let formatted = '';
                            const first7 = digits.slice(0, 7);
                            formatted += first7;
                            if (first7.length === 7) {
                              formatted += '/';
                              const next2 = digits.slice(7, 9);
                              formatted += next2;
                              if (next2.length === 2) {
                                formatted += ' ';
                                formatted += letters;
                              }
                            }
                            field.onChange(formatted);
                          }}
                          autoComplete="off"
                        />
                        <span className="animate-pulse text-amber-600 select-none">|</span>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting || !form.formState.isValid}>
                  {isSubmitting ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
        </div>
      </DialogContent>
    </Dialog>
    {/* Boîte de dialogue d'erreur bloquante */}
    <Dialog open={errorModal.open} onOpenChange={(val) => setErrorModal(prev => ({ ...prev, open: val }))}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{errorModal.title || 'Information'}</DialogTitle>
          <DialogDescription>{errorModal.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => setErrorModal({ open: false, title: '', description: '' })}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
