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
      // Ne pas afficher pour 401 (session expirée gérée ailleurs) ou pour /api/auth/me
      const isAuthMe = typeof d.url === 'string' && d.url.includes('/api/auth/me');
      // Ne pas afficher pour la recherche d'agent par matricule (géré par une modale dédiée)
      const isAgentProfileByMatricule = typeof d.url === 'string' && d.url.includes('/api/users/agent-profile-by-matricule');
      // Ne pas afficher pour doublon d'alerte (409) sur /api/alerts: géré par une modale dédiée côté page
      const isDuplicateAlert = Number(d.status) === 409 && typeof d.url === 'string' && d.url.includes('/api/alerts');
      if (Number(d.status) === 401 || isAuthMe || isDuplicateAlert || isAgentProfileByMatricule) {
        return; // suppression de l'affichage de ce message
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
          {detail?.message ? (
            <p className="whitespace-pre-line">{detail.message}</p>
          ) : (
            <p>Une erreur est survenue lors du traitement de votre requête.</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
