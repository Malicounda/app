import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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

// Schema de validation
const agentFormSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
  phone: z.string().min(1, "Le numéro de téléphone est requis"),
  matricule: z.string().min(1, "Le matricule est requis"),
  region: z.string().min(1, "La région est requise"),
  departement: z.string().optional(),
});

type AgentFormValues = z.infer<typeof agentFormSchema>;

type AgentLike = {
  id: number;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  matricule?: string | null;
  region?: string | null;
  departement?: string | null;
  role?: string | null;
};

interface AgentFormProps {
  open: boolean;
  onClose: () => void;
  agent: AgentLike;
}

export default function AgentForm({ open, onClose, agent }: AgentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  // Définir les valeurs par défaut du formulaire
  const defaultValues: Partial<AgentFormValues> = {
    firstName: agent.firstName || "",
    lastName: agent.lastName || "",
    phone: agent.phone || "",
    matricule: agent.matricule || "",
    region: agent.region || "",
    departement: agent.departement || "",
  };

  // Initialiser le formulaire
  const form = useForm<AgentFormValues>({
    resolver: zodResolver(agentFormSchema),
    defaultValues,
  });

  // Reset form values when agent changes
  useEffect(() => {
    form.reset({
      firstName: agent.firstName || "",
      lastName: agent.lastName || "",
      phone: agent.phone || "",
      matricule: agent.matricule || "",
      region: agent.region || "",
      departement: agent.departement || "",
    });
  }, [agent, form]);

  const isSectorAgent = agent.role === 'sub-agent';
  const selectedRegion = form.watch("region");
  const departments = selectedRegion && departmentsByRegion[selectedRegion as keyof typeof departmentsByRegion]
    ? departmentsByRegion[selectedRegion as keyof typeof departmentsByRegion]
    : [];

  // Mutation pour mettre à jour l'agent
  const updateAgentMutation = useMutation({
    mutationFn: async (data: AgentFormValues) => {
      console.log(`🔄 Tentative de mise à jour de l'agent ${agent.id}`, data);
      setIsSaving(true);

      try {
        // Utilisez l'URL complète à partir de la racine
        const response = await apiRequest({
          url: `/api/users/${agent.id}`,
          method: "PATCH",
          data
        });
        console.log(`✅ Réponse de mise à jour:`, response);
        return response;
      } catch (error) {
        console.error(`❌ Erreur lors de la mise à jour de l'agent:`, error);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    onSuccess: (data) => {
      console.log("✅ Mise à jour réussie:", data);
      toast({
        title: "Succès",
        description: "Les informations de l'agent ont été mises à jour avec succès.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      onClose();
    },
    onError: (error: any) => {
      console.error("❌ Erreur détaillée lors de la mise à jour:", error);

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
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Échec de la mise à jour des informations de l'agent.",
        });
      }
    },
  });

  // Soumission du formulaire
  const onSubmit = (data: AgentFormValues) => {
    console.log("📝 Données du formulaire:", data);
    updateAgentMutation.mutate(data);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-4">
          <DialogTitle className="text-lg sm:text-xl">Modifier les informations de l'agent</DialogTitle>
          <DialogDescription className="text-sm">
            Mettez à jour les détails de l'agent {agent.username}
          </DialogDescription>
          <div className="bg-blue-50 border border-blue-200 rounded-md p-2 sm:p-3 mt-2">
            <p className="text-xs sm:text-sm text-blue-800 font-medium">
              ⚠️ Tous les champs du formulaire sont obligatoires. Veuillez les remplir avant de valider.
            </p>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3 sm:space-y-4">
            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input placeholder="Nom" {...field} />
                  </FormControl>
                  <FormMessage />
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
                    <Input placeholder="Prénom" {...field} />
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
                  <FormLabel>Téléphone</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 77 123 45 67" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="matricule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Matricule</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 740 364/B" {...field} />
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
                  <FormLabel>Région / Niveau</FormLabel>
                  <Select
                    onValueChange={(val) => {
                      field.onChange(val);
                      // Reset departement when region changes
                      form.setValue("departement", "");
                    }}
                    value={field.value}
                  >
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

            {isSectorAgent && (
              <FormField
                control={form.control}
                name="departement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Département / Secteur</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={departments.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={departments.length === 0 ? "Sélectionnez d'abord une région" : "Sélectionner un département"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departments.map((dept) => (
                          <SelectItem key={dept.value} value={dept.value}>
                            {dept.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 mt-4 sm:mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSaving}
                className="w-full sm:w-auto order-2 sm:order-1"
              >
                Annuler
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto order-1 sm:order-2"
              >
                {isSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
