import ChatAttachmentBlock from "@/components/messaging/ChatAttachmentBlock";
import { ContactAvatar } from "@/components/messaging/ContactAvatar";
import MessageAttachmentViewer, { type AttachmentViewPayload } from "@/components/messaging/MessageAttachmentViewer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useInternalMessaging, type InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { guessAttachmentMime, repairAttachmentFileName } from "@/lib/attachmentMime";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { buildMessageAttachmentUrl } from "@/lib/messageAttachments";
import { isGroupConversationKey, resolveConversationDeleteIdentifier } from "@/lib/messagingUtils";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Headphones,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export interface PilotageSmsScope {
  level: "national" | "regional" | "departemental" | "arrondissement";
  region?: string | null;
  departement?: string | null;
  territoryDisplay: string;
}

interface PilotageSmsPanelProps {
  scope: PilotageSmsScope;
  initialRecipient?: { identifier: string; label: string } | null;
  onUnreadCountChange?: (count: number) => void;
}

interface DirectoryContact {
  id: string;
  identifier: string;
  displayName: string;
  subtitle: string;
  isSupport: boolean;
  initial: string;
}

interface ChatMessageItem {
  uniqueKey: string;
  id: number;
  content: string;
  time: Date;
  isSent: boolean;
  isRead: boolean;
  rawMsgObj: any;
}

interface ChatConversation {
  contactKey: string;
  contactName: string;
  contactInitial: string;
  contactIdentifier: string;
  contactSubtitle: string;
  isGroup: boolean;
  isSupport: boolean;
  lastMessage: string;
  lastTime: Date;
  lastIsSent: boolean;
  unreadCount: number;
  messages: ChatMessageItem[];
}

const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 Mo

