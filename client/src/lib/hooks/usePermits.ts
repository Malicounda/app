import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { Permit, PermitWithHunterInfo } from '@/types/permits';
import { Hunter } from '@/types/hunters';

export function usePermits() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: allPermits = [], isLoading, error, refetch } = useQuery({
    queryKey: ["/api/permits"],
    queryFn: async () => {
      const response = await apiRequest<PermitWithHunterInfo[]>('GET', '/permits');
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch permits');
      }
      const data = response.data || [];
      console.log('[usePermits] Données reçues du serveur:', {
        count: data.length,
        sampleKeys: data[0] ? Object.keys(data[0]) : [],
        firstItem: data[0]
      });
      if (data[0]) {
        console.log('[usePermits] Premier permis détaillé:', JSON.stringify(data[0], null, 2));
      }
      return data;
    },
    staleTime: 1000 * 30, // 30 seconds
    retry: (failureCount, error) => {
      // Limiter les réessais à 1 fois pour éviter trop de requêtes
      return failureCount < 1;
    },
  });

  useEffect(() => {
    if (error) {
      console.error("Error fetching permits:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les permis.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    allPermits,
    isLoading,
    error,
    refetch
  };
}

export function usePermitsByZone(zone: string | null) {
  const { allPermits = [], isLoading, error } = usePermits();
  
  // LOGIQUE CORRIGÉE :
  // - Si zone est définie (agent secteur), retourner tableau vide pour l'instant
  // - Si zone est null/undefined, retourner tableau vide aussi (pas de zone = pas de permis secteur)
  // Le hook usePermits() séparé sera utilisé pour la liste nationale
  const permits: any[] = [];

  console.log('[usePermitsByZone] Filtrage par zone:', {
    zone,
    userZone: zone || 'undefined/null',
    totalPermits: Array.isArray(allPermits) ? allPermits.length : 0,
    filteredPermits: permits.length,
    logic: 'Secteur toujours vide pour l\'instant (en attente d\'implémentation du vrai filtrage)'
  });

  return {
    permits, 
    isLoading,
    error
  };
}

export function usePermitsByHunter(hunterId: number | null) {
  const { toast } = useToast();

  const { data: hunterPermits = [], isLoading: isLoadingHunterPermits, error: hunterPermitsError } = useQuery<Permit[]>({
    queryKey: [`/api/permits/hunter/${hunterId}`],
    queryFn: async () => {
      if (!hunterId) return [] as Permit[];
      const response = await apiRequest<Permit[]>('GET', `/permits/hunter/${hunterId}`);
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch hunter permits');
      }
      return response.data || [];
    },
    enabled: !!hunterId,
    staleTime: 1000 * 30, // 30 seconds
  });

  useEffect(() => {
    if (hunterPermitsError) {
      console.error("Error fetching hunter permits:", hunterPermitsError);
      toast({
        title: "Erreur",
        description: "Impossible de charger les permis du chasseur.",
        variant: "destructive",
      });
    }
  }, [hunterPermitsError, toast]);

  return {
    hunterPermits,
    isLoadingHunterPermits,
    hunterPermitsError
  };
}

export function usePermitDetails(permitId: number | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  async function getPermit(): Promise<Permit> {
    try {
      const response = await apiRequest<Permit>('GET', `/api/permits/${permitId}`);
      if (!response.ok) {
        console.error(`Erreur lors de la récupération du permis ${permitId}:`, response.error);
        toast({
          title: "Erreur",
          description: "Le permis demandé n'existe pas ou n'est plus disponible.",
          variant: "destructive",
        });
        throw new Error(response.error || 'Failed to fetch permit');
      }
      if (!response.data) {
        toast({
          title: "Erreur",
          description: "Aucune donnée de permis disponible.",
          variant: "destructive",
        });
        throw new Error('No permit data returned');
      }
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du permis ${permitId}:`, error);
      throw error;
    }
  };

  const getHunter = async (hunterId: number): Promise<Hunter | undefined> => {
    try {
      const response = await apiRequest<Hunter>('GET', `/api/hunters/${hunterId}`);
      if (!response.ok) {
        console.error(`Erreur lors de la récupération du chasseur ${hunterId}:`, response.error);
        toast({
          title: "Avertissement",
          description: "Les informations du chasseur ne sont pas disponibles.",
          variant: "default",
        });
        return undefined;
      }
      return response.data;
    } catch (error) {
      console.error(`Erreur lors de la récupération du chasseur ${hunterId}:`, error);
      return undefined;
    }
  };

  const { data: permit, isLoading, error, refetch } = useQuery({
    queryKey: [`/api/permits/${permitId}`],
    enabled: !!permitId,
    staleTime: 1000 * 30, // 30 seconds
    queryFn: getPermit,
    retry: (failureCount, error) => {
      // Ne réessayez pas les erreurs 404 (introuvable)
      if (error instanceof Error && error.message.includes('404')) {
        return false;
      }
      // Sinon, réessayer jusqu'à 2 fois maximum
      return failureCount < 2;
    },
    retryDelay: 1000,
  });

  const deletePermitMutation = useMutation<void, Error, number>({
    mutationFn: async (permitId: number) => {
      const response = await apiRequest<void>("DELETE", `/api/permits/${permitId}`);
      if (!response.ok) {
        throw new Error(response.error || 'Failed to delete permit');
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Le permis a été supprimé avec succès.",
        variant: "default",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
    },
    onError: (error) => {
      console.error("Error deleting permit:", error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le permis. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  return { permit, isLoading, error, refetch, getHunter, deletePermit: deletePermitMutation.mutate };
}

export function useSuspendedPermits() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: suspendedPermits = [],
    isLoading: isLoadingSuspended,
    error: suspendedError,
    refetch: refetchSuspended
  } = useQuery<Permit[], Error>({
    queryKey: ["/api/permits/suspended"],
    queryFn: async () => {
      const response = await apiRequest<Permit[]>('GET', '/permits/suspended');
      if (!response.ok) {
        throw new Error(response.error || 'Failed to fetch suspended permits');
      }
      return response.data || [];
    },
    staleTime: 1000 * 30, // 30 seconds
  });

  useEffect(() => {
    if (suspendedError) {
      console.error("Error fetching suspended permits:", suspendedError);
      toast({
        title: "Erreur",
        description: "Impossible de charger les permis suspendus.",
        variant: "destructive",
      });
    }
  }, [suspendedError, toast]);

  const deletePermitMutation = useMutation<void, Error, number>({
    mutationFn: async (permitId: number) => {
      const response = await apiRequest<void>("DELETE", `/api/permits/${permitId}`);
      if (!response.ok) {
        throw new Error(response.error || 'Failed to delete permit');
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Le permis a été supprimé avec succès.",
        variant: "default",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
    },
    onError: (error) => {
      console.error("Error deleting permit:", error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le permis. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const deleteAllSuspendedPermitsMutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await apiRequest<void>("DELETE", "/api/permits/suspended/all");
      if (!response.ok) {
        throw new Error(response.error || 'Failed to delete all suspended permits');
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Les permis suspendus ont été supprimés avec succès.",
        variant: "default",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/hunters"] });
    },
    onError: (error) => {
      console.error("Error deleting all suspended permits:", error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer les permis suspendus. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  const deleteBatchPermitsMutation = useMutation<void, Error, number[]>({
    mutationFn: async (permitIds: number[]) => {
      const response = await apiRequest<void>("POST", "/api/permits/batch/delete", { permitIds });
      if (!response.ok) {
        throw new Error(response.error || 'Failed to delete batch permits');
      }
    },
    onSuccess: () => {
      toast({
        title: "Succès",
        description: "Les permis sélectionnés ont été supprimés avec succès.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/permits/suspended"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/permits"] });
    },
    onError: (error) => {
      console.error("Error deleting batch permits:", error);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer les permis sélectionnés. Veuillez réessayer.",
        variant: "destructive",
      });
    },
  });

  return {
    suspendedPermits,
    isLoadingSuspended,
    suspendedError,
    refetchSuspended,
    deletePermit: deletePermitMutation.mutate,
    deleteAllSuspendedPermits: deleteAllSuspendedPermitsMutation.mutate,
    deleteBatchPermits: deleteBatchPermitsMutation.mutate,
    isDeleting: deletePermitMutation.isPending || deleteAllSuspendedPermitsMutation.isPending || deleteBatchPermitsMutation.isPending,
  };
}

export function useHuntersByRegion(region: string | null) {
  const { toast } = useToast();
  
  const getHuntersByRegion = async () => {
    try {
      const response = await apiRequest<Hunter[]>('GET', `/api/hunters/region/${region}`);
      if (!response.ok) {
        console.error(`Erreur lors de la récupération des chasseurs pour la région ${region}:`, response.error);
        // En cas d'erreur 404, retournez un tableau vide plutôt que de lancer une erreur
        if (response.error && response.error.includes('404')) {
          toast({
            title: "Information",
            description: "Aucun chasseur trouvé pour cette région.",
            variant: "default",
          });
          return [];
        }
        throw new Error(response.error || 'Failed to fetch hunters');
      }
      return response.data || [];
    } catch (error) {
      console.error('Error fetching hunters by region:', error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les chasseurs pour cette région.",
        variant: "destructive",
      });
      return [];
    }
  };
  
  const { data: hunters = [], isLoading, error, refetch } = useQuery({
    queryKey: [`/api/hunters/region/${region}`],
    queryFn: getHuntersByRegion,
    enabled: !!region,
    staleTime: 1000 * 60, // 1 minute
    retry: (failureCount, error) => {
      // Limiter les réessais à 1 fois pour éviter trop de requêtes
      return failureCount < 1;
    },
  });

  return {
    hunters,
    isLoading,
    error,
    refetch
  };
}