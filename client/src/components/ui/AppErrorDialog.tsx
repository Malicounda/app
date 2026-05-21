import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";

// Type de l'événement personnalisé déclenché par le client API
export type ApiRefusalDetail = {
  status?: number;
  message?: string;
  url?: string;
  method?: string;
  body?: any;
};

export default function AppErrorDialog() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<ApiRefusalDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<ApiRefusalDetail>;
      const d = ce.detail || {};
      const url = typeof d.url === 'string' ? d.url : '';
      const isAuthMe = url.includes('/api/auth/me');
      const isBackgroundPoll =
        url.includes('unread-count') ||
        url.includes('/api/auth/heartbeat');
      const isAgentProfileByMatricule = url.includes('/api/users/agent-profile-by-matricule');
      const isDuplicateAlert = Number(d.status) === 409 && url.includes('/api/alerts');
      if (isAuthMe || isDuplicateAlert || isAgentProfileByMatricule) {
        return;
      }
      if (Number(d.status) === 401 && isBackgroundPoll) {
        return; // heartbeat / compteurs : géré par SessionLockOverlay
      }
      setDetail(d);
      setOpen(true);
    };
    window.addEventListener("apiRefusal", handler as EventListener);
    return () => {
      window.removeEventListener("apiRefusal", handler as EventListener);
    };
  }, []);

  const title = (() => {
    if (!detail?.status) return "Erreur";
    if (detail.status === 400) return "Requête invalide";
    if (detail.status === 401) return "Non autorisé";
    if (detail.status === 403) return "Accès refusé";
    if (detail.status === 404) return "Ressource introuvable";
    if (detail.status === 409) return "Conflit";
    if (detail.status >= 500) return "Erreur serveur";
    return `Erreur (${detail.status})`;
  })();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-gray-700">
          {detail?.status === 401 ? (
            <p>
              Votre session n&apos;est plus valide. Cliquez sur « Se reconnecter » (écran de verrouillage)
              ou retournez à la page de connexion, puis réessayez.
            </p>
          ) : detail?.message ? (
            <p className="whitespace-pre-line">{detail.message}</p>
          ) : (
            <p>Une erreur est survenue lors du traitement de votre requête.</p>
          )}
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
