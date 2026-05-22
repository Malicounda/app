import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { LockState } from "@/hooks/useSessionHeartbeat";
import { Lock, LogOut, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface SessionLockOverlayProps {
  lockState: LockState;
  countdownSeconds: number;
  reauthenticate: (password: string) => Promise<{ ok: boolean; error?: string }>;
  forceLogout: () => Promise<void>;
}

/** Rétablit les interactions body (Radix Dialog laisse parfois pointer-events: none) */
function restoreBodyPointerEvents() {
  try {
    document.body.style.removeProperty("pointer-events");
    document.body.style.pointerEvents = "";
    document.body.style.removeProperty("overflow");
    document.body.style.overflow = "";
    document.documentElement.style.removeProperty("overflow");
    document.body.removeAttribute("data-scroll-locked");
    document.documentElement.removeAttribute("data-scroll-locked");
  } catch {}
}

function LockBackdrop({
  children,
  onBackdropClick,
}: {
  children: ReactNode;
  onBackdropClick?: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-lock-title"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 pointer-events-auto"
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onBackdropClick?.();
      }}
    >
      <div
        className="absolute inset-0 bg-black/85 backdrop-blur-md pointer-events-auto"
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-sm pointer-events-auto">{children}</div>
    </div>
  );
}

export default function SessionLockOverlay({
  lockState,
  countdownSeconds,
  reauthenticate,
  forceLogout,
}: SessionLockOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { user } = useAuth();
  const unlockWithMatricule =
    !!(user as { isDefaultRole?: boolean })?.isDefaultRole ||
    !!(user as { isSupervisorRole?: boolean })?.isSupervisorRole;

  useEffect(() => {
    if (lockState === "active") {
      document.body.removeAttribute("data-session-locked");
      return;
    }

    document.body.setAttribute("data-session-locked", "true");
    restoreBodyPointerEvents();
    document.body.style.overflow = "hidden";

    const t1 = setTimeout(restoreBodyPointerEvents, 0);
    const t2 = setTimeout(restoreBodyPointerEvents, 100);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.body.removeAttribute("data-session-locked");
      document.body.style.removeProperty("overflow");
    };
  }, [lockState]);

  const handleForceLogout = useCallback(async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setError("");
    try {
      await forceLogout();
    } catch {
      setError("Déconnexion impossible. Rechargez la page ou videz le cache.");
      setIsLoggingOut(false);
    }
  }, [forceLogout, isLoggingOut]);

  const handleUnlock = async () => {
    if (!password.trim()) {
      setError("Veuillez saisir votre mot de passe");
      return;
    }
    setIsVerifying(true);
    setError("");
    const result = await reauthenticate(password);
    setIsVerifying(false);
    if (!result.ok) {
      setError(result.error || "Mot de passe incorrect");
      setPassword("");
    } else {
      setPassword("");
      restoreBodyPointerEvents();
    }
  };

  if (lockState === "active") return null;

  const panelClass =
    "bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 w-full text-center border border-border";

  let content: ReactNode = null;

  if (lockState === "countdown") {
    content = (
      <LockBackdrop>
        <div className={panelClass}>
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>
          <h2 id="session-lock-title" className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Inactivité détectée
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Votre session va être verrouillée dans
          </p>
          <div className="text-5xl font-bold text-amber-600 mb-4">{countdownSeconds}</div>
          <p className="text-sm text-gray-500">Bougez la souris ou appuyez sur une touche pour continuer</p>
        </div>
      </LockBackdrop>
    );
  } else if (lockState === "expired") {
    content = (
      <LockBackdrop>
        <div className={panelClass}>
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
          <h2 id="session-lock-title" className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Session expirée
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Votre session n&apos;est plus valide. Reconnectez-vous pour continuer.
          </p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={isLoggingOut}
            onClick={handleForceLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {isLoggingOut ? "Redirection…" : "Se reconnecter"}
          </Button>
        </div>
      </LockBackdrop>
    );
  } else {
    content = (
      <LockBackdrop>
        <div className={panelClass}>
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
            <Lock className="h-8 w-8 text-blue-600" />
          </div>
          <h2 id="session-lock-title" className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
            Session verrouillée
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {user?.firstName
              ? `${user.firstName} ${user.lastName || ""}`.trim()
              : user?.username || "Utilisateur"}
          </p>

          <div className="space-y-3 mb-4">
            <Input
              type="password"
              placeholder={unlockWithMatricule ? "Mot de passe ou matricule" : "Mot de passe de connexion"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleUnlock();
              }}
              disabled={isVerifying || isLoggingOut}
              autoFocus
              autoComplete="current-password"
              className="text-center"
            />
            {unlockWithMatricule && (
              <p className="text-xs text-muted-foreground">
                Compte sans mot de passe : saisissez votre matricule pour déverrouiller.
              </p>
            )}
            {error && <p className="text-sm text-red-600 whitespace-pre-line">{error}</p>}
            <Button
              type="button"
              className="w-full"
              onClick={() => void handleUnlock()}
              disabled={isVerifying || isLoggingOut || !password.trim()}
            >
              {isVerifying ? "Vérification…" : "Déverrouiller"}
            </Button>
          </div>

          <div className="border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-red-600 w-full"
              disabled={isLoggingOut || isVerifying}
              onClick={handleForceLogout}
            >
              <LogOut className="h-4 w-4 mr-1" />
              {isLoggingOut ? "Déconnexion…" : "Se déconnecter"}
            </Button>
          </div>
        </div>
      </LockBackdrop>
    );
  }

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
