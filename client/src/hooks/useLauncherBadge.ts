import { useAuth } from "@/contexts/AuthContext";
import { syncLauncherBadge } from "@/lib/launcherBadge";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { getMessagingDomaineQueryParam } from "@/utils/messagingDomain";
import { App } from "@capacitor/app";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";

// ──────────────────────────────────────────────────────────────────────
// fetchTotalUnread : appel API DIRECT au serveur (pas de cache React Query).
// C'est la source de vérité unique pour le badge de l'icône.
// Identique aux données des cartes Alerte et Message de la page d'accueil.
// ──────────────────────────────────────────────────────────────────────

async function fetchTotalUnread(): Promise<number> {
  try {
    const [alertsRes, msgsRes] = await Promise.allSettled([
      authenticatedFetch("/api/alerts/unread-count"),
      authenticatedFetch(`/api/messages/unread-count?${getMessagingDomaineQueryParam()}`),
    ]);

    let alertCount = 0;
    let msgCount = 0;

    if (alertsRes.status === "fulfilled" && alertsRes.value.ok) {
      const data = await alertsRes.value.json();
      alertCount = data?.count || 0;
    }
    if (msgsRes.status === "fulfilled" && msgsRes.value.ok) {
      const data = await msgsRes.value.json();
      msgCount = data?.total || 0;
    }

    return alertCount + msgCount;
  } catch {
    return 0;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Hook principal
// ──────────────────────────────────────────────────────────────────────

/** Synchronise le badge icône APK avec le VRAI total non-lu du serveur. */
export function useLauncherBadge(enabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBadgeRef = useRef<number>(-1);

  // Fonction centrale : interroge le serveur et met à jour le badge
  const refreshBadge = useCallback(async () => {
    if (!enabled || !user) return;
    try {
      const total = await fetchTotalUnread();
      // Éviter les appels badge inutiles si la valeur n'a pas changé
      if (total !== lastBadgeRef.current) {
        lastBadgeRef.current = total;
        await syncLauncherBadge(total);
        console.log("[Badge] 🔢 Mis à jour:", total);
      }
    } catch (e) {
      console.warn("[Badge] refresh error:", e);
    }
  }, [enabled, user]);

  // 1. Rafraîchir le badge au montage et à chaque changement d'état
  useEffect(() => {
    if (!enabled || !user) return;
    // Rafraîchir immédiatement
    void refreshBadge();
  }, [enabled, user, refreshBadge]);

  // 2. Polling indépendant toutes les 8 secondes (fonctionne même en arrière-plan)
  //    C'est un setInterval natif, pas un hook React — il persiste tant que le composant est monté
  useEffect(() => {
    if (!enabled || !user) return;

    intervalRef.current = setInterval(() => {
      void refreshBadge();
    }, 8_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, user, refreshBadge]);

  // 3. Écouter l'événement launcher-badge-refresh (déclenché quand on lit un message/alerte)
  useEffect(() => {
    if (!enabled) return;

    const onRefresh = () => {
      // Invalider TOUTES les query keys des compteurs pour que les cartes se mettent aussi à jour
      queryClient.invalidateQueries({ queryKey: ["unread-alerts-count"] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count-launcher-badge"] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count-main"] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count-alerte"] });
      queryClient.invalidateQueries({ queryKey: ["messages-unread-count-supervisor-home"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications-count"] });
      // Rafraîchir le badge immédiatement depuis le serveur
      void refreshBadge();
    };
    window.addEventListener("launcher-badge-refresh", onRefresh);

    // Quand l'app revient au premier plan → rafraîchir le badge
    let removeApp: (() => void) | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) {
        onRefresh();
      }
    }).then((h) => {
      removeApp = () => h.remove();
    });

    return () => {
      window.removeEventListener("launcher-badge-refresh", onRefresh);
      removeApp?.();
    };
  }, [enabled, queryClient, refreshBadge]);
}
