import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
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

function isAccessDeniedView(detail: ApiRefusalDetail | null): boolean {
  if (!detail?.status) return false;
  const url = typeof detail.url === "string" ? detail.url : "";
  if (detail.status === 403) return true;
  if (detail.status === 401 && isLoginRequest(url)) return true;
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
      if (
        isAuthMe ||
        isDuplicateAlert ||
        isAgentProfileByMatricule ||
        isStaleMessaging404
      ) {
        return;
      }
      if (Number(d.status) === 401 && isBackgroundPoll) {
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

  const accessDenied = isAccessDeniedView(detail);
  const sessionExpired = isSessionExpiredView(detail);

  const title = (() => {
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
    if (accessDenied) {
      const msg = String(detail?.message || "").trim();
      if (msg && !/session|expir/i.test(msg)) return msg;
      return ACCESS_DENIED_MESSAGE;
    }
    if (sessionExpired) {
      return "Reconnectez-vous depuis la page de connexion, puis réessayez.";
    }
    if (detail?.message) return detail.message;
    return "Une erreur est survenue lors du traitement de votre requête.";
  })();

  if (accessDenied || sessionExpired) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[340px] rounded-2xl border-0 p-6 shadow-lg gap-0">
          <div className="flex flex-col items-center text-center pt-1">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100">
              <Info className="h-5 w-5 text-gray-500" strokeWidth={2.5} />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-800">{bodyText}</p>
          </div>
          <div className="mt-8 flex justify-end">
            <Button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full bg-black px-6 text-white hover:bg-gray-900"
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-gray-700">
          <p className="whitespace-pre-line">{bodyText}</p>
          {detail?.url && (
            <p className="text-xs text-muted-foreground break-all">
              {detail.method || "GET"} {detail.url}
              {detail.status ? ` — ${detail.status}` : ""}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
