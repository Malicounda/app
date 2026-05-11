import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessageComposer, { type InternalMessageComposerSubmitPayload } from "@/components/messaging/InternalMessageComposer";
import InternalMessageList from "@/components/messaging/InternalMessageList";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useInternalMessaging, type InternalMessageRecord } from "@/hooks/useInternalMessaging";
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
  const domaineId = 1;
  const [activeTab, setActiveTab] = useState<"reçus" | "nouveau" | "envoyés">("reçus");
  const [query, setQuery] = useState("\u0020");
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
          fetch(`/api/messages/agents?role=admin&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }),
          fetch(`/api/messages/agents?role=agent&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }),
          fetch(`/api/messages/agents?role=sector&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }),
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
      } catch {
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
      toast({ title: "Message envoyé", description: "Le message a été envoyé." });
      return true;
    } catch (error: any) {
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
    } catch (error: any) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Une erreur est survenue lors de la suppression.",
        variant: "destructive",
      });
    }
  };

  return (
    <ResponsivePage>
      <div className="mx-auto max-w-6xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:h-[78vh] overflow-hidden">
          {/* Main */}
          <div className="flex-1 bg-white border border-gray-200 rounded-lg md:rounded-r-none md:border-r-0 overflow-hidden h-full">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <h1 className="text-lg md:text-xl font-semibold">Messagerie interne</h1>
              <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2 w-56 md:w-72">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-500"><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" /></svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent outline-none text-sm w-full"
                  placeholder="Rechercher"
                />
              </div>
            </div>

            {/* Content (no tabs; controlled by sidebar) */}
            <div className="h-full flex flex-col">
              <div className="border-b border-gray-200 px-4 pt-3 pb-2" />

              {activeTab === "reçus" && (
                <div className="p-4 flex-1 min-h-0 overflow-auto">
                  <InternalMessageList
                    messages={filteredInbox}
                    loading={loadingInbox}
                    emptyLabel="Aucun message reçu pour le moment."
                    onDelete={handleDelete}
                  />
                </div>
              )}

              {activeTab === "nouveau" && (
                <div className="p-4">
                  <InternalMessageComposer
                    loading={sending}
                    onSubmit={handleSubmit}
                    regionTargets={sectorTargets}
                    allowIndividual
                    allowGroup
                    adminRecipients={recipientOptions}
                    showAdminQuickPick={recipientOptions.length > 0}
                  />
                </div>
              )}

              {activeTab === "envoyés" && (
                <div className="p-4 flex-1 min-h-0 overflow-auto">
                  <InternalMessageList
                    messages={filteredSent}
                    loading={loadingSent}
                    emptyLabel="Aucun message envoyé pour le moment."
                    context="sent"
                    onDelete={handleDelete}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <aside className="md:w-64 mt-3 md:mt-0 md:ml-0 md:order-2 bg-gray-100 border border-gray-200 md:border-l md:border-t-0 rounded-lg md:rounded-l-none p-3 md:p-4 h-full overflow-auto">
            <button
              onClick={() => setActiveTab("nouveau")}
              className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full py-2.5 px-4 text-sm shadow"
            >
              Nouveau message
            </button>

            <ul className="mt-4 space-y-1 text-sm">
              <li>
                <button
                  onClick={() => setActiveTab("reçus")}
                  className={`w-full flex items-center gap-2 rounded px-3 py-2 ${activeTab === "reçus" ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'hover:bg-gray-200'}`}
                >
                  Boîte de réception
                  <span className="ml-auto text-xs">{inbox.length}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => setActiveTab("envoyés")}
                  className={`w-full flex items-center gap-2 rounded px-3 py-2 ${activeTab === "envoyés" ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600' : 'hover:bg-gray-200'}`}
                >
                  Envoyés
                  <span className="ml-auto text-xs">{sent.length}</span>
                </button>
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </ResponsivePage>
  );
}
