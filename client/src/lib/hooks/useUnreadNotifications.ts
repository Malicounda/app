import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export function useUnreadNotificationsCount() {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  const { isAuthenticated } = useAuth();

  return useQuery<{ count: number }, Error>({
    queryKey: ["unread-alerts-count", isAuthenticated],
    queryFn: async () => {
      const res = await apiRequest<{ count: number }>("GET", "/alerts/unread-count");
      if (!res.ok) throw new Error(res.error || "Failed to fetch unread alerts count");
      return res.data as { count: number };
    },
    enabled: isOnline && isAuthenticated,
    retry: false,
    refetchInterval: isOnline && isAuthenticated ? 15000 : false,
    refetchOnWindowFocus: isOnline && isAuthenticated,
    staleTime: 0,
  });
}
