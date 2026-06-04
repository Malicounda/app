import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface UnreadMessagesCounts {
  individual: number;
  group: number;
  total: number;
}

export function useUnreadMessagesCount() {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const { isAuthenticated } = useAuth();

  return useQuery<UnreadMessagesCounts, Error>({
    queryKey: ["unread-messages-count", isAuthenticated],
    queryFn: async () => {
      const response = await apiRequest<UnreadMessagesCounts>("GET", "/messages/unread-count");
      if (!response.ok || !response.data) {
        throw new Error(response.error || "Impossible de récupérer le nombre de messages non lus");
      }
      return response.data;
    },
    enabled: isOnline && isAuthenticated,
    retry: false,
    refetchInterval: isOnline && isAuthenticated ? 15000 : false,
    refetchOnWindowFocus: isOnline && isAuthenticated,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });
}
