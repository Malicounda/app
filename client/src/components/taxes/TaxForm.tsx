  import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Hunter, Permit } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

// Define animal types and prices
interface AnimalType {
  id: string;
  name: string;
  price: number;
  code?: string;
  speciesId?: number;
}

// Liste désormais alimentée uniquement par l'API /api/settings/hunting-taxes

const taxFormSchema = z.object({
  taxNumber: z.string().min(3, { message: "Numéro de taxe invalide" }),
  hunterId: z.coerce.number().min(1, { message: "Veuillez sélectionner un chasseur" }),
  permitId: z.coerce.number().min(1, { message: "Veuillez sélectionner un permis" }),
  animalTypeId: z.string().min(1, { message: "Veuillez sélectionner un type d'animal" }),
  quantity: z.coerce.number().min(1, { message: "La quantité doit être d'au moins 1" }),
  // Format canonique avec espace: 1234567/24 AB
  receiptNumber: z
    .string()
    .trim()
    .regex(/^[0-9]{7}\/[0-9]{2} [A-Z]{2}$/u, { message: "Format attendu: 1234567/24 AB" })
    .refine(v => !/PLACEDOR/i.test(v), { message: "numéro invalide" }),
  issueDate: z.string().refine(val => !isNaN(Date.parse(val)), { message: "Date d'émission invalide" }),
  amount: z.coerce.number().min(1, { message: "Le montant doit être positif" }),
});

type TaxFormData = z.infer<typeof taxFormSchema>;

interface TaxFormProps {
  taxId?: number;
  open: boolean;
  onClose: () => void;
}

