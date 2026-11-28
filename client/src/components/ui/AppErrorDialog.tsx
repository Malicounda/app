import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";

export type ApiRefusalDetail = {
  status?: number;
  message?: string;
  url?: string;
  method?: string;
  body?: any;
};

const ACCESS_DENIED_MESSAGE =
  "Veuillez contacter l'administrateur du système pour créer un accès à cette application.";

function isLoginRequest(url: string): boolean {
  return url.includes("/api/auth/login");
}

function isLoginRefusalView(detail: ApiRefusalDetail | null): boolean {
  if (!detail?.status) return false;
  const url = typeof detail.url === "string" ? detail.url : "";
  return isLoginRequest(url) && (detail.status === 401 || detail.status === 403);
}

function isAccessDeniedView(detail: ApiRefusalDetail | null): boolean {
  if (!detail?.status) return false;
  const url = typeof detail.url === "string" ? detail.url : "";
  if (detail.status === 403 && !isLoginRequest(url)) return true;
  return false;
}

function isSessionExpiredView(detail: ApiRefusalDetail | null): boolean {
  return detail?.status === 401 && !isLoginRequest(typeof detail.url === "string" ? detail.url : "");
}

export default function AppErrorDialog() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ApiRefusalDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ApiRefusalDetail>;
      const d = ce.detail || {};
      const url = typeof d.url === "string" ? d.url : "";
      const isAuthMe = url.includes("/api/auth/me");
      const isBackgroundPoll =
        url.includes("unread-count") || url.includes("/api/auth/heartbeat");
      const isAgentProfileByMatricule = url.includes(
        "/api/users/agent-profile-by-matricule"
      );
      const isDuplicateAlert =
        Number(d.status) === 409 && url.includes("/api/alerts");
      const isStaleMessaging404 =
        Number(d.status) === 404 &&
        url.includes("/api/messages/") &&
        (url.includes("/read") ||
          /\/api\/messages\/\d+/.test(url) ||
          url.includes("/delete"));

      const isMessagingOrAlerts = url.includes("/api/messages") || url.includes("/api/alerts");
      const isMapData = url.includes("eco-zone") || url.includes(".geojson") || url.includes("region") || url.includes("departement") || url.includes("carte") || url.includes("zone");
      const isOfflineOrNetwork =
        !navigator.onLine ||
        [502, 503, 504].includes(Number(d.status)) ||
        (typeof d.message === 'string' &&
          /network|fetch|unreachable|failed|503|502|504|connecter|connexion|unavailable|service|hors ligne|offline/i.test(d.message)
        );
      const isIgnoredOffline = (isMessagingOrAlerts || isMapData) && isOfflineOrNetwork;

      if (
        isAuthMe ||
        isBackgroundPoll ||
        isDuplicateAlert ||
        isAgentProfileByMatricule ||
        isStaleMessaging404 ||
        isIgnoredOffline
      ) {
        return;
      }

      // Ignorer les erreurs 401 de session expirée pour les requêtes qui ne sont pas le login
      // C'est AuthContext qui s'en charge (redirection + Toast sur la page de login)
      if (Number(d.status) === 401 && !isLoginRequest(url)) {
        return;
      }

      setDetail(d);
      setOpen(true);
    };
    window.addEventListener("apiRefusal", handler as EventListener);
    return () => {
      window.removeEventListener("apiRefusal", handler as EventListener);
    };
  }, []);

  const loginRefusal = isLoginRefusalView(detail);
  const accessDenied = isAccessDeniedView(detail);
  const sessionExpired = isSessionExpiredView(detail);

  const title = (() => {
    if (loginRefusal) return "Connexion impossible";
    if (accessDenied) return "Accès refusé";
    if (sessionExpired) return "Session expirée";
    if (!detail?.status) return "Erreur";
    if (detail.status === 400) return "Requête invalide";
    if (detail.status === 404) return "Ressource introuvable";
    if (detail.status === 409) return "Conflit";
    if (detail.status >= 500) return "Erreur serveur";
    return `Erreur (${detail.status})`;
  })();

  const bodyText = (() => {
    // Par sécurité : aucune précision sur les identifiants, le mot de passe, le compte ou le domaine lors d'un échec de connexion
    if (loginRefusal) {
      return null;
    }
    if (accessDenied) {
      const msg = String(detail?.message || "").trim();
      if (msg && !/session|expir/i.test(msg) && !/<(!doctype|html|head|body)\b/i.test(msg)) return msg;
      return ACCESS_DENIED_MESSAGE;
    }
    if (sessionExpired) {
      return "Reconnectez-vous depuis la page de connexion, puis réessayez.";
    }
    const rawMsg = typeof detail?.message === "string" ? detail.message.trim() : "";
    if (rawMsg && !/<(!doctype|html|head|body|title|h1|p)\b/i.test(rawMsg)) {
      return rawMsg;
    }
    if (detail?.status === 404) {
      return "La ressource demandée est introuvable ou n'est plus disponible.";
    }
    if (detail?.status && detail.status >= 500) {
      return "Le serveur rencontre une difficulté temporaire. Veuillez réessayer dans quelques instants.";
    }
    return "Une erreur est survenue lors du traitement de votre requête.";
  })();

  const isNeutralAlert = loginRefusal || accessDenied || sessionExpired;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideClose
        overlayClassName="bg-black/40 backdrop-blur-[1px]"
        className="w-[calc(100vw-2rem)] max-w-[380px] sm:max-w-[440px] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 p-5 sm:p-6 shadow-xl gap-0"
      >
        <div className="flex flex-col items-center text-center min-w-0">
          {loginRefusal ? (
            <div className="mb-3 flex h-8 w-8 items-center justify-center text-slate-500 dark:text-slate-400">
              <Info className="h-6 w-6" strokeWidth={1.85} />
            </div>
          ) : (
            <div
              className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${
                isNeutralAlert
                  ? "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300"
                  : "bg-red-100 dark:bg-red-950/60 text-red-500 dark:text-red-400"
              }`}
            >
              <Info className="h-5 w-5" strokeWidth={2.5} />
            </div>
          )}

          <DialogTitle className="w-full text-center text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 break-words leading-snug">
            {title}
          </DialogTitle>

          {bodyText && (
            <p className="mt-3 w-full text-sm leading-relaxed text-slate-700 dark:text-slate-300 break-words">
              {bodyText}
            </p>
          )}
        </div>

        <div className={`${bodyText ? "mt-7" : "mt-5"} flex justify-center w-full`}>
          <Button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full h-11 rounded-xl bg-slate-950 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200 px-6 text-white font-medium active:scale-[0.99] transition-all"
          >
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
