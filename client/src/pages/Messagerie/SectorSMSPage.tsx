import ResponsivePage from "@/components/layout/ResponsivePage";
import { type InternalMessageComposerSubmitPayload } from "@/components/messaging/InternalMessageComposer";
import InternalMessagingShell from "@/components/messaging/InternalMessagingShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useInternalMessaging, type InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { getMessagingDomaineIdForHook } from "@/utils/messagingDomain";
import { useEffect, useMemo, useState } from "react";

const SECTOR_GROUPS = [
  { key: "regional-fauna", label: "Division régionale de la Faune", role: "agent", scopedToRegion: true },
  { key: "system-admin", label: "Administrateur système", role: "admin", scopedToRegion: false },
  { key: "hunters-active", label: "Chasseurs avec permis actif", role: "hunter", scopedToRegion: true },
  { key: "guides-active", label: "Guides de chasse actifs", role: "hunting-guide", scopedToRegion: true },
];

export default function SectorSMSPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const domaineId = getMessagingDomaineIdForHook();
  const [activeTab, setActiveTab] = useState<"reçus" | "envoyés">("reçus");
  const [query, setQuery] = useState("");
  const [recipientOptions, setRecipientOptions] = useState<Array<{ value: string; label: string }>>([]);
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
  } = useInternalMessaging({ domaineId, autoLoad: user?.role === "sub-agent" });

  const sectorTargets = useMemo(() => {
    return SECTOR_GROUPS.flatMap((group) => {
      if (group.scopedToRegion && !user?.region) {
        return [];
      }
      const target: { role: string; region?: string } = { role: group.role };
      if (group.scopedToRegion && user?.region) {
        target.region = user.region;
      }
      return [{ key: group.key, label: group.label, target }];
    });
  }, [user?.region]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const requests: Array<Promise<Response>> = [
          authenticatedFetch(`/api/messages/agents?role=admin&domaineId=${encodeURIComponent(String(domaineId))}`),
          authenticatedFetch(`/api/messages/agents?role=agent&domaineId=${encodeURIComponent(String(domaineId))}`),
          authenticatedFetch(`/api/messages/agents?role=sector&domaineId=${encodeURIComponent(String(domaineId))}`),
        ];

        const responses = await Promise.all(requests);
        const jsons = await Promise.all(responses.map((r) => (r.ok ? r.json() : Promise.resolve([]))));

        const adminsArr = Array.isArray(jsons[0]) ? jsons[0] : [];
        const regionalsArr = Array.isArray(jsons[1]) ? jsons[1] : [];
        const sectorsArr = Array.isArray(jsons[2]) ? jsons[2] : [];

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
          const region = u?.region ? ` — ${u.region}` : '';

          if (roleLabel === 'Secteur') {
            return `${name}${usernameSuffix} — ${roleLabel}${dept}`;
          }
          if (roleLabel === 'Agent régional') {
            return `${name}${usernameSuffix} — ${roleLabel}${region}`;
          }
          return `${name}${usernameSuffix} — ${roleLabel}`;
        };

        const optsRaw = [
          ...adminsArr.map((u: any) => ({ u, roleLabel: 'Administrateur' })),
          ...regionalsArr.map((u: any) => ({ u, roleLabel: 'Agent régional' })),
          ...sectorsArr.map((u: any) => ({ u, roleLabel: 'Secteur' })),
        ];

        const opts = optsRaw
          .filter(({ u }) => !isSelf(u))
          .map(({ u, roleLabel }) => ({ value: pickValue(u), label: toLabel(u, roleLabel) }))
          .filter((o) => Boolean(o.value));

        const unique = Array.from(new Map(opts.map((o) => [o.value, o])).values());
        if (!cancelled) setRecipientOptions(unique);
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        if (!cancelled) setRecipientOptions([]);
       }
    })();
    return () => { cancelled = true; };
  }, [domaineId, user]);

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

  const handleSubmit = async ({
    type,
    content,
    recipientIdentifier,
    selectedTargets = [],
    attachment,
  }: InternalMessageComposerSubmitPayload) => {
    if (!content.trim()) {
      toast({ title: "Message vide", description: "Veuillez saisir un message.", variant: "destructive" });
      return false;
    }

    try {
      const isOffline = !navigator.onLine;
      if (type === "individual") {
        if (!recipientIdentifier) {
          toast({ title: "Destinataire manquant", description: "Un identifiant est requis.", variant: "destructive" });
          return false;
        }
        await sendIndividual({ recipientIdentifier, content, attachment });
      } else {
        if (!selectedTargets.length) {
          toast({ title: "Groupes manquants", description: "Choisissez au moins un groupe cible.", variant: "destructive" });
          return false;
        }
        const resolvedTargets = selectedTargets
          .map((key: string) => sectorTargets.find((item) => item.key === key)?.target)
          .filter(Boolean) as { role: string; region?: string }[];
        if (!resolvedTargets.length) {
          toast({ title: "Cibles invalides", description: "Groupes non reconnus.", variant: "destructive" });
          return false;
        }
        await sendGroup({ targets: resolvedTargets, content, attachment });
      }
      
      if (isOffline) {
        toast({
          title: "Mode hors-ligne",
          description: "Message sauvegardé localement. Envoi automatique dès le retour du réseau.",
        });
      } else {
        toast({ title: "Message envoyé", description: "Le message a été envoyé." });
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
          } catch (e: any) {
            if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
            toast({ title: 'Erreur', description: e?.message || "Échec de l'envoi de la réponse.", variant: 'destructive' });
          }
        }}
        onSubmitCompose={handleSubmit}
        regionTargets={sectorTargets}
        allowIndividual
        allowGroup
        adminRecipients={recipientOptions}
        showAdminQuickPick={recipientOptions.length > 0}
      />
    </ResponsivePage>
  );
}
