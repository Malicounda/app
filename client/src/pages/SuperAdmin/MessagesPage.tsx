import ResponsivePage from "@/components/layout/ResponsivePage";
import { type InternalMessageComposerSubmitPayload } from "@/components/messaging/InternalMessageComposer";
import InternalMessagingShell from "@/components/messaging/InternalMessagingShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useInternalMessaging, type InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { useEffect, useMemo, useState } from "react";

const SUPERADMIN_TARGETS = [
  { key: "admins", label: "Administrateurs", target: { role: "admin" } },
  { key: "agents", label: "Agents Régionaux", target: { role: "agent" } },
  { key: "sub-agents", label: "Agents de Secteur", target: { role: "sub-agent" } },
  { key: "guides", label: "Guides de Chasse", target: { role: "hunting-guide" } },
  { key: "hunters", label: "Tous les Chasseurs", target: { role: "hunter" } },
];

export default function SuperAdminMessagesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"reçus" | "envoyés">("reçus");
  const [query, setQuery] = useState("");
  const [recipientOptions, setRecipientOptions] = useState<Array<{ value: string; label: string }>>([]);

  // Contexte global transversal ("null") pour voir tous les messages/questions reçus quel que soit le domaine
  const {
    inbox,
    sent,
    loadingInbox,
    loadingSent,
    sending,
    sendGroup,
    sendIndividual,
    deleteMessage,
    purgeStaleMessage,
    refreshSent,
    refreshInbox,
  } = useInternalMessaging({ domaineId: "null" });

  // Charger une liste rapide de destinataires (admins + agents régionaux + agents secteur)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [adminsResp, agentsResp, sectorsResp] = await Promise.all([
          authenticatedFetch("/api/messages/agents?role=admin&domaineId=null"),
          authenticatedFetch("/api/messages/agents?role=agent&domaineId=null"),
          authenticatedFetch("/api/messages/agents?role=sector&domaineId=null"),
        ]);

        const [adminsArr, agentsArr, sectorsArr] = await Promise.all([
          adminsResp.ok ? adminsResp.json() : Promise.resolve([]),
          agentsResp.ok ? agentsResp.json() : Promise.resolve([]),
          sectorsResp.ok ? sectorsResp.json() : Promise.resolve([]),
        ]);

        const pickValue = (u: any) => String(u?.username || u?.email || u?.matricule || "").trim();
        const isSelf = (u: any) => {
          const uid = (user as any)?.id;
          const uname = String((user as any)?.username || "").trim().toLowerCase();
          if (uid && u?.id && Number(uid) === Number(u.id)) return true;
          if (uname && String(u?.username || "").trim().toLowerCase() === uname) return true;
          return false;
        };
        const toLabel = (u: any, roleLabel: string) => {
          const full = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
          const name = full || String(u?.username || u?.email || `#${u?.id}`);
          const loc = u?.departement || u?.region || "";
          return loc ? `${name} (${roleLabel} — ${loc})` : `${name} (${roleLabel})`;
        };

        const raw = [
          ...(Array.isArray(adminsArr) ? adminsArr : []).map((u: any) => ({ u, roleLabel: "Administrateur" })),
          ...(Array.isArray(agentsArr) ? agentsArr : []).map((u: any) => ({ u, roleLabel: "Agent régional" })),
          ...(Array.isArray(sectorsArr) ? sectorsArr : []).map((u: any) => ({ u, roleLabel: "Agent secteur" })),
        ];

        const opts = raw
          .filter(({ u }) => !isSelf(u))
          .map(({ u, roleLabel }) => ({ value: pickValue(u), label: toLabel(u, roleLabel) }))
          .filter((o) => Boolean(o.value));

        const unique = Array.from(new Map(opts.map((o) => [o.value, o])).values());
        if (!cancelled) setRecipientOptions(unique);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[SuperAdminMessagesPage] Failed to load recipients", e);
        if (!cancelled) setRecipientOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (activeTab === "envoyés") {
      refreshSent();
    }
  }, [activeTab, refreshSent]);

  const normalizedQuery = query.trim().toLowerCase();
  const filterMessages = (arr: InternalMessageRecord[]) => {
    if (!normalizedQuery) return arr;
    return arr.filter((m: any) => {
      const subject = String(m?.subject ?? "").toLowerCase();
      const content = String(m?.content ?? "").toLowerCase();
      const senderFirst = String(m?.sender?.firstName ?? m?.senderFirstName ?? "").toLowerCase();
      const senderLast = String(m?.sender?.lastName ?? m?.senderLastName ?? "").toLowerCase();
      const recipientFirst = String(m?.recipient?.firstName ?? "").toLowerCase();
      const recipientLast = String(m?.recipient?.lastName ?? "").toLowerCase();
      return (
        subject.includes(normalizedQuery) ||
        content.includes(normalizedQuery) ||
        `${senderFirst} ${senderLast}`.includes(normalizedQuery) ||
        `${recipientFirst} ${recipientLast}`.includes(normalizedQuery)
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
      if (type === "individual") {
        const ident = String(recipientIdentifier || "").trim();
        if (!ident) {
          toast({
            title: "Destinataire manquant",
            description: "Sélectionnez un destinataire ou saisissez son matricule, e-mail, identifiant ou N° de pièce.",
            variant: "destructive",
          });
          return false;
        }
        await sendIndividual({ recipientIdentifier: ident, content, attachment });
      } else {
        if (!selectedTargets.length) {
          toast({ title: "Groupes manquants", description: "Choisissez au moins un groupe cible.", variant: "destructive" });
          return false;
        }
        const resolvedTargets = selectedTargets
          .map((key) => SUPERADMIN_TARGETS.find((t) => t.key === key)?.target)
          .filter(Boolean) as { role: string; region?: string }[];
        if (!resolvedTargets.length) {
          toast({ title: "Cibles invalides", description: "Groupes non reconnus.", variant: "destructive" });
          return false;
        }
        await sendGroup({ targets: resolvedTargets, content, attachment });
      }

      toast({
        title: "Message envoyé",
        description: "Votre message (Équipe Support) a bien été transmis.",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Erreur d'envoi",
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
    } catch (error: any) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Une erreur est survenue lors de la suppression.",
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsivePage className="bg-transparent">
      <InternalMessagingShell
        title="Messagerie Support (Équipe Support)"
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
        onStaleMessage={(m) => purgeStaleMessage(Number(m.id), Boolean(m.isGroupMessage))}
        onReply={async ({ recipientIdentifier, content, attachment }) => {
          try {
            await sendIndividual({ recipientIdentifier, content, attachment });
            toast({ title: "Réponse envoyée", description: "Votre réponse (Équipe Support) a été transmise." });
          } catch (e: any) {
            toast({
              title: "Erreur",
              description: e?.message || "Échec de l'envoi de la réponse.",
              variant: "destructive",
            });
          }
        }}
        onSubmitCompose={handleSubmit}
        regionTargets={SUPERADMIN_TARGETS}
        allowIndividual
        allowGroup
        adminRecipients={recipientOptions}
        showAdminQuickPick={recipientOptions.length > 0}
      />
    </ResponsivePage>
  );
}
