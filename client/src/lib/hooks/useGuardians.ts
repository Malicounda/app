import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Guardian } from "@shared/schema";

// Hook pour gérer les tuteurs (guardians)
export function useGuardians() {
  const queryClient = useQueryClient();

  // Récupérer tous les tuteurs
  const { data: guardians = [], isLoading: guardianLoading, error } = useQuery<Guardian[]>({
    queryKey: ["/api/guardians"],
    queryFn: () => apiRequest<Guardian[]>({ url: "/api/guardians", method: "GET" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Récupérer un tuteur par son ID
  const getGuardian = (id: number) => {
    return useQuery<Guardian>({
      queryKey: ["/api/guardians", id],
      queryFn: () => apiRequest<Guardian>({ url: `/api/guardians/${id}` , method: "GET" }),
      enabled: !!id,
    });
  };

  // Récupérer les tuteurs d'un chasseur
  const getGuardiansForHunter = (hunterId: number) => {
    return useQuery<Guardian[]>({
      queryKey: ["/api/hunters", hunterId, "guardians"],
      queryFn: () => apiRequest<Guardian[]>({ url: `/api/hunters/${hunterId}/guardians`, method: "GET" }),
      enabled: !!hunterId,
    });
  };

  // Mutation pour créer un tuteur
  const createGuardian = useMutation({
    mutationFn: async (guardian: Omit<Guardian, "id" | "createdAt">) => {
      const response = await fetch("/api/guardians", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(guardian),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Une erreur est survenue lors de la création du tuteur");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guardians"] });
      toast({
        title: "Tuteur créé avec succès",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation pour mettre à jour un tuteur
  const updateGuardian = useMutation({
    mutationFn: async ({ id, ...guardian }: Guardian) => {
      const response = await fetch(`/api/guardians/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(guardian),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Une erreur est survenue lors de la mise à jour du tuteur");
      }
      
      return response.json();
    },
    onSuccess: (updatedGuardian) => {
      queryClient.invalidateQueries({ queryKey: ["/api/guardians"] });
      queryClient.invalidateQueries({ queryKey: ["/api/guardians", updatedGuardian.id] });
      toast({
        title: "Tuteur mis à jour avec succès",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation pour supprimer un tuteur
  const deleteGuardian = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/guardians/${id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Une erreur est survenue lors de la suppression du tuteur");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/guardians"] });
      toast({
        title: "Tuteur supprimé avec succès",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation pour associer un tuteur à un chasseur mineur
  const associateGuardianToHunter = useMutation({
    mutationFn: async ({ hunterId, guardianId }: { hunterId: number; guardianId: number }) => {
      const response = await fetch(`/api/hunters/${hunterId}/guardians/${guardianId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Une erreur est survenue lors de l'association du tuteur au chasseur");
      }
      
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", variables.hunterId] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", variables.hunterId, "guardians"] });
      toast({
        title: "Tuteur associé au chasseur avec succès",
        variant: "default",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erreur",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    guardians,
    guardianLoading,
    error,
    getGuardian,
    getGuardiansForHunter,
    createGuardian,
    updateGuardian,
    deleteGuardian,
    associateGuardianToHunter,
  };
}
