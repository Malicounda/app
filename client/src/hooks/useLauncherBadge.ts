import { useAuth } from "@/contexts/AuthContext";
import { syncLauncherBadge } from "@/lib/launcherBadge";
import { useUnreadNotificationsCount } from "@/lib/hooks/useUnreadNotifications";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";
import { App } from "@capacitor/app";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Synchronise le badge icône APK avec alertes + messages non lus. */
export function useLauncherBadge(enabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: unreadAlerts } = useUnreadNotificationsCount();

  const { data: unreadMsg } = useQuery({
    queryKey: ["messages-unread-count-launcher-badge"],
    queryFn: async () => {
      try {
        const res = await authenticatedFetch(
          `/api/messages/unread-count?${getMessagingDomaineQueryParam()}`
        );
        if (!res.ok) return { total: 0 };
        return await res.json();
      } catch {
        return { total: 0 };
      }
    },
    enabled: enabled && !!user,
    refetchInterval: 10_000,
  });

  const pushBadge = () => {
    const total = (unreadAlerts?.count ?? 0) + (unreadMsg?.total ?? 0);
    void syncLauncherBadge(total);
  };

  useEffect(() => {
    if (!enabled) return;
    pushBadge();
  }, [enabled, unreadAlerts?.count, unreadMsg?.total]);

  useEffect(() => {
    if (!enabled) return;

    const onRefresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
      void queryClient.invalidateQueries({ queryKey: ["messages-unread-count-launcher-badge"] });
      void queryClient.invalidateQueries({ queryKey: ["messages-unread-count-main"] });
      void queryClient.invalidateQueries({ queryKey: ["messages-unread-count-alerte"] });
    };
    window.addEventListener("launcher-badge-refresh", onRefresh);

    let removeApp: (() => void) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) onRefresh();
    }).then((h) => {
      removeApp = () => h.remove();
    });

    return () => {
      window.removeEventListener("launcher-badge-refresh", onRefresh);
      removeApp?.();
    };
  }, [enabled, queryClient]);

  return { total: (unreadAlerts?.count ?? 0) + (unreadMsg?.total ?? 0) };
}
