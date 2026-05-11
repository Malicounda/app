import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { InternalMessageRecord } from "@/hooks/useInternalMessaging";
import { useQueryClient } from "@tanstack/react-query";
import { Mail as MailIcon, MailOpen as MailOpenIcon, MessageSquareIcon, Share2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

interface InternalMessageListProps {
  messages: InternalMessageRecord[];
  loading?: boolean;
  emptyLabel: string;
  onDelete?: (message: InternalMessageRecord) => Promise<void> | void;
  context?: 'inbox' | 'sent';
  onReply?: (payload: { recipientIdentifier: string; content: string; original: InternalMessageRecord }) => Promise<void> | void;
}

interface AttachmentPreview {
  name?: string | null;
  url: string;
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

export default function InternalMessageList({ messages, loading, emptyLabel, onDelete, context = 'inbox', onReply }: InternalMessageListProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // Toujours utiliser un tableau pour éviter les erreurs quand la prop n'est pas un Array
  const safeMessages: InternalMessageRecord[] = Array.isArray(messages) ? messages : [];
  const normalizedRole = (user?.role || '').toLowerCase();
  const [listFilter, setListFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [preview, setPreview] = useState<AttachmentPreview | null>(null);
  const hasPreview = !!preview;
  const [messageToDelete, setMessageToDelete] = useState<InternalMessageRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [readerDetailFor, setReaderDetailFor] = useState<InternalMessageRecord | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 5;
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
  const [replySubmitting, setReplySubmitting] = useState(false);

  const filteredMessages = useMemo(() => {
    if (context !== 'inbox') return safeMessages;
    if (listFilter === 'all') return safeMessages;
    if (listFilter === 'unread') return safeMessages.filter((m: any) => m?.isRead === false);
    return safeMessages.filter((m: any) => m?.isRead !== false);
  }, [context, safeMessages, listFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMessages.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [filteredMessages]);

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
          const resp = await fetch('/api/messages/agents?role=sector', { credentials: 'include' });
          if (!resp.ok) throw new Error('Échec du chargement des agents de secteur');
          const data = await resp.json();
          const arr = Array.isArray(data) ? data : [];
          setSectorAgents(arr.map((u: any) => ({ id: Number(u.id), label: String((u.label || `#${u.id}`) + (u.departement ? ` — ${u.departement}` : '')) })));
          const depts = Array.from(new Set(arr.map((u: any) => String(u.departement || '').trim()).filter(Boolean)));
          setDeptOptions(depts);
        } catch (e: any) {
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
        const resp = await fetch(`/api/messages/agents?role=sector${qs}`, { credentials: 'include' });
        if (!resp.ok) throw new Error('Échec du chargement des agents de secteur');
        const data = await resp.json();
        const arr = Array.isArray(data) ? data : [];
        setSectorAgents(arr.map((u: any) => ({ id: Number(u.id), label: String((u.label || `#${u.id}`) + (u.departement ? ` — ${u.departement}` : '')) })));
      } catch (e: any) {
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
        await fetch(endpoint, { method: 'PATCH', credentials: 'include' });
        // Invalidation immédiate pour mettre à jour les badges (Sidebar/Layout)
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
      } catch (e) {
        // silencieux
      }
    }
  };

  const isImagePreview = useMemo(() => {
    if (!preview) return false;
    if (preview.mime) return preview.mime.startsWith("image/");
    return preview.name ? /\.(png|jpe?g|gif|bmp|webp)$/i.test(preview.name) : false;
  }, [preview]);

  const isPdfPreview = useMemo(() => {
    if (!preview) return false;
    if (preview.mime) return preview.mime === "application/pdf";
    return preview.name ? /\.pdf$/i.test(preview.name) : false;
  }, [preview]);

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
    const displayName = (message.attachmentName as string | undefined) ?? "Pièce jointe";
    const messageId = message.id;
    if (!messageId) return;

    // Construire l'URL correcte vers l'endpoint API de téléchargement
    const isGroupMessage = Boolean(message.isGroupMessage);
    const endpoint = isGroupMessage
      ? `/api/messages/group/${messageId}/attachment`
      : `/api/messages/${messageId}/attachment`;

    const sizeValue = typeof message.attachmentSize === "number" ? message.attachmentSize : Number(message.attachmentSize ?? 0) || null;
    setPreview({
      name: displayName,
      url: endpoint,
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
    } catch (error: any) {
      const message = error?.message ?? error?.toString?.() ?? "Une erreur est survenue lors de la suppression.";
      setDeleteError(message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col">
      {(() => {
        const start = (page - 1) * PAGE_SIZE;
        const end = Math.min(filteredMessages.length, start + PAGE_SIZE);
        const canShowFilter = context === 'inbox';
        return (
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">
              Affichage {filteredMessages.length === 0 ? 0 : start + 1} à {end} sur {filteredMessages.length}
            </span>
            <div className="flex items-center gap-2">
              {canShowFilter && (
                <select
                  className="h-8 rounded-full border border-gray-200 bg-white px-3 text-xs text-gray-700"
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value as any)}
                >
                  <option value="all">Tous</option>
                  <option value="unread">Non lus</option>
                  <option value="read">Lus</option>
                </select>
              )}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={!canGoPrev}
                  aria-label="Page précédente"
                >
                  ‹
                </button>
                <span className="text-xs text-gray-500 min-w-[44px] text-center">{page}/{totalPages}</span>
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40"
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
      <div className="flex-1 overflow-auto rounded-md bg-gray-50 w-full p-3">
        {loading ? (
          <p className="text-sm text-gray-500">Chargement…</p>
        ) : filteredMessages.length ? (
          <div className="w-full space-y-3">
            {paginatedMessages.map((message, index) => {
              const isGroupKey = Boolean((message as any)?.isGroupMessage);
              const key = typeof message.id === "number"
                ? `${isGroupKey ? 'group' : 'msg'}-${message.id}`
                : `${page}-${index}`;
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

              const senderObj = typeof message.sender === "object" && message.sender ? (message.sender as Record<string, unknown>) : null;
              const isGroupMsg = Boolean(message.isGroupMessage);
              // Rôle de l'expéditeur
              const senderRoleRaw = (() => {
                if (isGroupMsg && senderObj && typeof senderObj.role === "string" && senderObj.role.trim()) {
                  return (senderObj.role as string).trim();
                }
                for (const key of SENDER_ROLE_KEYS) {
                  const value = message[key];
                  if (typeof value === "string" && value.trim()) return value.trim();
                }
                return null;
              })();

              const senderRoleLabel = senderRoleRaw ? SENDER_ROLE_LABELS[senderRoleRaw] : undefined;
              const senderFirstName = typeof senderObj?.firstName === "string" ? senderObj.firstName.trim() :
                (typeof message.senderFirstName === "string" ? message.senderFirstName.trim() : undefined);
              const senderLastName = typeof senderObj?.lastName === "string" ? senderObj.lastName.trim() :
                (typeof message.senderLastName === "string" ? message.senderLastName.trim() : undefined);
              const senderBase = !isGroupMsg ? extractFirstString(message, SENDER_KEYS) : null;
              const senderName = [senderFirstName, senderLastName].filter(isNonEmptyString).join(" ");
              const sender = senderRoleLabel
                ? `${senderRoleLabel}${senderName ? ` • ${senderName}` : ""}`
                : (senderName || senderBase);

              const attachmentName = extractFirstString(message, ["attachmentName", "attachment_name"]) ?? (message.attachmentPath as string | undefined) ?? null;
              const attachmentSizeRaw = typeof message.attachmentSize === "number" ? message.attachmentSize : Number(message.attachmentSize ?? 0);
              const attachmentSize = Number.isFinite(attachmentSizeRaw) && attachmentSizeRaw > 0 ? attachmentSizeRaw : null;
              const hasAttachment = isNonEmptyString(attachmentName);

              const metaParts = [] as string[];
              // Cacher l'expéditeur dans la vue Envoyés
              if (context !== 'sent') {
                if (sender) {
                  metaParts.push(`Expéditeur : ${sender}`);
                }
              }
              if (context === 'sent') {
                // Build enriched recipient label for sent messages
                let roleLabel: string | undefined;
                if (recipientRoleRaw === 'sub-agent') {
                  roleLabel = 'Agent secteur';
                } else if (recipientRoleRaw === 'agent') {
                  roleLabel = 'Agent IREF';
                }
                const targetRole = (message as any)?.targetRole as string | undefined;
                const looksLikeAdmin = (recipientRoleRaw === 'admin') || (typeof targetRole === 'string' && targetRole.toLowerCase() === 'admin') || (typeof (recipient || recipientName) === 'string' && /admin/i.test(String(recipient || recipientName)));
                if (looksLikeAdmin) {
                  metaParts.push('Destinataire : Admin');
                } else {
                  const assignmentParts: string[] = [];
                  if (recipientDept) assignmentParts.push(`Département ${recipientDept}`);
                  if (recipientRegion) assignmentParts.push(`Région ${recipientRegion}`);
                  const assignment = assignmentParts.join(' / ');
                  const baseName = recipientName || recipient || undefined;
                  const composed = [baseName, roleLabel, assignment ? `— ${assignment}` : ''].filter(isNonEmptyString).join(' ');
                  if (composed) {
                    metaParts.push(`Destinataire : ${composed}`);
                  } else {
                    const isRegionalAgent = normalizedRole === 'agent' && (user as any)?.type !== 'secteur';
                    if (isRegionalAgent) metaParts.push('Destinataire : Admin');
                  }
                }
              }
              const meta = metaParts.join(" • ");

              const isInbox = context === 'inbox';
              const numericId = typeof message.id === 'number' ? message.id : NaN;
              const isOpen = isInbox && Number.isFinite(numericId) ? openedIds.has(numericId as number) : true;
              const isUnread = isInbox && (message as any)?.isRead === false && !(Number.isFinite(numericId) && openedRef.current.has(numericId as number));
              return (
                <article
                  key={key}
                  className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${isUnread ? 'border-l-4 border-l-green-600' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isUnread ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {isUnread ? (
                        <MailIcon className="h-5 w-5" />
                      ) : (
                        <MailOpenIcon className="h-5 w-5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-gray-800 truncate">
                              {subject || "Message interne"}
                            </h3>
                            {isUnread && context === 'inbox' && (
                              <span className="rounded-full bg-green-100 text-green-800 text-[11px] px-2 py-0.5">Nouveau</span>
                            )}
                            {context === 'sent' ? (
                              Array.isArray((message as any).readers) && (message as any).readers.length > 0 ? (
                                <span className="rounded-full bg-green-100 text-green-700 text-[11px] px-2 py-0.5">Lu</span>
                              ) : (
                                <span className="rounded-full bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5">Non lu</span>
                              )
                            ) : null}
                          </div>
                          {meta ? (
                            <div className="text-xs text-gray-500 truncate mt-0.5">{meta}</div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-500">{timestamp}</span>
                        </div>
                      </div>

                      {context === 'inbox' ? (
                        <button
                          type="button"
                          className="mt-2 text-left w-full"
                          onClick={() => toggleOpen(message)}
                          aria-label={isOpen ? 'Fermer le message' : 'Ouvrir le message'}
                        >
                          {isOpen && (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap break-words text-justify leading-relaxed">
                              {wrapByWords(content, 20)}
                            </p>
                          )}
                        </button>
                      ) : (
                        isOpen && (
                          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words text-justify leading-relaxed">
                            {wrapByWords(content, 20)}
                          </p>
                        )
                      )}

                      <div className={`mt-3 flex items-center gap-2 ${context === 'sent' ? 'justify-end' : 'justify-between'}`}>
                        <div className={`flex items-center gap-1 ${context === 'sent' ? 'ml-auto' : ''}`}>
                          {context === 'inbox' && normalizedRole !== 'hunter' && normalizedRole !== 'hunting-guide' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-gray-600 hover:text-gray-800"
                              onClick={() => { setForwardFor(message); setForwardSubject(subject || ""); setForwardContent(""); setForwardError(null); }}
                              title="Transférer"
                              aria-label="Transférer"
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDelete(message);
                              }}
                              title="Supprimer"
                              aria-label="Supprimer"
                            >
                              <Trash2 className="h-5 w-5" />
                            </Button>
                          )}
                        </div>

                        {context === 'inbox' && (normalizedRole === 'admin' || (normalizedRole === 'agent' && (user as any)?.type !== 'secteur')) && (
                          <Button
                            variant="outline"
                            className="h-8 rounded-full border-green-200 text-green-700 hover:bg-green-50"
                            onClick={() => {
                              setReplyFor(message);
                              const senderObj = typeof message.sender === 'object' && message.sender ? (message.sender as any) : null;

                              const identifier = (
                                (typeof senderObj?.username === 'string' && senderObj.username.trim())
                                || (typeof (message as any).senderUsername === 'string' && String((message as any).senderUsername).trim())
                                || (typeof senderObj?.email === 'string' && senderObj.email.trim())
                                || (typeof (senderObj as any)?.matricule === 'string' && String((senderObj as any).matricule).trim())
                                || (typeof (message as any)?.senderId === 'number' && Number.isFinite((message as any).senderId) ? String((message as any).senderId) : '')
                              ) as string;

                              setReplyRecipient(identifier);
                              setReplyContent('');
                            }}
                          >
                            Répondre
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                  {hasAttachment && isOpen && (
                    <div className={`mt-3 flex flex-col items-start gap-1 ${context === 'inbox' ? 'pl-12' : ''}`}>
                      <p className="text-xs text-gray-500">
                        Pièce jointe : {attachmentName}
                        {attachmentSize ? ` (${formatFileSize(attachmentSize)})` : ""}
                      </p>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm"
                        onClick={() => openAttachmentPreview(message)}
                      >
                        Aperçu
                      </Button>
                    </div>
                  )}
                  {context === 'sent' && Array.isArray((message as any).readers) && (message as any).readers.length > 0 && (
                    <div className="mt-2 flex justify-end">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-sm text-green-700"
                        onClick={() => setReaderDetailFor(message)}
                      >
                        Détails
                      </Button>
                    </div>
                  )}
                  {onDelete && null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center text-center text-gray-500">
            <MessageSquareIcon className="mb-3 h-12 w-12 opacity-40" />
            <p className="text-sm">{emptyLabel}</p>
          </div>
        )}
      </div>
      <Dialog open={hasPreview} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Pièce jointe</DialogTitle>
            <DialogDescription>
              {preview?.name || "Aperçu de la pièce jointe"}
              {preview?.size ? ` • ${formatFileSize(preview.size)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-4">
              {isImagePreview ? (
                <img
                  src={preview.url}
                  alt={preview.name ?? "Pièce jointe"}
                  className="max-h-[60vh] w-full rounded-md object-contain"
                />
              ) : isPdfPreview ? (
                <iframe
                  title={preview.name ?? "Document PDF"}
                  src={preview.url}
                  className="h-[60vh] w-full rounded-md border"
                />
              ) : (
                <p className="text-sm text-gray-600">
                  Aperçu non disponible pour ce type de fichier. Vous pouvez le télécharger pour le consulter.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={closePreview}>
              Fermer
            </Button>
            {preview?.url && (
              <Button asChild>
                <a
                  href={`${preview.url}?download=1`}
                  download={preview.name ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Télécharger
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!replyFor} onOpenChange={(open) => { if (!open) { setReplyFor(null); setReplyContent(""); setReplyRecipient(""); setReplySubmitting(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Répondre à {(() => {
              // Extraction robuste du nom de l'expéditeur
              const sObj = typeof replyFor?.sender === 'object' && replyFor.sender ? (replyFor.sender as any) : null;
              const fn = sObj?.firstName || (replyFor as any)?.senderFirstName || (replyFor as any)?.firstName || "";
              const ln = sObj?.lastName || (replyFor as any)?.senderLastName || (replyFor as any)?.lastName || "";
              const displayName = (replyFor as any)?.senderDisplayName || (replyFor as any)?.senderName || "";
              const name = [fn, ln].filter(Boolean).join(" ").trim() || displayName;
              return name || replyRecipient || "l'expéditeur";
            })()}</DialogTitle>
            <DialogDescription>
              Votre réponse sera envoyée directement à cette personne.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm text-gray-700">Votre réponse</label>
              <textarea
                className="w-full rounded border px-3 py-2 text-sm"
                rows={5}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Écrivez votre message"
              />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => { setReplyFor(null); }} disabled={replySubmitting}>Annuler</Button>
            <Button
              onClick={async () => {
                const dest = replyRecipient.trim();
                const body = replyContent.trim();
                if (!dest || !body) return;
                if (onReply) {
                  setReplySubmitting(true);
                  try {
                    await onReply({ recipientIdentifier: dest, content: body, original: replyFor as any });
                    setReplyFor(null);
                  } finally {
                    setReplySubmitting(false);
                  }
                }
              }}
              disabled={replySubmitting || !replyRecipient.trim() || !replyContent.trim()}
            >
              {replySubmitting ? 'Envoi…' : 'Envoyer'}
            </Button>
          </DialogFooter>
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
                  <label className="text-sm text-gray-700">Département</label>
                  <select
                    className="rounded border px-2 py-1 text-sm"
                    value={sectorDeptFilter}
                    onChange={(e) => setSectorDeptFilter(e.target.value)}
                  >
                    <option value="">Tous</option>
                    {deptOptions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
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
                  const resp = await fetch(`/api/messages/${id}/forward`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ recipientIds: ids, recipientIdentifiers: identifiers, subject: forwardSubject || undefined, content: forwardContent || undefined }),
                  });
                  if (!resp.ok) {
                    const data = await resp.json().catch(() => ({} as any));
                    throw new Error(data?.message || 'Échec du transfert');
                  }
                  setForwardFor(null);
                } catch (err: any) {
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
