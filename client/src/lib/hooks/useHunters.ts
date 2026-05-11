import { toast } from "@/hooks/use-toast";
import { Hunter } from '@/types/hunters';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from '../api';

// Hook pour gérer les chasseurs
export function useHunters() {
  const queryClient = useQueryClient();

  // Récupérer tous les chasseurs
  const { data: allHunters = [], isLoading: huntersLoading, error } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters"],
    queryFn: async () => {
      const response = await apiRequest<Hunter[]>('GET', '/api/hunters');
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch hunters');
      }
      return response.data || [];
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  // Récupérer un chasseur par son ID
  const getHunter = (id: number) => {
    return useQuery<Hunter>({
      queryKey: ["/api/hunters", id],
      enabled: !!id,
      queryFn: async () => {
        const response = await apiRequest<Hunter>('GET', `/api/hunters/${id}`);
        if (!response.ok) {
          throw new Error(response.error || 'Failed to fetch hunter');
        }
        if (!response.data) {
          throw new Error('Hunter not found');
        }
        return response.data;
      },
      staleTime: 1000 * 30,
    });
  };

  // Récupérer les chasseurs mineurs
  const getMinorHunters = () => {
    return useQuery<Hunter[]>({
      queryKey: ["/api/hunters/minors"],
      queryFn: async () => {
        const response = await apiRequest<Hunter[]>('GET', `/api/hunters/minors`);
        if (!response.ok) {
          throw new Error(response.error || 'Failed to fetch minor hunters');
        }
        return response.data || [];
      },
      staleTime: 1000 * 30,
    });
  };

  // Récupérer les chasseurs d'une région spécifique
  const getHuntersByRegion = (region: string) => {
    return useQuery<Hunter[]>({
      queryKey: ["/api/hunters/region", region],
      enabled: !!region,
      queryFn: async () => {
        const response = await apiRequest<Hunter[]>('GET', `/api/hunters/region/${region}`);
        if (!response.ok) {
          throw new Error(response.error || 'Failed to fetch hunters by region');
        }
        return response.data || [];
      },
      staleTime: 1000 * 30,
    });
  };

  // Mutation pour marquer/démarquer un chasseur comme mineur
  const toggleMinorStatus = useMutation({
    mutationFn: async ({ hunterId, isMinor }: { hunterId: number; isMinor: boolean }) => {
      const response = await apiRequest<Hunter>('PUT', `/hunters/${hunterId}`, { isMinor });
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la mise à jour du statut mineur");
      }
      if (!response.data) {
        throw new Error('No hunter data returned');
      }
      return response.data;
    },
    onSuccess: (updatedHunter) => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/minors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", (updatedHunter as Hunter).id] });
      toast({
        title: "Statut mineur mis à jour",
        description: `Le chasseur est maintenant ${(updatedHunter as Hunter).isMinor ? "marqué comme mineur" : "marqué comme adulte"}.`,
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
    allHunters,
    huntersLoading,
    error,
    getHunter,
    getMinorHunters,
    getHuntersByRegion,
    toggleMinorStatus,
  };
}

// Hook pour récupérer les chasseurs créés par l'utilisateur (agent / sous-agent)
// Utilise le nouveau filtre backend ?createdByMe=true
export function useSectorHuntersCreatedByMe() {
  const { data: mySectorHunters = [], isLoading, error } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters", { createdByMe: true }],
    queryFn: async () => {
      const response = await apiRequest<Hunter[]>('GET', '/api/hunters?createdByMe=true');
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch sector hunters (created by me)');
      }
      return response.data || [];
    },
    staleTime: 1000 * 30,
  });

  return { mySectorHunters, isLoading, error };
}

// Hook pour la liste nationale (tous les chasseurs)
export function useNationalHunters() {
  const { data: nationalHunters = [], isLoading: nationalLoading, error: nationalError } = useQuery<Hunter[]>({
    queryKey: ["/api/hunters/all"],
    queryFn: async () => {
      const response = await apiRequest<Hunter[]>('GET', '/api/hunters/all');
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch national hunters');
      }
      return response.data || [];
    },
    staleTime: 1000 * 30,
  });

  return { nationalHunters, nationalLoading, nationalError };
}

