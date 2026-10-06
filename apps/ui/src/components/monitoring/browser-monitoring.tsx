"use client";
import { useEffect } from "react";
import type { BrowserMonitoringConfig } from "@asmblyr-collaborative/contracts";
import { requestJson } from "@/lib/http-request";
import {
  BrowserMonitorController,
  MONITORING_SETTINGS_CHANGED,
} from "@/lib/monitoring/controller";

/** Disabled installations download no Sentry SDK and install no observers. */
export function BrowserMonitoring() {
  useEffect(() => {
    const monitor = new BrowserMonitorController(
      async (signal) =>
        (
          await requestJson<{ data: BrowserMonitoringConfig }>(
            "/api/monitoring/browser",
            "GET",
            undefined,
            AbortSignal.any([signal, AbortSignal.timeout(10000)]),
          )
        ).data,
      async (value, signal) => {
        const runtime = await import("@/lib/monitoring/browser-runtime");
        if (signal.aborted) {
          return;
        }
        return runtime.startBrowserMonitoring(value);
      },
    );
    const changed = () => {
      if (!document.hidden) {
        void monitor.refresh();
      }
    };
    changed();
    const timer = window.setInterval(changed, 30000);
    document.addEventListener("visibilitychange", changed);
    window.addEventListener(MONITORING_SETTINGS_CHANGED, changed);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", changed);
      window.removeEventListener(MONITORING_SETTINGS_CHANGED, changed);
      void monitor.close();
    };
  }, []);
  return null;
}
