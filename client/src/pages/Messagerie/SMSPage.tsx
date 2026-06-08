import ResponsivePage from "@/components/layout/ResponsivePage";
import InternalMessageComposer from "@/components/messaging/InternalMessageComposer";
import InternalMessageList from "@/components/messaging/InternalMessageList";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import ChatAttachmentBlock from "@/components/messaging/ChatAttachmentBlock";
import { AgentNotFoundAvatar, ContactAvatar } from "@/components/messaging/ContactAvatar";
import MessageAttachmentViewer from "@/components/messaging/MessageAttachmentViewer";
import { guessAttachmentMime, repairAttachmentFileName } from "@/lib/attachmentMime";
import { buildMessageAttachmentUrl } from "@/lib/messageAttachments";
import {
  isGroupConversationKey,
  resolveConversationDeleteIdentifier,
} from "@/lib/messagingUtils";
import { useInternalMessaging } from "@/hooks/useInternalMessaging";
import { getMessagingDomaineIdForHook } from "@/utils/messagingDomain";
import { ArrowLeft, MoreVertical, Plus, Search, Send, Trash2, User, X, Paperclip, Check, CheckCheck, Clock, Camera, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";

interface AttachmentPreview {
  messageId: number;
  isGroup?: boolean;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
}

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
  const _smsDomain = (typeof window !== 'undefined' ? localStorage.getItem('domain') || '' : '').toUpperCase();
  const isAlerteDomain = _smsDomain === 'ALERTE' ||
    ((_smsDomain !== 'CHASSE' && _smsDomain !== 'REBOISEMENT') &&
      (isDefaultRole || isSupervisorRole));
  const usePhoneMessagingUi = isAlerteDomain;
  const userRegionLabel = String((user as any)?.region || '').trim();
  const userDeptLabel = String((user as any)?.departement || '').trim();
  const fallbackRecipientsLabel = isAlerteDomain
    ? (userDeptLabel ? `Superviseur — ${userDeptLabel}` : userRegionLabel ? `Superviseur — ${userRegionLabel}` : 'Chargement du superviseur...')
    : [
      userRegionLabel ? `Agent régional — ${userRegionLabel}` : 'Agent régional',
      userDeptLabel ? `Agent secteur — ${userDeptLabel}` : 'Agent secteur',
    ].join(' ; ');
  const inboxOnly = role === 'hunter' || role === 'hunting-guide';
  const domaineId = getMessagingDomaineIdForHook();
  const [recipientOptions, setRecipientOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [activeTab, setActiveTab] = useState<"reçus" | "envoyés">("reçus");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  // Phone messaging UI navigation state (supervisor)
  const [phoneView, setPhoneView] = useState<'list' | 'chat' | 'new'>('list');

  // Notify MainLayout to hide/show the bottom nav bar based on chat state
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sms:chat-state', { detail: phoneView !== 'list' }));
    return () => { window.dispatchEvent(new CustomEvent('sms:chat-state', { detail: false })); };
  }, [phoneView]);
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [tempConversation, setTempConversation] = useState<any | null>(null);
  const [newRecipientSearch, setNewRecipientSearch] = useState('');
  const [isResolvingContact, setIsResolvingContact] = useState(false);
  const [showAgentNotFoundDialog, setShowAgentNotFoundDialog] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Tactical phone-style deletion UI states
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [deletingConv, setDeletingConv] = useState(false);
  const [activeActionMessage, setActiveActionMessage] = useState<any | null>(null);

  // New multi-select states
  const [showListMenu, setShowListMenu] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedConvKeys, setSelectedConvKeys] = useState<Set<string>>(new Set());
  const [massDeleting, setMassDeleting] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const deleteConversationByKey = async (contactKey: string): Promise<boolean> => {
    const conv = conversations.find((c) => c.contactKey === contactKey);
    if (isGroupConversationKey(contactKey)) {
      if (conv?.messages?.length) {
        await Promise.all(conv.messages.map((m) => deleteMessage(m.rawMsgObj).catch(() => { })));
      }
      return true;
    }

    const identifiers = [
      resolveConversationDeleteIdentifier(contactKey, conv?.contactIdentifier),
      conv?.contactIdentifier,
      contactKey.startsWith('direct_') ? contactKey.slice('direct_'.length) : null,
    ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);

    for (const ident of identifiers) {
      const response = await authenticatedFetch(
        `/api/messages/conversation/${encodeURIComponent(ident)}`,
        { method: 'DELETE' }
      );
      if (response.ok || response.status === 204) return true;
    }

    if (conv?.messages?.length) {
      await Promise.all(conv.messages.map((m) => deleteMessage(m.rawMsgObj).catch(() => { })));
      return true;
    }
    return false;
  };

  const handleDeleteEntireConversation = async (contactKey: string) => {
    setDeletingConv(true);
    try {
      const deleted = await deleteConversationByKey(contactKey);
      if (!deleted) {
        throw new Error("Aucun message correspondant trouvé pour ce contact.");
      }

      toast({ title: "Discussion supprimée", description: "La conversation a été entièrement supprimée." });
      setPhoneView('list');
      setSelectedContactKey(null);
      await refreshAll();
    } catch (e: any) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      toast({ title: "Erreur", description: e?.message || "Impossible de supprimer la discussion.", variant: "destructive" });
    } finally {
      setDeletingConv(false);
      setShowHeaderMenu(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!conversations.some((c) => c.unreadCount > 0)) return;
    setShowListMenu(false);
    for (const conv of conversations) {
      if (conv.unreadCount > 0) {
        for (const m of conv.messages) {
          if (!m.isSent && m.rawMsgObj && !m.rawMsgObj.isRead) {
            await markMessageAsRead(
              m.id,
              Boolean(m.rawMsgObj?.isGroupMessage)
            ).catch(() => { });
          }
        }
      }
    }
    await refreshAll();
    toast({ title: "Messages lus", description: "Toutes les conversations ont été marquées comme lues." });
  };

  const handleDeleteSelected = async () => {
    if (selectedConvKeys.size === 0) return;
    setMassDeleting(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const key of selectedConvKeys) {
        const deleted = await deleteConversationByKey(key);
        if (deleted) ok += 1;
        else fail += 1;
      }
      setSelectedConvKeys(new Set());
      setIsSelectionMode(false);
      await refreshAll();
      if (ok > 0) {
        toast({
          title: "Suppression terminée",
          description:
            fail > 0
              ? `${ok} conversation(s) supprimée(s), ${fail} en échec.`
              : `${ok} conversation(s) supprimée(s).`,
        });
      } else {
        toast({
          title: "Erreur",
          description: "Impossible de supprimer les conversations sélectionnées.",
          variant: "destructive",
        });
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      toast({ title: "Erreur", description: "Une erreur est survenue lors de la suppression.", variant: "destructive" });
    } finally {
      setMassDeleting(false);
    }
  };

  const toggleConvSelection = (key: string) => {
    const newSet = new Set(selectedConvKeys);
    if (newSet.has(key)) newSet.delete(key);
    else newSet.add(key);
    setSelectedConvKeys(newSet);
  };


  const {
    inbox,
    sent,
    loadingInbox,
    loadingSent,
    sending,
    sendGroup,
    sendIndividual,
    editMessage,
    deleteMessage,
    markMessageAsRead,
    purgeStaleMessage,
    refreshSent,
    refreshAll,
    refreshInbox,
  } = useInternalMessaging({ domaineId, autoLoad: true });

  const targets = useMemo(() => GLOBAL_TARGETS, []);

  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!loadingInbox && !loadingSent) {
      initialLoadRef.current = false;
    }
  }, [loadingInbox, loadingSent]);

  // --- Simplified composer for default role (auto-send to regional + sector of user's zone) ---
  const [defaultMsg, setDefaultMsg] = useState("");
  const [defaultSending, setDefaultSending] = useState(false);
  const defaultFileRef = useRef<HTMLInputElement>(null);
  const [defaultAttachment, setDefaultAttachment] = useState<File | null>(null);
  const [autoRecipients, setAutoRecipients] = useState<Array<{ value: string; label: string; roleTag: string }>>([]);
  const [domaines, setDomaines] = useState<Array<{ id: number; nomDomaine: string; codeSlug: string }>>([]);
  const [editingMessage, setEditingMessage] = useState<any | null>(null);

  // Fetch all domaines
  useEffect(() => {
    if (!isDefaultRole) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await authenticatedFetch('/api/domaines/public/active');
        if (resp.ok) {
          const data = await resp.json();
          if (!cancelled && Array.isArray(data)) setDomaines(data);
        }
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e); }
    })();
    return () => { cancelled = true; };
  }, [isDefaultRole]);

  // ── CHARGEMENT DES DESTINATAIRES AUTOMATIQUES ───────────────────────────────────────
  // Domaine ALERTE : hiérarchie spécifique
  //   - isDefaultRole (agent terrain) -> superviseurs de son département
  //   - isSupervisorRole + département -> superviseurs régionaux de sa région
  //   - isSupervisorRole sans département (régional) -> pas de remountée auto
  // Autres domaines : logique inchangée (agent régional + secteur de la zone)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const userRegion = String((user as any)?.region || '').trim();
        const userDept = String((user as any)?.departement || '').trim();

        if (isAlerteDomain) {
          // ══ ALERTE : routage hiérarchique vers superviseurs ══
          let url = '';
          if (isDefaultRole) {
            // Agent terrain -> superviseurs du même département
            // Fallback sur région si pas de département défini
            if (userDept) {
              url = `/api/messages/agents?role=supervisor&departement=${encodeURIComponent(userDept)}`;
            } else if (userRegion) {
              url = `/api/messages/agents?role=supervisor&region=${encodeURIComponent(userRegion)}`;
            } else {
              // Aucune zone -> pas de destinataire auto
              if (!cancelled) setAutoRecipients([]);
              return;
            }
          } else if (isSupervisorRole) {
            // Superviseur départemental (a un departement) -> superviseurs régionaux de sa région
            // Superviseur régional (pas de dept spécifique) -> pas de remountée auto
            if (userDept && userRegion) {
              // Super dept -> cherche superviseurs de la même région (sans filtre département)
              url = `/api/messages/agents?role=supervisor&region=${encodeURIComponent(userRegion)}`;
            } else {
              if (!cancelled) setAutoRecipients([]);
              return;
            }
          } else {
            if (!cancelled) setAutoRecipients([]);
            return;
          }

          const resp = await authenticatedFetch(url);
          const data: any[] = resp.ok ? await resp.json() : [];
          const isSelf = (u: any) => Number(u?.id) === Number((user as any)?.id);

          const opts = data
            .filter(u => !isSelf(u))
            .map(u => {
              const value = String(u?.id || '').trim();
              const full = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
              const grade = String(u?.grade || '').trim();
              const name = grade ? `${grade} ${full || u?.username}` : (full || u?.username || value);
              // Étiquette : superviseur départemental ou régional
              const isRegionalSup = !u?.departement;
              const roleTag = isRegionalSup ? 'Superviseur régional' : 'Superviseur départemental';
              const loc = u?.departement ? ` — ${u.departement}` : u?.region ? ` — ${u.region}` : '';
              return { value, label: `${name}${loc} (${roleTag})`, roleTag };
            })
            .filter(o => Boolean(o.value));

          const unique = Array.from(new Map(opts.map(o => [o.value, o])).values());
          if (!cancelled) setAutoRecipients(unique);
          return; // ne pas exécuter la logique des autres domaines
        }

        // ══ AUTRES DOMAINES : logique inchangée ══
        if (!isDefaultRole) return; // les autres domaines gèrent leurs destinataires dans le 2ème useEffect
        const requests: Array<Promise<Response>> = [];
        if (userRegion) {
          requests.push(authenticatedFetch(`/api/messages/agents?role=agent&region=${encodeURIComponent(userRegion)}`));
        }
        if (userDept) {
          requests.push(authenticatedFetch(`/api/messages/agents?role=sector&departement=${encodeURIComponent(userDept)}`));
        }
        if (!requests.length) {
          requests.push(authenticatedFetch(`/api/messages/agents?role=admin`));
        }
        const responses = await Promise.all(requests);
        const jsons = await Promise.all(responses.map(r => r.ok ? r.json() : Promise.resolve([])));
        const allAgents = jsons.flatMap(arr => Array.isArray(arr) ? arr : []);
        const isSelf = (u: any) => Number(u?.id) === Number((user as any)?.id);
        const opts = allAgents
          .filter(u => !isSelf(u))
          .map((u: any) => {
            const value = String(u?.id || u?.username || u?.email || u?.matricule || '').trim();
            const full = [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
            const isSector = String(u?.role || '').toLowerCase().includes('sub-agent') || String(u?.role || '').toLowerCase().includes('sector');
            const roleTag = isSector ? 'Agent secteur' : 'Agent régional';
            const loc = u?.departement ? ` — ${u.departement}` : u?.region ? ` — ${u.region}` : '';
            return { value, label: `${full || value}${loc}`, roleTag };
          })
          .filter(o => Boolean(o.value));
        const unique = Array.from(new Map(opts.map(o => [o.value, o])).values());
        if (!cancelled) setAutoRecipients(unique);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        if (!cancelled) setAutoRecipients([]);
      }
    })();
    return () => { cancelled = true; };
  }, [isAlerteDomain, isDefaultRole, isSupervisorRole, user]);
  // ───────────────────────────────────────────────────────────

  const handleDefaultSend = async () => {
    if (!defaultMsg.trim()) {
      toast({ title: "Message vide", description: "Veuillez saisir un message.", variant: "destructive" });
      return;
    }
    if (!autoRecipients.length) {
      const desc = isAlerteDomain
        ? "Aucun superviseur trouvé pour votre zone. Vous pouvez utiliser la messagerie directe (tél/email/matricule)."
        : "Aucun agent régional ou secteur trouvé pour votre zone.";
      toast({ title: "Aucun destinataire", description: desc, variant: "destructive" });
      return;
    }
    setDefaultSending(true);
    try {
      const isOffline = !navigator.onLine;
      // Send to each auto-recipient individually using sendIndividual for full Offline-First compatibility
      for (const r of autoRecipients) {
        await sendIndividual({
          recipientIdentifier: r.value,
          content: defaultMsg.trim(),
          subject: "Message",
          attachment: defaultAttachment,
        });
      }

      if (isOffline) {
        toast({
          title: "Mode hors-ligne",
          description: `Message(s) sauvegardé(s) localement pour ${autoRecipients.length} destinataire(s). Envoi automatique au retour du réseau.`,
        });
      } else {
        toast({ title: "Message envoyé", description: `Envoyé à ${autoRecipients.length} destinataire(s) de votre zone.` });
      }

      setDefaultMsg("");
      setDefaultAttachment(null);
      if (defaultFileRef.current) defaultFileRef.current.value = "";
      refreshSent();
    } catch (e: any) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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

        const pickValue = (u: any) => String(u?.id || u?.username || u?.email || u?.matricule || '').trim();
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
          ...(!isAlerteDomain ? adminsArr.map((u: any) => ({ u, roleLabel: 'Administrateur' })) : []),
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
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        if (!cancelled) setRecipientOptions([]);
      }
    })();
    return () => { cancelled = true; };
  }, [role, user, isAlerteDomain]);

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
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      toast({ title: "Suppression impossible", description: error?.message || "Une erreur est survenue lors de la suppression.", variant: "destructive" });
    }
  };
  const filteredInbox = useMemo(() => filterMessages(inbox), [inbox, normalizedQuery]);
  const filteredSent = useMemo(() => filterMessages(sent), [sent, normalizedQuery]);

  // Group messages into conversations for phone UI (supervisor)
  const conversations = useMemo(() => {
    if (!usePhoneMessagingUi) return [];
    const convMap = new Map<string, {
      contactKey: string; contactName: string; contactInitial: string;
      contactIdentifier: string; contactGrade: string; contactRoleMetier: string;
      lastMessage: string; lastTime: Date;
      lastIsSent: boolean; unreadCount: number;
      messages: Array<{ id: number; content: string; time: Date; isSent: boolean; senderName?: string; rawMsgObj: any }>;
    }>();
    for (const msg of inbox) {
      const mAny = msg as any;
      const sId = String(mAny?.sender?.id || mAny?.senderId || '');
      const sName = [mAny?.sender?.firstName, mAny?.sender?.lastName].filter(Boolean).join(' ') || 'Inconnu';
      const sGrade = String(mAny?.sender?.grade || '').trim();
      const sRoleMetier = String(mAny?.sender?.roleMetierLabel || mAny?.sender?.role_metier_label || '').trim();
      const sIdent = String(mAny?.sender?.id || mAny?.sender?.username || mAny?.sender?.email || mAny?.sender?.matricule || sName);
      const key = sId || sIdent;
      const time = new Date(mAny?.createdAt || 0);
      const conv = convMap.get(key) || { contactKey: key, contactName: sGrade ? `${sGrade} ${sName}` : sName, contactInitial: sName.charAt(0).toUpperCase(), contactIdentifier: sIdent, contactGrade: sGrade, contactRoleMetier: sRoleMetier, lastMessage: mAny?.content || '', lastTime: time, lastIsSent: false, unreadCount: 0, messages: [] as any[] };
      if (!convMap.has(key)) {
        convMap.set(key, conv);
      }
      conv.messages.push({ id: Number(mAny.id), content: mAny?.content || '', time, isSent: false, senderName: sName, rawMsgObj: mAny });
      if (!mAny?.isRead && !mAny?.is_read) conv.unreadCount++;
      if (time > conv.lastTime) { conv.lastMessage = mAny?.content || ''; conv.lastTime = time; conv.lastIsSent = false; }
    }
    for (const msg of sent) {
      const mAny = msg as any;
      let rId = '';
      let rName = '';
      let rIdent = '';
      let rGrade = '';
      let rRoleMetier = '';
      let baseName = '';

      if (mAny?.isGroupMessage) {
        const targetRole = mAny?.targetRole || 'inconnu';
        const targetRegion = mAny?.targetRegion ? ` (${mAny.targetRegion})` : '';
        rName = `Groupe: ${targetRole}${targetRegion}`;
        rIdent = `group_${targetRole}_${mAny?.targetRegion || 'all'}`;
        rId = rIdent;
        baseName = rName;
      } else {
        rId = String(mAny?.recipient?.id || mAny?.recipientId || '');
        const reader = mAny?.readers?.[0];

        rGrade = String(mAny?.recipient?.grade || reader?.grade || '').trim();
        rRoleMetier = String(mAny?.recipient?.role_metier_label || '').trim();

        baseName = [mAny?.recipient?.firstName, mAny?.recipient?.lastName].filter(Boolean).join(' ') || reader?.name || mAny?.recipientIdentifier || (rId ? 'Utilisateur' : 'Destinataire');
        rName = rGrade ? `${rGrade} ${baseName}` : baseName;
        rIdent = String(rId || mAny?.recipientIdentifier || mAny?.recipient?.username || mAny?.recipient?.email || reader?.matricule || 'deleted');
      }

      const key = rId || rIdent;
      const time = new Date(mAny?.createdAt || 0);
      const conv = convMap.get(key) || { contactKey: key, contactName: rName, contactInitial: mAny?.isGroupMessage ? 'G' : (baseName || rName).charAt(0).toUpperCase(), contactIdentifier: rIdent, contactGrade: rGrade, contactRoleMetier: rRoleMetier, lastMessage: mAny?.content || '', lastTime: time, lastIsSent: true, unreadCount: 0, messages: [] as any[] };
      if (!convMap.has(key)) {
        convMap.set(key, conv);
      }
      conv.messages.push({ id: Number(mAny.id), content: mAny?.content || '', time, isSent: true, rawMsgObj: mAny });
      if (time > conv.lastTime) { conv.lastMessage = mAny?.content || ''; conv.lastTime = time; conv.lastIsSent = true; }
    }
    for (const conv of convMap.values()) conv.messages.sort((a, b) => a.time.getTime() - b.time.getTime());
    return Array.from(convMap.values()).sort((a, b) => b.lastTime.getTime() - a.lastTime.getTime());
  }, [inbox, sent, usePhoneMessagingUi]);

  const selectedConversation = useMemo(() => {
    if (!selectedContactKey) return null;
    return conversations.find(c => c.contactKey === selectedContactKey) || tempConversation || null;
  }, [conversations, selectedContactKey, tempConversation]);

  const hasUnread = useMemo(() => conversations.some(c => c.unreadCount > 0), [conversations]);

  // Prevent white screen: If we are in chat view but the conversation is lost, go back to the list
  useEffect(() => {
    if (phoneView === 'chat' && !selectedConversation) {
      setPhoneView('list');
    }
  }, [phoneView, selectedConversation]);

  // Mark unread messages as read when viewing conversation
  useEffect(() => {
    if (phoneView === 'chat' && selectedConversation) {
      selectedConversation.messages.forEach((m: any) => {
        if (!m.isSent && m.rawMsgObj && !m.rawMsgObj.isRead) {
          void markMessageAsRead(m.id, Boolean(m.rawMsgObj?.isGroupMessage)).catch(() => { });
          m.rawMsgObj.isRead = true;
        }
      });
    }
  }, [phoneView, selectedConversation, markMessageAsRead]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (phoneView === 'chat') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [phoneView, selectedConversation?.messages?.length]);

  const handleSendToContact = async (contactIdentifier: string) => {
    if (!defaultMsg.trim() && !defaultAttachment) return;
    setDefaultSending(true);
    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, defaultMsg.trim());
        toast({ title: "Message modifié" });
        setEditingMessage(null);
      } else {
        await sendIndividual({ recipientIdentifier: contactIdentifier, content: defaultMsg.trim(), attachment: defaultAttachment });
        toast({ title: "Message envoyé" });
      }
      setDefaultMsg(''); setDefaultAttachment(null);
      if (defaultFileRef.current) defaultFileRef.current.value = '';
      refreshSent();
    } catch (e: any) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
      toast({ title: "Erreur", description: e?.message || "Impossible de terminer l'action.", variant: "destructive" });
    } finally { setDefaultSending(false); }
  };

  const formatRelTime = (d: Date) => {
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && now.getDate() === d.getDate()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diff < 172800000) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };

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
          .map((key) => targets.find((item) => item.key === key)?.target)
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
    } catch (error: any) {
      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      toast({
        title: "Erreur",
        description: error?.message || "Impossible d'envoyer le message.",
        variant: "destructive",
      });
      return false;
    }
  };

  const isAlerteUser = isAlerteDomain;

  if (isAlerteUser) {
    return (
      <div className={`fixed inset-0 flex flex-col overflow-hidden bg-slate-50 ${phoneView === 'list' ? 'pb-14' : ''} md:pb-0`} style={{ paddingTop: 'calc(52px + env(safe-area-inset-top, 0px))' }}>
        {/* supervisor phone Messaging UI */}
        {usePhoneMessagingUi && (
          <div className="bg-white flex-1 flex flex-col min-h-0 w-full h-full relative">
            {/* ===== VIEW: Conversation List ===== */}
            {phoneView === 'list' && (
              <>
                <div className="bg-[#114b26] text-white px-4 py-3 shrink-0 flex items-center justify-between relative">
                  {isSelectionMode ? (
                    <>
                      <div className="flex items-center gap-3">
                        <button onClick={() => { setIsSelectionMode(false); setSelectedConvKeys(new Set()); }} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"><ArrowLeft className="h-5 w-5" /></button>
                        <span className="text-base font-bold">{selectedConvKeys.size} sélectionné(s)</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm font-semibold">
                        <button onClick={() => {
                          if (selectedConvKeys.size === conversations.length) {
                            setSelectedConvKeys(new Set());
                          } else {
                            setSelectedConvKeys(new Set(conversations.map(c => c.contactKey)));
                          }
                        }}>
                          {selectedConvKeys.size === conversations.length ? 'Désélectionner tout' : 'Tout sélectionner'}
                        </button>
                        {selectedConvKeys.size > 0 && (
                          <button onClick={handleDeleteSelected} disabled={massDeleting} className="text-white hover:text-red-300 disabled:opacity-50 transition-colors">
                            <Trash2 className="h-5 w-5" />
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-lg font-bold w-1/3">Messages</div>

                      <div className="flex-1 flex justify-center">
                        <button onClick={() => { setPhoneView('new'); setNewRecipientSearch(''); setDefaultMsg(''); }} className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-green-500 hover:bg-green-400 shadow flex items-center justify-center transition-all active:scale-90">
                          <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                        </button>
                      </div>

                      {/* Fil d'ariane */}
                      <div className="flex items-center justify-end gap-1.5 text-xs text-green-200 font-medium shrink-0 w-1/3">
                        <Link
                          href={isSupervisorRole ? "/supervisor" : "/default-home"}
                          className="flex items-center gap-0.5 hover:text-white transition-colors"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                          </svg>
                          <span className="hidden sm:inline">Accueil</span>
                        </Link>
                        <span className="text-green-500 opacity-60">/</span>
                        <span className="text-green-50 font-semibold hidden sm:inline">Messagerie</span>
                      </div>
                    </>
                  )}
                </div>
                {!isSelectionMode && conversations.length > 0 && (
                  <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2 relative">
                      <Search className="h-4 w-4 text-gray-400" />
                      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher" className="bg-transparent outline-none text-sm w-full pr-8" />
                      {query.length > 0 && (
                        <button
                          onClick={() => setQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label="Effacer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="relative shrink-0">
                      <button onClick={() => setShowListMenu(!showListMenu)} className="h-9 w-9 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors text-gray-600">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {showListMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowListMenu(false)} />
                          <div className="absolute right-0 mt-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 duration-150">
                            <button
                              onClick={handleMarkAllAsRead}
                              disabled={!hasUnread}
                              className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50 disabled:hover:bg-transparent flex items-center gap-3 transition-colors border-b border-gray-50 disabled:text-gray-400 disabled:opacity-50"
                            >
                              <span className="text-lg">✓</span> Tout marquer comme lu
                            </button>
                            <button onClick={() => { setIsSelectionMode(true); setShowListMenu(false); }} className="w-full text-left px-4 py-3 text-sm font-medium hover:bg-gray-50 flex items-center gap-3 transition-colors">
                              <span className="text-lg">☐</span> Sélectionner
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {/* Skeleton loader while fetching */}
                  {initialLoadRef.current && (loadingInbox || loadingSent) && conversations.length === 0 && (
                    <div className="flex flex-col gap-0 animate-pulse">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                          <ContactAvatar size="lg" className="bg-gray-200" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 bg-gray-200 rounded w-2/5" />
                            <div className="h-2.5 bg-gray-100 rounded w-3/4" />
                          </div>
                          <div className="h-2 w-10 bg-gray-200 rounded shrink-0" />
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Empty state — shown only after loading finishes */}
                  {!initialLoadRef.current && conversations.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
                      <p className="text-sm text-gray-400">Aucune conversation</p>
                    </div>
                  )}
                  {conversations.filter(c => !normalizedQuery || c.contactName.toLowerCase().includes(normalizedQuery)).map(conv => {
                    const isSelected = selectedConvKeys.has(conv.contactKey);
                    return (
                      <div key={conv.contactKey}
                        className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 transition-colors text-left select-none ${isSelectionMode ? 'cursor-pointer hover:bg-gray-50' : 'cursor-pointer hover:bg-gray-50 active:bg-gray-100'} ${isSelected ? 'bg-green-50/50' : ''}`}
                        onClick={() => {
                          if (isSelectionMode) toggleConvSelection(conv.contactKey);
                          else {
                            setSelectedContactKey(conv.contactKey);
                            setTempConversation(null);
                            setPhoneView('chat');
                            setDefaultMsg('');
                          }
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (!isSelectionMode) { setIsSelectionMode(true); toggleConvSelection(conv.contactKey); }
                        }}>
                        {isSelectionMode ? (
                          <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-green-600 border-green-600' : 'border-gray-300'}`}>
                            {isSelected && <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                          </div>
                        ) : (
                          <ContactAvatar size="lg" unread={conv.unreadCount > 0} isGroup={conv.contactInitial === 'G'} />
                        )}
                        <div className="flex-1 min-w-0 pointer-events-none">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-400'}`}>{conv.contactName}</span>
                            <span className="text-[10px] text-gray-400 shrink-0">{formatRelTime(conv.lastTime)}</span>
                          </div>
                          {conv.contactRoleMetier && <p className="text-[10px] text-green-700 font-medium truncate">{conv.contactRoleMetier}</p>}
                          <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{conv.lastIsSent ? 'Vous : ' : ''}{conv.lastMessage}</p>
                        </div>
                        {conv.unreadCount > 0 && !isSelectionMode && <span className="h-5 min-w-[20px] px-1 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">{conv.unreadCount}</span>}
                      </div>
                    );
                  })}
                </div>

              </>
            )}

            {/* ===== VIEW: Chat Conversation ===== */}
            {phoneView === 'chat' && selectedConversation && (
              <>
                <div className="bg-[#114b26] text-white px-3 py-3 shrink-0 flex items-center gap-3 relative justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button onClick={() => { setPhoneView('list'); setSelectedContactKey(null); setTempConversation(null); }} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"><ArrowLeft className="h-5 w-5" /></button>
                    <ContactAvatar size="sm" variant="header" isGroup={selectedConversation.contactInitial === 'G'} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{selectedConversation.contactName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Fil d'ariane */}
                    <div className="hidden sm:flex items-center gap-1.5 text-xs text-green-200 font-medium shrink-0">
                      <Link
                        href={isSupervisorRole ? "/supervisor" : "/default-home"}
                        className="flex items-center gap-0.5 hover:text-white transition-colors"
                      >
                        <span>Accueil</span>
                      </Link>
                      <span className="text-green-500 opacity-60">/</span>
                      <span className="text-green-50 font-semibold">Messagerie</span>
                    </div>
                    {/* Bouton trois points style smartphone */}
                    <div className="relative">
                      <button
                        onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                        className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                      {showHeaderMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 duration-150">
                            <button
                              onClick={() => handleDeleteEntireConversation(selectedConversation.contactKey)}
                              disabled={deletingConv}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 font-bold hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                            >
                              <Trash2 className="h-4.5 w-4.5" />
                              {deletingConv ? "Suppression..." : "Supprimer la discussion"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
                  {selectedConversation.messages.length === 0 && (
                    <div className="flex items-center justify-center h-full"><p className="text-xs text-gray-400">Aucun message</p></div>
                  )}
                  {selectedConversation.messages.map((m: any, i: number) => {
                    const hasAttachment = Boolean(m.rawMsgObj?.attachmentPath || m.rawMsgObj?.attachmentName);
                    const attachmentName = repairAttachmentFileName(m.rawMsgObj?.attachmentName) || 'Fichier joint';
                    const attachmentMime = guessAttachmentMime(
                      attachmentName,
                      m.rawMsgObj?.attachmentMime
                    );
                    const isGroupMsg = Boolean(
                      m.rawMsgObj?.isGroupMessage ||
                      selectedConversation.contactKey.startsWith('group_')
                    );
                    const url = m.rawMsgObj?.id
                      ? buildMessageAttachmentUrl(Number(m.rawMsgObj.id), { isGroup: isGroupMsg })
                      : '';

                    const openAttachmentPreview = () => {
                      if (!m.rawMsgObj?.id) return;
                      setPreview({
                        messageId: Number(m.rawMsgObj.id),
                        isGroup: isGroupMsg,
                        name: attachmentName,
                        mime: attachmentMime,
                        size: m.rawMsgObj?.attachmentSize,
                      });
                    };

                    return m.isSent ? (
                      <div key={i} className="flex flex-col items-end max-w-[80%] ml-auto">
                        <div
                          onClick={() => setActiveActionMessage(m)}
                          className="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm cursor-pointer hover:bg-green-700 active:scale-95 transition-all flex flex-col gap-1.5"
                        >
                          {m.content && <span>{m.content}</span>}
                          {hasAttachment && url && (
                            <ChatAttachmentBlock
                              url={url}
                              name={attachmentName}
                              mime={attachmentMime}
                              size={m.rawMsgObj?.attachmentSize}
                              variant="sent"
                              onOpen={openAttachmentPreview}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                          <span className="text-[9px] text-gray-400">
                            {m.time.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            {(() => {
                              const mObj = m.rawMsgObj;
                              if (!mObj?.updatedAt) return null;
                              const createdTime = new Date(mObj.createdAt || mObj.created_at || mObj.createdAtLocal || 0).getTime();
                              const updatedTime = new Date(mObj.updatedAt).getTime();
                              if (Number.isFinite(createdTime) && Number.isFinite(updatedTime) && (updatedTime - createdTime > 2000)) {
                                return ` (Modifié le ${new Date(mObj.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
                              }
                              return null;
                            })()}
                          </span>
                          {m.rawMsgObj?.isPending ? (
                            <span title="En attente"><Clock className="h-3 w-3 text-gray-400" /></span>
                          ) : Array.isArray(m.rawMsgObj?.readers) && m.rawMsgObj.readers.length > 0 ? (
                            <span title="Lu"><CheckCheck className="h-3 w-3 text-blue-500" /></span>
                          ) : (
                            <span title="Envoyé"><Check className="h-3 w-3 text-gray-400" /></span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex flex-col items-start max-w-[80%]">
                        <div
                          onClick={() => setActiveActionMessage(m)}
                          className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-800 shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 active:scale-95 transition-all flex flex-col gap-1.5"
                        >
                          {m.content && <span>{m.content}</span>}
                          {hasAttachment && url && (
                            <ChatAttachmentBlock
                              url={url}
                              name={attachmentName}
                              mime={attachmentMime}
                              size={m.rawMsgObj?.attachmentSize}
                              variant="received"
                              onOpen={openAttachmentPreview}
                            />
                          )}
                        </div>
                        <span className="text-[9px] text-gray-400 mt-0.5 ml-1">
                          {m.time.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {(() => {
                            const mObj = m.rawMsgObj;
                            if (!mObj?.updatedAt) return null;
                            const createdTime = new Date(mObj.createdAt || mObj.created_at || mObj.createdAtLocal || 0).getTime();
                            const updatedTime = new Date(mObj.updatedAt).getTime();
                            if (Number.isFinite(createdTime) && Number.isFinite(updatedTime) && (updatedTime - createdTime > 2000)) {
                              return ` (Modifié le ${new Date(mObj.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
                            }
                            return null;
                          })()}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>
                {defaultSending && (
                  <div className="flex flex-col items-end max-w-[80%] ml-auto opacity-70 px-4 mb-2">
                    {defaultAttachment && (
                      <div className="mb-1 relative w-32 h-32 bg-green-800 rounded-xl flex items-center justify-center overflow-hidden">
                        <Loader2 className="h-8 w-8 text-white animate-spin z-10" />
                        <div className="absolute inset-0 bg-black/20 z-0"></div>
                      </div>
                    )}
                    {defaultMsg.trim() && (
                      <div className="bg-green-600/80 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm flex items-center gap-2">
                        {defaultMsg}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                      <span className="text-[9px] text-gray-400">Envoi...</span>
                      <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                    </div>
                  </div>
                )}
                {defaultAttachment && (
                  <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 flex flex-col gap-2 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-700 truncate">📎 Pièce jointe sélectionnée</span>
                      <button type="button" onClick={() => { setDefaultAttachment(null); if (defaultFileRef.current) defaultFileRef.current.value = ''; }} className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-md hover:bg-gray-300 font-medium">Retirer</button>
                    </div>
                    {defaultAttachment.type.startsWith('image/') ? (
                      <div className="relative rounded-lg overflow-hidden border border-gray-200 max-w-[150px] shadow-sm">
                        <img src={URL.createObjectURL(defaultAttachment)} alt="Aperçu" className="w-full h-auto object-cover max-h-32" />
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 bg-white border border-gray-200 p-2 rounded-md truncate">
                        {defaultAttachment.name}
                      </div>
                    )}
                  </div>
                )}
                <div className="px-1 sm:px-3 py-2 border-t-2 border-gray-300 shadow-[0_-2px_8px_rgba(0,0,0,0.08)] bg-white shrink-0">
                  <div className="flex items-end gap-1 sm:gap-2">
                    <input ref={defaultFileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setDefaultAttachment(f); setShowAttachMenu(false); } }} />
                    <input id="camera-capture-input-2" type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setDefaultAttachment(f); setShowAttachMenu(false); } }} />
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => setShowAttachMenu(!showAttachMenu)} className="shrink-0 h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"><Paperclip className="h-4 w-4 text-gray-500" /></button>
                      {showAttachMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowAttachMenu(false)} />
                          <div className="absolute bottom-11 left-0 w-44 bg-white rounded-xl shadow-xl border border-gray-200 py-1.5 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                            <button type="button" onClick={() => { defaultFileRef.current?.click(); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                              <Plus className="h-4 w-4 text-gray-500" />
                              <span>Fichier</span>
                            </button>
                            <button type="button" onClick={() => { document.getElementById('camera-capture-input-2')?.click(); }} className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-3 transition-colors">
                              <Camera className="h-4 w-4 text-gray-500" />
                              <span>Caméra</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex-1 relative">
                      {editingMessage && (
                        <div className="absolute -top-8 left-0 right-0 bg-yellow-50 text-yellow-800 text-[10px] font-bold px-3 py-1.5 rounded-t-xl border border-yellow-200 border-b-0 flex justify-between items-center">
                          <span>Modification du message...</span>
                          <button onClick={() => { setEditingMessage(null); setDefaultMsg(''); }} className="text-yellow-900 hover:text-yellow-700">Annuler</button>
                        </div>
                      )}
                      <textarea value={defaultMsg} onChange={e => {
                        setDefaultMsg(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                      }} placeholder="Message..." maxLength={160} rows={1} style={{ maxHeight: '120px' }} className={`w-full resize-none no-scrollbar ${editingMessage ? 'rounded-b-2xl rounded-t-none border-t-0' : 'rounded-2xl'} border border-gray-200 bg-gray-50 px-4 py-2 pr-12 text-sm focus:outline-none focus:border-green-400`} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendToContact(selectedConversation.contactIdentifier); } }} />
                      <span className="absolute right-3 bottom-2 text-[9px] text-gray-400 pointer-events-none">{defaultMsg.length}/160</span>
                    </div>
                    <button type="button" onClick={() => handleSendToContact(selectedConversation.contactIdentifier)} disabled={defaultSending || (!defaultMsg.trim() && !defaultAttachment)} className="shrink-0 h-9 w-9 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center disabled:opacity-40 transition-colors">
                      {defaultSending ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : editingMessage ? <Check className="h-4 w-4 text-white" /> : <Send className="h-4 w-4 text-white" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ===== VIEW: New Message ===== */}
            {phoneView === 'new' && (
              <>
                <div className="bg-[#114b26] text-white px-3 py-3 shrink-0 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setPhoneView('list')} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"><ArrowLeft className="h-5 w-5" /></button>
                    <div className="text-sm font-semibold">Nouveau message</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-green-200 font-medium shrink-0">
                    <Link href={isSupervisorRole ? "/supervisor" : "/default-home"} className="flex items-center gap-0.5 hover:text-white transition-colors">
                      <span>Accueil</span>
                    </Link>
                    <span className="text-green-500 opacity-60">/</span>
                    <span className="text-green-50 font-semibold">Messagerie</span>
                  </div>
                </div>
                <div className="px-4 py-3 border-b border-gray-200 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 font-medium">À :</span>
                    <div className="flex-1 relative flex items-center">
                      <input
                        value={newRecipientSearch}
                        onChange={e => setNewRecipientSearch(e.target.value)}
                        placeholder={isAlerteDomain ? "Tel / email / matricule..." : "Rechercher un agent..."}
                        className="w-full bg-transparent outline-none text-sm placeholder:text-gray-400 pr-6"
                      />
                      {newRecipientSearch.length > 0 && (
                        <button
                          onClick={() => setNewRecipientSearch('')}
                          className="absolute right-0 text-gray-400 hover:text-gray-600 transition-colors"
                          aria-label="Effacer"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {isAlerteDomain && newRecipientSearch.trim().length >= 2 && (
                      <button
                        disabled={isResolvingContact}
                        onClick={async () => {
                          const ident = newRecipientSearch.trim();
                          if (!ident) return;

                          setIsResolvingContact(true);
                          try {
                            const res = await authenticatedFetch(`/api/users/resolve-identifier?ident=${encodeURIComponent(ident)}`);

                            if (!res.ok) {
                              setShowAgentNotFoundDialog(true);
                              return;
                            }

                            const userObj = await res.json();
                            if (userObj.role === 'admin' || userObj.role === 'superadmin') {
                              setShowAgentNotFoundDialog(true);
                              return;
                            }
                            const key = String(userObj.id);
                            const contactName = [userObj.grade, userObj.firstName, userObj.lastName].filter(Boolean).join(' ').trim() || userObj.username || ident;
                            const roleMetier = userObj.roleMetier || userObj.serviceLocation || userObj.role || '';

                            const existingConv = conversations.find(c => String(c.contactKey) === key || c.contactIdentifier === ident);
                            if (existingConv) {
                              setSelectedContactKey(existingConv.contactKey);
                              setTempConversation(null);
                            } else {
                              setSelectedContactKey(key);
                              setTempConversation({
                                contactKey: key,
                                contactName: contactName,
                                contactInitial: contactName.charAt(0).toUpperCase(),
                                contactIdentifier: String(userObj.id),
                                contactGrade: userObj.grade || '',
                                contactRoleMetier: roleMetier,
                                lastMessage: '',
                                lastTime: new Date(),
                                lastIsSent: false,
                                unreadCount: 0,
                                messages: []
                              });
                            }
                            setPhoneView('chat');
                            setDefaultMsg('');
                            setNewRecipientSearch('');
                          } catch (e) {
                            if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
                            setShowAgentNotFoundDialog(true);
                          } finally {
                            setIsResolvingContact(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 active:scale-95 transition-all shadow-sm disabled:opacity-50 shrink-0"
                      >
                        {isResolvingContact ? "..." : "OK"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {recipientOptions.filter(r => !newRecipientSearch || r.label.toLowerCase().includes(newRecipientSearch.toLowerCase())).map((r, i) => (
                    <button key={i} onClick={() => {
                      const existingConv = conversations.find(c => String(c.contactKey) === String(r.value) || c.contactIdentifier === r.value);
                      if (existingConv) {
                        setSelectedContactKey(existingConv.contactKey);
                        setTempConversation(null);
                      } else {
                        setSelectedContactKey(r.value);
                        setTempConversation({
                          contactKey: r.value,
                          contactName: r.label,
                          contactInitial: r.label.charAt(0).toUpperCase(),
                          contactIdentifier: r.value,
                          contactGrade: '',
                          contactRoleMetier: '',
                          lastMessage: '',
                          lastTime: new Date(),
                          lastIsSent: false,
                          unreadCount: 0,
                          messages: []
                        });
                      }
                      setPhoneView('chat');
                      setDefaultMsg('');
                      setNewRecipientSearch('');
                    }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                      <ContactAvatar size="md" variant="search" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-800 truncate">{r.label}</div>
                      </div>
                    </button>
                  ))}
                  {recipientOptions.filter(r => !newRecipientSearch || r.label.toLowerCase().includes(newRecipientSearch.toLowerCase())).length === 0 && (
                    <div className="flex flex-col items-center justify-center py-10 px-4 text-center space-y-2">
                      <p className="text-sm text-gray-500 font-medium">Aucun agent trouvé dans la liste</p>
                      {isAlerteDomain && newRecipientSearch.trim().length > 0 && (
                        <p className="text-xs text-gray-400 max-w-xs mx-auto">Cliquez sur <span className="font-bold text-green-600">OK</span> pour vérifier si l'identifiant <span className="font-bold text-gray-700">{newRecipientSearch}</span> existe et démarrer une discussion.</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Form-style composer for default role */}
        {isDefaultRole && !usePhoneMessagingUi && (
          <div className="bg-white flex-grow flex flex-col min-h-0 w-full h-full overflow-y-auto">
            <div className="bg-[#114b26] text-white px-4 py-3 shrink-0 flex items-center justify-between">
              <div className="text-lg font-bold">Messages</div>
              {/* Fil d'ariane */}
              <div className="flex items-center gap-1.5 text-xs text-green-200 font-medium shrink-0">
                <Link
                  href="/default-home"
                  className="flex items-center gap-0.5 hover:text-white transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  <span>Accueil</span>
                </Link>
                <span className="text-green-500 opacity-60">/</span>
                <span className="text-green-50 font-semibold">Messagerie</span>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="max-w-3xl mx-auto space-y-4">
                <div className="space-y-2">
                  <div className="text-xs text-gray-600 font-medium">Destinataire</div>
                  <input
                    value={autoRecipients.length > 0 ? autoRecipients.map(r => r.label).join(' ; ') : fallbackRecipientsLabel}
                    readOnly
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                    placeholder="Chargement des destinataires..."
                  />
                  <div className="text-[11px] text-gray-500 leading-snug">
                    {isAlerteDomain
                      ? "Superviseur(s) de votre zone (département ou région) qui recevront votre message."
                      : "Destinataires automatiques selon votre région et votre département."}
                  </div>
                  {autoRecipients.length === 0 && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                      {isAlerteDomain
                        ? "Aucun superviseur trouvé pour votre zone. Utilisez la messagerie directe (tél/email/matricule) pour contacter un superviseur spécifique."
                        : "Aucun compte destinataire trouvé/actif pour votre zone. Dès qu'un agent régional et/ou un agent secteur sera enregistré dans votre région/département, il recevra vos messages."}
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
                  <div className="grid grid-cols-2 gap-2">
                    {/* File Browser */}
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
                      className="w-full flex flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="text-sm font-semibold text-green-700">Joindre un fichier</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">Parcourir la galerie</div>
                    </button>

                    {/* Camera Capture */}
                    <input
                      id="form-camera-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setDefaultAttachment(file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('form-camera-input')?.click()}
                      className="w-full flex flex-col items-center justify-center rounded-md border border-dashed border-gray-300 bg-gray-50 px-2 py-3 hover:bg-gray-100 transition-colors"
                    >
                      <div className="text-sm font-semibold text-green-700">Prendre une photo</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">Appareil photo</div>
                    </button>
                  </div>

                  {defaultAttachment && (
                    <div className="mt-2 flex items-center justify-between gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="text-xs text-gray-700 truncate flex-1 font-medium">{defaultAttachment.name}</div>
                      <span
                        className="text-xs text-red-600 hover:underline cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDefaultAttachment(null);
                          if (defaultFileRef.current) defaultFileRef.current.value = "";
                          const camInput = document.getElementById('form-camera-input') as HTMLInputElement;
                          if (camInput) camInput.value = "";
                        }}
                      >
                        Retirer
                      </span>
                    </div>
                  )}
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
          </div>
        )}

        {/* Tiroir d'actions tactiles de type smartphone */}
        {activeActionMessage && (
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end justify-center p-4 pb-20"
            onClick={() => setActiveActionMessage(null)}
          >
            <div
              className="bg-white w-full max-w-xs rounded-2xl p-4 space-y-4 pb-6 shadow-2xl animate-in slide-in-from-bottom duration-200 border border-gray-100"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-1" />
              <div className="text-xs font-bold text-gray-400 text-center uppercase tracking-widest">Options du message</div>

              <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 divide-y divide-gray-100">

                {(() => {
                  if (!activeActionMessage || !activeActionMessage.isSent) return null;
                  const convMessages = selectedConversation?.messages || [];
                  const isLastMsg = convMessages.length > 0 && convMessages[convMessages.length - 1].id === activeActionMessage.id;

                  const msgTime = new Date(activeActionMessage.time).getTime();
                  const isWithin12Hours = Date.now() - msgTime <= 12 * 60 * 60 * 1000;

                  if (!isLastMsg || !isWithin12Hours) return null;

                  return (
                    <button
                      onClick={() => {
                        setEditingMessage(activeActionMessage);
                        setDefaultMsg(activeActionMessage.content || '');
                        setActiveActionMessage(null);
                        if (defaultFileRef.current) defaultFileRef.current.value = '';
                        setDefaultAttachment(null);
                      }}
                      className="w-full text-left px-5 py-4 text-sm font-semibold text-gray-700 hover:bg-gray-100 active:bg-gray-200 flex items-center gap-3 transition-colors"
                    >
                      <span className="text-lg">✏️</span> Modifier le message
                    </button>
                  );
                })()}

                <button
                  onClick={async () => {
                    const msgObj = activeActionMessage.rawMsgObj;
                    setActiveActionMessage(null);
                    if (msgObj) {
                      await handleDelete(msgObj);
                    }
                  }}
                  className="w-full text-left px-5 py-4 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 flex items-center gap-3 transition-colors"
                >
                  <span className="text-lg">🗑️</span> Supprimer pour moi
                </button>
              </div>

              <button
                onClick={() => setActiveActionMessage(null)}
                className="w-full text-center py-3.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 active:scale-98 transition-all"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* === Dialog Agent introuvable === */}
        {showAgentNotFoundDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full animate-in fade-in zoom-in-95 duration-200">
              {/* Icône agent */}
              <AgentNotFoundAvatar />
              <div className="text-center">
                <p className="text-base font-bold text-gray-800">Agent introuvable</p>
                <p className="text-xs text-gray-500 mt-1">Aucun agent ne correspond à cet identifiant dans le système.</p>
              </div>
              <button
                onClick={() => {
                  setShowAgentNotFoundDialog(false);
                  setNewRecipientSearch('');
                }}
                className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-95 transition-all"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (inboxOnly) {
    return (
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-slate-50">
        <AgentTopHeader />
        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar overscroll-contain pb-24">
          <div className="w-full max-w-3xl mx-auto px-2 sm:px-4 py-4">
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg overflow-hidden flex flex-col min-h-0 shadow-sm">
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <div className="h-9 w-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3 8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v9.5A2.25 2.25 0 0118.75 20H5.25A2.25 2.25 0 013 17.75v-9.5zm2.25-.75a.75.75 0 00-.75.75v.807l7.06 4.237a2.25 2.25 0 002.38 0L21.5 9.057V8.25a.75.75 0 00-.75-.75H5.25zm16.25 3.308l-6.786 4.072a3.75 3.75 0 01-3.956 0L4.5 10.808v6.942c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-6.942z" /></svg>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">Boîte de réception</div>
                    <div className="text-xs text-gray-500">{inbox.length} message(s)</div>
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
                    className="text-xs rounded-full px-3 py-1 border bg-green-50 border-green-600 text-green-700"
                  >
                    Reçus
                  </button>
                </div>
              </div>

              <div className="md:hidden border-b border-gray-200 px-4 py-3 bg-white">
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-200 rounded-full px-3 py-2 w-full shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-gray-500"><path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" /></svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="bg-transparent outline-none text-sm w-full"
                    placeholder="Rechercher un message..."
                  />
                </div>
              </div>

              <div className="p-4 flex-1 min-h-0 bg-white">
                <InternalMessageList
                  messages={filteredInbox}
                  loading={loadingInbox}
                  emptyLabel="Aucun message reçu pour le moment."
                  onDelete={handleDelete}
                  onRefresh={refreshInbox}
                  onStaleMessage={(m) =>
                    purgeStaleMessage(Number(m.id), Boolean(m.isGroupMessage))
                  }
                  onReply={async ({ recipientIdentifier, content }) => {
                    try {
                      await sendIndividual({ recipientIdentifier, content });
                      toast({ title: 'Réponse envoyée', description: 'Votre réponse a été transmise.' });
                      return;
                    } catch (e: any) {
                      if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
                      toast({ title: 'Erreur', description: e?.message || "Échec de l'envoi de la réponse.", variant: 'destructive' });
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        <MessageAttachmentViewer payload={preview} onClose={() => setPreview(null)} />
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-[#2d6a4f] ${usePhoneMessagingUi ? 'h-full' : 'min-h-screen'}`}>
      {inboxOnly && <AgentTopHeader />}
      <ResponsivePage className={`bg-transparent w-full ${usePhoneMessagingUi ? 'flex-1 h-full flex flex-col' : 'flex-1'}`}>
        <div className={`${usePhoneMessagingUi || isDefaultRole ? 'w-full' : inboxOnly ? 'mx-auto max-w-3xl' : 'mx-auto max-w-6xl'} ${usePhoneMessagingUi ? 'h-full flex flex-col flex-1' : ''}`}>
          <div className={`grid ${(usePhoneMessagingUi || isDefaultRole) ? 'gap-0' : 'gap-4'} ${inboxOnly || usePhoneMessagingUi || isDefaultRole ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'} ${usePhoneMessagingUi ? 'h-full flex-1' : isDefaultRole ? 'h-auto pb-8' : 'lg:h-[78vh]'}`}>
            {!usePhoneMessagingUi && !isDefaultRole && (
              <section className="bg-gray-50 border-2 border-gray-300 rounded-lg overflow-hidden flex flex-col min-h-0 shadow-sm lg:h-[78vh]">
                <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-start gap-2">
                    <div className="h-9 w-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3 8.25A2.25 2.25 0 015.25 6h13.5A2.25 2.25 0 0121 8.25v9.5A2.25 2.25 0 0118.75 20H5.25A2.25 2.25 0 013 17.75v-9.5zm2.25-.75a.75.75 0 00-.75.75v.807l7.06 4.237a2.25 2.25 0 002.38 0L21.5 9.057V8.25a.75.75 0 00-.75-.75H5.25zm16.25 3.308l-6.786 4.072a3.75 3.75 0 01-3.956 0L4.5 10.808v6.942c0 .414.336.75.75.75h13.5a.75.75 0 00.75-.75v-6.942z" /></svg>
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
                      onRefresh={refreshInbox}
                      onStaleMessage={(m) =>
                        purgeStaleMessage(Number(m.id), Boolean(m.isGroupMessage))
                      }
                      onReply={async ({ recipientIdentifier, content }) => {
                        try {
                          await sendIndividual({ recipientIdentifier, content });
                          toast({ title: 'Réponse envoyée', description: 'Votre réponse a été transmise.' });
                          return;
                        } catch (e: any) {
                          if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
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
                      onRefresh={refreshSent}
                      onStaleMessage={(m) =>
                        purgeStaleMessage(Number(m.id), Boolean(m.isGroupMessage))
                      }
                    />
                  )}
                </div>
              </section>
            )}

            {!inboxOnly && !isDefaultRole && !usePhoneMessagingUi && (
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



            {/* Phone-like messaging UI for supervisor role */}
            {!inboxOnly && usePhoneMessagingUi && (
              <aside id="composer-panel" className="relative bg-white border-2 border-gray-200 shadow-sm flex flex-col overflow-hidden w-full h-full rounded-none sm:rounded-2xl">

                {/* ===== VIEW: Conversation List ===== */}
                {phoneView === 'list' && (
                  <>
                    <div className="bg-[#114b26] text-white px-4 py-3 shrink-0">
                      <div className="text-lg font-bold">Messages</div>
                    </div>
                    <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                      <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-2">
                        <Search className="h-4 w-4 text-gray-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher" className="bg-transparent outline-none text-sm w-full" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {conversations.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full gap-2 py-12">
                          <p className="text-sm text-gray-400">Aucune conversation</p>
                        </div>
                      )}
                      {conversations.filter(c => !normalizedQuery || c.contactName.toLowerCase().includes(normalizedQuery)).map(conv => (
                        <button key={conv.contactKey} onClick={() => { setSelectedContactKey(conv.contactKey); setPhoneView('chat'); setDefaultMsg(''); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                          <ContactAvatar size="lg" unread={conv.unreadCount > 0} isGroup={conv.contactInitial === 'G'} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[13px] truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-400'}`}>{conv.contactName}</span>
                              <span className="text-[10px] text-gray-400 shrink-0">{formatRelTime(conv.lastTime)}</span>
                            </div>
                            {conv.contactRoleMetier && <p className="text-[10px] text-green-700 font-medium truncate">{conv.contactRoleMetier}</p>}
                            <p className={`text-xs truncate mt-0.5 ${conv.unreadCount > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>{conv.lastIsSent ? 'Vous : ' : ''}{conv.lastMessage}</p>
                          </div>
                          {conv.unreadCount > 0 && <span className="h-5 min-w-[20px] px-1 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center">{conv.unreadCount}</span>}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setPhoneView('new'); setNewRecipientSearch(''); setDefaultMsg(''); }} className="absolute bottom-6 right-6 h-14 w-14 rounded-full bg-green-600 hover:bg-green-700 shadow-lg flex items-center justify-center transition-all active:scale-90 z-10">
                      <Plus className="h-7 w-7 text-white" />
                    </button>
                  </>
                )}

                {/* ===== VIEW: Chat Conversation ===== */}
                {phoneView === 'chat' && selectedConversation && (
                  <>
                    <div className="bg-[#114b26] text-white px-3 py-3 shrink-0 flex items-center gap-3 relative">
                      <button onClick={() => { setPhoneView('list'); setSelectedContactKey(null); }} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"><ArrowLeft className="h-5 w-5" /></button>
                      <ContactAvatar size="sm" variant="header" isGroup={selectedConversation.contactInitial === 'G'} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{selectedConversation.contactName}</div>
                      </div>
                      {/* Bouton trois points style smartphone */}
                      <div className="relative">
                        <button
                          onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                          className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors shrink-0"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                        {showHeaderMenu && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                            <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-100 py-1.5 z-50 text-gray-800 animate-in fade-in slide-in-from-top-2 duration-150">
                              <button
                                onClick={() => handleDeleteEntireConversation(selectedConversation.contactKey)}
                                disabled={deletingConv}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 font-bold hover:bg-red-50 flex items-center gap-2 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                                {deletingConv ? "Suppression..." : "Supprimer la discussion"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
                      {selectedConversation.messages.length === 0 && (
                        <div className="flex items-center justify-center h-full"><p className="text-xs text-gray-400">Aucun message</p></div>
                      )}
                      {selectedConversation.messages.map((m: any, i: number) => {
                        const hasAttachment = Boolean(m.rawMsgObj?.attachmentPath || m.rawMsgObj?.attachmentName);
                        const attachmentName = repairAttachmentFileName(m.rawMsgObj?.attachmentName) || 'Fichier joint';
                        const attachmentMime = guessAttachmentMime(
                          attachmentName,
                          m.rawMsgObj?.attachmentMime
                        );
                        const isGroupMsg = Boolean(
                          m.rawMsgObj?.isGroupMessage ||
                          selectedConversation.contactKey.startsWith('group_')
                        );
                        const url = m.rawMsgObj?.id
                          ? buildMessageAttachmentUrl(Number(m.rawMsgObj.id), { isGroup: isGroupMsg })
                          : '';

                        const openAttachmentPreview = () => {
                          if (!m.rawMsgObj?.id) return;
                          setPreview({
                            messageId: Number(m.rawMsgObj.id),
                            isGroup: isGroupMsg,
                            name: attachmentName,
                            mime: attachmentMime,
                            size: m.rawMsgObj?.attachmentSize,
                          });
                        };

                        return m.isSent ? (
                          <div key={i} className="flex flex-col items-end max-w-[80%] ml-auto">
                            <div
                              onClick={() => setActiveActionMessage(m)}
                              className="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm cursor-pointer hover:bg-green-700 active:scale-95 transition-all flex flex-col gap-1.5"
                            >
                              {m.content && <span>{m.content}</span>}
                              {hasAttachment && url && (
                                <ChatAttachmentBlock
                                  url={url}
                                  name={attachmentName}
                                  mime={attachmentMime}
                                  size={m.rawMsgObj?.attachmentSize}
                                  variant="sent"
                                  onOpen={openAttachmentPreview}
                                />
                              )}
                            </div>
                            <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                              <span className="text-[9px] text-gray-400">
                                {m.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                {(() => {
                                  const mObj = m.rawMsgObj;
                                  if (!mObj?.updatedAt) return null;
                                  const createdTime = new Date(mObj.createdAt || mObj.created_at || mObj.createdAtLocal || 0).getTime();
                                  const updatedTime = new Date(mObj.updatedAt).getTime();
                                  if (Number.isFinite(createdTime) && Number.isFinite(updatedTime) && (updatedTime - createdTime > 2000)) {
                                    return ` (Modifié le ${new Date(mObj.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
                                  }
                                  return null;
                                })()}
                              </span>
                              {m.rawMsgObj?.isPending ? (
                                <span title="En attente"><Clock className="h-3 w-3 text-gray-400" /></span>
                              ) : Array.isArray(m.rawMsgObj?.readers) && m.rawMsgObj.readers.length > 0 ? (
                                <span title="Lu"><CheckCheck className="h-3 w-3 text-blue-500" /></span>
                              ) : (
                                <span title="Envoyé"><Check className="h-3 w-3 text-gray-400" /></span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div key={i} className="flex flex-col items-start max-w-[80%]">
                            <div
                              onClick={() => setActiveActionMessage(m)}
                              className="bg-white rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-gray-800 shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 active:scale-95 transition-all flex flex-col gap-1.5"
                            >
                              {m.content && <span>{m.content}</span>}
                              {hasAttachment && url && (
                                <ChatAttachmentBlock
                                  url={url}
                                  name={attachmentName}
                                  mime={attachmentMime}
                                  variant="received"
                                  size={m.rawMsgObj?.attachmentSize}
                                  onOpen={openAttachmentPreview}
                                />
                              )}
                            </div>
                            <span className="text-[9px] text-gray-400 mt-0.5 ml-1">
                              {m.time.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              {(() => {
                                const mObj = m.rawMsgObj;
                                if (!mObj?.updatedAt) return null;
                                const createdTime = new Date(mObj.createdAt || mObj.created_at || mObj.createdAtLocal || 0).getTime();
                                const updatedTime = new Date(mObj.updatedAt).getTime();
                                if (Number.isFinite(createdTime) && Number.isFinite(updatedTime) && (updatedTime - createdTime > 2000)) {
                                  return ` (Modifié le ${new Date(mObj.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`;
                                }
                                return null;
                              })()}
                            </span>
                          </div>
                        );
                      })}
                      {defaultSending && (
                        <div className="flex flex-col items-end max-w-[80%] ml-auto opacity-70">
                          {defaultAttachment && (
                            <div className="mb-1 relative w-32 h-32 bg-green-800 rounded-xl flex items-center justify-center overflow-hidden">
                              <Loader2 className="h-8 w-8 text-white animate-spin z-10" />
                              <div className="absolute inset-0 bg-black/20 z-0"></div>
                            </div>
                          )}
                          {defaultMsg.trim() && (
                            <div className="bg-green-600/80 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm flex items-center gap-2">
                              {defaultMsg}
                            </div>
                          )}
                          <div className="flex items-center justify-end gap-1 mt-0.5 mr-1">
                            <span className="text-[9px] text-gray-400">Envoi...</span>
                            <Loader2 className="h-3 w-3 text-gray-400 animate-spin" />
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    {defaultAttachment && (
                      <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-700 truncate flex-1">📎 {defaultAttachment.name}</span>
                        <button type="button" onClick={() => { setDefaultAttachment(null); if (defaultFileRef.current) defaultFileRef.current.value = ''; }} className="text-xs text-red-500 hover:underline">✕</button>
                      </div>
                    )}
                    <div className="px-1 sm:px-3 py-2 border-t border-gray-200 bg-white shrink-0">
                      <div className="flex items-end gap-1 sm:gap-2">
                        <input ref={defaultFileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setDefaultAttachment(f); }} />
                        <button type="button" onClick={() => defaultFileRef.current?.click()} className="shrink-0 h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Plus className="h-4 w-4 text-gray-500" /></button>

                        {/* Hidden input and button for direct Camera capture */}
                        <input id="camera-capture-input" type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setDefaultAttachment(f); }} />
                        <button type="button" onClick={() => document.getElementById('camera-capture-input')?.click()} className="shrink-0 h-9 w-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"><Camera className="h-4 w-4 text-gray-500" /></button>

                        <div className="flex-1 relative">
                          <textarea value={defaultMsg} onChange={e => {
                            setDefaultMsg(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                          }} placeholder="Message..." maxLength={160} rows={1} style={{ maxHeight: '120px' }} className="w-full resize-none no-scrollbar rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 pr-12 text-sm focus:outline-none focus:border-green-400" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendToContact(selectedConversation.contactIdentifier); } }} />
                          <span className="absolute right-3 bottom-2 text-[9px] text-gray-400 pointer-events-none">{defaultMsg.length}/160</span>
                        </div>
                        <button type="button" onClick={() => handleSendToContact(selectedConversation.contactIdentifier)} disabled={defaultSending || (!defaultMsg.trim() && !defaultAttachment)} className="shrink-0 h-9 w-9 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center disabled:opacity-40 transition-colors">
                          {defaultSending ? <Loader2 className="h-4 w-4 text-white animate-spin" /> : <Send className="h-4 w-4 text-white" />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* ===== VIEW: New Message ===== */}
                {phoneView === 'new' && (
                  <>
                    <div className="bg-[#114b26] text-white px-3 py-3 shrink-0 flex items-center gap-3">
                      <button onClick={() => setPhoneView('list')} className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"><ArrowLeft className="h-5 w-5" /></button>
                      <div className="text-sm font-semibold">Nouveau message</div>
                    </div>
                    <div className="px-4 py-3 border-b border-gray-200 shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">À :</span>
                        <input value={newRecipientSearch} onChange={e => setNewRecipientSearch(e.target.value)}
                          placeholder={isAlerteDomain ? "Rechercher un superviseur..." : "Rechercher un agent..."}
                          className="flex-1 bg-transparent outline-none text-sm" />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">

                      {/* Superviseurs / destinataires automatiques */}
                      {autoRecipients.filter(r => !newRecipientSearch || r.label.toLowerCase().includes(newRecipientSearch.toLowerCase())).map((r, i) => (
                        <button key={i} onClick={() => { const existingConv = conversations.find(c => String(c.contactKey) === String(r.value) || c.contactIdentifier === r.value); if (existingConv) { setSelectedContactKey(existingConv.contactKey); setTempConversation(null); } else { setSelectedContactKey(r.value); setTempConversation({ contactKey: r.value, contactName: r.label, contactInitial: r.label.charAt(0).toUpperCase(), contactIdentifier: r.value, contactGrade: '', contactRoleMetier: '', lastMessage: '', lastTime: new Date(), lastIsSent: false, unreadCount: 0, messages: [] }); } setPhoneView('chat'); setDefaultMsg(''); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                          <ContactAvatar size="md" variant="search" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-800 truncate">{r.label}</div>
                            <div className="text-[10px] text-gray-500">{r.roleTag}</div>
                          </div>
                        </button>
                      ))}

                      {autoRecipients.filter(r => !newRecipientSearch || r.label.toLowerCase().includes(newRecipientSearch.toLowerCase())).length === 0 && !newRecipientSearch && (
                        <div className="flex items-center justify-center py-6">
                          <p className="text-sm text-gray-400">{isAlerteDomain ? "Aucun superviseur de zone trouvé" : "Aucun agent trouvé"}</p>
                        </div>
                      )}

                      {/* ── Messagerie directe par identifiant (domaine ALERTE) ── */}
                      {isAlerteDomain && (
                        <div className="mx-4 mt-4 mb-6 rounded-2xl border border-green-100 bg-green-50 p-4">
                          <p className="text-xs font-bold text-green-800 uppercase tracking-wide mb-1">Messagerie directe</p>
                          <p className="text-[11px] text-green-700 mb-3">Saisir téléphone, email ou matricule pour contacter directement un agent</p>
                          <div className="flex gap-2">
                            <input
                              id="direct-identifier-input"
                              type="text"
                              value={newRecipientSearch.startsWith('@') ? newRecipientSearch.slice(1) : ''}
                              onChange={e => setNewRecipientSearch('@' + e.target.value)}
                              placeholder="Ex : 77 123 45 67 ou MAT001"
                              className="flex-1 rounded-xl border border-green-200 bg-white px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                            />
                            <button
                              onClick={() => {
                                const ident = newRecipientSearch.startsWith('@') ? newRecipientSearch.slice(1).trim() : '';
                                if (!ident) return;
                                const existingConv = conversations.find(c => String(c.contactKey) === ident || c.contactIdentifier === ident || String(c.contactIdentifier).toLowerCase() === ident.toLowerCase());
                                if (existingConv) { setSelectedContactKey(existingConv.contactKey); setTempConversation(null); }
                                else {
                                  const key = `direct_${ident}`;
                                  setSelectedContactKey(key);
                                  setTempConversation({ contactKey: key, contactName: ident, contactInitial: ident.charAt(0).toUpperCase(), contactIdentifier: ident, contactGrade: '', contactRoleMetier: 'Contact direct', lastMessage: '', lastTime: new Date(), lastIsSent: false, unreadCount: 0, messages: [] });
                                }
                                setPhoneView('chat');
                                setDefaultMsg('');
                                setNewRecipientSearch('');
                              }}
                              disabled={!newRecipientSearch.startsWith('@') || newRecipientSearch.length < 2}
                              className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-green-700 active:scale-95 transition-all"
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </aside>
            )}
          </div>
        </div>
      </ResponsivePage>

      {/* Tiroir d'actions tactiles de type smartphone */}
      {activeActionMessage && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-50 flex items-end justify-center p-4 pb-20"
          onClick={() => setActiveActionMessage(null)}
        >
          <div
            className="bg-white w-full max-w-xs rounded-2xl p-4 space-y-4 pb-6 shadow-2xl animate-in slide-in-from-bottom duration-200 border border-gray-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-1" />
            <div className="text-xs font-bold text-gray-400 text-center uppercase tracking-widest">Options du message</div>

            <div className="bg-gray-50 rounded-2xl overflow-hidden border border-gray-100 divide-y divide-gray-100">

              <button
                onClick={async () => {
                  const msgObj = activeActionMessage.rawMsgObj;
                  setActiveActionMessage(null);
                  if (msgObj) {
                    await handleDelete(msgObj);
                  }
                }}
                className="w-full text-left px-5 py-4 text-sm font-semibold text-red-600 hover:bg-red-50 active:bg-red-100 flex items-center gap-3 transition-colors"
              >
                <span className="text-lg">🗑️</span> Supprimer pour moi
              </button>
            </div>

            <button
              onClick={() => setActiveActionMessage(null)}
              className="w-full text-center py-3.5 text-sm font-bold text-gray-600 bg-gray-100 rounded-2xl hover:bg-gray-200 active:scale-98 transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {/* === Dialog Agent introuvable === */}
      {showAgentNotFoundDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4 max-w-xs w-full animate-in fade-in zoom-in-95 duration-200">
            {/* Icône agent */}
            <AgentNotFoundAvatar />
            <div className="text-center">
              <p className="text-base font-bold text-gray-800">Agent introuvable</p>
              <p className="text-xs text-gray-500 mt-1">Aucun agent ne correspond à cet identifiant dans le système.</p>
            </div>
            <button
              onClick={() => {
                setShowAgentNotFoundDialog(false);
                setNewRecipientSearch('');
              }}
              className="w-full py-2.5 rounded-xl bg-green-600 text-white text-sm font-bold hover:bg-green-700 active:scale-95 transition-all"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <MessageAttachmentViewer payload={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
