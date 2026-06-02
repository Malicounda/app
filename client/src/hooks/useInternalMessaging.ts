import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authenticatedFetch } from "@/lib/authenticatedFetch";
import { dismissSystemNotification } from "./use-notifications";
import { createOfflineMessage } from "@/lib/offlineCrud";

export interface InternalMessagingTarget {
  role: string;
  region?: string;
}

export interface SendInternalMessageParams {
  recipientIdentifier: string;
  content: string;
  subject?: string;
  attachment?: File | null;
}

export interface SendInternalGroupMessageParams {
  targets: InternalMessagingTarget[];
  content: string;
  subject?: string;
  attachment?: File | null;
}

interface UseInternalMessagingOptions {
  autoLoad?: boolean;
  domaineId?: number | "null";
}

export interface InternalMessageRecord {
  id: number;
  createdAt?: string;
  created_at?: string;
  isGroupMessage?: boolean;
  [key: string]: unknown;
}

const sortMessagesByDate = (messages: InternalMessageRecord[]) =>
  messages
    .slice()
    .sort((a, b) => {
      const dateA = a.createdAt || (typeof a.created_at === "string" ? a.created_at : undefined);
      const dateB = b.createdAt || (typeof b.created_at === "string" ? b.created_at : undefined);
      const timeA = dateA ? new Date(dateA).getTime() : 0;
      const timeB = dateB ? new Date(dateB).getTime() : 0;
      return timeB - timeA;
    });

const extractErrorMessage = async (response: Response) => {
  try {
    const data = await response.json();
    if (data?.message) return data.message as string;
  } catch (err) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
    // Ignore JSON parsing errors
   }
  return `Erreur ${response.status}`;
};

// ── LocalStorage cache helpers ────────────────────────────────────────────────
const getCacheKey = (type: "inbox" | "sent", domaineId?: number | "null") =>
  `msg_cache_${type}_${domaineId ?? "all"}`;

const loadFromCache = (type: "inbox" | "sent", domaineId?: number | "null"): InternalMessageRecord[] => {
  try {
    const raw = localStorage.getItem(getCacheKey(type, domaineId));
    if (!raw) return [];
    return JSON.parse(raw) as InternalMessageRecord[];
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    return [];
   }
};

const saveToCache = (type: "inbox" | "sent", domaineId: number | "null" | undefined, data: InternalMessageRecord[]) => {
  try {
    localStorage.setItem(getCacheKey(type, domaineId), JSON.stringify(data));
  } catch (e) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', e);
    // Ignore quota errors
   }
};
// ─────────────────────────────────────────────────────────────────────────────

