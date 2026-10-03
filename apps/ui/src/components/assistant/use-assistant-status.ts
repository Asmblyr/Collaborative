"use client";

import { useEffect, useState } from "react";
import {
  ASSISTANT_SETTINGS_CHANGED,
  type AssistantSettings,
  type AssistantStatus,
} from "./assistant-types";

export function useAssistantStatus(open: boolean) {
  const [status, setStatus] = useState<AssistantStatus>({ available: false });
  const [settings, setSettings] = useState<AssistantSettings>({});

  useEffect(() => {
    const controller = new AbortController();
    let version = 0;
    async function load() {
      const currentVersion = ++version;
      try {
        const response = await fetch("/api/assistant/status", {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(8000),
          ]),
        });
        const data: AssistantStatus = response.ok
          ? (await response.json()).data
          : { available: false };
        if (controller.signal.aborted || currentVersion !== version) return;
        setStatus(data);
        setSettings((previous) => ({
          ...(previous.reasoningEffort &&
          data.settings?.reasoningOptions.includes(previous.reasoningEffort)
            ? { reasoningEffort: previous.reasoningEffort }
            : {}),
          ...(data.settings?.thinking === "optional" &&
          previous.thinking !== undefined
            ? { thinking: previous.thinking }
            : {}),
        }));
      } catch {
        if (!controller.signal.aborted && currentVersion === version)
          setStatus({ available: false });
      }
    }
    const refresh = () => {
      void load();
    };
    refresh();
    window.addEventListener(ASSISTANT_SETTINGS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener(ASSISTANT_SETTINGS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [open]);

  return { status, settings, setSettings };
}
