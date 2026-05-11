import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, User } from "lucide-react";
import { useMemo, useState } from "react";
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
    DialogFooter,
    DialogHeader,
    DialogTitle
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
import { regionEnum } from "@/lib/constants";

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
const addAgentFormSchema = z.object({
  username: z.string()
    .min(3, "Le nom d'utilisateur doit contenir au moins 3 caractères")
    .max(20, "Le nom d'utilisateur ne peut pas dépasser 20 caractères")
    .regex(/^[a-zA-Z0-9_]+$/, "Le nom d'utilisateur ne peut contenir que des lettres, chiffres et underscore"),
  password: z.string()
    .min(6, "Le mot de passe doit contenir au moins 6 caractères")
    .max(50, "Le mot de passe ne peut pas dépasser 50 caractères"),
  email: z.string()
    .min(1, "L'email est requis")
    .email("Format d'email invalide (exemple: nom@domaine.com)"),
  firstName: z.string()
    .min(2, "Le prénom doit contenir au moins 2 caractères")
    .max(30, "Le prénom ne peut pas dépasser 30 caractères")
    .regex(/^[\p{L} ]+$/u, "Le prénom ne peut contenir que des lettres"),
  lastName: z.string()
    .min(2, "Le nom doit contenir au moins 2 caractères")
    .max(30, "Le nom ne peut pas dépasser 30 caractères")
    .regex(/^[\p{L} ]+$/u, "Le nom ne peut contenir que des lettres"),
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
  region: z.string().min(1, "La région est requise"),
  serviceLocation: z.string().optional()
  // assignmentPost supprimé selon la demande
});

type AddAgentFormValues = z.infer<typeof addAgentFormSchema>;

interface AddAgentFormProps {
  open: boolean;
  onClose: () => void;
}

export default function AddAgentForm({ open, onClose }: AddAgentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Définir les valeurs par défaut du formulaire
  const defaultValues: Partial<AddAgentFormValues> = {
    username: "",
    password: "",
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    matricule: "",
    grade: "",
    genre: "",
    region: "",
    serviceLocation: ""
    // assignmentPost supprimé selon la demande
  };

  // Initialiser le formulaire avec validation en temps réel
  const form = useForm<AddAgentFormValues>({
    resolver: zodResolver(addAgentFormSchema),
    defaultValues,
    mode: "onChange" // Validation en temps réel
  });

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

  // Libellé dynamique pour "Lieu de service": IREF/<Nom de la région>
  const selectedRegion = form.watch("region");
  const serviceLocationLabel = useMemo(() => {
    const regionLabel = regionEnum.find(r => r.value === selectedRegion)?.label;
    return regionLabel ? `IREF/${regionLabel}` : "IREF";
  }, [selectedRegion]);

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

  // Mutation pour créer un agent
  const createAgentMutation = useMutation({
    mutationFn: async (data: AddAgentFormValues) => {
      console.log(` Tentative de création d'un nouvel agent`, data);
      setIsSaving(true);

      try {
        // Ajouter le rôle agent, attendu par le backend pour cette route
        const agentData = {
          ...data,
          role: "agent"
        };

        // Utilisez l'URL correcte pour la création d'agent
        const response = await apiRequest({
          url: `/api/users/create-agent`,
          method: "POST",
          data: agentData
        });
        console.log(` Réponse de création:`, response);
        return response;
      } catch (error) {
        console.error(` Erreur lors de la création de l'agent:`, error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    onSuccess: (data) => {
      console.log(" Création réussie:", data);
      toast({
        title: "Succès",
        description: "L'agent a été créé avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
      // Compatibilité: certaines pages historiques utilisaient une clé générique
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      console.error(" Erreur détaillée lors de la création:", error);

      // Si c'est une erreur de validation (422), afficher les erreurs sur les champs
      if (error.response?.status === 422 && error.response?.data?.errors) {
        const validationErrors = error.response.data.errors;

        // Appliquer les erreurs aux champs correspondants
        validationErrors.forEach((err: any) => {
          if (err.path) {
            form.setError(err.path as any, {
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
        let errorMessage = "Impossible de créer l'agent.";

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
  const onSubmit = (data: AddAgentFormValues) => {
    console.log(" Données du formulaire:", data);
    createAgentMutation.mutate(data);
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
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-green-600" />
            <div>
              <DialogTitle className="text-lg sm:text-xl">Ajouter un Agent Régional</DialogTitle>
              <p className="text-xs text-green-700 font-semibold tracking-wide uppercase mt-0.5">
                Division gestion de la faune
              </p>
            </div>
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
                        placeholder="Prénom"
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
                        placeholder="Nom"
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
                      <Input
                        type="email"
                        placeholder="nom@domaine.com"
                        {...field}
                      />
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
                      <Input
                        placeholder="Nom d'utilisateur (min. 3 caractères)"
                        autoComplete="off"
                        {...field}
                      />
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
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Région</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Sélectionner une région" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {regionEnum.map((region) => (
                          <SelectItem key={region.value} value={region.value}>
                            {region.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormItem>
                <FormLabel>Lieu de service</FormLabel>
                <FormControl>
                  <Input value={serviceLocationLabel} disabled readOnly />
                </FormControl>
                <FormMessage />
              </FormItem>

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

              {/* Champ 'Lieu de service' masqué, valeur calquée sur l'affichage */}
              <input type="hidden" value={serviceLocationLabel} {...form.register("serviceLocation")} />

              {/* Champ assignmentPost supprimé selon la demande */}
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
                className="bg-green-600 hover:bg-green-700 w-full sm:w-auto order-1 sm:order-2"
                disabled={isSaving || !form.formState.isValid}
              >
                {isSaving ? "Création en cours..." : "Créer l'agent"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