export function useInternalMessaging(options: UseInternalMessagingOptions = {}) {
  const { autoLoad = true, domaineId } = options;
  const queryClient = useQueryClient();

  // Initialize state from localStorage cache immediately so data is visible
  // on first render even before the network request completes.
  const [inbox, setInbox] = useState<InternalMessageRecord[]>(() =>
    loadFromCache("inbox", domaineId)
  );
  const [sent, setSent] = useState<InternalMessageRecord[]>(() =>
    loadFromCache("sent", domaineId)
  );
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const queryParams = domaineId ? `?domaineId=${domaineId}` : "";
      const [individualRes, groupRes] = await Promise.all([
        authenticatedFetch(`/api/messages/inbox${queryParams}`),
        authenticatedFetch(`/api/messages/group/inbox${queryParams}`),
      ]);

      if (!individualRes.ok) {
        throw new Error(await extractErrorMessage(individualRes));
      }
      if (!groupRes.ok) {
        throw new Error(await extractErrorMessage(groupRes));
      }

      const [individualData, groupData] = await Promise.all([
        individualRes.json(),
        groupRes.json(),
      ]);

      const normalizeGroup = (Array.isArray(groupData) ? groupData : []).map((message) => ({
        ...message,
        isGroupMessage: true,
      })) as InternalMessageRecord[];

      const normalizeIndividual = (Array.isArray(individualData) ? individualData : []).map((message) => ({
        ...message,
        isGroupMessage: message?.isGroupMessage === true,
      })) as InternalMessageRecord[];

      const merged: InternalMessageRecord[] = [...normalizeIndividual, ...normalizeGroup];
      const sorted = sortMessagesByDate(merged);
      setInbox(sorted);
      // Persist to cache so the next mount shows data instantly
      saveToCache("inbox", domaineId, sorted);
      return merged;
    } catch (err) {
      // Network failure — keep existing cached state, don't wipe the inbox
      console.warn("[useInternalMessaging] fetchInbox failed, keeping cached data:", err);
      throw err;
    } finally {
      setLoadingInbox(false);
    }
  }, [domaineId]);

  const fetchSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      const queryParams = domaineId ? `?domaineId=${domaineId}` : "";
      const response = await authenticatedFetch(`/api/messages/sent${queryParams}`);
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const data = await response.json();
      const list: InternalMessageRecord[] = (Array.isArray(data) ? data : []).map((message) => ({
        ...message,
        isGroupMessage: message?.isGroupMessage === true,
      }));
      const sorted = sortMessagesByDate(list);
      setSent(sorted);
      // Persist to cache
      saveToCache("sent", domaineId, sorted);
      return list;
    } catch (err) {
      // Network failure — keep existing cached state
      console.warn("[useInternalMessaging] fetchSent failed, keeping cached data:", err);
      throw err;
    } finally {
      setLoadingSent(false);
    }
  }, [domaineId]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchInbox(), fetchSent()]);
  }, [fetchInbox, fetchSent]);

  useEffect(() => {
    if (autoLoad) {
      void refreshAll();
      const interval = setInterval(() => {
        void refreshAll();
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [autoLoad, refreshAll]);

  useEffect(() => {
    const handleRefreshAll = () => {
      console.log("[useInternalMessaging] Refreshing message list due to custom refresh event");
      void refreshAll();
    };

    window.addEventListener('messaging-refresh-all', handleRefreshAll);
    return () => {
      window.removeEventListener('messaging-refresh-all', handleRefreshAll);
    };
  }, [refreshAll]);

  const sendIndividual = useCallback(
    async ({ recipientIdentifier, content, subject = "Message", attachment }: SendInternalMessageParams) => {
      setSending(true);
      try {
        const formData = new FormData();
        formData.append("recipient", recipientIdentifier);
        formData.append("subject", subject);
        formData.append("content", content);
        if (attachment) {
          formData.append("attachment", attachment, attachment.name);
        }
        if (domaineId) {
          formData.append("domaineId", String(domaineId));
        }

        let isOffline = !navigator.onLine;
        let data: any = null;

        if (!isOffline) {
          try {
            const response = await authenticatedFetch("/api/messages/", {
              method: "POST",
              body: formData,
            });
            if (!response.ok) {
              throw new Error(await extractErrorMessage(response));
            }
            data = await response.json();
          } catch (err: any) {
            const msg = String(err?.message || '');
            if (msg.includes('fetch') || msg.includes('Network') || msg.includes('network') || msg.includes('survenue')) {
              isOffline = true;
            } else {
              throw err;
            }
          }
        }

        let created: InternalMessageRecord[];
        if (isOffline) {
          await createOfflineMessage(
            { recipient: recipientIdentifier, subject, content, domaineId: domaineId ? String(domaineId) : undefined },
            attachment ? [attachment] : []
          );
          data = { offlineQueued: true };
        }

        if (data.offlineQueued) {
          const tempMsg: InternalMessageRecord = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            content,
            subject,
            createdAt: new Date().toISOString(),
            isPending: true, // Custom flag for offline queue
            recipientIdentifier,
            isGroupMessage: false,
          };
          created = [tempMsg];
        } else {
          created = (Array.isArray(data) ? data : [data]).map((message) => ({
            ...message,
            isGroupMessage: message?.isGroupMessage === true,
          })) as InternalMessageRecord[];
        }

        setSent((prev) => {
          const updated = sortMessagesByDate([...created, ...prev]);
          saveToCache("sent", domaineId, updated);
          return updated;
        });
        
        // Refresh depuis le serveur pour garantir la cohérence
        if (!isOffline) setTimeout(() => fetchSent(), 500);
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
        
        return created;
      } catch (err) {
        console.error("[useInternalMessaging] sendIndividual error:", err);
        throw err;
      } finally {
        setSending(false);
      }
    },
    [domaineId, fetchSent, queryClient]
  );

  const editMessage = useCallback(async (messageId: number, newContent: string) => {
    try {
      const response = await authenticatedFetch(`/api/messages/${messageId}/content`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent })
      });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const updatedData = await response.json();
      
      // Update local state for sent messages
      setSent((prev) => {
        const updated = prev.map(m => {
          if (m.id === messageId) {
            const rawObj = typeof m.rawMsgObj === 'object' && m.rawMsgObj !== null ? { ...m.rawMsgObj, content: newContent } : { content: newContent };
            return { ...m, content: newContent, rawMsgObj: rawObj };
          }
          return m;
        });
        saveToCache("sent", domaineId, updated);
        return updated;
      });

      return updatedData;
    } catch (err) {
      console.error("[useInternalMessaging] editMessage error:", err);
      throw err;
    }
  }, [domaineId]);

  const sendGroup = useCallback(
    async ({ targets, content, subject = "Message", attachment }: SendInternalGroupMessageParams) => {
      if (!targets.length) {
        throw new Error("Aucun groupe sélectionné");
      }
      setSending(true);
      try {
        const promises = targets.map(async (target) => {
          const formData = new FormData();
          formData.append("subject", subject);
          formData.append("content", content);
          formData.append("targetRole", target.role);
          if (target.region) {
            formData.append("targetRegion", target.region);
          }
          if (attachment) {
            formData.append("attachment", attachment, attachment.name);
          }
          if (domaineId) {
            formData.append("domaineId", String(domaineId));
          }

          let isOffline = !navigator.onLine;
          let data: any = null;

          if (!isOffline) {
            try {
              const response = await authenticatedFetch("/api/messages/group", {
                method: "POST",
                body: formData,
              });
              if (!response.ok) {
                throw new Error(await extractErrorMessage(response));
              }
              data = await response.json();
            } catch (err: any) {
              const msg = String(err?.message || '');
              if (msg.includes('fetch') || msg.includes('Network') || msg.includes('network') || msg.includes('survenue')) {
                isOffline = true;
              } else {
                throw err;
              }
            }
          }

          if (isOffline) {
            await createOfflineMessage(
              { targetRole: target.role, targetRegion: target.region, subject, content, domaineId: domaineId ? String(domaineId) : undefined, isGroupMessage: true },
              attachment ? [attachment] : []
            );
            data = { offlineQueued: true };
          }

          if (data.offlineQueued) {
            return [{
              id: Date.now() + Math.floor(Math.random() * 1000),
              content,
              subject,
              createdAt: new Date().toISOString(),
              isPending: true,
              targetRole: target.role,
              targetRegion: target.region,
              isGroupMessage: true,
            }] as InternalMessageRecord[];
          }
          return (Array.isArray(data) ? data : [data]).map((message) => ({
            ...message,
            isGroupMessage: true,
          })) as InternalMessageRecord[];
        });
        const responses = await Promise.all(promises);
        const flattened = sortMessagesByDate(responses.flat());
        if (flattened.length) {
          setSent((prev) => {
            const updated = sortMessagesByDate([...flattened, ...prev]);
            saveToCache("sent", domaineId, updated);
            return updated;
          });
        }
        
        // Refresh depuis le serveur pour garantir la cohérence
        if (navigator.onLine) setTimeout(() => fetchSent(), 500);
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
        
        return flattened;
      } finally {
        setSending(false);
      }
    },
    [domaineId, fetchSent, queryClient]
  );

  const removeMessageFromState = useCallback((id: number, isGroup: boolean) => {
    setInbox((prev) => {
      const updated = prev.filter((message) => !(message.id === id && Boolean(message.isGroupMessage) === isGroup));
      saveToCache("inbox", domaineId, updated);
      return updated;
    });
    setSent((prev) => {
      const updated = prev.filter((message) => !(message.id === id && Boolean(message.isGroupMessage) === isGroup));
      saveToCache("sent", domaineId, updated);
      return updated;
    });
  }, [domaineId]);

  const purgeStaleMessage = useCallback(
    (id: number, isGroup?: boolean) => {
      removeMessageFromState(id, Boolean(isGroup));
    },
    [removeMessageFromState]
  );

  const deleteMessageRecord = useCallback(
    async (message: InternalMessageRecord) => {
      const id = Number(message?.id);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error("Identifiant de message invalide");
      }

      const isGroup = Boolean(message.isGroupMessage);
      const endpoint = isGroup ? `/api/messages/group/${id}/delete` : `/api/messages/${id}`;
      const method = isGroup ? "PATCH" : "DELETE";

      try {
        await apiRequest({ url: endpoint, method });
      } catch (err: unknown) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
        const e = err as { message?: string; status?: number  };
        const msg = String(e?.message || '').toLowerCase();
        if (e?.status === 404 || msg.includes('non trouvé')) {
          purgeStaleMessage(id, isGroup);
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
          queryClient.invalidateQueries({ queryKey: ['messages-unread-count-launcher-badge'] });
          window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
          return;
        }
        throw err;
      }

      removeMessageFromState(id, isGroup);
      await refreshAll();
      queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
      queryClient.invalidateQueries({ queryKey: ['messages-unread-count-launcher-badge'] });
      window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
    },
    [removeMessageFromState, purgeStaleMessage, refreshAll, queryClient]
  );

  const markMessageAsRead = useCallback(async (messageId: number, isGroup?: boolean) => {
    const endpoint = isGroup
      ? `/api/messages/group/${messageId}/read`
      : `/api/messages/${messageId}/read`;
    try {
      await apiRequest({ url: endpoint, method: 'PATCH' });
    } catch (err: unknown) { if (import.meta.env.DEV) console.warn('[SCODI-DEBUG] Silenced error', err);
      const e = err as { message?: string; status?: number  };
      const msg = String(e?.message || '').toLowerCase();
      if (e?.status === 404 || msg.includes('non trouvé')) {
        purgeStaleMessage(messageId, isGroup);
        return;
      }
      throw err;
    }
    // Supprimer la notification système Android correspondante
    void dismissSystemNotification('MESSAGE', messageId);
    setInbox((prev) => {
      const updated = prev.map((msg) =>
        msg.id === messageId ? { ...msg, isRead: true, is_read: true } : msg
      );
      saveToCache("inbox", domaineId, updated);
      return updated;
    });
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count-alerte'] });
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count-main'] });
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count-supervisor-home'] });
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count-launcher-badge'] });
    window.dispatchEvent(new CustomEvent('launcher-badge-refresh'));
  }, [queryClient, domaineId, purgeStaleMessage]);

  const state = useMemo(
    () => ({
      inbox,
      sent,
      loadingInbox,
      loadingSent,
      sending,
    }),
    [inbox, sent, loadingInbox, loadingSent, sending]
  );

  return {
    ...state,
    refreshInbox: fetchInbox,
    refreshSent: fetchSent,
    refreshAll,
    sendIndividual,
    sendGroup,
    editMessage,
    markMessageAsRead,
    deleteMessage: deleteMessageRecord,
    purgeStaleMessage,
    setInbox,
    setSent,
  };
}
