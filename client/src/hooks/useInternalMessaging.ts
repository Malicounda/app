import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  domaineId?: number;
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
  } catch (err) {
    // Ignore JSON parsing errors
  }
  return `Erreur ${response.status}`;
};

export function useInternalMessaging(options: UseInternalMessagingOptions = {}) {
  const { autoLoad = true, domaineId } = options;
  const queryClient = useQueryClient();
  const [inbox, setInbox] = useState<InternalMessageRecord[]>([]);
  const [sent, setSent] = useState<InternalMessageRecord[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const queryParams = domaineId ? `?domaineId=${domaineId}` : "";
      const [individualRes, groupRes] = await Promise.all([
        fetch(`/api/messages/inbox${queryParams}`, { credentials: "include" }),
        fetch(`/api/messages/group/inbox${queryParams}`, { credentials: "include" }),
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
      setInbox(sortMessagesByDate(merged));
      return merged;
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  const fetchSent = useCallback(async () => {
    setLoadingSent(true);
    try {
      const queryParams = domaineId ? `?domaineId=${domaineId}` : "";
      const response = await fetch(`/api/messages/sent${queryParams}`, { credentials: "include" });
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response));
      }
      const data = await response.json();
      const list: InternalMessageRecord[] = (Array.isArray(data) ? data : []).map((message) => ({
        ...message,
        isGroupMessage: message?.isGroupMessage === true,
      }));
      setSent(sortMessagesByDate(list));
      return list;
    } finally {
      setLoadingSent(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([fetchInbox(), fetchSent()]);
  }, [fetchInbox, fetchSent]);

  useEffect(() => {
    if (autoLoad) {
      void refreshAll();
    }
  }, [autoLoad, refreshAll]);

  const sendIndividual = useCallback(
    async ({ recipientIdentifier, content, subject = "Message", attachment }: SendInternalMessageParams) => {
      setSending(true);
      try {
        const formData = new FormData();
        formData.append("recipient", recipientIdentifier);
        formData.append("subject", subject);
        formData.append("content", content);
        if (attachment) {
          formData.append("attachment", attachment);
        }
        if (domaineId) {
          formData.append("domaineId", String(domaineId));
        }

        const response = await fetch("/api/messages/", {
          method: "POST",
          credentials: "include",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(await extractErrorMessage(response));
        }

        const data = await response.json();
        const created = (Array.isArray(data) ? data : [data]).map((message) => ({
          ...message,
          isGroupMessage: message?.isGroupMessage === true,
        })) as InternalMessageRecord[];
        setSent((prev) => sortMessagesByDate([...created, ...prev]));
        
        // Refresh depuis le serveur pour garantir la cohérence
        setTimeout(() => fetchSent(), 500);
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
        
        return created;
      } finally {
        setSending(false);
      }
    },
    []
  );

  const sendGroup = useCallback(
    async ({ targets, content, subject = "Message", attachment }: SendInternalGroupMessageParams) => {
      if (!targets.length) {
        throw new Error("Aucun groupe sélectionné");
      }
      setSending(true);
      try {
        const responses: InternalMessageRecord[][] = [];
        for (const target of targets) {
          const formData = new FormData();
          formData.append("subject", subject);
          formData.append("content", content);
          formData.append("targetRole", target.role);
          if (target.region) {
            formData.append("targetRegion", target.region);
          }
          if (attachment) {
            formData.append("attachment", attachment);
          }
          if (domaineId) {
            formData.append("domaineId", String(domaineId));
          }

          const response = await fetch("/api/messages/group", {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          if (!response.ok) {
            throw new Error(await extractErrorMessage(response));
          }
          const data = await response.json();
          const created = (Array.isArray(data) ? data : [data]).map((message) => ({
            ...message,
            isGroupMessage: true,
          })) as InternalMessageRecord[];
          responses.push(created);
        }
        const flattened = sortMessagesByDate(responses.flat());
        if (flattened.length) {
          setSent((prev) => sortMessagesByDate([...flattened, ...prev]));
        }
        
        // Refresh depuis le serveur pour garantir la cohérence
        setTimeout(() => fetchSent(), 500);
        queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
        
        return flattened;
      } finally {
        setSending(false);
      }
    },
    []
  );

  const removeMessageFromState = useCallback((id: number, isGroup: boolean) => {
    setInbox((prev) => prev.filter((message) => !(message.id === id && Boolean(message.isGroupMessage) === isGroup)));
    setSent((prev) => prev.filter((message) => !(message.id === id && Boolean(message.isGroupMessage) === isGroup)));
  }, []);

  const deleteMessageRecord = useCallback(
    async (message: InternalMessageRecord) => {
      const id = Number(message?.id);
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error("Identifiant de message invalide");
      }

      const isGroup = Boolean(message.isGroupMessage);
      const endpoint = isGroup ? `/api/messages/group/${id}/delete` : `/api/messages/${id}`;
      const method = isGroup ? "PATCH" : "DELETE";

      const response = await fetch(endpoint, {
        method,
        credentials: "include",
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(await extractErrorMessage(response));
      }

      removeMessageFromState(id, isGroup);
      // Forcer un rafraîchissement serveur pour garantir la cohérence
      await refreshAll();
      queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
    },
    [removeMessageFromState, refreshAll, queryClient]
  );

  const markMessageAsRead = useCallback(async (messageId: number) => {
    const response = await fetch(`/api/messages/${messageId}/read`, {
      method: "PATCH",
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error(await extractErrorMessage(response));
    }
    setInbox((prev) => prev.map((msg) => (msg.id === messageId ? { ...msg, isRead: true } : msg)));
    queryClient.invalidateQueries({ queryKey: ['messages-unread-count'] });
  }, [queryClient]);

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
    markMessageAsRead,
    deleteMessage: deleteMessageRecord,
    setInbox,
    setSent,
  };
}
