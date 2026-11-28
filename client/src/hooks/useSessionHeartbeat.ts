import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { afterLogoutClearAll, apiRequest } from "@/lib/queryClient";
import { resolveApiUrl } from "@/utils/environment";
import { getLoginRoute, resolveLogoutRedirectRoute } from "@/utils/getLoginRoute";
import { removePreference } from "@/utils/preferences";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Configuration ─────────────────────────────────────────────────
const INACTIVITY_TIMEOUT_MS = 4 * 60 * 1000;   // 4 minutes d'inactivité avant verrouillage
const COUNTDOWN_MS          = 30 * 1000;        // 30 secondes de compte à rebours avant verrouillage
const HEARTBEAT_INTERVAL_MS = 60 * 1000;        // Heartbeat toutes les 60 secondes
const WARNING_BEFORE_MS     = INACTIVITY_TIMEOUT_MS - COUNTDOWN_MS; // Moment où le countdown démarre

// ── États du verrouillage ─────────────────────────────────────────
export type LockState = "active" | "countdown" | "locked" | "expired";

export interface SessionHeartbeatState {
  lockState: LockState;
  countdownSeconds: number;      // Secondes restantes avant verrouillage (0-30)
  reauthenticate: (password: string) => Promise<{ ok: boolean; error?: string }>;
  forceLogout: () => Promise<void>;
}

/**
 * Hook qui gère le heartbeat de session + verrouillage d'écran.
 *
 * - Tant que l'utilisateur bouge la souris / tape au clavier, un heartbeat
 *   est envoyé au serveur toutes les 60s pour maintenir la session vivante.
 * - Après 3min30 d'inactivité, un countdown de 30s s'affiche.
 * - Après 4min, l'écran se verrouille (overlay opaque).
 *   L'utilisateur peut saisir son mot de passe pour reprendre sans perdre
 *   son état React (formulaires en cours, etc.).
 * - Si la session côté serveur a expiré, l'état passe à "expired"
 *   et l'utilisateur est redirigé vers /login.
 */
