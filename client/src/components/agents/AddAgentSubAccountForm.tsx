import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { departmentsByRegion, regionEnum } from "@/lib/constants";

function normalizeNom(raw: string) {
  return String(raw || "").trim().toUpperCase();
}

function capitalizeWords(raw: string, delimiterRegex: RegExp, joinWith: string) {
  const cleaned = String(raw || "").trim();
  if (!cleaned) return "";
  return cleaned
    .split(delimiterRegex)
    .filter((p) => p !== "")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(joinWith);
}

function normalizePrenom(raw: string) {
  return capitalizeWords(raw, /\s+/, " ");
}

// Schema de validation
const addSubAccountFormSchema = z.object({
  firstName: z.string()
    .min(2, "Le prénom doit contenir au moins 2 caractères")
    .max(30, "Le prénom ne peut pas dépasser 30 caractères")
    .regex(/^[\p{L} ]+$/u, "Le prénom ne peut contenir que des lettres"),
  lastName: z.string()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(30, "Le nom ne peut pas dépasser 30 caractères")
    .regex(/^[\p{L} ]+$/u, "Le nom ne peut contenir que des lettres"),
  username: z.string()
    .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
    .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères")
    .regex(/^[a-zA-Z0-9_]+$/, "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscore"),
  email: z.string()
    .min(1, "L'email est requis")
    .email("Format d'email invalide (exemple: nom@domaine.com)"),
  password: z.string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères")
    .max(50, "Le mot de passe ne peut pas dépasser 50 caractères"),
  phone: z.string()
    .min(1, "Le numéro de téléphone est requis")
    .regex(/^(\d{2}\s\d{3}\s\d{2}\s\d{2}|\d{9})$/, "Format attendu: XX XXX XX XX"),
  matricule: z.string()
    .min(3, "Le matricule doit contenir au moins 3 caractères")
    .max(20, "Le matricule ne peut pas dépasser 20 caractères"),
  grade: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.trim() === "" || /^[\p{L} ]+$/u.test(v),
      "Le grade ne peut contenir que des lettres"
    ),
  genre: z.string().optional(),
  sector: z.string().min(1, "Le secteur est requis"),
});

type AddSubAccountFormValues = z.infer<typeof addSubAccountFormSchema>;

