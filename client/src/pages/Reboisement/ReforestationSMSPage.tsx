import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessagingShell from "@/components/messaging/InternalMessagingShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useInternalMessaging } from "@/hooks/useInternalMessaging";
import { useEffect, useMemo, useState } from "react";

export default function ReforestationSMSPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const domaineId = 33;

  // Dans le domaine reboisement, tous les rôles admin/agent/sub-agent peuvent envoyer des messages
  const inboxOnly = false;

  const [recipientOptions, setRecipientOptions] = useState<Array<{ value: string; label: string }>>([]);
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
  } = useInternalMessaging({ domaineId });

  // Cibles spécifiques au reboisement
  const reforestationTargets = useMemo(() => [
    { key: "regional", label: "Agents Régionaux", target: { role: "agent" } },
    { key: "sector", label: "Agents de Secteur", target: { role: "sub-agent" } },
  ], []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const isRegional = role === 'agent' || role === 'regional' || role === 'chef-regional';

        const requests: Array<Promise<Response>> = [
          authenticatedFetch(`/api/messages/agents?role=admin&domaineId=${encodeURIComponent(String(domaineId))}`),
          authenticatedFetch(`/api/messages/agents?role=agent&domaineId=${encodeURIComponent(String(domaineId))}`),
        ];
        if (isRegional) {
          requests.push(authenticatedFetch(`/api/messages/agents?role=sector&domaineId=${encodeURIComponent(String(domaineId))}`));
        }

        const responses = await Promise.all(requests);
        const jsons = await Promise.all(responses.map((r) => (r.ok ? r.json() : Promise.resolve([]))));

        const adminsArr = Array.isArray(jsons[0]) ? jsons[0] : [];
        const regionalsArr = Array.isArray(jsons[1]) ? jsons[1] : [];
        const sectorsArr = isRegional ? (Array.isArray(jsons[2]) ? jsons[2] : []) : [];

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
          const name = fullName || String(u?.username || '').trim() || roleLabel;
          const dept = u?.departement ? ` — ${u.departement}` : '';
          const region = u?.region ? ` — ${u.region}` : '';
          if (roleLabel === 'Secteur') {
            return `${name} — ${roleLabel}${dept}`;
          }
          return `${name} — ${roleLabel}${region}`;
        };

        const optsRaw = [
          ...adminsArr.map((u: any) => ({ u, roleLabel: 'Administrateur' })),
          ...regionalsArr.map((u: any) => ({ u, roleLabel: 'Agent régional' })),
          ...sectorsArr.map((u: any) => ({ u, roleLabel: 'Secteur' })),
        ];

        const opts = optsRaw
          .filter(({ u }) => !isSelf(u))
          .map(({ u, roleLabel }) => {
            const value = pickValue(u);
            return {
              value,
              label: toLabel(u, roleLabel),
            };
          })
          .filter((o) => Boolean(o.value));

        const unique = Array.from(new Map(opts.map((o) => [o.value, o])).values());
        if (!cancelled) setRecipientOptions(unique);
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        if (!cancelled) setRecipientOptions([]);
       }
    })();
    return () => { cancelled = true; };
  }, [role, user]);

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

  const handleDelete = async (message: any) => {
    try {
      await deleteMessage(message);
      toast({ title: "Supprimé", description: "Le message a été supprimé." });
    } catch (error: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      toast({ title: "Suppression impossible", description: error?.message || "Une erreur est survenue lors de la suppression.", variant: "destructive"  });
    }
  };

  const filteredInbox = useMemo(() => filterMessages(inbox), [inbox, normalizedQuery]);
  const filteredSent = useMemo(() => filterMessages(sent), [sent, normalizedQuery]);

  useEffect(() => {
    if (activeTab === "envoyés") {
      refreshSent();
    }
  }, [activeTab, refreshSent]);

  const handleSubmit = async ({
    type,
    content,
    recipientIdentifier,
    selectedTargets = [],
    attachment,
  }: {
    type: "individual" | "group";
    content: string;
    recipientIdentifier?: string;
    selectedTargets?: string[];
    attachment?: File | null;
  }) => {
    if (!content.trim()) {
      toast({ title: "Message vide", description: "Veuillez saisir un message.", variant: "destructive" });
      return false;
    }

    try {
      const isOffline = !navigator.onLine;
      if (type === "individual") {
        const ident = String(recipientIdentifier || '').trim();
        if (!ident) {
          toast({ title: "Destinataire manquant", description: "Veuillez saisir un matricule, un e-mail ou un identifiant.", variant: "destructive" });
          return false;
        }
        await sendIndividual({ recipientIdentifier: ident, content, attachment });
      } else {
        if (!selectedTargets.length) {
          toast({ title: "Groupes manquants", description: "Choisissez au moins un groupe cible.", variant: "destructive" });
          return false;
        }
        const resolvedTargets = selectedTargets
          .map((key) => reforestationTargets.find((item) => item.key === key)?.target)
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

  return (
    <ResponsivePage className="bg-transparent">
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
        inboxOnly={inboxOnly}
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
        onSubmitCompose={handleSubmit}
        regionTargets={reforestationTargets}
        allowIndividual
        allowGroup
        adminRecipients={recipientOptions}
        showAdminQuickPick={recipientOptions.length > 0}
      />
    </ResponsivePage>
  );
}