export function useSessionHeartbeat(isAuthenticated: boolean, disableLock: boolean = false): SessionHeartbeatState {
  const [lockState, setLockState] = useState<LockState>("active");
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const lastActivityRef   = useRef(Date.now());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef         = useRef(isAuthenticated);
  const lockStateRef        = useRef<LockState>("active");
  const disableLockRef      = useRef(disableLock);
  const isForceLoggingOutRef = useRef(false);

  useEffect(() => {
    lockStateRef.current = lockState;
  }, [lockState]);

  useEffect(() => {
    disableLockRef.current = disableLock;
  }, [disableLock]);

  // Garder le ref synchronisé et réinitialiser l'inactivité à la connexion
  useEffect(() => { 
    isActiveRef.current = isAuthenticated; 
    if (isAuthenticated) {
      lastActivityRef.current = Date.now();
      setLockState("active");
      setCountdownSeconds(0);
    }
  }, [isAuthenticated]);

  // ── Re-authentification (déverrouillage avec timeout sécurisé) ──
  const reauthenticate = useCallback(async (password: string): Promise<{ ok: boolean; error?: string }> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await authenticatedFetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        signal: controller.signal,
      });

      let body: any = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (res.ok) {
        setLockState("active");
        lastActivityRef.current = Date.now();
        return { ok: true };
      }

      const msg = String(body?.message || body?.error || "");
      if (res.status === 401) {
        if (msg.toLowerCase().includes("incorrect")) {
          return { ok: false, error: "Mot de passe incorrect. Veuillez réessayer." };
        }
        setLockState("expired");
        return {
          ok: false,
          error: "Session expirée côté serveur. Cliquez sur « Se déconnecter » puis reconnectez-vous.",
        };
      }
      if (res.status === 403) {
        return { ok: false, error: "Accès refusé. Veuillez vous reconnecter." };
      }
      return {
        ok: false,
        error: msg || "Impossible de vérifier le mot de passe. Réessayez.",
      };
    } catch (err: any) {
      if (err?.name === "AbortError") {
        return { ok: false, error: "Délai dépassé : le serveur ne répond pas. Vérifiez que le backend est actif." };
      }
      return {
        ok: false,
        error: "Impossible de joindre le serveur. Vérifiez votre connexion.",
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  // ── Déconnexion forcée ──────────────────────────────────────────
  const forceLogout = useCallback(async () => {
    if (isForceLoggingOutRef.current) return;
    isForceLoggingOutRef.current = true;

    // 1. Résoudre la route exacte de redirection (ex: page login de l'unique domaine visible)
    //    AVANT de vider le cache React Query, pendant que l'overlay opaque reste affiché.
    const targetRoute = await resolveLogoutRedirectRoute().catch(() => getLoginRoute());

    // 2. Fermer la session serveur via fetch direct (sans passer par apiRequest)
    //    afin d'éviter tout événement sessionExpired ou popup apiRefusal si le token a déjà expiré.
    const controller = new AbortController();
    const timerId = window.setTimeout(() => controller.abort(), 2000);
    try {
      let token: string | null = null;
      try {
        token = localStorage.getItem("token") || sessionStorage.getItem("token");
      } catch {
        token = null;
      }
      await fetch(resolveApiUrl("/api/auth/logout"), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          reason: lockStateRef.current === "expired" ? "session_expired" : "inactivity",
        }),
        signal: controller.signal,
      });
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    } finally {
      window.clearTimeout(timerId);
    }

    // 3. Nettoyer la session locale sans toucher à lockState (évite tout flash des données sous-jacentes)
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("scodi_session");
      localStorage.removeItem("userRole");
      localStorage.removeItem("userRegion");
      sessionStorage.removeItem("token");
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    }
    try {
      await Promise.all([
        removePreference("token"),
        removePreference("scodi_session"),
        removePreference("userRole"),
        removePreference("userRegion"),
      ]);
      await afterLogoutClearAll();
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    }

    // 4. Garder l'overlay verrouillé opaque jusqu'à la fin de la redirection vers la page exacte
    window.location.replace(targetRoute);
  }, []);

  // ── Envoi du heartbeat (uniquement si l'utilisateur est réellement actif) ──
  const sendHeartbeat = useCallback(async (forceInitial = false) => {
    if (!isActiveRef.current) return;
    if (lockStateRef.current === "locked" || lockStateRef.current === "expired") return;
    const elapsedSinceActivity = Date.now() - lastActivityRef.current;
    if (!forceInitial && !disableLockRef.current && elapsedSinceActivity >= HEARTBEAT_INTERVAL_MS + 15_000) {
      // Ne pas maintenir artificiellement la session ni mettre à jour last_activity si l'utilisateur est inactif
      return;
    }
    try {
      const res = await apiRequest<{ active: boolean; expiresAt?: number }>({
        url: "/api/auth/heartbeat",
        method: "GET",
      });
      if (!res?.active) {
        // Session serveur expirée
        setLockState("expired");
      }
    } catch (err: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
      if (err?.status === 401) {
        setLockState("expired");
       }
    }
  }, []);

  // ── Détection d'activité utilisateur ────────────────────────────
  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Si on était en countdown, annuler immédiatement
    if (lockStateRef.current === "countdown") {
      setLockState("active");
      setCountdownSeconds(0);
    }
  }, []);

  // ── Heartbeat interval ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      if (!isForceLoggingOutRef.current) {
        setLockState("active");
      }
      return;
    }

    // Envoyer le heartbeat périodiquement (seulement si activité récente)
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat(false);
    }, HEARTBEAT_INTERVAL_MS);

    // Premier heartbeat immédiat à la connexion
    sendHeartbeat(true);

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [isAuthenticated, sendHeartbeat]);

  // ── Vérification d'inactivité + countdown ──────────────────────
  useEffect(() => {
    if (!isAuthenticated || lockState === "locked" || lockState === "expired" || disableLock) return;

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= INACTIVITY_TIMEOUT_MS) {
        // Verrouiller
        setLockState("locked");
        setCountdownSeconds(0);
      } else if (elapsed >= WARNING_BEFORE_MS) {
        // Démarrer le countdown
        const remaining = Math.ceil((INACTIVITY_TIMEOUT_MS - elapsed) / 1000);
        setLockState("countdown");
        setCountdownSeconds(remaining);
      } else {
        setLockState("active");
        setCountdownSeconds(0);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isAuthenticated, lockState, disableLock]);

  // ── Écouteurs d'activité (mouse, keyboard, touch, scroll) ──────
  useEffect(() => {
    if (!isAuthenticated || lockState === "locked" || lockState === "expired") return;

    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    const handler = () => onActivity();

    // Throttle leading-edge pour mousemove/scroll : réagit instantanément (annule le countdown sans délai)
    let lastThrottledRun = 0;
    const throttledHandler = () => {
      const now = Date.now();
      if (lockStateRef.current === "countdown" || now - lastThrottledRun >= 3000) {
        lastThrottledRun = now;
        handler();
      }
    };

    for (const evt of events) {
      if (evt === "mousemove" || evt === "scroll") {
        window.addEventListener(evt, throttledHandler, { passive: true });
      } else {
        window.addEventListener(evt, handler, { passive: true });
      }
    }

    return () => {
      for (const evt of events) {
        if (evt === "mousemove" || evt === "scroll") {
          window.removeEventListener(evt, throttledHandler);
        } else {
          window.removeEventListener(evt, handler);
        }
      }
    };
  }, [isAuthenticated, lockState, onActivity]);

  return { lockState, countdownSeconds, reauthenticate, forceLogout };
}
