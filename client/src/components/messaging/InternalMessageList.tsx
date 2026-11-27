import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { useQueryClient } from "@tanstack/react-query";
import { Mail as MailIcon, MailOpen as MailOpenIcon, MessageSquareIcon, Paperclip, Send as SendIcon, Share2, Trash2, Check, CheckCheck, Clock, ArrowLeft, RefreshCw, Square, CheckSquare, Loader2, X as XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { repairAttachmentFileName } from "@/lib/attachmentMime";
import MessageAttachmentViewer from "@/components/messaging/MessageAttachmentViewer";

interface InternalMessageListProps {
  messages: InternalMessageRecord[];
  loading?: boolean;
  emptyLabel: string;
  onDelete?: (message: InternalMessageRecord) => Promise<void> | void;
  onStaleMessage?: (message: InternalMessageRecord) => void;
  context?: 'inbox' | 'sent';
  onReply?: (payload: { recipientIdentifier: string; content: string; attachment?: File | null; original: InternalMessageRecord }) => Promise<void> | void;
  onRefresh?: () => void;
}

interface AttachmentPreview {
  messageId: number;
  isGroup?: boolean;
  name?: string | null;
  mime?: string | null;
  size?: number | null;
}

const DATE_KEYS = ["createdAt", "created_at", "sentAt", "sent_at", "updatedAt", "updated_at"];
const SUBJECT_KEYS = ["subject", "title", "heading"];
const CONTENT_KEYS = ["content", "body", "message", "text", "description"];
const RECIPIENT_KEYS = ["recipientName", "recipient", "recipientLabel"];
const RECIPIENT_ROLE_KEYS = ["recipientRole", "recipient_role", "role"]; // when using recipient object
const RECIPIENT_REGION_KEYS = ["recipientRegion", "recipient_region", "region", "targetRegion"]; // best-effort
const RECIPIENT_DEPT_KEYS = ["recipientDepartement", "recipient_department", "departement", "department"]; // best-effort
const SENDER_KEYS = ["senderDisplayName", "senderName", "sender", "senderLabel"];
const SENDER_ROLE_KEYS = ["senderRole", "sender_role", "role"];

const SENDER_ROLE_LABELS: Record<string, string> = {
  agent: "Chef de division régional",
};

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const extractFirstString = (record: InternalMessageRecord, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (isNonEmptyString(value)) {
      return value.trim();
    }
  }
  return null;
};

const extractDate = (record: InternalMessageRecord): string | null => {
  for (const key of DATE_KEYS) {
    const value = record[key];
    if (isNonEmptyString(value)) {
      return value;
    }
  }
  return null;
};

const extractContent = (record: InternalMessageRecord): string => {
  const text = extractFirstString(record, CONTENT_KEYS);
  if (text) return text;
  const fallback = record?.content ?? record?.body ?? record?.message;
  return typeof fallback === "string" ? fallback : JSON.stringify(record ?? {});
};

const formatDate = (value: string | null) => {
  if (!value) return "Date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const wrapByWords = (text: string, chunkSize: number) => {
  if (typeof text !== 'string' || chunkSize <= 0) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    lines.push(words.slice(i, i + chunkSize).join(' '));
  }
  return lines.join('\n');
};

