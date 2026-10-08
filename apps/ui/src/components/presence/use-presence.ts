"use client";
import { useEffect, useState } from "react";
import type {
  PresenceResult,
  PresenceScope,
} from "@asmblyr-collaborative/contracts";
import { subscribeRealtime } from "@/lib/realtime-scope";

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
    const unsubscribe = subscribeRealtime(target, (event) => {
      if (event?.type === "presence.changed") {
        setSnapshot({
          key,
          data: {
            participants: event.payload.participants,
            total: event.payload.total,
          },
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [key]);
  return snapshot?.key === key ? snapshot.data : null;
}