const normStr = (v?: string | null) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function formatRelTime(date: Date): string {
  if (!date || Number.isNaN(date.getTime()) || date.getTime() === 0) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function formatBubbleTime(date: Date): string {
  if (!date || Number.isNaN(date.getTime()) || date.getTime() === 0) return "";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function PilotageSmsPanel({
  scope,
  initialRecipient,
  onUnreadCountChange,
}: PilotageSmsPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // Contexte global ("null") pour recevoir et envoyer tous les messages directs (y compris Support Technique)
  const {
    inbox,
    sent,
    loadingInbox,
    loadingSent,
    sending,
    sendGroup,
    sendIndividual,
    markMessageAsRead,
    deleteMessage,
    refreshAll,
  } = useInternalMessaging({ autoLoad: Boolean(user), domaineId: "null" });

  const [listQuery, setListQuery] = useState("");
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [tempConversation, setTempConversation] = useState<ChatConversation | null>(null);
  const [rightMode, setRightMode] = useState<"chat" | "new">("chat");
  const [mobileShowRight, setMobileShowRight] = useState(false);

  // Composition dans un fil existant / nouveau
  const [draftText, setDraftText] = useState("");
  const [draftAttachment, setDraftAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Nouvelle discussion (individuelle ou groupée)
  const [newTab, setNewTab] = useState<"individual" | "group">("individual");
  const [contactSearch, setContactSearch] = useState("");
  const [contacts, setContacts] = useState<DirectoryContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  // Envoi groupé
  const [selectedGroupKeys, setSelectedGroupKeys] = useState<string[]>([]);
  const [groupMessage, setGroupMessage] = useState("");
  const [groupAttachment, setGroupAttachment] = useState<File | null>(null);
  const groupFileInputRef = useRef<HTMLInputElement | null>(null);

  // Aperçu pièce jointe & suppression
  const [preview, setPreview] = useState<AttachmentViewPayload | null>(null);
  const [deletingConv, setDeletingConv] = useState(false);
  const markedReadIdsRef = useRef<Set<number>>(new Set());

  // Remonter le compteur de non-lus au bandeau haut
  useEffect(() => {
    if (!onUnreadCountChange) return;
    const count = (Array.isArray(inbox) ? inbox : []).filter(
      (m: any) => m?.isRead === false || (m?.isRead == null && m?.is_read === false)
    ).length;
    onUnreadCountChange(count);
  }, [inbox, onUnreadCountChange]);

  // Charger les contacts autorisés sans doublon : Équipe Support en tête + hiérarchie + périmètre
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingContacts(true);
      try {
        const regionQuery =
          scope.level !== "national" && scope.region ? `&region=${encodeURIComponent(scope.region)}` : "";
        const deptQuery =
          (scope.level === "departemental" || scope.level === "arrondissement") && scope.departement
            ? `&departement=${encodeURIComponent(scope.departement)}`
            : "";

        const [supportResp, adminsResp, supervisorsResp, agentsResp, sectorsResp] = await Promise.all([
          authenticatedFetch("/api/messages/agents?role=support&domaineId=null"),
          authenticatedFetch("/api/messages/agents?role=admin&domaineId=null"),
          authenticatedFetch(`/api/messages/agents?role=supervisor&domaineId=null${regionQuery}${deptQuery}`),
          authenticatedFetch(`/api/messages/agents?role=agent&domaineId=null${regionQuery}`),
          authenticatedFetch(`/api/messages/agents?role=sector&domaineId=null${regionQuery}`),
        ]);

        const [supportArr, adminsArr, supervisorsArr, agentsArr, sectorsArr] = await Promise.all([
          supportResp.ok ? supportResp.json().catch(() => []) : Promise.resolve([]),
          adminsResp.ok ? adminsResp.json().catch(() => []) : Promise.resolve([]),
          supervisorsResp.ok ? supervisorsResp.json().catch(() => []) : Promise.resolve([]),
          agentsResp.ok ? agentsResp.json().catch(() => []) : Promise.resolve([]),
          sectorsResp.ok ? sectorsResp.json().catch(() => []) : Promise.resolve([]),
        ]);

        const isSelf = (u: any) => {
          const uid = (user as any)?.id;
          const uname = String((user as any)?.username || "").trim().toLowerCase();
          const email = String((user as any)?.email || "").trim().toLowerCase();
          if (uid && u?.id && Number(uid) === Number(u.id)) return true;
          if (uname && String(u?.username || "").trim().toLowerCase() === uname) return true;
          if (email && String(u?.email || "").trim().toLowerCase() === email) return true;
          return false;
        };

        const matchesTerritory = (u: any) => {
          if (scope.level === "national") return true;
          if (scope.region && u?.region && normStr(u.region) !== normStr(scope.region)) return false;
          if ((scope.level === "departemental" || scope.level === "arrondissement") && scope.departement) {
            if (u?.departement && normStr(u.departement) !== normStr(scope.departement)) return false;
          }
          return true;
        };

        const dedup = new Map<string, DirectoryContact>();

        const addContact = (u: any, roleLabel: string, forceSupport = false) => {
          if (!u || isSelf(u)) return;
          const isSup = forceSupport || Boolean(u?.isSuperAdmin) || u?.role === "support";
          const identifier = String(u?.username || u?.email || u?.matricule || u?.id || "").trim();
          if (!identifier) return;

          // Une seule entrée "Support Technique — Équipe Support" (zéro doublon)
          const dedupKey = isSup ? "__support__" : `user:${u?.id ?? identifier.toLowerCase()}`;
          if (dedup.has(dedupKey)) return;

          if (isSup) {
            dedup.set(dedupKey, {
              id: String(u?.id || "__support__"),
              identifier,
              displayName: "Équipe Support",
              subtitle: "Support Technique • Disponible à tout moment",
              isSupport: true,
              initial: "S",
            });
            return;
          }

          const full = [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim();
          const grade = String(u?.grade || "").trim();
          const displayName = grade && full ? `${grade} ${full}` : full || identifier;
          const loc = [u?.region, u?.departement].filter(Boolean).join(" / ");
          dedup.set(dedupKey, {
            id: String(u?.id || identifier),
            identifier,
            displayName,
            subtitle: `${roleLabel}${loc ? ` • ${loc}` : ""}`,
            isSupport: false,
            initial: (full || displayName).charAt(0).toUpperCase() || "A",
          });
        };

        for (const u of Array.isArray(supportArr) ? supportArr : []) addContact(u, "Support Technique", true);
        for (const u of Array.isArray(adminsArr) ? adminsArr : []) addContact(u, "Administrateur");
        for (const u of Array.isArray(supervisorsArr) ? supervisorsArr : []) {
          if (matchesTerritory(u)) addContact(u, "Superviseur");
        }
        for (const u of Array.isArray(agentsArr) ? agentsArr : []) {
          if (matchesTerritory(u)) addContact(u, "Agent");
        }
        for (const u of Array.isArray(sectorsArr) ? sectorsArr : []) {
          if (matchesTerritory(u)) addContact(u, "Agent de secteur");
        }

        if (!cancelled) setContacts(Array.from(dedup.values()));
      } catch (err) {
        if (import.meta.env.DEV) console.warn("[PilotageSmsPanel] load contacts failed", err);
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, scope.level, scope.region, scope.departement]);

  // Cibles d'envoi groupé adaptées au niveau territorial
  const groupTargets = useMemo(() => {
    if (scope.level === "national") {
      return [
        { key: "agents", label: "Tous les agents / cadres", target: { role: "agent" } },
        { key: "sectors", label: "Tous les agents de secteur", target: { role: "sub-agent" } },
        { key: "admins", label: "Administrateurs", target: { role: "admin" } },
        { key: "hunters", label: "Tous les chasseurs", target: { role: "hunter" } },
        { key: "guides", label: "Guides de chasse", target: { role: "hunting-guide" } },
      ];
    }
    const reg = scope.region || undefined;
    return [
      { key: "agents", label: `Agents (${reg || scope.territoryDisplay})`, target: { role: "agent", region: reg } },
      { key: "sectors", label: `Agents de secteur (${reg || scope.territoryDisplay})`, target: { role: "sub-agent", region: reg } },
      { key: "admins", label: "Hiérarchie / Administrateurs", target: { role: "admin" } },
      { key: "hunters", label: `Chasseurs (${reg || scope.territoryDisplay})`, target: { role: "hunter", region: reg } },
      { key: "guides", label: `Guides de chasse (${reg || scope.territoryDisplay})`, target: { role: "hunting-guide", region: reg } },
    ];
  }, [scope.level, scope.region, scope.territoryDisplay]);

  // Regrouper inbox + sent en conversations chronologiques sans doublon
  const conversations = useMemo<ChatConversation[]>(() => {
    const convMap = new Map<string, ChatConversation>();
    const seenMsgKeys = new Set<string>();

    for (const msg of inbox || []) {
      const mAny = msg as any;
      const msgId = Number(mAny?.id);
      const uniq = `r:${msgId}:${mAny?.createdAt || ""}`;
      if (seenMsgKeys.has(uniq)) continue;
      seenMsgKeys.add(uniq);

      const isSuperSender = Boolean(mAny?.sender?.isSuperAdmin);
      const sId = String(mAny?.sender?.id || mAny?.senderId || "");
      const sName = isSuperSender
        ? "Équipe Support"
        : [mAny?.sender?.firstName, mAny?.sender?.lastName].filter(Boolean).join(" ").trim() ||
          mAny?.senderDisplayName ||
          mAny?.senderName ||
          "Agent";
      const sGrade = isSuperSender ? "" : String(mAny?.sender?.grade || "").trim();
      const sRoleMetier = isSuperSender
        ? "Support Technique"
        : String(mAny?.sender?.roleMetierLabel || mAny?.sender?.role_metier_label || "").trim();
      const sIdent = String(
        mAny?.sender?.username || mAny?.sender?.email || mAny?.sender?.matricule || sId || sName
      ).trim();

      const key = isSuperSender ? "__support__" : sId || sIdent;
      const time = new Date(mAny?.createdAt || mAny?.created_at || 0);
      const isRead = Boolean(mAny?.isRead ?? mAny?.is_read ?? false);
      const displayContent = String(mAny?.content || "").trim() || (mAny?.attachmentName ? "📎 Pièce jointe" : "");

      let conv = convMap.get(key);
      if (!conv) {
        conv = {
          contactKey: key,
          contactName: sGrade ? `${sGrade} ${sName}` : sName,
          contactInitial: isSuperSender ? "S" : sName.charAt(0).toUpperCase() || "A",
          contactIdentifier: sIdent,
          contactSubtitle: sRoleMetier,
          isGroup: false,
          isSupport: isSuperSender,
          lastMessage: displayContent,
          lastTime: time,
          lastIsSent: false,
          unreadCount: 0,
          messages: [],
        };
        convMap.set(key, conv);
      }

      conv.messages.push({
        uniqueKey: uniq,
        id: msgId,
        content: String(mAny?.content || ""),
        time,
        isSent: false,
        isRead,
        rawMsgObj: mAny,
      });
      if (!isRead) conv.unreadCount += 1;
      if (time >= conv.lastTime) {
        conv.lastMessage = displayContent;
        conv.lastTime = time;
        conv.lastIsSent = false;
      }
    }

    for (const msg of sent || []) {
      const mAny = msg as any;
      const msgId = Number(mAny?.id);
      const uniq = `s:${msgId}:${mAny?.createdAt || ""}`;
      if (seenMsgKeys.has(uniq)) continue;
      seenMsgKeys.add(uniq);

      let key = "";
      let name = "";
      let initial = "A";
      let ident = "";
      let subtitle = "";
      let isGroup = false;
      let isSupport = false;

      if (mAny?.isGroupMessage) {
        isGroup = true;
        const targetRole = mAny?.targetRole || "groupe";
        const targetRegion = mAny?.targetRegion ? ` (${mAny.targetRegion})` : "";
        name = `Groupe : ${targetRole}${targetRegion}`;
        ident = `group_${targetRole}_${mAny?.targetRegion || "all"}`;
        key = ident;
        initial = "G";
        subtitle = "Diffusion groupée";
      } else {
        const isSuperRecipient = Boolean(mAny?.recipient?.isSuperAdmin);
        isSupport = isSuperRecipient;
        const rId = String(mAny?.recipient?.id || mAny?.recipientId || "");
        const reader = mAny?.readers?.[0];
        const rGrade = isSuperRecipient ? "" : String(mAny?.recipient?.grade || reader?.grade || "").trim();
        subtitle = isSuperRecipient
          ? "Support Technique"
          : String(mAny?.recipient?.role_metier_label || mAny?.recipient?.roleMetierLabel || "").trim();
        const baseName = isSuperRecipient
          ? "Équipe Support"
          : [mAny?.recipient?.firstName, mAny?.recipient?.lastName].filter(Boolean).join(" ").trim() ||
            reader?.name ||
            mAny?.recipientIdentifier ||
            "Destinataire";
        name = rGrade ? `${rGrade} ${baseName}` : baseName;
        ident = String(
          mAny?.recipient?.username ||
            mAny?.recipient?.email ||
            mAny?.recipientIdentifier ||
            reader?.matricule ||
            rId ||
            ""
        ).trim();
        key = isSuperRecipient ? "__support__" : rId || ident;
        initial = isSuperRecipient ? "S" : baseName.charAt(0).toUpperCase() || "A";
      }

      const time = new Date(mAny?.createdAt || mAny?.created_at || 0);
      const displayContent = String(mAny?.content || "").trim() || (mAny?.attachmentName ? "📎 Pièce jointe" : "");
      const isRead = mAny?.readStatus === "read" || Boolean(mAny?.isRead) || (Array.isArray(mAny?.readers) && mAny.readers.length > 0);

      let conv = convMap.get(key);
      if (!conv) {
        conv = {
          contactKey: key,
          contactName: name,
          contactInitial: initial,
          contactIdentifier: ident,
          contactSubtitle: subtitle,
          isGroup,
          isSupport,
          lastMessage: displayContent,
          lastTime: time,
          lastIsSent: true,
          unreadCount: 0,
          messages: [],
        };
        convMap.set(key, conv);
      }

      conv.messages.push({
        uniqueKey: uniq,
        id: msgId,
        content: String(mAny?.content || ""),
        time,
        isSent: true,
        isRead,
        rawMsgObj: mAny,
      });
      if (time >= conv.lastTime) {
        conv.lastMessage = displayContent;
        conv.lastTime = time;
        conv.lastIsSent = true;
      }
    }

    for (const conv of convMap.values()) {
      conv.messages.sort((a, b) => a.time.getTime() - b.time.getTime());
    }

    return Array.from(convMap.values()).sort((a, b) => b.lastTime.getTime() - a.lastTime.getTime());
  }, [inbox, sent]);

  // Ouvrir directement la conversation avec l'expéditeur d'une alerte si demandé
  useEffect(() => {
    if (!initialRecipient?.identifier) return;
    const targetIdent = initialRecipient.identifier.trim();
    const existing = conversations.find(
      (c) =>
        normStr(c.contactIdentifier) === normStr(targetIdent) ||
        normStr(c.contactKey) === normStr(targetIdent)
    );
    if (existing) {
      setSelectedContactKey(existing.contactKey);
      setTempConversation(null);
    } else {
      const temp: ChatConversation = {
        contactKey: `temp:${targetIdent}`,
        contactName: initialRecipient.label || targetIdent,
        contactInitial: (initialRecipient.label || targetIdent).charAt(0).toUpperCase() || "A",
        contactIdentifier: targetIdent,
        contactSubtitle: "Expéditeur d'alerte",
        isGroup: false,
        isSupport: false,
        lastMessage: "",
        lastTime: new Date(),
        lastIsSent: false,
        unreadCount: 0,
        messages: [],
      };
      setTempConversation(temp);
      setSelectedContactKey(temp.contactKey);
    }
    setRightMode("chat");
    setMobileShowRight(true);
  }, [initialRecipient, conversations]);

  const selectedConversation = useMemo<ChatConversation | null>(() => {
    if (!selectedContactKey) return null;
    const found = conversations.find((c) => c.contactKey === selectedContactKey);
    if (found) return found;
    if (tempConversation && tempConversation.contactKey === selectedContactKey) {
      // Si la conversation temporaire existe désormais dans les vraies conversations, basculer dessus sans doublon
      const matchReal = conversations.find(
        (c) =>
          (tempConversation.isSupport && c.isSupport) ||
          normStr(c.contactIdentifier) === normStr(tempConversation.contactIdentifier)
      );
      return matchReal || tempConversation;
    }
    return null;
  }, [conversations, selectedContactKey, tempConversation]);

  // Marquer automatiquement comme lus les messages reçus de la conversation ouverte
  useEffect(() => {
    if (rightMode !== "chat" || !selectedConversation) return;
    const unreadMsgs = selectedConversation.messages.filter(
      (m) => !m.isSent && !m.isRead && Number.isFinite(m.id) && !markedReadIdsRef.current.has(m.id)
    );
    for (const m of unreadMsgs) {
      markedReadIdsRef.current.add(m.id);
      void markMessageAsRead(m.id).catch(() => {
        markedReadIdsRef.current.delete(m.id);
      });
    }
  }, [rightMode, selectedConversation, markMessageAsRead]);

  // Auto-scroll en bas du fil
  useEffect(() => {
    if (rightMode === "chat" && selectedConversation) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [rightMode, selectedConversation?.contactKey, selectedConversation?.messages.length]);

  const filteredConversations = useMemo(() => {
    const q = normStr(listQuery);
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        normStr(c.contactName).includes(q) ||
        normStr(c.contactSubtitle).includes(q) ||
        normStr(c.lastMessage).includes(q)
    );
  }, [conversations, listQuery]);

  const filteredContacts = useMemo(() => {
    const q = normStr(contactSearch);
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        normStr(c.displayName).includes(q) ||
        normStr(c.subtitle).includes(q) ||
        normStr(c.identifier).includes(q)
    );
  }, [contacts, contactSearch]);

  const openChatWithContact = (contact: DirectoryContact) => {
    const existing = conversations.find(
      (c) =>
        (contact.isSupport && c.isSupport) ||
        c.contactKey === contact.id ||
        normStr(c.contactIdentifier) === normStr(contact.identifier)
    );
    if (existing) {
      setSelectedContactKey(existing.contactKey);
      setTempConversation(null);
    } else {
      const temp: ChatConversation = {
        contactKey: contact.isSupport ? "__support__" : contact.id,
        contactName: contact.displayName,
        contactInitial: contact.initial,
        contactIdentifier: contact.identifier,
        contactSubtitle: contact.subtitle,
        isGroup: false,
        isSupport: contact.isSupport,
        lastMessage: "",
        lastTime: new Date(),
        lastIsSent: false,
        unreadCount: 0,
        messages: [],
      };
      setTempConversation(temp);
      setSelectedContactKey(temp.contactKey);
    }
    setRightMode("chat");
    setMobileShowRight(true);
    setDraftText("");
    setDraftAttachment(null);
  };

  const openChatWithManualIdentifier = () => {
    const raw = contactSearch.trim();
    if (!raw) return;
    openChatWithContact({
      id: `manual:${raw.toLowerCase()}`,
      identifier: raw,
      displayName: raw,
      subtitle: "Destinataire direct",
      isSupport: false,
      initial: raw.charAt(0).toUpperCase() || "U",
    });
  };

  const handleSendInChat = async () => {
    if (!selectedConversation) return;
    const text = draftText.trim();
    if (!text && !draftAttachment) return;
    if (draftAttachment && draftAttachment.size > MAX_ATTACHMENT_SIZE) {
      toast({ title: "Fichier trop volumineux", description: "La pièce jointe ne doit pas dépasser 5 Mo.", variant: "destructive" });
      return;
    }

    const contentToSend = text || (draftAttachment ? "[Pièce jointe]" : "");
    try {
      if (selectedConversation.isGroup) {
        const parts = selectedConversation.contactKey.replace(/^group_/, "").split("_");
        const role = parts[0] || "agent";
        const reg = parts.slice(1).join("_");
        await sendGroup({
          targets: [{ role, region: reg && reg !== "all" ? reg : undefined }],
          content: contentToSend,
          attachment: draftAttachment,
        });
      } else {
        await sendIndividual({
          recipientIdentifier: selectedConversation.contactIdentifier,
          content: contentToSend,
          attachment: draftAttachment,
        });
      }
      setDraftText("");
      setDraftAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (tempConversation) {
        setTempConversation(null);
      }
    } catch (error: any) {
      toast({
        title: "Échec de l'envoi",
        description: error?.message || "Impossible d'envoyer le message.",
        variant: "destructive",
      });
    }
  };

  const handleSendGroupBroadcast = async () => {
    if (!selectedGroupKeys.length) {
      toast({ title: "Destinataires manquants", description: "Sélectionnez au moins un groupe.", variant: "destructive" });
      return;
    }
    const text = groupMessage.trim();
    if (!text && !groupAttachment) {
      toast({ title: "Message vide", description: "Saisissez un message ou joignez un fichier.", variant: "destructive" });
      return;
    }
    if (groupAttachment && groupAttachment.size > MAX_ATTACHMENT_SIZE) {
      toast({ title: "Fichier trop volumineux", description: "La pièce jointe ne doit pas dépasser 5 Mo.", variant: "destructive" });
      return;
    }

    const targets = selectedGroupKeys
      .map((k) => groupTargets.find((t) => t.key === k)?.target)
      .filter(Boolean) as Array<{ role: string; region?: string }>;

    try {
      await sendGroup({
        targets,
        content: text || "[Pièce jointe]",
        attachment: groupAttachment,
      });
      toast({ title: "Message groupé envoyé", description: "Le message a été transmis aux groupes sélectionnés." });
      setGroupMessage("");
      setGroupAttachment(null);
      setSelectedGroupKeys([]);
      if (groupFileInputRef.current) groupFileInputRef.current.value = "";
      setRightMode("chat");
    } catch (error: any) {
      toast({
        title: "Erreur d'envoi groupé",
        description: error?.message || "Impossible d'envoyer le message groupé.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConversation = async (conv: ChatConversation) => {
    if (!window.confirm(`Supprimer définitivement la discussion avec « ${conv.contactName} » ?`)) return;
    setDeletingConv(true);
    try {
      if (isGroupConversationKey(conv.contactKey) || conv.isGroup) {
        await Promise.all(conv.messages.map((m) => deleteMessage(m.rawMsgObj as InternalMessageRecord).catch(() => {})));
      } else {
        const identifiers = [
          resolveConversationDeleteIdentifier(conv.contactKey, conv.contactIdentifier),
          conv.contactIdentifier,
        ].filter((v, i, arr): v is string => Boolean(v) && arr.indexOf(v) === i);
        let deletedOk = false;
        for (const ident of identifiers) {
          const resp = await authenticatedFetch(
            `/api/messages/conversation/${encodeURIComponent(ident)}?domaineId=null`,
            { method: "DELETE" }
          );
          if (resp.ok) {
            deletedOk = true;
            break;
          }
        }
        if (!deletedOk) {
          await Promise.all(conv.messages.map((m) => deleteMessage(m.rawMsgObj as InternalMessageRecord).catch(() => {})));
        }
      }
      setSelectedContactKey(null);
      setTempConversation(null);
      setMobileShowRight(false);
      await refreshAll();
      toast({ title: "Discussion supprimée" });
    } catch (error: any) {
      toast({
        title: "Suppression impossible",
        description: error?.message || "Erreur lors de la suppression.",
        variant: "destructive",
      });
    } finally {
      setDeletingConv(false);
    }
  };

  const supportContact = useMemo(() => contacts.find((c) => c.isSupport) || null, [contacts]);
  const isLoading = loadingInbox && loadingSent && conversations.length === 0;

  return (
    <div className="w-full rounded-2xl border border-emerald-200/90 bg-white shadow-sm overflow-hidden grid grid-cols-1 lg:grid-cols-12 h-[calc(100vh-14rem)] min-h-[560px]">
      {/* ══════════════════ COLONNE GAUCHE : LISTE DES CONVERSATIONS ══════════════════ */}
      <aside
        className={`lg:col-span-4 border-r border-slate-200 flex flex-col bg-white overflow-hidden ${
          mobileShowRight ? "hidden lg:flex" : "flex"
        }`}
      >
        {/* En-tête vert foncé identique à la messagerie chasseurs/guides */}
        <div className="bg-[#114b26] text-white px-4 py-3.5 shrink-0 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight truncate">Messages</h2>
            <p className="text-[11px] text-emerald-100/90 truncate">{scope.territoryDisplay}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void refreshAll()}
              title="Actualiser"
              className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
            >
              <RefreshCw className={`h-4 w-4 ${loadingInbox || loadingSent ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setRightMode("new");
                setNewTab("individual");
                setContactSearch("");
                setMobileShowRight(true);
              }}
              title="Nouvelle discussion"
              className="h-8 px-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>Nouveau</span>
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="px-3 py-2.5 border-b border-slate-100 shrink-0 space-y-2">
          <div className="flex items-center gap-2 bg-slate-100 rounded-full px-3.5 py-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Rechercher une conversation…"
              className="bg-transparent outline-none text-sm w-full text-slate-800 placeholder:text-slate-400"
            />
            {listQuery && (
              <button type="button" onClick={() => setListQuery("")} className="text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Accès direct permanent vers l'Équipe Support */}
          {supportContact && (
            <button
              type="button"
              onClick={() => openChatWithContact(supportContact)}
              className="w-full flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/80 px-3 py-2 text-left transition-colors"
            >
              <div className="h-8 w-8 rounded-full bg-[#114b26] text-white flex items-center justify-center shrink-0">
                <Headphones className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-emerald-950 truncate">Équipe Support</div>
                <div className="text-[11px] text-emerald-700 truncate">Contacter le Support Technique</div>
              </div>
              <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-[10px] px-2 py-0.5 shrink-0">
                Support
              </Badge>
            </button>
          )}
        </div>

        {/* Liste des discussions */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-emerald-700 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Chargement…</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-2">
              <MessageSquare className="h-9 w-9 text-slate-300 mx-auto" />
              <p className="text-sm font-medium text-slate-500">Aucune conversation</p>
              <p className="text-xs text-slate-400">
                Cliquez sur <strong>+ Nouveau</strong> ou sur <strong>Équipe Support</strong> pour démarrer un échange.
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = rightMode === "chat" && selectedConversation?.contactKey === conv.contactKey;
              return (
                <button
                  key={conv.contactKey}
                  type="button"
                  onClick={() => {
                    setSelectedContactKey(conv.contactKey);
                    setTempConversation(null);
                    setRightMode("chat");
                    setMobileShowRight(true);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    isSelected
                      ? "bg-emerald-50 border-l-4 border-l-emerald-600"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <ContactAvatar size="lg" unread={conv.unreadCount > 0} isGroup={conv.isGroup} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-sm truncate ${
                          conv.unreadCount > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800"
                        }`}
                      >
                        {conv.contactName}
                      </span>
                      <span className="text-[11px] text-slate-400 shrink-0">{formatRelTime(conv.lastTime)}</span>
                    </div>
                    {conv.contactSubtitle && (
                      <p className="text-[11px] text-emerald-700 font-medium truncate">{conv.contactSubtitle}</p>
                    )}
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        conv.unreadCount > 0 ? "text-slate-800 font-semibold" : "text-slate-500"
                      }`}
                    >
                      {conv.lastIsSent ? "Vous : " : ""}
                      {conv.lastMessage || "Nouvelle discussion"}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-green-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ══════════════════ COLONNE DROITE : FIL CHAT OU NOUVELLE DISCUSSION ══════════════════ */}
      <main
        className={`lg:col-span-8 flex flex-col bg-slate-50 overflow-hidden ${
          mobileShowRight ? "flex" : "hidden lg:flex"
        }`}
      >
        {rightMode === "new" ? (
          /* ── VUE NOUVELLE DISCUSSION / ENVOI GROUPÉ ── */
          <div className="flex flex-col h-full bg-white">
            <div className="bg-[#114b26] text-white px-4 py-3.5 shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setRightMode("chat");
                    setMobileShowRight(false);
                  }}
                  className="h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center transition-colors"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <span className="text-base font-bold">Nouvelle discussion</span>
              </div>

              <div className="inline-flex rounded-full bg-white/15 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setNewTab("individual")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                    newTab === "individual" ? "bg-white text-[#114b26]" : "text-white/90 hover:text-white"
                  }`}
                >
                  <UserIcon className="h-3.5 w-3.5" />
                  <span>Individuel</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNewTab("group")}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                    newTab === "group" ? "bg-white text-[#114b26]" : "text-white/90 hover:text-white"
                  }`}
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Groupé</span>
                </button>
              </div>
            </div>

            {newTab === "individual" ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 shrink-0 space-y-2">
                  <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2.5">
                    <Search className="h-4 w-4 text-slate-400 shrink-0" />
                    <input
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && contactSearch.trim()) openChatWithManualIdentifier();
                      }}
                      placeholder="Rechercher un contact ou saisir un matricule / e-mail…"
                      className="bg-transparent outline-none text-sm w-full text-slate-800"
                    />
                    {contactSearch.trim() && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={openChatWithManualIdentifier}
                        className="h-7 rounded-full bg-green-600 hover:bg-green-700 text-white text-xs px-3"
                      >
                        Écrire
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                  {loadingContacts ? (
                    <div className="py-12 flex items-center justify-center gap-2 text-emerald-700 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Chargement des contacts…</span>
                    </div>
                  ) : filteredContacts.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-500 px-4">
                      Aucun contact trouvé. Vous pouvez saisir directement un matricule ou e-mail ci-dessus puis cliquer sur <strong>Écrire</strong>.
                    </div>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.isSupport ? "__support__" : c.id}
                        type="button"
                        onClick={() => openChatWithContact(c)}
                        className={`w-full flex items-center gap-3 px-5 py-3 text-left transition-colors ${
                          c.isSupport ? "bg-emerald-50/70 hover:bg-emerald-100/70" : "hover:bg-slate-50"
                        }`}
                      >
                        {c.isSupport ? (
                          <div className="h-10 w-10 rounded-full bg-[#114b26] text-white flex items-center justify-center shrink-0">
                            <Headphones className="h-5 w-5" />
                          </div>
                        ) : (
                          <ContactAvatar size="md" variant="search" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold text-slate-900 truncate">{c.displayName}</div>
                          <div className="text-xs text-emerald-700 truncate">{c.subtitle}</div>
                        </div>
                        {c.isSupport && (
                          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white border-0 text-xs">
                            Support
                          </Badge>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* ── ENVOI GROUPÉ ── */
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-800">Groupes destinataires</div>
                  <div className="flex flex-wrap gap-2">
                    {groupTargets.map((t) => {
                      const active = selectedGroupKeys.includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() =>
                            setSelectedGroupKeys((prev) =>
                              prev.includes(t.key) ? prev.filter((x) => x !== t.key) : [...prev, t.key]
                            )
                          }
                          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition-colors ${
                            active
                              ? "bg-green-700 border-green-700 text-white"
                              : "bg-white border-slate-200 text-slate-700 hover:bg-emerald-50"
                          }`}
                        >
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-bold text-slate-800">Message</div>
                  <textarea
                    value={groupMessage}
                    onChange={(e) => setGroupMessage(e.target.value)}
                    rows={5}
                    placeholder="Saisissez le message à diffuser aux groupes sélectionnés…"
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      ref={groupFileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setGroupAttachment(e.target.files?.[0] || null)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => groupFileInputRef.current?.click()}
                      className="gap-1.5"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span>Joindre un fichier</span>
                    </Button>
                    {groupAttachment && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs text-emerald-900">
                        <span className="truncate max-w-[180px]">{groupAttachment.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setGroupAttachment(null);
                            if (groupFileInputRef.current) groupFileInputRef.current.value = "";
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>

                  <Button
                    type="button"
                    disabled={sending}
                    onClick={handleSendGroupBroadcast}
                    className="bg-green-700 hover:bg-green-800 text-white gap-2 px-5"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span>Envoyer au groupe</span>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : !selectedConversation ? (
          /* ── ÉTAT D'ACCUEIL QUAND AUCUNE DISCUSSION N'EST SÉLECTIONNÉE ── */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
            <div className="h-16 w-16 rounded-full bg-emerald-100 text-[#114b26] flex items-center justify-center">
              <MessageSquare className="h-8 w-8" />
            </div>
            <div className="space-y-1 max-w-md">
              <h3 className="text-base font-bold text-slate-900">Messagerie instantanée SCODI</h3>
              <p className="text-sm text-slate-500">
                Sélectionnez une discussion à gauche, démarrez un nouvel échange avec un agent de votre périmètre ou contactez directement l&apos;Équipe Support.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button
                type="button"
                onClick={() => {
                  setRightMode("new");
                  setNewTab("individual");
                  setMobileShowRight(true);
                }}
                className="bg-green-700 hover:bg-green-800 text-white gap-2"
              >
                <Plus className="h-4 w-4" />
                <span>Nouvelle discussion</span>
              </Button>
              {supportContact && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => openChatWithContact(supportContact)}
                  className="border-emerald-300 text-emerald-900 hover:bg-emerald-50 gap-2"
                >
                  <Headphones className="h-4 w-4" />
                  <span>Écrire à l&apos;Équipe Support</span>
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* ── FIL DE DISCUSSION ACTIF (STYLE CHAT CHASSEURS / GUIDES) ── */
          <>
            <div className="bg-[#114b26] text-white px-4 py-3 shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileShowRight(false)}
                  className="lg:hidden h-8 w-8 rounded-full hover:bg-white/15 flex items-center justify-center"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {selectedConversation.isSupport ? (
                  <div className="h-9 w-9 rounded-full bg-white/15 text-white flex items-center justify-center shrink-0">
                    <Headphones className="h-5 w-5" />
                  </div>
                ) : (
                  <ContactAvatar size="sm" variant="header" isGroup={selectedConversation.isGroup} />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">{selectedConversation.contactName}</div>
                  {selectedConversation.contactSubtitle && (
                    <div className="text-[11px] text-emerald-100/90 truncate">
                      {selectedConversation.contactSubtitle}
                    </div>
                  )}
                </div>
              </div>

              {selectedConversation.messages.length > 0 && (
                <button
                  type="button"
                  disabled={deletingConv}
                  onClick={() => handleDeleteConversation(selectedConversation)}
                  title="Supprimer la discussion"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-600/80 hover:text-white transition-colors shrink-0 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{deletingConv ? "Suppression…" : "Supprimer"}</span>
                </button>
              )}
            </div>

            {/* Bulles de messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 bg-slate-50">
              {selectedConversation.messages.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Commencez votre échange avec {selectedConversation.contactName} ci-dessous.
                </div>
              ) : (
                selectedConversation.messages.map((m) => {
                  const hasAttachment = Boolean(m.rawMsgObj?.attachmentPath || m.rawMsgObj?.attachmentName);
                  const attachmentName = repairAttachmentFileName(m.rawMsgObj?.attachmentName) || "Fichier joint";
                  const attachmentMime = guessAttachmentMime(attachmentName, m.rawMsgObj?.attachmentMime);
                  const isGroupMsg = Boolean(m.rawMsgObj?.isGroupMessage || selectedConversation.isGroup);
                  const attachmentUrl = m.rawMsgObj?.id
                    ? buildMessageAttachmentUrl(Number(m.rawMsgObj.id), { isGroup: isGroupMsg })
                    : "";

                  const openAttachment = () => {
                    if (!m.rawMsgObj?.id) return;
                    setPreview({
                      messageId: Number(m.rawMsgObj.id),
                      isGroup: isGroupMsg,
                      name: attachmentName,
                      mime: attachmentMime,
                      size: m.rawMsgObj?.attachmentSize,
                    });
                  };

                  const showText =
                    Boolean(m.content?.trim()) &&
                    !(hasAttachment && /^\[?pi[èe]ce jointe\]?$/i.test(m.content.trim()));

                  return m.isSent ? (
                    <div key={m.uniqueKey} className="flex flex-col items-end max-w-[82%] ml-auto">
                      <div className="bg-green-600 text-white rounded-2xl rounded-tr-sm px-3.5 py-2 text-sm shadow-xs flex flex-col gap-1">
                        {showText && <span className="whitespace-pre-wrap break-words">{m.content}</span>}
                        {hasAttachment && attachmentUrl && (
                          <ChatAttachmentBlock
                            url={attachmentUrl}
                            name={attachmentName}
                            mime={attachmentMime}
                            size={m.rawMsgObj?.attachmentSize}
                            variant="sent"
                            onOpen={openAttachment}
                          />
                        )}
                        <div className="flex items-center justify-end gap-1 text-[10px] text-green-100/90 mt-0.5">
                          <span>{formatBubbleTime(m.time)}</span>
                          {m.isRead ? (
                            <CheckCheck className="h-3.5 w-3.5 text-sky-200" />
                          ) : (
                            <Check className="h-3.5 w-3.5 text-green-200" />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={m.uniqueKey} className="flex flex-col items-start max-w-[82%] mr-auto">
                      <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2 text-sm shadow-xs flex flex-col gap-1">
                        {showText && <span className="whitespace-pre-wrap break-words">{m.content}</span>}
                        {hasAttachment && attachmentUrl && (
                          <ChatAttachmentBlock
                            url={attachmentUrl}
                            name={attachmentName}
                            mime={attachmentMime}
                            size={m.rawMsgObj?.attachmentSize}
                            variant="received"
                            onOpen={openAttachment}
                          />
                        )}
                        <div className="text-[10px] text-slate-400 text-right mt-0.5">
                          {formatBubbleTime(m.time)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Barre de saisie en bas */}
            <div className="border-t border-slate-200 bg-white px-3 py-2.5 shrink-0 space-y-2">
              {draftAttachment && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-900">
                  <span className="truncate font-medium">📎 {draftAttachment.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftAttachment(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-emerald-700 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => setDraftAttachment(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Joindre un fichier (max 5 Mo)"
                  className="h-10 w-10 rounded-full border border-slate-200 hover:bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 transition-colors"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendInChat();
                    }
                  }}
                  placeholder={`Écrire un message à ${selectedConversation.contactName}…`}
                  className="flex-1 h-10 rounded-full bg-slate-100 px-4 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  disabled={sending || (!draftText.trim() && !draftAttachment)}
                  onClick={() => void handleSendInChat()}
                  className="h-10 w-10 rounded-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      <MessageAttachmentViewer payload={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
