import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessageComposer from "@/components/messaging/InternalMessageComposer";
import InternalMessageList from "@/components/messaging/InternalMessageList";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useInternalMessaging } from "@/hooks/useInternalMessaging";
import { Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const GLOBAL_TARGETS = [
  { key: "hunters", label: "Tous les chasseurs", target: { role: "hunter" } },
  { key: "guides", label: "Guides", target: { role: "hunting-guide" } },
  { key: "agents", label: "Agents", target: { role: "agent" } },
];

export default function SimpleSMSPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  const isDefaultRole = !!(user as any)?.isDefaultRole;
  const isSupervisorRole = !!(user as any)?.isSupervisorRole;
  const usePhoneMessagingUi = isSupervisorRole;
  const userRegionLabel = String((user as any)?.region || '').trim();
  const userDeptLabel = String((user as any)?.departement || '').trim();
  const fallbackRecipientsLabel = [
    userRegionLabel ? `Agent régional — ${userRegionLabel}` : 'Agent régional',
    userDeptLabel ? `Agent secteur — ${userDeptLabel}` : 'Agent secteur',
  ].join(' ; ');
  const inboxOnly = role === 'hunter' || role === 'hunting-guide';
  const domaineId = isDefaultRole ? undefined : 1;
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
  } = useInternalMessaging({ domaineId, autoLoad: !isDefaultRole });

  const targets = useMemo(() => GLOBAL_TARGETS, []);

  // --- Simplified composer for default role (auto-send to regional + sector of user's zone) ---
  const [defaultMsg, setDefaultMsg] = useState("");
  const [defaultSending, setDefaultSending] = useState(false);
  const defaultFileRef = useRef<HTMLInputElement>(null);
  const [defaultAttachment, setDefaultAttachment] = useState<File | null>(null);
  const [autoRecipients, setAutoRecipients] = useState<Array<{ value: string; label: string; roleTag: string }>>([]);
  const [domaines, setDomaines] = useState<Array<{ id: number; nomDomaine: string; codeSlug: string }>>([]);

  // Fetch all domaines
  useEffect(() => {
    if (!isDefaultRole) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch('/api/domaines', { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (!cancelled && Array.isArray(data)) setDomaines(data);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [isDefaultRole]);

  // Fetch regional agents + sector agent of same zone (no domaineId needed for default role)
  useEffect(() => {
    if (!isDefaultRole || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const userRegion = (user as any)?.region;
        const userDept = (user as any)?.departement;
        const requests: Array<Promise<Response>> = [];

        // Fetch regional agents in same region (no domaineId)
        if (userRegion) {
          requests.push(fetch(`/api/messages/agents?role=agent&region=${encodeURIComponent(userRegion)}`, { credentials: 'include' }));
        }
        // Fetch sector (sub-agent) of user's departement (no domaineId)
        if (userDept) {
          requests.push(fetch(`/api/messages/agents?role=sector&departement=${encodeURIComponent(userDept)}`, { credentials: 'include' }));
        }

        if (!requests.length) { setAutoRecipients([]); return; }
        const responses = await Promise.all(requests);
        const jsons = await Promise.all(responses.map(r => r.ok ? r.json() : Promise.resolve([])));
        const allAgents = jsons.flatMap(arr => Array.isArray(arr) ? arr : []);
        const isSelf = (u: any) => {
          const uid = (user as any)?.id;
          if (uid && u?.id && Number(uid) === Number(u.id)) return true;
          return false;
        };
        const opts = allAgents
          .filter((u: any) => !isSelf(u))
          .map((u: any) => {
            const value = String(u?.username || u?.email || u?.matricule || '').trim();
            const full = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
            const isSector = u?.departement && String(u?.role || '').toLowerCase().includes('sub-agent') || String(u?.role || '').toLowerCase().includes('sector');
            const roleTag = isSector ? 'Agent secteur' : 'Agent régional';
            const loc = u?.departement ? ` — ${u.departement}` : u?.region ? ` — ${u.region}` : '';
            return { value, label: `${full || value}${loc}`, roleTag };
          })
          .filter(o => Boolean(o.value));
        // Deduplicate by value
        const unique = Array.from(new Map(opts.map(o => [o.value, o])).values());
        if (!cancelled) setAutoRecipients(unique);
      } catch {
        if (!cancelled) setAutoRecipients([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isDefaultRole, user]);

  const handleDefaultSend = async () => {
    if (!defaultMsg.trim()) {
      toast({ title: "Message vide", description: "Veuillez saisir un message.", variant: "destructive" });
      return;
    }
    if (!autoRecipients.length) {
      toast({ title: "Aucun destinataire", description: "Aucun agent régional ou secteur trouvé pour votre zone.", variant: "destructive" });
      return;
    }
    setDefaultSending(true);
    try {
      // Send to each auto-recipient individually — no domaineId forced so server uses user's context
      for (const r of autoRecipients) {
        const formData = new FormData();
        formData.append("recipient", r.value);
        formData.append("subject", "Message");
        formData.append("content", defaultMsg.trim());
        if (defaultAttachment) {
          formData.append("attachment", defaultAttachment);
        }
        const response = await fetch("/api/messages/", {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        if (!response.ok) {
          const errText = await response.text();
          let errMsg = "Impossible d'envoyer le message.";
          try { const j = JSON.parse(errText); errMsg = j?.message || errMsg; } catch {}
          throw new Error(errMsg);
        }
      }
      toast({ title: "Message envoyé", description: `Envoyé à ${autoRecipients.length} destinataire(s) de votre zone.` });
      setDefaultMsg("");
      setDefaultAttachment(null);
      if (defaultFileRef.current) defaultFileRef.current.value = "";
      refreshSent();
    } catch (e: any) {
      toast({ title: "Erreur", description: e?.message || "Impossible d'envoyer le message.", variant: "destructive" });
    } finally {
      setDefaultSending(false);
    }
  };

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
          const username = String(u?.username || '').trim();
          const name = fullName || username || roleLabel;
          const usernameSuffix = fullName && username ? ` (${username})` : '';
          const dept = u?.departement ? ` — ${u.departement}` : '';
          const region = u?.region ? ` — ${u.region}` : '';

          if (roleLabel === 'Secteur') {
            return `${name}${usernameSuffix} — ${roleLabel}${dept}`;
          }

          return `${name}${usernameSuffix} — ${roleLabel}${region}`;
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

  // Refresh automatique quand l'onglet "Envoyés" devient actif
  useEffect(() => {
    if (!inboxOnly && activeTab === "envoyés") {
      refreshSent();
    }
  }, [activeTab, refreshSent, inboxOnly]);

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
          .map((key) => targets.find((item) => item.key === key)?.target)
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
      <div className={usePhoneMessagingUi || isDefaultRole ? "w-full" : "mx-auto max-w-6xl"}>
        <div className={`grid ${(usePhoneMessagingUi || isDefaultRole) ? 'gap-0' : 'gap-4'} ${inboxOnly || usePhoneMessagingUi || isDefaultRole ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} ${(usePhoneMessagingUi || isDefaultRole) ? 'h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)]' : 'lg:h-[78vh]'}`}>
          {!usePhoneMessagingUi && !isDefaultRole && (
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
                {!inboxOnly && (
                  <button
                    onClick={() => setActiveTab('envoyés')}
                    className={`text-xs rounded-full px-3 py-1 border ${activeTab === 'envoyés' ? 'bg-green-50 border-green-600 text-green-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  >
                    Envoyés
                  </button>
                )}
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

              {!inboxOnly && activeTab === 'envoyés' && (
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
          )}

          {!inboxOnly && !isDefaultRole && (
            <aside id="composer-panel" className="bg-gray-50 border-2 border-gray-300 rounded-lg p-4 shadow-sm lg:h-[78vh] lg:overflow-auto">
              <InternalMessageComposer
                loading={sending}
                onSubmit={handleSubmit}
                regionTargets={targets}
                allowIndividual
                allowGroup
                adminRecipients={recipientOptions}
                showAdminQuickPick={role === 'admin' && recipientOptions.length > 0}
              />
            </aside>
          )}

          {/* Form-style composer (like screenshot) for default role */}
          {!inboxOnly && isDefaultRole && (
            <aside id="composer-panel" className="bg-white border-2 border-gray-200 shadow-sm flex flex-col overflow-hidden w-full h-full rounded-none sm:rounded-2xl">
              <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                <div className="max-w-xl mx-auto space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs text-gray-600 font-medium">Destinataire</div>
                    <input
                      value={autoRecipients.length > 0 ? autoRecipients.map(r => r.label).join(' ; ') : fallbackRecipientsLabel}
                      readOnly
                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                      placeholder="Chargement des destinataires..."
                    />
                    <div className="text-[11px] text-gray-500 leading-snug">
                      Destinataires automatiques selon votre région et votre département.
                    </div>
                    {autoRecipients.length === 0 && (
                      <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Aucun compte destinataire trouvé/actif pour votre zone. Dès qu'un agent régional et/ou un agent secteur sera enregistré dans votre région/département, il recevra vos messages.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-600 font-medium">Message</div>
                    <textarea
                      value={defaultMsg}
                      onChange={(e) => setDefaultMsg(e.target.value)}
                      placeholder="Écrivez votre message (160 caractères max)."
                      maxLength={160}
                      className="w-full min-h-[120px] resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="text-[11px] text-gray-400 text-right">{defaultMsg.length} / 160</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-gray-600 font-medium">Pièce jointe (optionnelle)</div>
                    <input
                      ref={defaultFileRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setDefaultAttachment(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => defaultFileRef.current?.click()}
                      className="w-full rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-left hover:bg-gray-100 transition-colors"
                    >
                      <div className="text-sm font-semibold text-green-700">Joindre un fichier</div>
                      <div className="text-xs text-gray-500 mt-1">Glissez-déposez un fichier ici ou cliquez pour sélectionner</div>
                      {defaultAttachment && (
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="text-xs text-gray-700 truncate">{defaultAttachment.name}</div>
                          <span
                            className="text-xs text-red-600 hover:underline"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDefaultAttachment(null);
                              if (defaultFileRef.current) defaultFileRef.current.value = "";
                            }}
                          >
                            Retirer
                          </span>
                        </div>
                      )}
                    </button>
                    <div className="text-[11px] text-gray-500">
                      Formats acceptés selon configuration du serveur. Taille maximale 5 Mo.
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleDefaultSend}
                      disabled={defaultSending || !autoRecipients.length || !defaultMsg.trim()}
                      className="inline-flex items-center justify-center rounded-md bg-green-700 hover:bg-green-800 text-white px-6 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {defaultSending ? "Envoi..." : "Envoyer"}
                    </button>
                  </div>
                </div>
              </div>
            </aside>
          )}

          {/* Phone-like chat UI for supervisor role */}
          {!inboxOnly && usePhoneMessagingUi && (
            <aside
              id="composer-panel"
              className={`bg-white border-2 border-gray-200 shadow-sm flex flex-col overflow-hidden ${usePhoneMessagingUi ? 'w-full h-full rounded-none sm:rounded-2xl' : 'rounded-2xl lg:h-[78vh]'}`}
            >
              {/* Header with recipients */}
              <div className="bg-green-700 text-white px-4 py-3 shrink-0">
                <div className="text-sm font-semibold">Messagerie</div>
                <div className="text-[10px] text-green-200 mt-0.5">
                  {autoRecipients.length > 0
                    ? `${autoRecipients.length} destinataire(s) dans votre zone`
                    : "Aucun destinataire trouvé"}
                </div>
              </div>

              {/* Recipient chips */}
              <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {autoRecipients.map((r, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-green-100 text-green-800 rounded-full px-2 py-0.5 text-[10px] font-medium">
                      <span className="h-3.5 w-3.5 rounded-full bg-green-700 text-white flex items-center justify-center text-[7px] font-bold">{r.label.charAt(0)}</span>
                      {r.label} — {r.roleTag}
                    </span>
                  ))}
                  {autoRecipients.length === 0 && (
                    <span className="text-[10px] text-amber-600">Aucun agent régional ou secteur dans votre zone</span>
                  )}
                </div>
              </div>

              {/* Chat bubbles area — show sent messages as conversation */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-white">
                {filteredSent.length === 0 && filteredInbox.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-gray-400">Aucun message pour le moment</p>
                  </div>
                )}
                {/* Show inbox messages as received bubbles */}
                {filteredInbox.map((msg: any, i: number) => {
                  const senderName = [msg?.sender?.firstName, msg?.sender?.lastName].filter(Boolean).join(' ') || 'Expéditeur';
                  const time = msg?.createdAt ? new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={`in-${i}`} className="flex flex-col items-start max-w-[85%]">
                      <span className="text-[9px] text-gray-400 mb-0.5 ml-1">{senderName}</span>
                      <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-800">
                        {msg?.content || ''}
                      </div>
                      <span className="text-[9px] text-gray-400 mt-0.5 ml-1">{time}</span>
                    </div>
                  );
                })}
                {/* Show sent messages as sent bubbles */}
                {filteredSent.map((msg: any, i: number) => {
                  const time = msg?.createdAt ? new Date(msg.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
                  return (
                    <div key={`out-${i}`} className="flex flex-col items-end max-w-[85%] ml-auto">
                      <div className="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm">
                        {msg?.content || ''}
                      </div>
                      <span className="text-[9px] text-gray-400 mt-0.5 mr-1">{time}</span>
                    </div>
                  );
                })}
              </div>

              {/* Attachment preview */}
              {defaultAttachment && (
                <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-green-600 shrink-0"><path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.24l7-7a3 3 0 0 0 0-4.24Z" clipRule="evenodd" /></svg>
                  <span className="text-xs text-gray-700 truncate flex-1">{defaultAttachment.name}</span>
                  <button
                    type="button"
                    onClick={() => { setDefaultAttachment(null); if (defaultFileRef.current) defaultFileRef.current.value = ""; }}
                    className="text-xs text-red-500 hover:underline"
                  >✕</button>
                </div>
              )}

              {/* Input bar — like phone SMS */}
              <div className="px-3 py-2 border-t border-gray-200 bg-white shrink-0">
                <div className="flex items-end gap-2">
                  <input
                    ref={defaultFileRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setDefaultAttachment(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => defaultFileRef.current?.click()}
                    className="shrink-0 h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    title="Joindre un fichier"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-500"><path fillRule="evenodd" d="M15.621 4.379a3 3 0 0 0-4.242 0l-7 7a3 3 0 0 0 4.241 4.24l7-7a3 3 0 0 0 0-4.24Z" clipRule="evenodd" /></svg>
                  </button>
                  <div className="flex-1 relative">
                    <textarea
                      value={defaultMsg}
                      onChange={(e) => setDefaultMsg(e.target.value)}
                      placeholder="Message..."
                      maxLength={160}
                      rows={1}
                      className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm focus:outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleDefaultSend();
                        }
                      }}
                    />
                    <span className="absolute right-3 bottom-1.5 text-[9px] text-gray-400">{defaultMsg.length}/160</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDefaultSend}
                    disabled={defaultSending || !autoRecipients.length || !defaultMsg.trim()}
                    className="shrink-0 h-9 w-9 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="h-4 w-4 text-white" />
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>
    </ResponsivePage>
  );
}
