"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantConversation,
  AssistantConversationDetail,
  AssistantConversationPage,
  AssistantConversationReceipt,
} from "@asmblyr-collaborative/contracts";

async function historyRequest<T>(
  path: string,
  method = "GET",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api/assistant/conversations" + path, {
    method,
    cache: "no-store",
    signal,
    ...(method === "POST"
      ? { headers: { "content-type": "application/json" }, body: "{}" }
      : {}),
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "Не удалось загрузить историю.");
  }
  return result.data;
}

export function useAssistantHistory(
  open: boolean,
  restore: (detail: AssistantConversationDetail, prepend: boolean) => void,
  onRemove?: (id: string) => void,
) {
  const [conversation, setConversation] =
    useState<AssistantConversation | null>(null);
  const [items, setItems] = useState<AssistantConversation[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const current = useRef<AssistantConversation | null>(null);
  const request = useRef<AbortController | null>(null);

  const loadList = useCallback(async (before?: string) => {
    const data = await historyRequest<AssistantConversationPage>(
      before ? "?before=" + encodeURIComponent(before) : "",
    );
    setItems((previous) => {
      if (!before) {
        return data.items;
      }
      const ids = new Set(previous.map((item) => item.id));
      return [...previous, ...data.items.filter((item) => !ids.has(item.id))];
    });
    setCursor(data.nextCursor);
    return data.items;
  }, []);

  const loadConversation = useCallback(
    async (id: string, before?: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      setLoading(true);
      setError(null);
      try {
        const path =
          "/" +
          encodeURIComponent(id) +
          (before ? "?before=" + encodeURIComponent(before) : "");
        const data = await historyRequest<AssistantConversationDetail>(
          path,
          "GET",
          controller.signal,
        );
        if (request.current !== controller || controller.signal.aborted) {
          return false;
        }
        current.current = data.conversation;
        setConversation(data.conversation);
        setMessageCursor(data.nextCursor);
        restore(data, Boolean(before));
        return true;
      } catch (failure) {
        if (!controller.signal.aborted) {
          setError(
            failure instanceof Error
              ? failure.message
              : "Не удалось загрузить историю.",
          );
        }
        return false;
      } finally {
        if (request.current === controller) {
          request.current = null;
          setLoading(false);
        }
      }
    },
    [restore],
  );

  useEffect(() => {
    if (!open || initialized.current) {
      return;
    }
    initialized.current = true;
    setLoading(true);
    void loadList()
      .then(async (sessions) => {
        if (sessions[0]) {
          await loadConversation(sessions[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
        setError("Не удалось загрузить историю.");
      });
  }, [open, loadConversation, loadList]);

  useEffect(() => () => request.current?.abort(), []);

  useEffect(() => {
    if (!open || !conversation?.busyUntil) {
      return;
    }
    const timer = setInterval(
      () => void loadConversation(conversation.id),
      3000,
    );
    return () => clearInterval(timer);
  }, [open, conversation?.id, conversation?.busyUntil, loadConversation]);

  async function create(signal?: AbortSignal) {
    setLoading(true);
    try {
      const session = await historyRequest<AssistantConversation>(
        "",
        "POST",
        signal,
      );
      current.current = session;
      setConversation(session);
      setMessageCursor(null);
      setError(null);
      return session;
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    setLoading(true);
    setError(null);
    try {
      await historyRequest<void>("/" + encodeURIComponent(id), "DELETE");
      onRemove?.(id);
      if (current.current?.id === id) {
        current.current = null;
        setConversation(null);
        setMessageCursor(null);
        restore(
          {
            conversation: {
              id: "",
              title: "",
              createdAt: "",
              updatedAt: "",
              compactionCount: 0,
              busyUntil: null,
            },
            messages: [],
            nextCursor: null,
          },
          false,
        );
      }
      await loadList();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось удалить сессию.",
      );
    } finally {
      setLoading(false);
    }
  }

  return {
    conversation,
    items,
    loading,
    error,
    cursor,
    messageCursor,
    loadList: () =>
      loadList().catch(() => setError("Не удалось загрузить историю.")),
    loadMore: () =>
      cursor &&
      loadList(cursor).catch(() => setError("Не удалось загрузить историю.")),
    loadOlder: () =>
      current.current &&
      messageCursor &&
      loadConversation(current.current.id, messageCursor),
    select: loadConversation,
    create,
    ensure: async (signal?: AbortSignal) => current.current ?? create(signal),
    remove,
    update(receipt: AssistantConversationReceipt) {
      if (current.current?.id === receipt.id) {
        const next = {
          ...current.current,
          compactionCount: receipt.compactionCount,
          busyUntil: null,
        };
        current.current = next;
        setConversation(next);
      }
    },
  };
}
