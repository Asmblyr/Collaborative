"use client";
import { useEffect, useState } from "react";
import type { PresenceResult, PresenceScope } from "@asmblyr/contracts";
import { asmblyr } from "@/lib/asmblyr";
import { createPresenceSession } from "./presence-session";

export function usePresence(
  scope: PresenceScope | null,
): PresenceResult["data"] | null {
  const key = scope ? JSON.stringify(scope) : "";
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: PresenceResult["data"] | null;
  } | null>(null);
  useEffect(() => {
    if (!key) {
      return;
    }
    const target: PresenceScope = JSON.parse(key);
    function start() {
      const clientId = crypto.randomUUID();
      return createPresenceSession(
        () =>
          asmblyr.presence.touch(
            { clientId, scope: target },
            { timeoutMs: 5000 },
          ),
        () =>
          fetch(`/api/presence/${clientId}`, {
            method: "DELETE",
            keepalive: true,
          }),
        (result) => setSnapshot({ key, data: result?.data ?? null }),
      );
    }
    let session = start();
    void session.refresh();
    const refresh = () => {
      void session.refresh();
    };
    const hide = () => session.dispose();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) {
        session = start();
        refresh();
      }
    };
    const visibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      document.removeEventListener("visibilitychange", visibility);
      session.dispose();
    };
  }, [key]);
  return snapshot?.key === key ? snapshot.data : null;
}
