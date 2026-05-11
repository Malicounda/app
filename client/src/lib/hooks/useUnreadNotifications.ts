import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";

export function useUnreadNotificationsCount() {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  return useQuery<{ count: number }, Error>({
    queryKey: ["unread-alerts-count"],
    queryFn: async () => {
      const res = await apiRequest<{ count: number }>("GET", "/alerts/unread-count");
      if (!res.ok) throw new Error(res.error || "Failed to fetch unread alerts count");
      return res.data as { count: number };
    },
    enabled: isOnline,
    retry: false,
    refetchInterval: isOnline ? 15000 : false,
    refetchOnWindowFocus: isOnline,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
