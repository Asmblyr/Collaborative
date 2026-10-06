"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NotificationResult } from "@asmblyr-collaborative/contracts";
import { asmblyr } from "@/lib/asmblyr";

export function useNotifications() {
  const [result, setResult] = useState<NotificationResult | null>(null);
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  const [limit, setLimit] = useState(50);
  const controller = useRef<AbortController | null>(null);
  const disposed = useRef(false);
  const mutating = useRef(false);
  const refresh = useCallback(async () => {
    if (
      document.visibilityState !== "visible" ||
      disposed.current ||
      mutating.current
    )
      return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    try {
      const response = await asmblyr.notifications.list(limit, {
        signal: next.signal,
        timeoutMs: 8000,
      });
      if (!next.signal.aborted && !disposed.current) {
        setResult(response);
        setError(false);
      }
    } catch {
      if (!next.signal.aborted && !disposed.current) setError(true);
    }
  }, [limit]);
  useEffect(() => {
    disposed.current = false;
    const update = () => {
      void refresh();
    };
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 30_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      disposed.current = true;
      controller.current?.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  async function read(id?: string): Promise<boolean> {
    if (mutating.current || (!id && !result)) return false;
    mutating.current = true;
    controller.current?.abort();
    setPending(true);
    try {
      if (id) await asmblyr.notifications.read(id);
      else await asmblyr.notifications.readAll(result!.readBefore);
      return true;
    } catch {
      if (!disposed.current) setError(true);
      return false;
    } finally {
      mutating.current = false;
      if (!disposed.current) {
        setPending(false);
        void refresh();
      }
    }
  }
  return {
    result,
    error,
    pending,
    refresh,
    read,
    showMore: () => setLimit((current) => Math.min(200, current + 50)),
  };
}
