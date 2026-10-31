"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeConnectionState } from "@asmblyr-collaborative/contracts";
import { ApiError } from "@asmblyr-collaborative/sdk";
import { getRealtimeLocks, subscribeRealtime } from "@/lib/realtime-scope";
import { useUiCopy } from "@/lib/ui-copy";

export function useRecordLive(
  collection: string,
  recordId: string,
  dirty: boolean,
  refresh: () => void,
  busy = false,
) {
  const copy = useUiCopy();
  const [state, setState] = useState<RealtimeConnectionState>("connecting");
  const [notice, setNotice] = useState("");
  const [holders, setHolders] = useState<
    Record<string, { id: string; displayName: string }>
  >({});
  const [selfId, setSelfId] = useState("");
  const dirtyRef = useRef(dirty);
  const busyRef = useRef(busy);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    dirtyRef.current = dirty;
    busyRef.current = busy;
    refreshRef.current = refresh;
  }, [busy, dirty, refresh]);
  const clientId = useRef("");
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const focused = useRef(new Set<string>());
  const pendingLocks = useRef(new Set<string>());
  useEffect(() => {
    if (!recordId) {
      return;
    }
    clientId.current = crypto.randomUUID();
    const lease = clientId.current;
    const scope = { kind: "record" as const, collection, id: recordId };
    const activeTimers = timers.current;
    const activeFields = focused.current;
    return () => {
      const locks = getRealtimeLocks(scope);
      activeFields.clear();
      for (const [field, timer] of activeTimers) {
        clearInterval(timer);
        void locks
          ?.release({ collection, recordId, field, clientId: lease })
          .catch(() => undefined);
      }
      activeTimers.clear();
    };
  }, [collection, recordId]);
  useEffect(() => {
    if (!recordId) return;
    return subscribeRealtime(
      { kind: "record", collection, id: recordId },
      (event, connection) => {
        setState(connection);
        if (!event) {
          if (connection !== "connected") setHolders({});
          return;
        }
        if (event.type === "presence.changed") {
          setSelfId(
            event.payload.participants.find((person) => person.self)?.id ?? "",
          );
        }
        if (
          event.type === "record.updated" ||
          event.type === "record.created"
        ) {
          if (busyRef.current) {
            setNotice("");
          } else if (dirtyRef.current) {
            setNotice(
              copy(
                "Запись изменена другим участником. При сохранении проверьте конфликт.",
              ),
            );
          } else {
            setNotice(copy("Запись обновлена"));
            refreshRef.current();
          }
        }
        if (event.type === "record.deleted") {
          setNotice(copy("Запись удалена другим участником."));
        }
        if (event.type === "field.locked") {
          setHolders((current) => ({
            ...current,
            [event.payload.field]: event.payload.holder,
          }));
        }
        if (event.type === "field.unlocked") {
          setHolders((current) => {
            if (current[event.payload.field]?.id !== event.payload.holder.id) {
              return current;
            }
            const next = { ...current };
            delete next[event.payload.field];
            return next;
          });
        }
        if (
          event.type === "collection.changed" &&
          connection === "connected" &&
          !dirtyRef.current &&
          !busyRef.current
        ) {
          refreshRef.current();
        }
      },
    );
  }, [collection, recordId, copy]);

  async function focus(field: string) {
    const scope = { kind: "record" as const, collection, id: recordId };
    const locks = getRealtimeLocks(scope);
    if (!locks || !clientId.current) {
      return;
    }
    focused.current.add(field);
    if (timers.current.has(field) || pendingLocks.current.has(field)) {
      return;
    }
    pendingLocks.current.add(field);
    const lock = { collection, recordId, field, clientId: clientId.current };
    try {
      await locks.acquire(lock);
      if (!focused.current.has(field)) {
        await locks.release(lock);
        return;
      }
      const timer = setInterval(() => {
        const activeLocks = getRealtimeLocks(scope);
        if (!activeLocks) {
          return;
        }
        void activeLocks
          .refresh(lock)
          .then(() => {
            setNotice((current) =>
              current ===
              copy(
                "Блокировка поля истекла. Проверьте изменения перед сохранением.",
              )
                ? ""
                : current,
            );
          })
          .catch(() => {
            setNotice(
              copy(
                "Блокировка поля истекла. Проверьте изменения перед сохранением.",
              ),
            );
          });
      }, 10_000);
      timers.current.set(field, timer);
    } catch (error) {
      focused.current.delete(field);
      if (error instanceof ApiError && error.code === "FIELD_LOCKED") {
        setNotice(copy("Это поле сейчас редактирует другой участник."));
      }
    } finally {
      pendingLocks.current.delete(field);
    }
  }

  function blur(field: string) {
    focused.current.delete(field);
    const timer = timers.current.get(field);
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timers.current.delete(field);
    const locks = getRealtimeLocks({
      kind: "record",
      collection,
      id: recordId,
    });
    void locks
      ?.release({ collection, recordId, field, clientId: clientId.current })
      .catch(() => undefined);
  }

  return { state, notice, holders, selfId, focus, blur };
}

export function useCollectionLive(
  collection: string,
  enabled: boolean,
  onRefresh: () => void,
) {
  const refreshRef = useRef(onRefresh);
  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeRealtime(
      { kind: "collection", collection },
      (event, state) => {
        if (
          event?.type === "collection.changed" &&
          state === "connected" &&
          !timer
        ) {
          timer = setTimeout(() => {
            timer = null;
            refreshRef.current();
          }, 200);
        }
      },
    );

    return () => {
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [collection, enabled]);
}