export default function TaxForm({ taxId, open, onClose }: TaxFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hunters, setHunters] = useState<Hunter[]>([]);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);
  const [animalTypes, setAnimalTypes] = useState<AnimalType[]>([]);
  const [loading, setLoading] = useState(true);
  const isEditing = !!taxId;
  const [loadedTaxAnimalName, setLoadedTaxAnimalName] = useState<string | null>(null);

  // Lire le flag override national et la liste nationale si activée
  const { data: nationalOverride } = useQuery<{ enabled: boolean}>({
    queryKey: ["/api/settings/national-override"],
    queryFn: async () => apiRequest<{ enabled: boolean}>({ url: "/api/settings/national-override", method: "GET" }),
    refetchOnWindowFocus: false,
  });
  const { data: nationalHunters = [], isLoading: nationalHuntersLoading } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters/all", nationalOverride?.enabled],
    enabled: !!nationalOverride?.enabled,
    queryFn: async () => apiRequest<Hunter[]>({ url: "/api/hunters/all", method: "GET" }),
    refetchOnWindowFocus: false,
  });

  const form = useForm<TaxFormData>({
    resolver: zodResolver(taxFormSchema),
    mode: "onChange",
    defaultValues: {
      taxNumber: generateTaxNumber(),
      hunterId: 0,
      permitId: 0,
      animalTypeId: "",
      quantity: 1,
      receiptNumber: "",
      issueDate: format(new Date(), "yyyy-MM-dd"),
      amount: 0,
    },
  });

  // Watch for changes to quantity and animal type
  const quantity = form.watch("quantity");
  const animalTypeId = form.watch("animalTypeId");
  const hunterId = form.watch("hunterId");
  const watchedPermitId = form.watch("permitId");

  // Charger la campagne en cours (période d'ouverture/fermeture)
  const { data: campaign } = useQuery<{ startDate: string; endDate: string; isActive?: boolean; id?: number; year?: string; periods?: any[] }>({
    queryKey: ["/api/settings/campaign"],
    queryFn: async () => apiRequest<any>({ url: "/api/settings/campaign", method: "GET" }),
    refetchOnWindowFocus: false,
  });
  const campaignStart = useMemo(() => {
    const s = (campaign as any)?.startDate;
    return s ? new Date(s) : null;
  }, [campaign]);
  const campaignEnd = useMemo(() => {
    const e = (campaign as any)?.endDate;
    return e ? new Date(e) : null;
  }, [campaign]);

  // Déterminer si le permis sélectionné bloque l'association d'une taxe
  const isPermitBlocked = useMemo(() => {
    if (!selectedPermit) return false;
    const renewalsLen = Array.isArray((selectedPermit as any)?.metadata?.renewals)
      ? (selectedPermit as any).metadata.renewals.length
      : 0;
    const isExpired = new Date(selectedPermit.expiryDate) < new Date();
    return renewalsLen >= 2 && isExpired;
  }, [selectedPermit]);

  // Règles métier UI
  const normalize = (s: string) => s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9]/g, '');
  const isWaterfowlPermit = (p: any | null) => {
    if (!p) return false;
    const t = normalize(String((p as any).type || ''));
    const c = normalize(String((p as any).categoryId || ''));
    return t === 'gibierdeau' || c.includes('gibierdeau');
  };
  const isPetiteChassePermit = (p: any | null) => {
    if (!p) return false;
    const t = normalize(String((p as any).type || ''));
    const c = normalize(String((p as any).categoryId || ''));
    return t === 'petitechasse' || c.includes('petitechasse');
  };
  const filteredAnimalTypes = useMemo(() => {
    // PRIORITÉ ABSOLUE: Gibier d'Eau = aucun animal autorisé
    if (isWaterfowlPermit(selectedPermit)) {
      return [] as AnimalType[];
    }
    // Seulement après avoir exclu Gibier d'Eau, vérifier Petite Chasse
    if (isPetiteChassePermit(selectedPermit)) {
      return animalTypes.filter(a => a.name.toLowerCase().includes('phacoch'));
    }
    return animalTypes;
  }, [animalTypes, selectedPermit]);

  // Si un permis Gibier d'Eau est sélectionné, vider immédiatement le type d'animal
  useEffect(() => {
    if (isWaterfowlPermit(selectedPermit)) {
      const current = form.getValues('animalTypeId');
      if (current) {
        form.setValue('animalTypeId', '');
      }
    }
  }, [selectedPermit]);

  useEffect(() => {
    // Update amount when quantity or animal type changes
    if (animalTypeId) {
      const animalType = animalTypes.find(a => a.id === animalTypeId);
      if (animalType) {
        const amount = animalType.price * quantity;
        form.setValue("amount", amount);
      }
    }
  }, [quantity, animalTypeId, form]);

  // Charger la liste dynamique depuis l'API des taxes d'abattage (source de vérité de l'onglet)
  useEffect(() => {
    const fetchHuntingTaxes = async () => {
      try {
        const resp = await apiRequest<any>({ url: "/api/settings/hunting-taxes", method: "GET" });
        const rows = (resp && typeof resp === 'object' && 'data' in resp) ? (resp as any).data : resp;
        if (Array.isArray(rows) && rows.length > 0) {
          const mapped: AnimalType[] = rows.map((row: any) => ({
            id: String(row.espece_id),
            name: String(row.espece_nom || ''),
            price: Number(row.prix_xof || 0),
            code: undefined,
            speciesId: Number(row.espece_id),
          }));
          setAnimalTypes(mapped);
        } else {
          // fallback si la route ne renvoie rien: liste vide
          setAnimalTypes([]);
          toast({ title: 'Info', description: 'Aucune espèce taxable disponible pour le moment.', variant: 'default' });
        }
      } catch (error) {
        console.error("Error fetching hunting taxes:", error);
        // fallback: liste vide, informer discrètement
        setAnimalTypes([]);
        toast({ title: 'Info', description: 'Impossible de charger les taxes d\'abattage. Réessayez plus tard.', variant: 'default' });
      }
    };
    fetchHuntingTaxes();
  }, []);

  // Charger les détails d'une taxe en mode édition et pré-remplir
  useEffect(() => {
    const fetchTaxForEdit = async () => {
      if (!isEditing || !taxId || !open) return;
      try {
        const resp = await apiRequest<any>({ url: `/api/taxes/${taxId}`, method: "GET" });
        const t = (resp && (resp as any).data) ? (resp as any).data : resp;
        if (t && typeof t === 'object') {
          // Pré-remplir champs de base
          form.setValue('taxNumber', String(t.taxNumber || ''));
          form.setValue('hunterId', Number(t.hunterId || 0));
          // Ne pas permettre de changer permitId en PUT, mais pré-remplir pour cohérence UI
          form.setValue('permitId', Number(t.permitId || 0));
          form.setValue('quantity', Number(t.quantity || 1));
          form.setValue('receiptNumber', String(t.receiptNumber || ''));
          const dt = t.issueDate ? new Date(t.issueDate) : new Date();
          form.setValue('issueDate', format(dt, 'yyyy-MM-dd'));
          form.setValue('amount', Number(t.amount || 0));
          // Mémoriser le nom d'animal pour mapper vers animalTypeId quand la liste est chargée
          if (t.animalType) setLoadedTaxAnimalName(String(t.animalType));
        }
      } catch (e) {
        console.error('Erreur chargement taxe pour édition:', e);
      }
    };
    fetchTaxForEdit();
  }, [isEditing, taxId, open]);

  // Quand la liste animalTypes est disponible, mapper le nom de l'animal chargé vers un ID
  useEffect(() => {
    if (!loadedTaxAnimalName || animalTypes.length === 0) return;
    const target = loadedTaxAnimalName.trim().toLowerCase();
    const match = animalTypes.find(a => a.name.trim().toLowerCase() === target);
    if (match) {
      form.setValue('animalTypeId', match.id);
      // recalcule montant basé sur quantité actuelle
      const qty = form.getValues('quantity') || 1;
      form.setValue('amount', (match.price || 0) * qty);
    }
  }, [loadedTaxAnimalName, animalTypes]);

  useEffect(() => {
    // Charger la liste selon le flag
    const fetchHunters = async () => {
      setLoading(true);
      try {
        if (nationalOverride?.enabled) {
          // nationalHunters est déjà alimenté par react-query
          const base = Array.isArray(nationalHunters) ? nationalHunters : [];
          const filtered = await filterHuntersWithPermits(base);
          setHunters(filtered);
        } else {
          const data = await apiRequest<Hunter[]>({ url: "/api/hunters", method: "GET" });
          const filtered = await filterHuntersWithPermits(Array.isArray(data) ? data : []);
          setHunters(filtered);
        }
      } catch (err) {
        console.error("Error fetching hunters:", err);
        toast({
          title: "Erreur",
          description: "Impossible de charger la liste des chasseurs",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchHunters();
  }, [toast, nationalOverride?.enabled, nationalHunters]);

  // Utilitaire: garder uniquement les chasseurs ayant au moins un permis
  async function filterHuntersWithPermits(list: Hunter[]): Promise<Hunter[]> {
    if (!Array.isArray(list) || list.length === 0) return [];
    const concurrency = 8;
    const result: Hunter[] = [];
    let index = 0;

    async function worker() {
      while (index < list.length) {
        const i = index++;
        const h = list[i];
        try {
          const permits = await apiRequest<any[]>({ url: `/api/permits/hunter/${h.id}`, method: 'GET' });
          if (Array.isArray(permits) && permits.length > 0) {
            result.push(h);
          }
        } catch (_) {
          // ignorer les erreurs individuelles
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => worker());
    await Promise.all(workers);
    return result;
  }

  useEffect(() => {
    // When hunter changes, fetch their permits
    const fetchPermits = async () => {
      if (hunterId > 0) {
        try {
          const allPermits = await apiRequest<Permit[]>({ url: `/api/permits/hunter/${hunterId}` , method: "GET" });

          // Ne conserver que les permis pertinents:
          // - Actifs non expirés
          // - Expirés mais n'ayant pas atteint 2 renouvellements (sinon ils sont bloqués)
          const today = new Date();
          const relevantPermits = (allPermits as any[]).filter((permit: any) => {
            const isExpired = new Date(permit.expiryDate) < new Date();
            const renewalsLen = Array.isArray(permit?.metadata?.renewals) ? permit.metadata.renewals.length : 0;
            const blocked = isExpired && renewalsLen >= 2;
            if (blocked) return false;
            // Exclure suspendu
            if (String(permit.status) === 'suspended') return false;
            // Exclure les permis de gibier d'eau du formulaire de taxe
            const t = String(permit.type || '').toLowerCase();
            const c = String(permit.categoryId || '').toLowerCase();
            if (t === 'gibier-eau' || c.includes('gibier-eau')) return false;
            // Autoriser actif (même si proche d'expiration) et expiré (si non bloqué)
            return ['active', 'expired'].includes(String(permit.status));
          });

          setPermits(relevantPermits as Permit[]);

          // Reset permit selection if previous selection is no longer valid
          const currentPermitId = form.getValues("permitId");
          if (currentPermitId && !(relevantPermits as any[]).some((p: any) => p.id === currentPermitId)) {
            form.setValue("permitId", 0);
            setSelectedPermit(null);
          }
        } catch (err) {
          console.error("Error fetching permits:", err);
          toast({
            title: "Erreur",
            description: "Impossible de charger les permis du chasseur",
            variant: "destructive",
          });
        }
      } else {
        setPermits([]);
        form.setValue("permitId", 0);
        setSelectedPermit(null);
      }
    };

    fetchPermits();
  }, [hunterId, form, toast]);

  // Charger les détails du permis sélectionné (pour disposer de metadata.renewals)
  useEffect(() => {
    const loadSelectedPermit = async () => {
      if (!watchedPermitId) {
        setSelectedPermit(null);
        return;
      }
      const p = permits.find(p => p.id === Number(watchedPermitId));
      // Si le permis dans la liste contient déjà metadata, on l'utilise
      if (p && (p as any)?.metadata) {
        setSelectedPermit(p);
        return;
      }
      // Sinon, on récupère le détail du permis pour obtenir metadata
      try {
        const detail = await apiRequest<Permit>({ url: `/api/permits/${watchedPermitId}`, method: "GET" });
        setSelectedPermit(detail);
      } catch (e) {
        console.error('Erreur chargement détail permis:', e);
        setSelectedPermit(p || null);
      }
    };
    loadSelectedPermit();
  }, [watchedPermitId, permits]);

  // Function to generate a tax number
  function generateTaxNumber() {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const randomLetter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
    return `T-SN-${year}-${random}${randomLetter}`;
  }

  async function onSubmit(data: TaxFormData) {
    setIsSubmitting(true);
    try {
      // Validation date d'abattage dans la campagne (hunting_campaigns)
      if (campaignStart && campaignEnd) {
        const d = new Date(data.issueDate);
        if (isNaN(d.getTime()) || d < campaignStart || d > campaignEnd) {
          toast({
            title: "Date hors campagne",
            description: `La date d'abattage doit être comprise entre ${format(campaignStart, "dd/MM/yyyy")} et ${format(campaignEnd, "dd/MM/yyyy")}.`,
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }
      // Règles frontend: empêcher cas inéligibles
      if (selectedPermit) {
        if (isWaterfowlPermit(selectedPermit)) {
          toast({ title: 'Permis inéligible', description: "Les permis de Gibier d'Eau ne sont pas éligibles aux taxes d'abattage.", variant: 'destructive' });
          setIsSubmitting(false);
          return;
        }
        if (isPetiteChassePermit(selectedPermit)) {
          const chosen = animalTypes.find(a => a.id === data.animalTypeId)?.name?.toLowerCase() || '';
          if (!chosen.includes('phacoch')) {
            toast({ title: 'Règle métier', description: "Pour les permis de Petite Chasse, seules les taxes de Phacochère sont autorisées.", variant: 'destructive' });
            setIsSubmitting(false);
            return;
          }
        }
      }
      // Garde-fou: si le permis a déjà 2 renouvellements ET est arrivé à expiration (fin 2e renouvellement), bloquer
      if (selectedPermit) {
        const renewalsLen = Array.isArray((selectedPermit as any)?.metadata?.renewals)
          ? (selectedPermit as any).metadata.renewals.length
          : 0;
        const isExpired = new Date(selectedPermit.expiryDate) < new Date();
        if (renewalsLen >= 2 && isExpired) {
          toast({
            title: "Association interdite",
            description: "Ce permis a atteint 2 renouvellements et est expiré. Aucune taxe d'abattage ne peut y être associée.",
            variant: "destructive",
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Prepare data for API
      const selectedAnimal = animalTypes.find(a => a.id === data.animalTypeId);
      const basePayload = {
        amount: data.amount,
        issueDate: new Date(data.issueDate).toISOString().split('T')[0],
        // Backend expects a descriptive string (e.g., "Phacochère"), not un ID
        animalType: selectedAnimal?.name || data.animalTypeId,
        quantity: data.quantity,
        receiptNumber: data.receiptNumber,
      } as const;

      const taxData = isEditing
        ? basePayload // PUT: ne pas envoyer permitId ni hunterId (le backend les refuse/modifie)
        : {
            hunterId: data.hunterId,
            permitId: data.permitId,
            ...basePayload,
          };

      const endpoint = isEditing ? `/api/taxes/${taxId}` : "/api/taxes";
      const method = isEditing ? "PUT" : "POST";

      // Utiliser apiRequest pour inclure automatiquement credentials + Authorization
      const result = await apiRequest<any>({
        url: endpoint,
        method,
        data: taxData,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["/api/taxes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });

      toast({
        title: isEditing ? "Taxe mise à jour" : "Taxe créée",
        description: `La taxe ${data.taxNumber} a été ${isEditing ? "mise à jour" : "créée"} avec succès.`,
        variant: "default",
      });

      onClose();
    } catch (error) {
      console.error("Error saving tax:", error);
      toast({
        title: "Erreur",
        description: `Une erreur est survenue lors de l'enregistrement de la taxe. ${error instanceof Error ? error.message : ''}`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[90%] md:max-w-[560px] max-h-[90vh] overflow-hidden no-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center">
            {isEditing ? "Modifier une Taxe d'Abattage" : "Ajouter une Taxe d'Abattage"}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto no-scrollbar max-h-[calc(90vh-140px)]">
        {loading ? (
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
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value > 0 ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ou sélectionner dans la liste complète" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {hunters.map((hunter) => (
                          <SelectItem key={hunter.id} value={hunter.id.toString()}>
                            {hunter.firstName} {hunter.lastName} - {hunter.idNumber}
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
                name="taxNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Numéro de Taxe</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        readOnly
                        aria-readonly
                        className="bg-gray-100 text-gray-800 font-semibold cursor-not-allowed text-center font-bold text-lg md:text-xl"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="permitId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Permis</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseInt(v))}
                      value={field.value > 0 ? field.value.toString() : ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un permis" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {permits.length > 0 && (
                          permits.map((permit) => {
                            const isExpired = permit.expiryDate ? new Date(permit.expiryDate) < new Date() : false;
                            const status = isExpired ? 'Expiré' : (permit.status === 'active' ? 'Actif' : permit.status === 'suspended' ? 'Suspendu' : String(permit.status));
                            return (
                              <SelectItem key={permit.id} value={permit.id.toString()}>
                                {permit.permitNumber}
                                {permit.categoryId ? ` · ${permit.categoryId}` : ''}
                                {` · ${status} · expire: `}
                                {permit.expiryDate ? format(new Date(permit.expiryDate), "dd/MM/yyyy") : '—'}
                              </SelectItem>
                            );
                          })
                        )}
                      </SelectContent>
                    </Select>
                    {isPermitBlocked && (
                      <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                        Ce permis a atteint 2 renouvellements et est expiré. Aucune taxe d'abattage ne peut y être associée.
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="animalTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type d'Animal</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isWaterfowlPermit(selectedPermit)}
                    >
                      <FormControl>
                        <SelectTrigger disabled={isWaterfowlPermit(selectedPermit)}>
                          <SelectValue placeholder="Sélectionner un type d'animal" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {filteredAnimalTypes.length === 0 ? (
                          <SelectItem value="__none__" disabled>
                            Aucun type disponible
                          </SelectItem>
                        ) : filteredAnimalTypes.map((animal) => (
                          <SelectItem key={animal.id} value={animal.id}>
                            {animal.name} - {animal.price.toLocaleString()} FCFA
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isWaterfowlPermit(selectedPermit) && (
                      <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                        Les permis de Gibier d'Eau ne sont pas éligibles aux taxes d'abattage. Veuillez sélectionner un autre permis.
                      </div>
                    )}
                    {isPetiteChassePermit(selectedPermit) && (
                      <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        Pour les permis de Petite Chasse, seules les taxes de Phacochère sont autorisées.
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantité</FormLabel>
                    <FormControl>
                      <Input type="number" min="1" {...field} className="text-center font-bold text-lg md:text-xl max-w-[140px] mx-auto" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Montant Total (FCFA)</FormLabel>
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
                    <FormLabel>Numéro quittance</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700 select-none">N°</span>
                        <Input
                          placeholder="Exemple: 1234567/24 AB"
                          className="bg-yellow-50 border-yellow-200 focus:border-yellow-300 tracking-wider font-bold text-lg md:text-xl placeholder:font-normal placeholder:text-sm md:placeholder:text-base text-center"
                          {...field}
                          onPaste={(e) => e.preventDefault()}
                          onChange={(e) => {
                            let raw = e.target.value.toUpperCase();
                            // Autoriser chiffres, lettres, '/', ' ', '.'
                            raw = raw.replace(/[^0-9A-Z\/. ]/g, '');
                            // Supprimer les points, normaliser espaces
                            raw = raw.replace(/[.]/g, '');
                            raw = raw.replace(/\s+/g, ' ');
                            // Construire format canonique NNNNNNN/NN LL
                            const only = raw.replace(/[^0-9A-Z]/g, '');
                            let digits = only.replace(/[^0-9]/g, '');
                            let letters = only.replace(/[^A-Z]/g, '');
                            digits = digits.slice(0, 9);
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
                <Button type="submit" disabled={isSubmitting || isPermitBlocked || isWaterfowlPermit(selectedPermit) || !form.formState.isValid}>
                  {isSubmitting ? "Enregistrement..." : "Enregistrer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
