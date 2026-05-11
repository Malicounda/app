import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

export function useTaxes() {
  const { toast } = useToast();

  const {
    data: taxes,
    isLoading,
    error,
    refetch
  } = useQuery<any[]>({
    queryKey: ["/api/taxes"],
    queryFn: () => apiRequest({ url: "/api/taxes", method: "GET" }),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (error) {
      console.error("Error fetching taxes:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les taxes. Veuillez réessayer.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    taxes,
    isLoading,
    error,
    refetch
  };
}

export function useHunterTaxes(hunterId: number | null) {
  const { toast } = useToast();

  const {
    data: taxes,
    isLoading,
    error,
    refetch
  } = useQuery<any[]>({
    queryKey: [`/api/taxes/hunter/${hunterId}`],
    queryFn: () => apiRequest({ url: `/api/taxes/hunter/${hunterId}`, method: "GET" }),
    enabled: !!hunterId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (error) {
      console.error("Error fetching hunter taxes:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les taxes du chasseur.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    taxes,
    isLoading,
    error,
    refetch
  };
}

export function usePermitTaxes(permitId: number | null) {
  const { toast } = useToast();

  const {
    data: taxes,
    isLoading,
    error,
    refetch
  } = useQuery<any[]>({
    queryKey: [`/api/taxes/permit/${permitId}`],
    queryFn: () => apiRequest({ url: `/api/taxes/permit/${permitId}`, method: "GET" }),
    enabled: !!permitId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (error) {
      console.error("Error fetching permit taxes:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les taxes associées au permis.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    taxes,
    isLoading,
    error,
    refetch
  };
}

export function useTaxDetails(taxId: number | null) {
  const { toast } = useToast();

  const {
    data: tax,
    isLoading,
    error,
    refetch
  } = useQuery<any>({
    queryKey: [`/api/taxes/${taxId}`],
    queryFn: () => apiRequest({ url: `/api/taxes/${taxId}`, method: "GET" }),
    enabled: !!taxId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  useEffect(() => {
    if (error) {
      console.error("Error fetching tax details:", error);
      toast({
        title: "Erreur",
        description: "Impossible de charger les détails de la taxe.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  return {
    tax,
    isLoading,
    error,
    refetch
  };
}
