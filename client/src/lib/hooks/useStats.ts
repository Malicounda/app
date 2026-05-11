
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface Stats {
  activePermits: number;
  expiredPermits: number;
  activeHunters: number;
  totalTaxes: number;
  hunterCount: number;
  permitCount: number;
  revenue: number;
  activePermitCount: number;
  expiredPermitCount: number;
  campaignSettings: {
    startDate: string;
    endDate: string;
    status: string;
    quotas: Record<string, number>;
    regions: string[];
  };
}

// Hook minimal avec données null par défaut (backend /api/stats non implémenté)
export function useStats(): { stats: Stats | null; loading: boolean; error: unknown; refetch: () => void } {
  return {
    stats: null,
    loading: false,
    error: null,
    refetch: () => {},
  };
}
