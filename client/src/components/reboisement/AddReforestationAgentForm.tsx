import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, TreePine } from "lucide-react";
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

// ─── Helpers de normalisation ──────────────────────────────────────────────────
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

// ─── Schéma de validation ──────────────────────────────────────────────────────
const addReforestationAgentSchema = z.object({
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
  serviceLocation: z.string().optional(),
});

type AddReforestationAgentFormValues = z.infer<typeof addReforestationAgentSchema>;

interface AddReforestationAgentFormProps {
  open: boolean;
  onClose: () => void;
}

// ─── Composant principal ───────────────────────────────────────────────────────
export default function AddReforestationAgentForm({ open, onClose }: AddReforestationAgentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const defaultValues: Partial<AddReforestationAgentFormValues> = {
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
    serviceLocation: "",
  };

  const form = useForm<AddReforestationAgentFormValues>({
    resolver: zodResolver(addReforestationAgentSchema),
    defaultValues,
    mode: "onChange",
  });

  // ─── Formater le numéro de téléphone ────────────────────────────────────────
  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, "");
    const truncated = numbers.slice(0, 9);
    if (truncated.length <= 2) return truncated;
    if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
    if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
    return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
  };

  // ─── Libellé dynamique du lieu de service ───────────────────────────────────
  // Pour le Reboisement : "IREF-REBOISEMENT/<Région>"
  const selectedRegion = form.watch("region");
  const serviceLocationLabel = useMemo(() => {
    const regionLabel = regionEnum.find((r) => r.value === selectedRegion)?.label;
    return regionLabel ? `IREF-REBOISEMENT/${regionLabel}` : "IREF-REBOISEMENT";
  }, [selectedRegion]);

  // ─── Lookup par matricule ────────────────────────────────────────────────────
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

  // ─── Mutation de création ────────────────────────────────────────────────────
  const createAgentMutation = useMutation({
    mutationFn: async (data: AddReforestationAgentFormValues) => {
      setIsSaving(true);
      try {
        // domain = "REBOISEMENT" est fixé ici — pas de choix possible
        const agentData = {
          ...data,
          role: "agent",
          domain: "REBOISEMENT",
          serviceLocation: serviceLocationLabel,
        };
        const response = await apiRequest({
          url: `/api/users/create-agent`,
          method: "POST",
          data: agentData,
        });
        return response;
      } catch (error) {
        console.error("Erreur création agent reboisement:", error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "L'agent régional Reboisement a été créé avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users/agents"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      if (error.response?.status === 422 && error.response?.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          if (err.path) {
            form.setError(err.path as any, { type: "server", message: err.message || "Champ invalide" });
          }
        });
        toast({
          variant: "destructive",
          title: "Erreur de validation",
          description: "Veuillez corriger les erreurs dans le formulaire.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: error.response?.data?.message || "Impossible de créer l'agent.",
        });
      }
    },
  });

  const onSubmit = (data: AddReforestationAgentFormValues) => {
    createAgentMutation.mutate(data);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        form.reset();
        setAgentNotFoundOpen(false);
        setMatriculeLookupStatus("idle");
        setMatriculeLookupMessage("");
        onClose();
      }
    }}>
      {/* Alerte agent introuvable */}
      <AlertDialog open={agentNotFoundOpen} onOpenChange={handleAgentNotFoundOpenChange}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[10020] bg-transparent" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10030] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-center">Agent introuvable</AlertDialogTitle>
              <div className="flex items-center justify-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700">
                  <TreePine className="h-4 w-4 text-white" />
                </div>
                <AlertDialogDescription className="text-foreground/80">
                  L'utilisateur demandé est introuvable dans le registre.
                </AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <div className="flex justify-center">
              <AlertDialogAction>Fermer</AlertDialogAction>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialog>

      <DialogContent
        className="w-[95vw] max-w-[620px] max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (agentNotFoundOpen) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (agentNotFoundOpen) e.preventDefault(); }}
      >
        {/* En-tête avec couleur propre au Reboisement */}
        <DialogHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-700">
              <TreePine className="h-5 w-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg sm:text-xl text-emerald-900">
                Ajouter un Agent Régional
              </DialogTitle>
              <p className="text-xs text-emerald-700 font-semibold tracking-wide uppercase mt-0.5">
                Domaine — Reboisement / Reforestation
              </p>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4" autoComplete="off">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

              {/* Matricule + Recherche */}
              <FormField
                control={form.control}
                name="matricule"
                render={({ field }) => (
                  <FormItem className="col-span-1 sm:col-span-2">
                    <FormLabel>Matricule</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Matricule (min. 3 caractères)"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setMatriculeLookupStatus("idle");
                            setMatriculeLookupMessage("");
                          }}
                        />
                      </FormControl>
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
                    {!!matriculeLookupMessage && (
                      <p className={
                        matriculeLookupStatus === "found"
                          ? "text-xs text-emerald-600"
                          : matriculeLookupStatus === "not_found"
                            ? "text-xs text-muted-foreground"
                            : "text-xs text-red-600"
                      }>
                        {matriculeLookupMessage}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Prénom */}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nom */}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email */}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Téléphone */}
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
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Nom d'utilisateur */}
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

              {/* Mot de passe */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe</FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Mot de passe (min. 6 caractères)"
                          autoComplete="new-password"
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full px-3"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Masquer" : "Afficher"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Région */}
              <FormField
                control={form.control}
                name="region"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Région d'affectation</FormLabel>
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

              {/* Lieu de service — calculé automatiquement, lecture seule */}
              {/* Lieu de service — calculé automatiquement, lecture seule */}
              <FormField
                control={form.control}
                name="serviceLocation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieu de service</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={serviceLocationLabel}
                        disabled
                        readOnly
                        className="bg-emerald-50 text-emerald-800 font-medium"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Grade */}
              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Grade</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Grade (ex: Inspecteur, Chef de Brigade…)"
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

              {/* Genre */}
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

              {/* Champ serviceLocation caché — valeur calculée */}
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
                className="bg-emerald-700 hover:bg-emerald-800 w-full sm:w-auto order-1 sm:order-2"
                disabled={isSaving || !form.formState.isValid}
              >
                {isSaving ? "Création en cours..." : "Créer l'agent Reboisement"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
