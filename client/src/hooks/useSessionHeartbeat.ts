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
  reauthenticate: (password: string) => Promise<boolean>;
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
 * - Si la session côté serveur a expiré (8h), l'état passe à "expired"
 *   et l'utilisateur est redirigé vers /login.
 */
export function useSessionHeartbeat(isAuthenticated: boolean): SessionHeartbeatState {
  const [lockState, setLockState] = useState<LockState>("active");
  const [countdownSeconds, setCountdownSeconds] = useState(0);

  const lastActivityRef   = useRef(Date.now());
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef       = useRef(isAuthenticated);

  // Garder le ref synchronisé
  useEffect(() => { isActiveRef.current = isAuthenticated; }, [isAuthenticated]);

  // ── Re-authentification (déverrouillage) ────────────────────────
  const reauthenticate = useCallback(async (password: string): Promise<boolean> => {
    try {
      // Vérifier le mot de passe via l'API existante
      await apiRequest({ url: "/api/auth/verify-password", method: "POST", data: { password } });
      // Succès : déverrouiller et réinitialiser l'inactivité
      setLockState("active");
      lastActivityRef.current = Date.now();
      return true;
    } catch {
      return false;
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
    } catch {}
    // Le AuthContext gère la redirection
    window.location.href = "/login";
  }, [lockState]);

  // ── Envoi du heartbeat ──────────────────────────────────────────
  const sendHeartbeat = useCallback(async () => {
    if (!isActiveRef.current) return;
    try {
      const res = await apiRequest<{ active: boolean; expiresAt?: number }>({
        url: "/api/auth/heartbeat",
        method: "GET",
      });
      if (!res?.active) {
        // Session serveur expirée
        setLockState("expired");
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setLockState("expired");
      }
    }
  }, []);

  // ── Détection d'activité utilisateur ────────────────────────────
  const onActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Si on était en countdown, annuler
    if (lockState === "countdown") {
      setLockState("active");
      setCountdownSeconds(0);
    }
  }, [lockState]);

  // ── Heartbeat interval ──────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated) {
      setLockState("active");
      return;
    }

    // Envoyer le heartbeat périodiquement
    heartbeatTimerRef.current = setInterval(() => {
      sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Premier heartbeat immédiat
    sendHeartbeat();

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [isAuthenticated, sendHeartbeat]);

  // ── Vérification d'inactivité + countdown ──────────────────────
  useEffect(() => {
    if (!isAuthenticated || lockState === "locked" || lockState === "expired") return;

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
  }, [isAuthenticated, lockState]);

  // ── Écouteurs d'activité (mouse, keyboard, touch, scroll) ──────
  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ["mousedown", "keydown", "touchstart", "scroll", "mousemove"] as const;
    const handler = () => onActivity();

    // Throttle léger pour mousemove/scroll
    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const throttledHandler = () => {
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => {
        handler();
        throttleTimer = null;
      }, 5000); // 5s de throttle pour mousemove
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
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [isAuthenticated, onActivity]);

  return { lockState, countdownSeconds, reauthenticate, forceLogout };
}