export default function InternalMessageList({
  messages,
  loading,
  emptyLabel,
  onDelete,
  onStaleMessage,
  context = 'inbox',
  onReply,
  onRefresh,
}: InternalMessageListProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Toujours utiliser un tableau pour éviter les erreurs quand la prop n'est pas un Array
  const safeMessages: InternalMessageRecord[] = Array.isArray(messages) ? messages : [];
  const normalizedRole = (user?.role || '').toLowerCase();
  const [listFilter, setListFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<InternalMessageRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [readerDetailFor, setReaderDetailFor] = useState<InternalMessageRecord | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;
  const [forwardFor, setForwardFor] = useState<InternalMessageRecord | null>(null);
  const [sectorAgents, setSectorAgents] = useState<Array<{ id: number; label: string }>>([]);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const [selectAllSectors, setSelectAllSectors] = useState(false);
  const [selectedSectorIds, setSelectedSectorIds] = useState<Set<number>>(new Set());
  const [sectorDeptFilter, setSectorDeptFilter] = useState<string>("");
  const [deptOptions, setDeptOptions] = useState<string[]>([]);
  const [forwardSubject, setForwardSubject] = useState<string>("");
  const [forwardContent, setForwardContent] = useState<string>("");
  const [freeIdentifiers, setFreeIdentifiers] = useState<string>("");
  const [forwardSubmitting, setForwardSubmitting] = useState(false);
  const [forwardError, setForwardError] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<InternalMessageRecord | null>(null);
  const [replyRecipient, setReplyRecipient] = useState<string>("");
  const [replyContent, setReplyContent] = useState<string>("");
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<InternalMessageRecord | null>(null);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!loading) {
      setHasLoadedOnce(true);
    }
  }, [loading]);

  const filteredMessages = useMemo(() => {
    if (context !== 'inbox') return safeMessages;
    if (listFilter === 'all') return safeMessages;
    if (listFilter === 'unread') return safeMessages.filter((m: any) => m?.isRead === false);
    return safeMessages.filter((m: any) => m?.isRead !== false);
  }, [context, safeMessages, listFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE));

  // Only reset page to 1 if the filter changes.
  // We avoid resetting to page 1 simply because the messages list refreshed.
  const prevFilterRef = useRef(listFilter);
  useEffect(() => {
    if (listFilter !== prevFilterRef.current) {
      setPage(1);
      prevFilterRef.current = listFilter;
    }
  }, [listFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (forwardFor) {
      setSectorLoading(true);
      setSectorError(null);
      setSelectedSectorIds(new Set());
      setSelectAllSectors(false);
      setSectorDeptFilter("");
      (async () => {
        try {
          const resp = await authenticatedFetch('/api/messages/agents?role=sector');
          if (!resp.ok) throw new Error('Échec du chargement des agents de secteur');
          const data = await resp.json();
          const arr = Array.isArray(data) ? data : [];
          setSectorAgents(arr.map((u: any) => ({ id: Number(u.id), label: String((u.label || `#${u.id}`) + (u.departement ? ` — ${u.departement}` : '')) })));
          const depts = Array.from(new Set(arr.map((u: any) => String(u.departement || '').trim()).filter(Boolean)));
          setDeptOptions(depts);
        } catch (e: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
          setSectorError(e?.message || 'Impossible de charger la liste des agents de secteur');
         } finally {
          setSectorLoading(false);
        }
      })();
    }
  }, [forwardFor]);

  useEffect(() => {
    if (!forwardFor) return;
    const run = async () => {
      setSectorLoading(true);
      setSectorError(null);
      try {
        const qs = sectorDeptFilter ? `&departement=${encodeURIComponent(sectorDeptFilter)}` : '';
        const resp = await authenticatedFetch(`/api/messages/agents?role=sector${qs}`);
        if (!resp.ok) throw new Error('Échec du chargement des agents de secteur');
        const data = await resp.json();
        const arr = Array.isArray(data) ? data : [];
        setSectorAgents(arr.map((u: any) => ({ id: Number(u.id), label: String((u.label || `#${u.id}`) + (u.departement ? ` — ${u.departement}` : '')) })));
      } catch (e: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        setSectorError(e?.message || 'Impossible de charger la liste des agents de secteur');
       } finally {
        setSectorLoading(false);
      }
    };
    run();
  }, [sectorDeptFilter, forwardFor]);

  const closePreview = () => setPreview(null);
  const closeDeleteDialog = () => {
    if (deleting) return;
    setMessageToDelete(null);
    setDeleteError(null);
  };

  // Pagination slice for current page (defined before effects that depend on it)
  const paginatedMessages = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredMessages.slice(start, start + PAGE_SIZE);
  }, [filteredMessages, page]);

  // Ouverture/fermeture des messages en "Reçus" (enveloppe)
  const openedRef = useRef<Set<number>>(new Set());
  const [openedIds, setOpenedIds] = useState<Set<number>>(new Set());
  const toggleOpen = async (m: InternalMessageRecord) => {
    if (context !== 'inbox') return;
    const id = Number(m?.id);
    if (!Number.isFinite(id)) return;
    setOpenedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // Marquer comme lu uniquement à la première ouverture
    if (!openedRef.current.has(id)) {
      openedRef.current.add(id);
      try {
        const endpoint = m.isGroupMessage ? `/api/messages/group/${id}/read` : `/api/messages/${id}/read`;
        const res = await authenticatedFetch(endpoint, { method: 'PATCH' });
        if (res.status === 404) {
          onStaleMessage?.(m);
          return;
        }
        if (!res.ok) return;
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-alerte'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-main'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-launcher-badge'] });
        window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
      } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
        onStaleMessage?.(m);
       }
    }
  };

  const formatFileSize = (size: number | null | undefined) => {
    if (!size || Number.isNaN(size)) return "";
    if (size < 1024) return `${size} o`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} Go`;
  };



  const canGoPrev = page > 1;
  const canGoNext = page < totalPages;

  const openAttachmentPreview = (message: InternalMessageRecord) => {
    const messageId = message.id;
    if (!messageId) return;
    const displayName =
      repairAttachmentFileName(message.attachmentName as string | undefined) || 'Pièce jointe';
    const isGroupMessage = Boolean(message.isGroupMessage);
    const sizeValue =
      typeof message.attachmentSize === 'number'
        ? message.attachmentSize
        : Number(message.attachmentSize ?? 0) || null;
    setPreview({
      messageId: Number(messageId),
      isGroup: isGroupMessage,
      name: displayName,
      mime: (message.attachmentMime as string | undefined) ?? null,
      size: sizeValue,
    });
  };

  const requestDelete = (message: InternalMessageRecord) => {
    if (!onDelete) return;
    if (deleting) return;
    setDeleteError(null);
    setMessageToDelete(message);
  };

  const confirmDelete = async () => {
    if (deleting) return;
    if (!onDelete || !messageToDelete) {
      closeDeleteDialog();
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(messageToDelete);
      setMessageToDelete(null);
    } catch (error: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', error);
      const message = error?.message ?? error?.toString?.() ?? "Une erreur est survenue lors de la suppression.";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!onDelete || selectedMessageIds.size === 0) return;
    setBulkDeleting(true);
    try {
      // Find the message objects from safeMessages that correspond to the selected IDs
      const messagesToDelete = safeMessages.filter(m => typeof m.id === 'number' && selectedMessageIds.has(m.id));
      await Promise.all(messagesToDelete.map(m => onDelete(m)));
      setSelectedMessageIds(new Set());
    } catch (error) {
      console.warn('[SCODI-DEBUG] Error during bulk delete', error);
    } finally {
      setBulkDeleting(false);
    }
  };

  const getMessageDetails = (message: any) => {
    const isGroupKey = Boolean((message as any)?.isGroupMessage);
    const subject = extractFirstString(message, SUBJECT_KEYS);
    const content = extractContent(message);
    const timestamp = formatDate(extractDate(message));
    const recipient = extractFirstString(message, RECIPIENT_KEYS) || ((): string | null => {
      const extraKeys = ["recipientUsername", "recipientEmail", "recipientLogin", "recipient_user", "recipient_email"];
      return extractFirstString(message, extraKeys as any);
    })();
    const recipientObj = typeof (message as any).recipient === 'object' && (message as any).recipient ? ((message as any).recipient as Record<string, unknown>) : null;
    const recipientFirstName = typeof recipientObj?.firstName === 'string' ? recipientObj.firstName.trim() : (typeof (message as any).recipientFirstName === 'string' ? (message as any).recipientFirstName.trim() : undefined);
    const recipientLastName = typeof recipientObj?.lastName === 'string' ? recipientObj.lastName.trim() : (typeof (message as any).recipientLastName === 'string' ? (message as any).recipientLastName.trim() : undefined);
    const recipientName = [recipientFirstName, recipientLastName].filter(isNonEmptyString).join(' ');
    const recipientRoleRaw = (() => {
      if (recipientObj && typeof recipientObj.role === 'string' && recipientObj.role.trim()) return (recipientObj.role as string).trim();
      return extractFirstString(message, RECIPIENT_ROLE_KEYS) || null;
    })();
    const recipientRegion = (() => {
      if (typeof recipientObj?.region === 'string' && recipientObj.region.trim()) return recipientObj.region.trim();
      return extractFirstString(message, RECIPIENT_REGION_KEYS) || undefined;
    })();
    const recipientDept = (() => {
      if (typeof (recipientObj as any)?.departement === 'string' && (recipientObj as any).departement.trim()) return ((recipientObj as any).departement as string).trim();
      return extractFirstString(message, RECIPIENT_DEPT_KEYS) || undefined;
    })();

    const senderObj = typeof message.sender === 'object' && message.sender ? (message.sender as Record<string, unknown>) : null;
    const isGroupMsg = Boolean(message.isGroupMessage);
    const senderRoleRaw = (() => {
      if (isGroupMsg && senderObj && typeof senderObj.role === 'string' && senderObj.role.trim()) {
        return (senderObj.role as string).trim();
      }
      for (const key of SENDER_ROLE_KEYS) {
        const value = message[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
      return null;
    })();

    const senderRoleLabel = senderRoleRaw ? SENDER_ROLE_LABELS[senderRoleRaw] : undefined;
    const senderFirstName = typeof senderObj?.firstName === 'string' ? senderObj.firstName.trim() :
      (typeof message.senderFirstName === 'string' ? message.senderFirstName.trim() : undefined);
    const senderLastName = typeof senderObj?.lastName === 'string' ? senderObj.lastName.trim() :
      (typeof message.senderLastName === 'string' ? message.senderLastName.trim() : undefined);
    const senderBase = !isGroupMsg ? extractFirstString(message, SENDER_KEYS) : null;
    const senderName = [senderFirstName, senderLastName].filter(isNonEmptyString).join(' ');
    const isSuperSender = Boolean((senderObj as any)?.isSuperAdmin);
    const sender = isSuperSender
      ? 'Équipe Support'
      : senderRoleLabel
        ? `${senderRoleLabel}${senderName ? ` • ${senderName}` : ''}`
        : (senderName || senderBase);

    const attachmentName = extractFirstString(message, ['attachmentName', 'attachment_name']) ?? (message.attachmentPath as string | undefined) ?? null;
    const attachmentSizeRaw = typeof message.attachmentSize === 'number' ? message.attachmentSize : Number(message.attachmentSize ?? 0);
    const attachmentSize = Number.isFinite(attachmentSizeRaw) && attachmentSizeRaw > 0 ? attachmentSizeRaw : null;
    const hasAttachment = isNonEmptyString(attachmentName);

    const metaParts = [] as string[];
    if (context !== 'sent') {
      if (sender) metaParts.push(`Expéditeur : ${sender}`);
    } else {
      let roleLabel: string | undefined;
      if (recipientRoleRaw === 'sub-agent') roleLabel = 'Agent secteur';
      else if (recipientRoleRaw === 'agent') roleLabel = 'Agent IREF';
      const isSuperRecipient = Boolean((recipientObj as any)?.isSuperAdmin);
      const targetRole = (message as any)?.targetRole as string | undefined;
      const looksLikeAdmin = (recipientRoleRaw === 'admin') || (typeof targetRole === 'string' && targetRole.toLowerCase() === 'admin') || (typeof (recipient || recipientName) === 'string' && /admin/i.test(String(recipient || recipientName)));
      if (isSuperRecipient) {
        metaParts.push('Destinataire : Équipe Support');
      } else if (looksLikeAdmin) {
        metaParts.push('Destinataire : Admin');
      } else {
        const assignmentParts: string[] = [];
        if (recipientDept) assignmentParts.push(`Département ${recipientDept}`);
        if (recipientRegion) assignmentParts.push(`Région ${recipientRegion}`);
        const assignment = assignmentParts.join(' / ');
        const baseName = recipientName || recipient || undefined;
        const composed = [baseName, roleLabel, assignment ? `— ${assignment}` : ''].filter(isNonEmptyString).join(' ');
        if (composed) metaParts.push(`Destinataire : ${composed}`);
        else {
          const isRegionalAgent = normalizedRole === 'agent' && (user as any)?.type !== 'secteur';
          if (isRegionalAgent) metaParts.push('Destinataire : Admin');
        }
      }
    }
    const meta = metaParts.join(' • ');
    const numericId = typeof message.id === 'number' ? message.id : NaN;
    const isUnread = context === 'inbox' && (message as any)?.isRead === false && !(Number.isFinite(numericId) && openedRef.current.has(numericId as number));

    return { subject, content, timestamp, sender, attachmentName, attachmentSize, hasAttachment, meta, isGroupKey, isUnread };
  };

  const renderDetailView = () => {
    if (!selectedMessage) return null;
    const { subject, content, timestamp, sender, attachmentName, attachmentSize, hasAttachment, meta } = getMessageDetails(selectedMessage);
    
    return (
      <div className="flex-1 overflow-auto rounded-xl bg-white w-full flex flex-col border border-gray-200 shadow-sm relative z-10">
        <div className="flex items-center justify-between px-3 py-2.5 sm:px-4 border-b border-gray-100 sticky top-0 bg-white/95 backdrop-blur-xs">
          <Button variant="ghost" size="sm" onClick={() => setSelectedMessage(null)} className="hover:bg-gray-100 text-gray-700 gap-1.5 px-2.5" title="Retour à la liste">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-xs sm:text-sm font-medium">Retour</span>
          </Button>
          <div className="flex items-center gap-1.5">
            {context === 'inbox' && normalizedRole !== 'hunter' && normalizedRole !== 'hunting-guide' && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:text-gray-800" onClick={() => { setForwardFor(selectedMessage); setForwardSubject(subject || ''); setForwardContent(''); setForwardError(null); }} title="Transférer">
                <Share2 className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => requestDelete(selectedMessage)} title="Supprimer">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4">{subject || "Message interne"}</h2>
          
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold uppercase shrink-0">
                {(sender || meta || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 text-sm break-words">{meta}</div>
                <div className="text-xs text-gray-500 mt-0.5">{timestamp}</div>
              </div>
            </div>
            {context === 'sent' && Array.isArray((selectedMessage as any).readers) && (selectedMessage as any).readers.length > 0 && (
              <Button variant="link" className="h-auto p-0 text-xs text-green-700" onClick={() => setReaderDetailFor(selectedMessage)}>
                Voir les accusés de lecture
              </Button>
            )}
          </div>
          
          {!(hasAttachment && /^\[?pi[èe]ce jointe\]?$/i.test(content.trim())) && (
            <div className="text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
              {/invalidée?s?/i.test(content) && content.includes('• ')
                ? content.split('\n').map((line, idx) => (
                    <span key={idx}>
                      {idx > 0 ? '\n' : ''}
                      {line.trim().startsWith('• ') ? (
                        <strong className="font-bold text-red-600">{line}</strong>
                      ) : (
                        line
                      )}
                    </span>
                  ))
                : content}
            </div>
          )}
          
          {hasAttachment && (
            <div className={`${/^\[?pi[èe]ce jointe\]?$/i.test(content.trim()) ? 'mt-2' : 'mt-6 pt-4 border-t border-gray-100'} flex flex-col items-start gap-2`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pièce jointe</div>
              <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors w-full sm:w-auto sm:min-w-[280px]">
                <div className="h-9 w-9 rounded-lg bg-green-50 text-green-700 flex items-center justify-center shrink-0"><Paperclip className="h-4 w-4"/></div>
                <div className="flex flex-col min-w-0 pr-3">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[220px]" title={repairAttachmentFileName(attachmentName)}>
                    {repairAttachmentFileName(attachmentName)}
                  </span>
                  <span className="text-xs text-gray-500">{attachmentSize ? formatFileSize(attachmentSize) : ''}</span>
                </div>
                <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => openAttachmentPreview(selectedMessage)}>Aperçu</Button>
              </div>
            </div>
          )}
          
          {/* Actions bas de page */}
          {context === 'inbox' && (
            <div className="mt-8 pt-4 border-t border-gray-100 flex flex-wrap gap-2.5">
              <Button variant="outline" className="gap-2 rounded-full border-gray-300" onClick={() => {
                setReplyFor(selectedMessage);
                const senderObj = typeof selectedMessage.sender === 'object' && selectedMessage.sender ? (selectedMessage.sender as any) : null;
                const identifier = ((typeof senderObj?.username === 'string' && senderObj.username.trim()) || (typeof (selectedMessage as any).senderUsername === 'string' && String((selectedMessage as any).senderUsername).trim()) || (typeof senderObj?.email === 'string' && senderObj.email.trim()) || (typeof (senderObj as any)?.matricule === 'string' && String((senderObj as any).matricule).trim()) || (typeof (selectedMessage as any)?.senderId === 'number' && Number.isFinite((selectedMessage as any).senderId) ? String((selectedMessage as any).senderId) : '')) as string;
                setReplyRecipient(identifier);
                setReplyContent('');
                setReplyAttachment(null);
                setReplyError(null);
                if (replyFileInputRef.current) replyFileInputRef.current.value = '';
              }}>
                <MailIcon className="h-4 w-4" /> Répondre
              </Button>
              {normalizedRole !== 'hunter' && normalizedRole !== 'hunting-guide' && (
                <Button variant="outline" className="gap-2 rounded-full border-gray-300" onClick={() => { setForwardFor(selectedMessage); setForwardSubject(subject || ''); setForwardContent(''); setForwardError(null); }}>
                  <Share2 className="h-4 w-4" /> Transférer
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full h-full flex flex-col">
      {selectedMessage ? renderDetailView() : (
        <>
      {(() => {
        const start = (page - 1) * PAGE_SIZE;
        const end = Math.min(filteredMessages.length, start + PAGE_SIZE);
        const canShowFilter = context === 'inbox';
        return (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              Affichage {filteredMessages.length === 0 ? 0 : start + 1} à {end} sur {filteredMessages.length}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 border-r border-gray-200 pr-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:bg-gray-100" onClick={() => {
                  if (selectedMessageIds.size === filteredMessages.length && filteredMessages.length > 0) {
                    setSelectedMessageIds(new Set());
                  } else {
                    const newSet = new Set<number>();
                    filteredMessages.forEach(m => {
                      if (typeof m.id === 'number') newSet.add(m.id);
                    });
                    setSelectedMessageIds(newSet);
                  }
                }} title={selectedMessageIds.size === filteredMessages.length ? "Tout désélectionner" : "Tout sélectionner"}>
                  {selectedMessageIds.size > 0 && selectedMessageIds.size === filteredMessages.length ? <CheckSquare className="h-4 w-4 text-green-700" /> : <Square className="h-4 w-4" />}
                </Button>
                {onRefresh && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-600 hover:bg-gray-100" onClick={onRefresh} title="Actualiser">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                {onDelete && selectedMessageIds.size > 0 && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700 gap-1" onClick={handleBulkDelete} disabled={bulkDeleting} title={`Supprimer la sélection (${selectedMessageIds.size})`}>
                    <Trash2 className="h-4 w-4" />
                    <span>({selectedMessageIds.size})</span>
                  </Button>
                )}
              </div>
              {canShowFilter && (
                <Select value={listFilter} onValueChange={(v) => setListFilter(v as any)}>
                  <SelectTrigger className="h-8 w-[108px] rounded-lg border-gray-200 bg-white px-2.5 text-xs text-gray-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="w-[120px]">
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="unread">Non lus</SelectItem>
                    <SelectItem value="read">Lus</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canGoPrev}
                  aria-label="Page précédente"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-500 min-w-[40px] text-center">{page}/{totalPages}</span>
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={!canGoNext}
                  aria-label="Page suivante"
                >
                  ›
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <div className="flex-1 overflow-auto rounded-xl bg-gray-50/70 border border-gray-100 w-full p-2 sm:p-3 relative">
        {loading && !hasLoadedOnce && filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </p>
          </div>
        ) : filteredMessages.length ? (
          <div className="w-full space-y-2">
            {paginatedMessages.map((message, index) => {
              const { subject, content, timestamp, sender, hasAttachment, meta, isUnread } = getMessageDetails(message);
              const key = typeof message.id === "number" ? `msg-${message.id}` : `${page}-${index}`;
              const displayName = context === 'inbox'
                ? (sender || 'Inconnu')
                : (meta.replace('Destinataire : ', '') || 'Inconnu');
              const isSelected = typeof message.id === 'number' && selectedMessageIds.has(message.id);
              const hasCustomSubject = Boolean(subject && subject.toLowerCase() !== 'message interne');

              return (
                <article
                  key={key}
                  className={`group rounded-xl border transition-all cursor-pointer hover:border-gray-300 hover:shadow-sm ${
                    isSelected
                      ? 'border-green-300 bg-green-50/40 ring-1 ring-green-200'
                      : message.isPending
                        ? 'border-amber-200 bg-amber-50/60 border-l-4 border-l-amber-500'
                        : isUnread
                          ? 'border-gray-200 bg-white border-l-4 border-l-green-600 shadow-xs'
                          : 'border-gray-200/70 bg-white/80 hover:bg-white'
                  }`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return;
                    toggleOpen(message);
                    setSelectedMessage(message);
                  }}
                >
                  <div className="flex items-start gap-2.5 sm:gap-3 p-3 sm:px-4 sm:py-3.5">
                    {/* Checkbox */}
                    <div
                      className="shrink-0 pt-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (typeof message.id === 'number') {
                          const newSet = new Set(selectedMessageIds);
                          if (newSet.has(message.id)) {
                            newSet.delete(message.id);
                          } else {
                            newSet.add(message.id);
                          }
                          setSelectedMessageIds(newSet);
                        }
                      }}
                    >
                      <div className={`h-4 w-4 rounded border flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300 hover:border-gray-400'}`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                    </div>

                    {/* Avatar / Statut lu-non lu */}
                    <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${isUnread ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isUnread ? <MailIcon className="h-4 w-4" /> : <MailOpenIcon className="h-4 w-4" />}
                    </div>

                    {/* Bloc principal sur 2 lignes : jamais écrasé sur mobile, tablette ou PC */}
                    <div className="flex-1 min-w-0">
                      {/* Ligne 1 : Expéditeur/Destinataire + badges + Date */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {displayName}
                          </span>
                          {isUnread && (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
                              Nouveau
                            </span>
                          )}
                          {message.isPending && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                              <Clock className="h-2.5 w-2.5" />
                              En attente
                            </span>
                          )}
                        </div>
                        <span className={`shrink-0 text-[11px] sm:text-xs whitespace-nowrap ${isUnread ? 'font-semibold text-green-800' : 'text-gray-400'}`}>
                          {timestamp}
                        </span>
                      </div>

                      {/* Ligne 2 : Objet + Aperçu lisible du message + Badge pièce jointe */}
                      <div className="mt-1 flex items-start justify-between gap-2">
                        <p className={`text-xs sm:text-sm line-clamp-2 break-words leading-snug ${isUnread ? 'text-gray-800' : 'text-gray-500'}`}>
                          {hasCustomSubject && (
                            <span className="font-medium text-gray-900 mr-1.5">{subject} —</span>
                          )}
                          {content}
                        </p>
                        {hasAttachment && (
                          <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600" title="Contient une pièce jointe">
                            <Paperclip className="h-3 w-3" />
                            <span className="hidden sm:inline">PJ</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action rapide Supprimer */}
                    {onDelete && (
                      <div className="shrink-0 self-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          onClick={(e) => { e.stopPropagation(); requestDelete(message); }}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500">
            <MessageSquareIcon className="mb-3 h-12 w-12 opacity-30" />
            <p className="text-sm">{emptyLabel}</p>
          </div>
        )}
      </div>
      </>
      )}
      <MessageAttachmentViewer payload={preview} onClose={closePreview} />
      <Dialog
        open={!!replyFor}
        onOpenChange={(open) => {
          if (!open && !replySubmitting) {
            setReplyFor(null);
            setReplyContent("");
            setReplyRecipient("");
            setReplyAttachment(null);
            setReplyError(null);
            if (replyFileInputRef.current) replyFileInputRef.current.value = "";
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg max-h-[90dvh] p-0 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          {(() => {
            const sObj = typeof replyFor?.sender === 'object' && replyFor.sender ? (replyFor.sender as any) : null;
            const isSuper = Boolean(sObj?.isSuperAdmin);
            const fn = sObj?.firstName || (replyFor as any)?.senderFirstName || (replyFor as any)?.firstName || "";
            const ln = sObj?.lastName || (replyFor as any)?.senderLastName || (replyFor as any)?.lastName || "";
            const displayName = (replyFor as any)?.senderDisplayName || (replyFor as any)?.senderName || "";
            const recipientDisplay = isSuper
              ? "Équipe Support"
              : ([fn, ln].filter(Boolean).join(" ").trim() || displayName || replyRecipient || "l'expéditeur");
            const originalPreview = replyFor ? extractContent(replyFor) : "";
            const hasOriginalPreview =
              Boolean(originalPreview) && !/^\[?pi[èe]ce jointe\]?$/i.test(originalPreview.trim());
            const canSubmit = Boolean(replyRecipient.trim() && (replyContent.trim() || replyAttachment));

            return (
              <>
                {/* En-tête moderne */}
                <DialogHeader className="shrink-0 border-b border-gray-100 bg-gray-50/80 px-5 py-4 text-left">
                  <div className="flex items-center gap-3 pr-7 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-700 text-white font-bold uppercase shadow-xs">
                      {recipientDisplay.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <DialogTitle className="text-base font-semibold text-gray-900 truncate">
                        Répondre à {recipientDisplay}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-gray-500 mt-0.5">
                        Votre réponse sera envoyée directement à ce destinataire.
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                {/* Corps scrollable — zéro débordement sur téléphone */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                  {/* Rappel discret du message d'origine */}
                  {hasOriginalPreview && (
                    <div className="rounded-xl border border-green-100 border-l-4 border-l-green-600 bg-green-50/50 px-3.5 py-2.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-green-800 mb-0.5">
                        En réponse à
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2 break-words leading-snug">
                        {originalPreview}
                      </p>
                    </div>
                  )}

                  {/* Zone de saisie + compteur */}
                  <div className="space-y-1.5">
                    <label htmlFor="reply-message-textarea" className="text-sm font-medium text-gray-700 block">
                      Votre réponse
                    </label>
                    <div className="relative">
                      <textarea
                        id="reply-message-textarea"
                        className="w-full min-h-[120px] resize-none rounded-xl border border-gray-200 bg-gray-50/50 px-3.5 py-3 pb-7 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-green-600 focus:bg-white focus:ring-2 focus:ring-green-600/15"
                        rows={4}
                        maxLength={160}
                        value={replyContent}
                        onChange={(e) => {
                          setReplyContent(e.target.value);
                          setReplyError(null);
                        }}
                        placeholder="Écrivez votre réponse (160 caractères max)..."
                        disabled={replySubmitting}
                      />
                      <span className="pointer-events-none absolute bottom-2.5 right-3 text-[11px] text-gray-400">
                        {replyContent.length} / 160
                      </span>
                    </div>
                  </div>

                  {/* Input fichier caché + Aperçu pièce jointe */}
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        setReplyError("La pièce jointe ne doit pas dépasser 5 Mo.");
                        e.target.value = "";
                        return;
                      }
                      setReplyError(null);
                      setReplyAttachment(file);
                    }}
                  />

                  {replyAttachment && (
                    <div className="flex items-center justify-between gap-2.5 rounded-xl border border-green-200 bg-green-50/50 px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
                          <Paperclip className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-gray-900 truncate">
                            {replyAttachment.name}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {formatFileSize(replyAttachment.size)}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={replySubmitting}
                        onClick={() => {
                          setReplyAttachment(null);
                          if (replyFileInputRef.current) replyFileInputRef.current.value = "";
                        }}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Retirer la pièce jointe"
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  {replyError && (
                    <p className="text-xs font-medium text-red-600">{replyError}</p>
                  )}
                </div>

                {/* Pied de dialogue propre et adaptatif mobile/PC */}
                <div className="shrink-0 border-t border-gray-100 bg-gray-50/60 px-5 py-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <button
                      type="button"
                      disabled={replySubmitting}
                      onClick={() => replyFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-white px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-50/60 hover:border-green-400 transition-colors disabled:opacity-50"
                      title="Joindre un fichier ou une photo (5 Mo max)"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>Joindre un fichier</span>
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-4 border-gray-300 text-gray-700"
                        onClick={() => {
                          setReplyFor(null);
                          setReplyAttachment(null);
                          setReplyError(null);
                          if (replyFileInputRef.current) replyFileInputRef.current.value = "";
                        }}
                        disabled={replySubmitting}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-9 px-5 bg-green-700 hover:bg-green-800 text-white gap-1.5"
                        onClick={async () => {
                          const dest = replyRecipient.trim();
                          const body = replyContent.trim() || (replyAttachment ? "[Pièce jointe]" : "");
                          if (!dest || !body) return;
                          if (onReply) {
                            setReplySubmitting(true);
                            try {
                              await onReply({
                                recipientIdentifier: dest,
                                content: body,
                                attachment: replyAttachment,
                                original: replyFor as any,
                              });
                              setReplyFor(null);
                              setReplyContent("");
                              setReplyAttachment(null);
                              setReplyError(null);
                              if (replyFileInputRef.current) replyFileInputRef.current.value = "";
                            } finally {
                              setReplySubmitting(false);
                            }
                          }
                        }}
                        disabled={replySubmitting || !canSubmit}
                      >
                        {replySubmitting ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Envoi…</span>
                          </>
                        ) : (
                          <>
                            <SendIcon className="h-3.5 w-3.5" />
                            <span>Envoyer</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
      <Dialog open={!!forwardFor} onOpenChange={(open) => { if (!open) { setForwardFor(null); setSectorAgents([]); setSelectedSectorIds(new Set()); setSelectAllSectors(false); setForwardSubject(""); setForwardContent(""); setFreeIdentifiers(""); setForwardError(null); setSectorError(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transférer le message</DialogTitle>
            <DialogDescription>
              Sélectionnez les agents de secteur destinataires. Vous pouvez aussi l'envoyer à <b>tous les agents de secteur de votre région</b> en une seule fois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectAllSectors}
                onChange={(e) => setSelectAllSectors(e.target.checked)}
              />
              <span>Envoyer à tous les agents de secteur de votre région</span>
            </label>
            {!selectAllSectors && (
              <>
                {deptOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700 shrink-0">Département</label>
                    <Select
                      value={sectorDeptFilter || "__all__"}
                      onValueChange={(v) => setSectorDeptFilter(v === "__all__" ? "" : v)}
                    >
                      <SelectTrigger className="h-9 flex-1 bg-white text-sm">
                        <SelectValue placeholder="Tous" />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
                        <SelectItem value="__all__">Tous</SelectItem>
                        {deptOptions.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="max-h-48 overflow-auto rounded border p-2">
                  {sectorLoading ? (
                    <p className="text-sm text-gray-500">Chargement…</p>
                  ) : sectorError ? (
                    <p className="text-sm text-red-600">{sectorError}</p>
                  ) : sectorAgents.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun agent de secteur disponible</p>
                  ) : (
                    sectorAgents.map((a) => {
                      const checked = selectedSectorIds.has(a.id);
                      return (
                        <label key={a.id} className="flex items-center gap-2 text-sm py-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedSectorIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(a.id); else next.delete(a.id);
                                return next;
                              });
                            }}
                          />
                          <span>{a.label}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-sm text-gray-700">Autres destinataires (email / téléphone / identifiant / matricule, séparés par des virgules)</label>
              <input
                type="text"
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="ex: 770000000, agent.secteur@exemple.com, DIOP21"
                value={freeIdentifiers}
                onChange={(e) => setFreeIdentifiers(e.target.value)}
              />
              <p className="text-xs text-gray-500">Permet d'envoyer aussi à un guide, un guide de même chasseur, ou un chasseur en saisissant son email ou téléphone.</p>
            </div>
            <input
              type="text"
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Sujet (optionnel)"
              value={forwardSubject}
              onChange={(e) => setForwardSubject(e.target.value)}
            />
            <textarea
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Contenu (optionnel, sinon reprend l'original)"
              rows={4}
              value={forwardContent}
              onChange={(e) => setForwardContent(e.target.value)}
            />
            {forwardError && <p className="text-sm text-red-600">{forwardError}</p>}
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { setForwardFor(null); }} disabled={forwardSubmitting}>Annuler</Button>
            <Button
              onClick={async () => {
                if (!forwardFor?.id) return;
                setForwardSubmitting(true);
                setForwardError(null);
                try {
                  const id = forwardFor.id as number;
                  let ids: number[] = [];
                  if (selectAllSectors) {
                    ids = sectorAgents.map((a) => a.id).filter((n) => Number.isFinite(n) && n > 0);
                  } else {
                    ids = Array.from(selectedSectorIds.values());
                  }
                  const identifiers = freeIdentifiers
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (!ids.length && identifiers.length === 0) {
                    setForwardError('Veuillez sélectionner au moins un destinataire ou saisir un identifiant');
                    setForwardSubmitting(false);
                    return;
                  }
                  const resp = await authenticatedFetch(`/api/messages/${id}/forward`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ recipientIds: ids, recipientIdentifiers: identifiers, subject: forwardSubject || undefined, content: forwardContent || undefined }),
                  });
                  if (!resp.ok) {
                    const data = await resp.json().catch(() => ({} as any));
                    throw new Error(data?.message || 'Échec du transfert');
                  }
                  setForwardFor(null);
                } catch (err: any) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
                  setForwardError(err?.message || 'Échec du transfert');
                 } finally {
                  setForwardSubmitting(false);
                }
              }}
              disabled={forwardSubmitting}
            >
              {forwardSubmitting ? 'Transfert…' : 'Transférer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!readerDetailFor} onOpenChange={(open) => { if (!open) setReaderDetailFor(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Lecteurs</DialogTitle>
            <DialogDescription>
              {Array.isArray((readerDetailFor as any)?.readers) && (readerDetailFor as any).readers.length > 0 ? "Liste des lecteurs" : "Aucun lecteur"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {Array.isArray((readerDetailFor as any)?.readers) && ((readerDetailFor as any).readers as any[]).map((r, idx) => {
              const parts: string[] = [];
              const firstName = typeof r?.firstName === 'string' ? r.firstName.trim() : '';
              const lastName = typeof r?.lastName === 'string' ? r.lastName.trim() : '';
              const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
              if (fullName) {
                parts.push(fullName);
              } else if (typeof r?.name === 'string' && r.name.trim()) {
                parts.push(r.name.trim());
              }
              if (typeof r?.matricule === 'string' && r.matricule.trim()) parts.push(`Matricule ${r.matricule.trim()}`);
              if (typeof r?.role === 'string' && r.role.trim()) parts.push(r.role.trim());
              const assignment = (typeof r?.departement === 'string' && r.departement?.trim())
                ? `Département ${r.departement.trim()}`
                : (typeof r?.region === 'string' && r.region?.trim()) ? `Région ${r.region.trim()}` : '';
              if (assignment) parts.push(assignment);
              if (typeof r?.readAt === 'string' && r.readAt.trim()) parts.push(`Lu le ${formatDate(r.readAt)}`);
              else if (r?.readAt instanceof Date) parts.push(`Lu le ${formatDate(r.readAt.toISOString())}`);
              return (
                <div key={idx} className="text-sm text-gray-700">
                  {parts.join(' • ')}
                </div>
              );
            })}
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setReaderDetailFor(null)} variant="outline">Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!messageToDelete} onOpenChange={(open) => { if (!open) closeDeleteDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Cette action supprimera définitivement le message{messageToDelete?.isGroupMessage ? " de groupe" : ""} de votre boîte.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-red-600">{deleteError}</p>}
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closeDeleteDialog} disabled={deleting}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
