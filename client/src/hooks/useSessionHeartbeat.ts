import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { apiRequest } from "@/lib/queryClient";
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
  const isActiveRef       = useRef(isAuthenticated);
  const lockStateRef      = useRef<LockState>("active");
  const disableLockRef    = useRef(disableLock);

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
    try {
      await apiRequest({
        url: "/api/auth/logout",
        method: "POST",
        data: { reason: lockState === "expired" ? "session_expired" : "inactivity" },
      });
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
    try {
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
    } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
    const prevDomain = localStorage.getItem('domain');
    if (prevDomain === "ALERTE") {
      window.location.href = "/alerte-login";
    } else if (prevDomain === "REBOISEMENT") {
      window.location.href = "/reboisement-login";
    } else {
      window.location.href = "/login";
    }
  }, [lockState]);

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
      setLockState("active");
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
