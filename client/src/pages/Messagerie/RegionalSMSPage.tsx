import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessagingShell from "@/components/messaging/InternalMessagingShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useInternalMessaging, type InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { getMessagingDomaineIdForHook } from "@/utils/messagingDomain";
import { useEffect, useMemo, useState } from "react";

export default function RegionalSMSPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const domaineId = getMessagingDomaineIdForHook();
  const [activeTab, setActiveTab] = useState<"reçus" | "envoyés">("reçus");
  const [query, setQuery] = useState("");
  const {
    inbox,
    sent,
    loadingInbox,
    loadingSent,
    sending,
    sendGroup,
    sendIndividual,
    deleteMessage,
    refreshSent,
    refreshInbox,
  } = useInternalMessaging({ autoLoad: user?.role === "agent", domaineId });

  // Liste des administrateurs pour le quick-pick dans le composer
  const [adminOptions, setAdminOptions] = useState<Array<{ value: string; label: string }>>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [adminsResp, sectorsResp] = await Promise.all([
          authenticatedFetch(`/api/messages/agents?role=admin&domaineId=${encodeURIComponent(String(domaineId))}`),
          authenticatedFetch(`/api/messages/agents?role=sector&domaineId=${encodeURIComponent(String(domaineId))}`),
        ]);
        if (!adminsResp.ok && !sectorsResp.ok) return;
        const [adminsData, sectorsData] = await Promise.all([
          adminsResp.ok ? adminsResp.json() : Promise.resolve([]),
          sectorsResp.ok ? sectorsResp.json() : Promise.resolve([]),
        ]);
        const adminsArr = Array.isArray(adminsData) ? adminsData : [];
        const sectorsArr = Array.isArray(sectorsData) ? sectorsData : [];

        const pickValue = (u: any) => String(u?.username || u?.email || u?.matricule || '').trim();
        const isSelf = (u: any) => {
          const uid = (user as any)?.id;
          const uname = String((user as any)?.username || '').trim().toLowerCase();
          const email = String((user as any)?.email || '').trim().toLowerCase();
          if (uid && u?.id && Number(uid) === Number(u.id)) return true;
          if (uname && String(u?.username || '').trim().toLowerCase() === uname) return true;
          if (email && String(u?.email || '').trim().toLowerCase() === email) return true;
          return false;
        };
        const toName = (u: any) => {
          const full = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
          const grade = String((u as any)?.grade || '').trim();
          if (grade && full) return `${grade} ${full}`;
          return full;
        };
        const toLabel = (u: any, roleLabel: string) => {
          if (u?.isSuperAdmin || u?.role === 'support') {
            return 'Support Technique — Équipe Support';
          }
          const fullName = toName(u);
          const username = String(u?.username || '').trim();
          const name = fullName || username || roleLabel;
          const usernameSuffix = fullName && username ? ` (${username})` : '';
          const dept = u?.departement ? ` — ${u.departement}` : '';

          return `${name}${usernameSuffix} — ${roleLabel}${dept}`;
        };

        const opts = [
          ...adminsArr.map((u: any) => ({
            value: pickValue(u),
            label: toLabel(u, 'Administrateur'),
          })),
          ...sectorsArr.map((u: any) => ({
            value: pickValue(u),
            label: toLabel(u, 'Secteur'),
          })),
        ]
          .filter((o) => Boolean(o.value))
          .filter((o) => !isSelf((adminsArr as any[]).concat(sectorsArr as any[]).find((u: any) => pickValue(u) === o.value)));

        // Dédupliquer par value
        const unique = Array.from(new Map(opts.map((o) => [o.value, o])).values());
        if (!cancelled) setAdminOptions(unique);
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);  }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const regionalTargets = useMemo(() => {
    if (!user?.region) return [];
    return [
      { key: "agents", label: "Agents de secteur", target: { role: "sub-agent", region: user.region } },
      { key: "system-admin", label: "Administrateur système", target: { role: "admin" } },
      { key: "hunters", label: "Chasseurs avec permis actif", target: { role: "hunter", region: user.region } },
      { key: "guides", label: "Guides de chasse actifs", target: { role: "hunting-guide", region: user.region } },
    ];
  }, [user?.region]);

  // Refresh automatique quand l'onglet "Envoyés" devient actif
  useEffect(() => {
    if (activeTab === "envoyés") {
      refreshSent();
    }
  }, [activeTab, refreshSent]);

  const normalizedQuery = query.trim().toLowerCase();
  const filterMessages = (arr: any[]) => {
    if (!normalizedQuery) return arr;
    return arr.filter((m) => {
      const subject = String((m?.subject ?? "")).toLowerCase();
      const content = String((m?.content ?? "")).toLowerCase();
      const senderFirst = String((m?.sender?.firstName ?? m?.senderFirstName ?? "")).toLowerCase();
      const senderLast = String((m?.sender?.lastName ?? m?.senderLastName ?? "")).toLowerCase();
      return (
        subject.includes(normalizedQuery) ||
        content.includes(normalizedQuery) ||
        `${senderFirst} ${senderLast}`.includes(normalizedQuery)
      );
    });
  };
  const filteredInbox = useMemo(() => filterMessages(inbox), [inbox, normalizedQuery]);
  const filteredSent = useMemo(() => filterMessages(sent), [sent, normalizedQuery]);

  const handleSend = async (payload: {
    type: "individual" | "group";
    content: string;
    recipientIdentifier?: string;
    selectedTargets?: string[];
    attachment?: File | null;
  }) => {
    const { type, content, recipientIdentifier, selectedTargets = [], attachment } = payload;
    if (!content.trim()) {
      toast({ title: "Message vide", description: "Veuillez saisir un message.", variant: "destructive" });
      return false;
    }

    try {
      const isOffline = !navigator.onLine;
      if (type === "individual") {
        if (!recipientIdentifier) {
          toast({ title: "Destinataire manquant", description: "Un destinataire doit être renseigné.", variant: "destructive" });
          return false;
        }
        await sendIndividual({ recipientIdentifier, content, attachment });
      } else {
        if (!selectedTargets.length) {
          toast({ title: "Destinataire manquant", description: "Sélectionnez au moins un groupe.", variant: "destructive" });
          return false;
        }
        const targets = selectedTargets
          .map((key) => regionalTargets.find((item) => item.key === key)?.target)
          .filter(Boolean) as { role: string; region?: string }[];
        if (!targets.length) {
          toast({ title: "Destinataires invalides", description: "Les groupes choisis ne sont pas disponibles.", variant: "destructive" });
          return false;
        }
        await sendGroup({ targets, content, attachment });
      }
      
      if (isOffline) {
        toast({
          title: "Mode hors-ligne",
          description: "Message sauvegardé localement. Envoi automatique dès le retour du réseau.",
        });
      } else {
        toast({ title: "Message envoyé", description: "Le message a été transmis." });
      }
      return true;
    } catch (error: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      toast({
        title: "Erreur",
        description: error?.message || "Impossible d'envoyer le message.",
        variant: "destructive",
       });
      return false;
    }
  };

  const handleDelete = async (message: InternalMessageRecord) => {
    try {
      await deleteMessage(message);
      toast({ title: "Message supprimé", description: "Le message a été retiré." });
    } catch (error: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      toast({
        title: "Suppression impossible",
        description: error?.message || "Une erreur est survenue lors de la suppression.",
        variant: "destructive",
       });
    }
  };

  return (
    <ResponsivePage>
      <InternalMessagingShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        query={query}
        onQueryChange={setQuery}
        inbox={inbox}
        filteredInbox={filteredInbox}
        sent={sent}
        filteredSent={filteredSent}
        loadingInbox={loadingInbox}
        loadingSent={loadingSent}
        sending={sending}
        onRefreshInbox={refreshInbox}
        onRefreshSent={refreshSent}
        onDelete={handleDelete}
        onReply={async ({ recipientIdentifier, content, attachment }) => {
          try {
            const isOffline = !navigator.onLine;
            await sendIndividual({ recipientIdentifier, content, attachment });
            if (isOffline) {
              toast({ title: 'Mode hors-ligne', description: 'Réponse sauvegardée localement. Envoi automatique dès le retour du réseau.' });
            } else {
              toast({ title: 'Réponse envoyée', description: 'Votre réponse a été transmise.' });
            }
            return;
          } catch (e: any) {
            if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
            toast({ title: 'Erreur', description: e?.message || "Échec de l'envoi de la réponse.", variant: 'destructive' });
          }
        }}
        onSubmitCompose={handleSend}
        regionTargets={regionalTargets}
        allowIndividual
        allowGroup
        adminRecipients={adminOptions}
        showAdminQuickPick
      />
    </ResponsivePage>
  );
}
