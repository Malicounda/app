import { useQuery } from "@tanstack/react-query";

// Types
interface PermitRequest {
  id: number;
  hunterId: number;
  status: "pending" | "approved" | "rejected";
  requestDate: string;
  type: string;
  category?: string;
  area?: string;
  zone?: string;
  pickupLocation?: string;
  receiptNumber?: string;
}

// Hook pour récupérer toutes les demandes de permis
export function usePermitRequests() {
  const { data, isLoading, error } = useQuery<PermitRequest[]>({
    queryKey: ['/api/permit-requests'],
  });

  return {
    requests: data || [],
    isLoading,
    error,
  };
}

// Hook pour récupérer les demandes de permis par zone
export function usePermitRequestsByZone(zone: string | null) {
  const { data: allRequests, isLoading, error } = useQuery<PermitRequest[]>({
    queryKey: ['/api/permit-requests'],
  });

  // Filtrer les demandes par zone ou lieu de retrait
  const requests = allRequests?.filter(request => 
    zone && (request.zone === zone || request.pickupLocation === zone)
  ) || [];

  return {
    requests,
    isLoading,
    error,
  };
}

// Hook pour récupérer une demande spécifique
export function usePermitRequest(requestId: number | null) {
  const { data, isLoading, error } = useQuery<PermitRequest>({
    queryKey: [`/api/permit-requests/${requestId}`],
    enabled: !!requestId,
  });

  return {
    request: data,
    isLoading,
    error,
  };
}