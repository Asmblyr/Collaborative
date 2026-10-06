"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  ASSISTANT_SETTINGS_CHANGED,
  type AssistantSettings,
} from "./assistant-types";
import {
  assistantStatusState,
  initialAssistantStatus,
  supportedAssistantSettings,
} from "./assistant-status-state";
import {
  AssistantStatusRequestError,
  requestAssistantStatus,
} from "./assistant-status-request";

export function useAssistantStatus(open: boolean) {
  const [availability, dispatch] = useReducer(
    assistantStatusState,
    initialAssistantStatus,
  );
  const [settings, setSettings] = useState<AssistantSettings>({});
  const active = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    dispatch({ type: "loading" });

    try {
      const status = await requestAssistantStatus(
        AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      );
      if (controller.signal.aborted || active.current !== controller) {
        return;
      }
      dispatch({ type: "loaded", status });
      if (status.available) {
        setSettings((previous) => supportedAssistantSettings(previous, status));
      }
    } catch (failure) {
      if (controller.signal.aborted || active.current !== controller) {
        return;
      }
      dispatch({
        type: "failed",
        failure:
          failure instanceof AssistantStatusRequestError
            ? failure.failure
            : "request",
      });
    } finally {
      if (active.current === controller) {
        active.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const refresh = () => {
      void reload();
    };
    refresh();
    window.addEventListener(ASSISTANT_SETTINGS_CHANGED, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active.current?.abort();
      active.current = null;
      window.removeEventListener(ASSISTANT_SETTINGS_CHANGED, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [open, reload]);

  return {
    status: availability.status ?? { available: false },
    availability,
    reload,
    settings,
    setSettings,
  };
}
