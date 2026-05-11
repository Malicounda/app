import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { LockState } from "@/hooks/useSessionHeartbeat";
import { Lock, LogOut, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

interface SessionLockOverlayProps {
  lockState: LockState;
  countdownSeconds: number;
  reauthenticate: (password: string) => Promise<boolean>;
  forceLogout: () => Promise<void>;
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
  const { user } = useAuth();

  // Poser/retirer un flag sur <body> pour que les Dialog sachent que la session est verrouillée
  useEffect(() => {
    if (lockState === "active") {
      document.body.removeAttribute("data-session-locked");
    } else {
      document.body.setAttribute("data-session-locked", "true");
    }
    return () => document.body.removeAttribute("data-session-locked");
  }, [lockState]);

  // Ne rien afficher si la session est active
  if (lockState === "active") return null;

  // ── Countdown (30 dernières secondes) ────────────────────────────
  if (lockState === "countdown") {
    return (
      <div className="fixed inset-0 z-[20000] bg-black/40 backdrop-blur-sm flex items-center justify-center transition-all duration-300">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center animate-in fade-in zoom-in duration-300">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Inactivité détectée
          </h2>
          <p className="text-gray-600 mb-4">
            Votre session va être verrouillée dans
          </p>
          <div className="text-5xl font-bold text-amber-600 mb-4">
            {countdownSeconds}
          </div>
          <p className="text-sm text-gray-500">
            Bougez la souris ou appuyez sur une touche pour continuer
          </p>
        </div>
      </div>
    );
  }

  // ── Session expirée (8h dépassé côté serveur) ────────────────────
  if (lockState === "expired") {
    return (
      <div className="fixed inset-0 z-[20000] bg-black/80 backdrop-blur-md flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Session expirée
          </h2>
          <p className="text-gray-600 mb-6">
            Votre session a expiré (durée maximale de 8h atteinte). Veuillez vous reconnecter.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={forceLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Se reconnecter
          </Button>
        </div>
      </div>
    );
  }

  // ── Écran verrouillé (4min d'inactivité) ────────────────────────
  const handleUnlock = async () => {
    if (!password.trim()) {
      setError("Veuillez saisir votre mot de passe");
      return;
    }
    setIsVerifying(true);
    setError("");
    const ok = await reauthenticate(password);
    setIsVerifying(false);
    if (!ok) {
      setError("Mot de passe incorrect");
      setPassword("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleUnlock();
  };

  return (
    <div className="fixed inset-0 z-[20000] bg-black/80 backdrop-blur-md flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">
          Session verrouillée
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          {user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : user?.username || "Utilisateur"}
        </p>

        <div className="space-y-3 mb-4">
          <Input
            type="password"
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            disabled={isVerifying}
            autoFocus
            className="text-center"
          />
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <Button
            className="w-full"
            onClick={handleUnlock}
            disabled={isVerifying || !password.trim()}
          >
            {isVerifying ? "Vérification…" : "Déverrouiller"}
          </Button>
        </div>

        <div className="border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-500 hover:text-red-600"
            onClick={forceLogout}
          >
            <LogOut className="h-4 w-4 mr-1" />
            Se déconnecter
          </Button>
        </div>
      </div>
    </div>
  );
}
