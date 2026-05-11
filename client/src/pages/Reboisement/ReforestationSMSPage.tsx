import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessageComposer from "@/components/messaging/InternalMessageComposer";
import InternalMessageList from "@/components/messaging/InternalMessageList";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
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
          fetch(`/api/messages/agents?role=admin&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }),
          fetch(`/api/messages/agents?role=agent&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }),
        ];
        if (isRegional) {
          requests.push(fetch(`/api/messages/agents?role=sector&domaineId=${encodeURIComponent(String(domaineId))}`, { credentials: 'include' }));
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
      } catch {
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
    } catch (error: any) {
      toast({ title: "Suppression impossible", description: error?.message || "Une erreur est survenue lors de la suppression.", variant: "destructive" });
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

  return (
    <ResponsivePage className="bg-transparent">
      <div className="mx-auto max-w-6xl">
        <div className={`grid gap-4 ${inboxOnly ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} lg:h-[78vh]`}>
            <section className="bg-gray-50 border-2 border-gray-300 rounded-lg overflow-hidden flex flex-col min-h-0 shadow-sm lg:h-[78vh]">
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-start gap-2">
                <div className="h-9 w-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3 8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v9.5A2.25 2.25 0 0118.75 20H5.25A2.25 2.25 0 013 17.75v-9.5zm2.25-.75a.75.75 0 00-.75.75v.807l7.06 4.237a2.25 2.25 0 002.38 0L21.5 9.057V8.25a.75.75 0 00-.75-.75H5.25zm16.25 3.308l-6.786 4.072a3.75 3.75 0 01-3.956 0L4.5 10.808v6.942c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-6.942z"/></svg>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{activeTab === 'reçus' ? 'Boîte de réception' : "Boîte d'envoi"}</div>
                  <div className="text-xs text-gray-500">{(activeTab === 'reçus' ? inbox.length : sent.length)} message(s)</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden md:flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 w-64 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-500"><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" /></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="bg-transparent outline-none text-sm w-full"
                    placeholder="Rechercher un message..."
                  />
                </div>
                <button
                  onClick={() => setActiveTab('reçus')}
                  className={`text-xs rounded-full px-3 py-1 border ${activeTab === 'reçus' ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  Reçus
                </button>
                <button
                  onClick={() => setActiveTab('envoyés')}
                  className={`text-xs rounded-full px-3 py-1 border ${activeTab === 'envoyés' ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                >
                  Envoyés
                </button>
              </div>
            </div>

            <div className="md:hidden border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-2 w-full shadow-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-500"><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" /></svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent outline-none text-sm w-full"
                  placeholder="Rechercher un message..."
                />
              </div>
            </div>

            <div className="p-4 flex-1 min-h-0">
              {activeTab === 'reçus' && (
                <InternalMessageList
                  messages={filteredInbox}
                  loading={loadingInbox}
                  emptyLabel="Aucun message reçu pour le moment."
                  onDelete={handleDelete}
                  onReply={async ({ recipientIdentifier, content }) => {
                    try {
                      await sendIndividual({ recipientIdentifier, content });
                      toast({ title: 'Réponse envoyée', description: 'Votre réponse a été transmise.' });
                      return;
                    } catch (e: any) {
                      toast({ title: 'Erreur', description: e?.message || "Échec de l'envoi de la réponse.", variant: 'destructive' });
                    }
                  }}
                />
              )}

              {activeTab === 'envoyés' && (
                <InternalMessageList
                  messages={filteredSent}
                  loading={loadingSent}
                  emptyLabel="Aucun message envoyé pour le moment."
                  context="sent"
                  onDelete={handleDelete}
                />
              )}
            </div>
          </section>

          {!inboxOnly && (
            <aside id="composer-panel" className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 shadow-sm lg:h-[78vh] lg:overflow-auto">
              <InternalMessageComposer
                loading={sending}
                onSubmit={handleSubmit}
                regionTargets={reforestationTargets}
                allowIndividual
                allowGroup
                adminRecipients={recipientOptions}
                showAdminQuickPick={recipientOptions.length > 0}
              />
            </aside>
          )}
        </div>
      </div>
    </ResponsivePage>
  );
}