// Hook spécifique pour les détails d'un chasseur et les opérations associées
export function useHunterDetails(hunterId: number) {
  const queryClient = useQueryClient();
  console.log("Démarrage du hook useHunterDetails avec l'ID:", hunterId);

  // Récupérer les détails du chasseur
  const { data: hunter, isLoading, error } = useQuery<Hunter>({
    queryKey: ["/api/hunters", hunterId],
    enabled: !!hunterId,
    queryFn: async ({ queryKey }) => {
      console.log("Exécution de la queryFn pour les détails du chasseur, queryKey:", queryKey);
      const response = await apiRequest<Hunter>('GET', `/api/hunters/${hunterId}`);
      if (!response.ok) {
        console.error("Erreur lors de la requête chasseur:", response.error);
        throw new Error(response.error || "Erreur lors de la récupération du chasseur");
      }
      if (!response.data) {
        throw new Error('Hunter not found');
      }
      console.log("Données reçues du serveur pour le chasseur:", response.data);
      return response.data;
    },
  });

  // Mutation pour suspendre un chasseur
  const suspendHunter = useMutation<Hunter, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest<Hunter>('PUT', `/api/hunters/${hunterId}/suspend`);
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la suspension du chasseur");
      }
      if (!response.data) {
        throw new Error('No hunter data returned');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", hunterId] });
      queryClient.invalidateQueries({ queryKey: ["hunter", hunterId] });
      toast({
        title: "Chasseur suspendu",
        description: "Le chasseur a été suspendu avec succès. Tous ses permis associés ont également été suspendus.",
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

  // Mutation pour réactiver un chasseur
  const reactivateHunter = useMutation<Hunter, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest<Hunter>('PUT', `/api/hunters/${hunterId}/activate`);
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la réactivation du chasseur");
      }
      if (!response.data) {
        throw new Error('No hunter data returned');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", hunterId] });
      queryClient.invalidateQueries({ queryKey: ["hunter", hunterId] });
      toast({
        title: "Chasseur réactivé",
        description: "Le chasseur a été réactivé avec succès.",
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

  // Mutation pour supprimer un chasseur
  const deleteHunter = useMutation<void, Error, { id: number; force?: boolean }>({
    mutationFn: async ({ id, force = false }: { id: number, force?: boolean }) => {
      console.log(`🗑️ Suppression du chasseur ID: ${id}, force=${force}`);
      const response = await apiRequest<unknown>('DELETE', `/api/hunters/${id}${force ? '?force=true' : ''}`);
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la suppression du chasseur");
      }
      return undefined as void;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", hunterId] });
      queryClient.invalidateQueries({ queryKey: ["hunter", hunterId] });
      queryClient.removeQueries({ queryKey: ["/api/hunters", hunterId] });
      queryClient.removeQueries({ queryKey: ["hunter", hunterId] });
      toast({
        title: "Chasseur supprimé",
        description: "Le chasseur a été supprimé avec succès.",
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

  // Mutation pour toggle le statut mineur
  const toggleMinorStatus = useMutation({
    mutationFn: async (isMinor: boolean) => {
      const response = await apiRequest<Hunter>('PUT', `/api/hunters/${hunterId}`, { isMinor });
      if (!response.ok) {
        throw new Error(response.error || "Une erreur est survenue lors de la modification du statut mineur");
      }
      if (!response.data) {
        throw new Error('No hunter data returned');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hunters", hunterId] });
      toast({
        title: "Statut mis à jour",
        description: "Le statut mineur du chasseur a été mis à jour avec succès.",
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
    hunter,
    isLoading,
    error,
    suspendHunter,
    suspendLoading: suspendHunter.isPending,
    reactivateHunter,
    reactivateLoading: reactivateHunter.isPending,
    deleteHunter,
    deleteLoading: deleteHunter.isPending,
    toggleMinorStatus,
  };
}

// Hooks spécifiques pour les listes de chasseurs par région ou zone
export function useHuntersByRegion(region: string | null) {
  const { data: hunters, isLoading, error } = useQuery({
    queryKey: ["/api/hunters/region", region],
    enabled: !!region,
  });

  return { hunters, isLoading, error };
}

export function useHuntersByZone(zone: string | null) {
  const { data: hunters, isLoading, error } = useQuery({
    queryKey: ["/api/hunters/zone", zone],
    enabled: !!zone,
  });

  return { hunters, isLoading, error };
}
