import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, TreePine } from "lucide-react";
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
const addReforestationSubAccountSchema = z.object({
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

type AddReforestationSubAccountValues = z.infer<typeof addReforestationSubAccountSchema>;

interface AddReforestationSubAccountFormProps {
  open: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}

export default function AddReforestationSectorAgentForm({ open, onClose, triggerRef }: AddReforestationSubAccountFormProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Helpers pour normaliser la clé région
  const removeDiacritics = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
  const slugify = (s: string) => removeDiacritics(s).trim().toLowerCase().replace(/\s+/g, '-');

  // Générer la liste des secteurs de la région de l'agent connecté
  let sectors: { value: string; label: string }[] = [];
  if (user?.region) {
    let regionKey = slugify(user.region);
    if (!departmentsByRegion[regionKey as keyof typeof departmentsByRegion]) {
      const userRegionNorm = removeDiacritics(user.region).trim().toUpperCase();
      const match = regionEnum.find(r => removeDiacritics(r.label).toUpperCase() === userRegionNorm);
      if (match) {
        regionKey = match.value;
      }
    }
    const deps = departmentsByRegion[regionKey as keyof typeof departmentsByRegion] || [];
    sectors = deps.map(dep => ({ value: dep.value, label: dep.label }));
  }

  const form = useForm<AddReforestationSubAccountValues>({
    resolver: zodResolver(addReforestationSubAccountSchema),
    defaultValues: {
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
    },
    mode: "onChange"
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

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    const truncated = numbers.slice(0, 9);
    if (truncated.length <= 2) return truncated;
    if (truncated.length <= 5) return `${truncated.slice(0, 2)} ${truncated.slice(2)}`;
    if (truncated.length <= 7) return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5)}`;
    return `${truncated.slice(0, 2)} ${truncated.slice(2, 5)} ${truncated.slice(5, 7)} ${truncated.slice(7)}`;
  };

  const createSubAccountMutation = useMutation({
    mutationFn: async (data: AddReforestationSubAccountValues) => {
      setIsSaving(true);
      try {
        const agentData = {
          ...data,
          role: "sub-agent",
          domain: "REBOISEMENT",
          region: user?.region || "",
          serviceLocation: "Secteur",
          departement: data.sector,
          isActive: true,
        };

        return await apiRequest({
          url: `/api/users/create-agent`,
          method: "POST",
          data: agentData
        });
      } finally {
        setIsSaving(false);
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "L'Agent de Secteur Reboisement a été créé avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/reboisement/regional/my-sector-agents"] });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      if (error.response?.status === 422 && error.response?.data?.errors) {
        error.response.data.errors.forEach((err: any) => {
          if (err.path) {
            const fieldName = err.path === 'departement' ? 'sector' : err.path;
            form.setError(fieldName as any, { type: "server", message: err.message || "Invalide" });
          }
        });
        toast({ variant: "destructive", title: "Erreur de validation", description: "Corrigez les erreurs." });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: error.response?.data?.message || "Échec de création." });
      }
    },
  });

  const onSubmit = (data: AddReforestationSubAccountValues) => {
    createSubAccountMutation.mutate(data);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) {
        form.reset();
        setAgentNotFoundOpen(false);
        setMatriculeLookupStatus("idle");
        onClose();
        if (triggerRef?.current) setTimeout(() => triggerRef.current?.focus(), 0);
      }
    }}>
      <AlertDialog open={agentNotFoundOpen} onOpenChange={handleAgentNotFoundOpenChange}>
        <AlertDialogPrimitive.Portal>
          <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[10020] bg-transparent" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10030] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-2xl border border-border bg-background p-5 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-bold text-center text-emerald-900">Agent introuvable</AlertDialogTitle>
              <div className="flex items-center justify-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-700">
                  <TreePine className="h-4 w-4 text-white" />
                </div>
                <AlertDialogDescription className="text-foreground/80">L'utilisateur demandé est introuvable.</AlertDialogDescription>
              </div>
            </AlertDialogHeader>
            <div className="flex justify-center">
              <AlertDialogAction className="bg-emerald-700 hover:bg-emerald-800">Fermer</AlertDialogAction>
            </div>
          </AlertDialogPrimitive.Content>
        </AlertDialogPrimitive.Portal>
      </AlertDialog>

      <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-2">
          <div className="min-w-0">
            <DialogTitle className="text-lg sm:text-xl text-emerald-900">Ajouter un Agent de Secteur (Reboisement)</DialogTitle>
            <DialogDescription className="text-sm text-emerald-700">
              Créez un compte agent pour un secteur de votre région
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
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          placeholder="Matricule (min. 3 caractères)"
                          {...field}
                          onChange={(e) => {
                            field.onChange(e);
                            setMatriculeLookupStatus("idle");
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
                        disabled={isMatriculeLookupLoading || (field.value?.length || 0) < 3}
                      >
                        {isMatriculeLookupLoading
                          ? "Recherche..."
                          : matriculeLookupStatus === "found"
                            ? "Nouvelle recherche"
                            : "Rechercher"}
                      </Button>
                    </div>
                    {!!matriculeLookupMessage && (
                      <p className={matriculeLookupStatus === "found" ? "text-xs text-emerald-600" : "text-xs text-red-600"}>
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
                        onChange={(e) => field.onChange(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                        onBlur={(e) => field.onChange(normalizePrenom(e.target.value))}
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
                        onChange={(e) => field.onChange(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
                        onBlur={(e) => field.onChange(normalizeNom(e.target.value))}
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
                        onChange={(e) => field.onChange(formatPhoneNumber(e.target.value))}
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
                      <Input placeholder="Nom d'utilisateur" autoComplete="off" {...field} />
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
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Mot de passe"
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
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
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

              {/* Grade */}
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
                        onChange={(e) => field.onChange(e.target.value.replace(/[\p{N}\p{P}\p{S}_]+/gu, ""))}
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
                        {sectors.map((sector) => (
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
              <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto order-2 sm:order-1">
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !form.formState.isValid}
                className="w-full sm:w-auto order-1 sm:order-2 bg-emerald-700 hover:bg-emerald-800"
              >
                {isSaving ? "Création..." : "Créer l'Agent de Secteur"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
