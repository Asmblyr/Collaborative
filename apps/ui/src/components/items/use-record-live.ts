"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeConnectionState } from "@asmblyr-collaborative/contracts";
import { ApiError } from "@asmblyr-collaborative/sdk";
import { asmblyr } from "@/lib/asmblyr";
import { subscribeRealtime } from "@/lib/realtime-scope";
import { useUiCopy } from "@/lib/ui-copy";

export function useRecordLive(
  collection: string,
  recordId: string,
  dirty: boolean,
  refresh: () => void,
) {
  const copy = useUiCopy();
  const [state, setState] = useState<RealtimeConnectionState>("connecting");
  const [notice, setNotice] = useState("");
  const [holders, setHolders] = useState<
    Record<string, { id: string; displayName: string }>
  >({});
  const [selfId, setSelfId] = useState("");
  const dirtyRef = useRef(dirty);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    dirtyRef.current = dirty;
    refreshRef.current = refresh;
  }, [dirty, refresh]);
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
          if (dirtyRef.current)
            setNotice(
              copy(
                "Запись изменена другим участником. При сохранении проверьте конфликт.",
              ),
            );
          else {
            setNotice(copy("Запись обновлена"));
            refreshRef.current();
          }
        }
        if (event.type === "record.deleted")
          setNotice(copy("Запись удалена другим участником."));
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
          !dirtyRef.current
        ) {
          refreshRef.current();
        }
      },
    );
  }, [collection, recordId, copy]);

  const live = useRef<ReturnType<typeof asmblyr.realtime.connect> | null>(null);
  const clientId = useRef("");
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const focused = useRef(new Set<string>());
  const pendingLocks = useRef(new Set<string>());
  useEffect(() => {
    clientId.current = crypto.randomUUID();
    live.current = asmblyr.realtime.connect();
    const active = live.current;
    const lease = clientId.current;
    const activeTimers = timers.current;
    const activeFields = focused.current;
    return () => {
      activeFields.clear();
      for (const [field, timer] of activeTimers) {
        clearInterval(timer);
        void active.locks
          .release({ collection, recordId, field, clientId: lease })
          .catch(() => undefined);
      }
      activeTimers.clear();
      active.close();
      live.current = null;
    };
  }, [collection, recordId]);

  async function focus(field: string) {
    const connection = live.current;
    if (!connection) return;
    focused.current.add(field);
    if (timers.current.has(field) || pendingLocks.current.has(field)) return;
    pendingLocks.current.add(field);
    const lock = { collection, recordId, field, clientId: clientId.current };
    try {
      await connection.locks.acquire(lock);
      if (!focused.current.has(field)) {
        await connection.locks.release(lock);
        return;
      }
      const timer = setInterval(() => {
        void connection.locks
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
    if (!timer) return;
    clearInterval(timer);
    timers.current.delete(field);
    void live.current?.locks
      .release({ collection, recordId, field, clientId: clientId.current })
      .catch(() => undefined);
  }

  return { state, notice, holders, selfId, focus, blur };
}