interface AddSubAccountFormProps {
  open: boolean;
  onClose: () => void;
  mode: "admin" | "agent";
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

export const AddAgentSubAccountForm: React.FC<AddSubAccountFormProps> = ({ open, onClose, mode, triggerRef }) => {
  console.log("AddAgentSubAccountForm - Initial Props:", { mode });
  const { user } = useAuth();
  console.log("AddAgentSubAccountForm - User object from useAuth:", user);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Helpers pour normaliser la clé région
  const removeDiacritics = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  const slugify = (s: string) => removeDiacritics(s).trim().toLowerCase().replace(/\s+/g, '-');

  // Générer la liste des secteurs selon le mode
  let sectors: { value: string; label: string }[] = [];
  if (mode === "admin") {
    // Tous les départements du Sénégal
    sectors = Object.entries(departmentsByRegion).flatMap(([region, deps]) =>
      deps.map((dep: any) => ({ value: dep.value, label: `${dep.label} (${region.charAt(0).toUpperCase() + region.slice(1)})` }))
    );
  } else if (mode === "agent" && user?.region) {
    // Départements de la région de l'agent connecté
    console.log("AddAgentSubAccountForm - [AGENT MODE] user.region:", user.region);
    // 1) Essayer une clé slugifiée sans accents
    let regionKey = slugify(user.region);
    // 2) Si non trouvé, tenter via regionEnum (match par label sans accents/espaces)
    if (!departmentsByRegion[regionKey as keyof typeof departmentsByRegion]) {
      const userRegionNorm = removeDiacritics(user.region).trim().toUpperCase();
      const match = regionEnum.find(r => removeDiacritics(r.label).toUpperCase() === userRegionNorm);
      if (match) {
        regionKey = match.value; // valeur slug fiable correspondant aux clés du mapping
      }
    }
    console.log("AddAgentSubAccountForm - [AGENT MODE] Calculated regionKey:", regionKey);
    const deps = departmentsByRegion[regionKey as keyof typeof departmentsByRegion] || [];
    console.log("AddAgentSubAccountForm - [AGENT MODE] Departments for regionKey:", deps);
    if (deps.length === 0) {
      console.warn("AddAgentSubAccountForm - [AGENT MODE] No departments found for regionKey:", regionKey, "Available keys in departmentsByRegion:", Object.keys(departmentsByRegion));
    }
    sectors = deps.map(dep => ({ value: dep.value, label: dep.label }));
  }

  // Définir les valeurs par défaut du formulaire
  const defaultValues: Partial<AddSubAccountFormValues> = {
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    password: "",
    phone: "",
    matricule: "",
    grade: "",
    genre: "",
    sector: "",
  };

  // Initialiser le formulaire avec validation en temps réel
  const form = useForm<AddSubAccountFormValues>({
    resolver: zodResolver(addSubAccountFormSchema),
    defaultValues,
    mode: "onChange" // Validation en temps réel
  });

  const [matriculeLookupStatus, setMatriculeLookupStatus] = useState<"idle" | "found" | "not_found" | "error">("idle");
  const [matriculeLookupMessage, setMatriculeLookupMessage] = useState<string>("");
  const [isMatriculeLookupLoading, setIsMatriculeLookupLoading] = useState(false);
  const [agentNotFoundOpen, setAgentNotFoundOpen] = useState(false);

  const handleAgentNotFoundOpenChange = (open: boolean) => {
    setAgentNotFoundOpen(open);
    if (!open) {
      form.setValue("matricule", "");
      setMatriculeLookupStatus("idle");
      setMatriculeLookupMessage("");
    }
  };

  const matriculeForLookup = String(form.watch("matricule") || "").trim();

  const clearAutoFilledFields = () => {
    form.setValue("firstName", "");
    form.setValue("lastName", "");
    form.setValue("email", "");
    form.setValue("phone", "");
    form.setValue("grade", "");
    form.setValue("genre", "");
  };

  const lookupByMatricule = async () => {
    const m = String(form.getValues("matricule") || "").trim();
    if (m.length < 3) return;

    setIsMatriculeLookupLoading(true);
    setMatriculeLookupStatus("idle");
    setMatriculeLookupMessage("");

    try {
      const result = await apiRequest<any>({
        url: `/api/users/agent-profile-by-matricule/${encodeURIComponent(m)}`,
        method: "GET",
      });

      const current = form.getValues();
      if (!current.firstName && result?.firstName) form.setValue("firstName", result.firstName);
      if (!current.lastName && result?.lastName) form.setValue("lastName", result.lastName);
      if (!current.email && result?.email) form.setValue("email", result.email);
      if (!current.phone && result?.phone) form.setValue("phone", result.phone);
      if (!current.grade && result?.grade) form.setValue("grade", result.grade);
      if (!current.genre && result?.genre) form.setValue("genre", result.genre);

      setMatriculeLookupStatus("found");
      setMatriculeLookupMessage("Agent trouvé");
    } catch (e: any) {
      if (e?.response?.status === 404) {
        setMatriculeLookupStatus("not_found");
        setMatriculeLookupMessage("");
        setAgentNotFoundOpen(true);
      } else {
        setMatriculeLookupStatus("error");
        setMatriculeLookupMessage("Erreur lors de la recherche");
      }
    } finally {
      setIsMatriculeLookupLoading(false);
    }
  };

  // Fonction pour formater le numéro de téléphone
  const formatPhoneNumber = (value: string) => {
    // Supprimer tous les caractères non numériques
    const numbers = value.replace(/\D/g, '');

    // Limiter à 9 chiffres
    const truncated = numbers.slice(0, 9);

    // Formater selon le pattern XX XXX XX XX
    if (truncated.length <= 2) return truncated;
    if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
    if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
    return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
  };

  // Mutation pour créer un sous-compte agent
  const createSubAccountMutation = useMutation({
    mutationFn: async (data: AddSubAccountFormValues) => {
      console.log(`🔄 Tentative de création d'un sous-compte agent`, data);
      setIsSaving(true);

      try {
        // Utiliser les données fournies par l'utilisateur
        const username = data.username;
        const password = data.password;
        const email = data.email;

        // Récupérer la région actuelle de l'agent
        const region = user?.region || "";

        // Préparer les données de l'agent
        const agentData = {
          username,
          password,
          email,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          matricule: data.matricule,
          grade: data.grade,
          genre: data.genre,
          region,
          // Lieu de service fixe pour les agents de secteur
          serviceLocation: "Secteur",
          // Enregistrer le département (secteur) dans la colonne departement
          departement: data.sector,
          role: "sub-agent", // Rôle spécifique pour les agents secteur
          isActive: true,
          isSuspended: false,
          hunterId: null // Pas de chasseur associé pour ce type de compte
        };

        // Envoyer la requête de création
        const response = await apiRequest({
          url: `/api/users/create-agent`,

          method: "POST",
          data: agentData
        });
        console.log(`✅ Réponse de création du sous-compte:`, response);
        return response;
      } catch (error) {
        console.error(`❌ Erreur lors de la création du sous-compte:`, error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    onSuccess: (data) => {
      console.log("✅ Création de l'Agent Secteur réussie:", data);
      toast({
        title: "Succès",
        description: "L'Agent Secteur a été créé avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/regional/my-sector-agents"] });
      if (user?.region) {
        queryClient.invalidateQueries({ queryKey: [`/api/users/by-region/${user.region}`] });
      }
      // Compatibilité: pages ou clés plus anciennes
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      console.error("❌ Erreur détaillée lors de la création du sous-compte:", error);

      // Si c'est une erreur de validation (422), afficher les erreurs sur les champs
      if (error.response?.status === 422 && error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;

        // Appliquer les erreurs aux champs correspondants
        validationErrors.forEach((err: any) => {
          if (err.path) {
            // Mapper 'departement' vers 'sector' pour ce formulaire
            const fieldName = err.path === 'departement' ? 'sector' : err.path;
            form.setError(fieldName as any, {
              type: "server",
              message: err.message || "Ce champ est invalide"
            });
          }
        });

        toast({
          variant: "destructive",
          title: "Erreur de validation",
          description: "Veuillez corriger les erreurs dans le formulaire.",
        });
      } else {
        // Autres erreurs
        let errorMessage = "Impossible de créer l'Agent Secteur.";

        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        }

        toast({
          variant: "destructive",
          title: "Erreur",
          description: errorMessage,
        });
      }
    },
  });

  // Soumission du formulaire
  const onSubmit = (data: AddSubAccountFormValues) => {
    console.log("📝 Données du formulaire sous-compte:", data);
    createSubAccountMutation.mutate(data);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (open) {
        setAgentNotFoundOpen(false);
        setMatriculeLookupStatus("idle");
        setMatriculeLookupMessage("");
      } else {
        form.reset();
        setAgentNotFoundOpen(false);
        setMatriculeLookupStatus("idle");
        setMatriculeLookupMessage("");
        onClose();
        // Remettre le focus sur le bouton d'ouverture si fourni
        if (triggerRef?.current) {
          setTimeout(() => triggerRef.current?.focus(), 0);
        }
      }
    }}>

      <AlertDialog open={agentNotFoundOpen} onOpenChange={handleAgentNotFoundOpenChange}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[10020] bg-transparent" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10030] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-center">Agent introuvable</AlertDialogTitle>
              <div className="flex items-center justify-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600">
                  <User className="h-4 w-4 text-white" />
                </div>
                <AlertDialogDescription className="text-foreground/80">L'utilisateur demandé est introuvable.</AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <div className="flex justify-center">
              <AlertDialogAction>Fermer</AlertDialogAction>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialog>

      <DialogContent
        className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => {
          if (agentNotFoundOpen) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (agentNotFoundOpen) e.preventDefault();
        }}
      >
        <DialogHeader className="pb-2">
          <div className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl">Ajouter un Agent Secteur</DialogTitle>
            <p className="text-xs text-green-700 font-semibold tracking-wide uppercase mt-0.5">
              Division gestion de la faune
            </p>
            <DialogDescription className="text-sm">
              Créez un nouvel Agent Secteur dans votre région
            </DialogDescription>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <FormField
                control={form.control}
                name="matricule"
                render={({ field }) => (
                  <FormItem className="col-span-1 sm:col-span-2">
                    <FormLabel>Matricule</FormLabel>
                    <FormControl>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Matricule (min. 3 caractères)"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setMatriculeLookupStatus("idle");
                            setMatriculeLookupMessage("");
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            if (matriculeLookupStatus === "found") {
                              clearAutoFilledFields();
                              form.setValue("matricule", "");
                              setMatriculeLookupStatus("idle");
                              setMatriculeLookupMessage("");
                              return;
                            }
                            lookupByMatricule();
                          }}
                          disabled={isMatriculeLookupLoading || matriculeForLookup.length < 3}
                        >
                          {isMatriculeLookupLoading
                            ? "Recherche..."
                            : matriculeLookupStatus === "found"
                              ? "Nouvelle recherche"
                              : "Rechercher"}
                        </Button>
                      </div>
                    </FormControl>
                    {!!matriculeLookupMessage && (
                      <p
                        className={
                          matriculeLookupStatus === "found"
                            ? "text-xs text-green-600"
                            : matriculeLookupStatus === "not_found"
                              ? "text-xs text-muted-foreground"
                              : "text-xs text-red-600"
                        }
                      >
                        {matriculeLookupMessage}
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Prénom (min. 2 caractères)"
                        {...field}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                          field.onChange(cleaned);
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          field.onChange(normalizePrenom(e.target.value));
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Nom (min. 2 caractères)"
                        {...field}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                          field.onChange(cleaned);
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          field.onChange(normalizeNom(e.target.value));
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="nom@domaine.com" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="XX XXX XX XX"
                        {...field}
                        onChange={(e) => {
                          const formatted = formatPhoneNumber(e.target.value);
                          field.onChange(formatted);
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom d'utilisateur</FormLabel>
                    <FormControl>
                      <Input placeholder="Nom d'utilisateur (min. 3 caractères)" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Mot de passe (min. 6 caractères)"
                          autoComplete="new-password"
                          {...field}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full px-3"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="genre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Genre</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="H">H</SelectItem>
                        <SelectItem value="F">F</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Grade"
                        {...field}
                        onChange={(e) => {
                          const cleaned = e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, "");
                          field.onChange(cleaned);
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="sector"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Secteur</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner un secteur" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sectors && sectors.map((sector) => (
                          <SelectItem key={sector.value} value={sector.value}>
                            {sector.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4 sm:mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !form.formState.isValid}
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                {isSaving ? "Création en cours..." : "Créer l'Agent Secteur"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
