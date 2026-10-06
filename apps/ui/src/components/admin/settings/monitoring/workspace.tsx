"use client";
import { useEffect, useState } from "react";
import type {
  IntegrationsSnapshot,
  MonitoringMetrics,
} from "@asmblyr-collaborative/contracts";
import { Activity } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestJson } from "@/lib/http-request";
import { useUiCopy } from "@/lib/ui-copy";
import { IntegrationEditor } from "../integrations/editor";
import { MonitoringMeasurements } from "./metrics";

export function MonitoringWorkspace({
  initial,
  initialMetrics,
}: {
  initial: IntegrationsSnapshot;
  initialMetrics: MonitoringMetrics;
}) {
  const copy = useUiCopy();
  const [snapshot, setSnapshot] = useState(initial);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    const update = async () => {
      if (loading || document.hidden) {
        return;
      }
      loading = true;
      try {
        const response = await requestJson<{ data: MonitoringMetrics }>(
          "/api/settings/monitoring",
          "GET",
          undefined,
          AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        );
        if (!controller.signal.aborted) {
          setMetrics(response.data);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
        }
      } finally {
        loading = false;
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 15000);
    document.addEventListener("visibilitychange", update);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [snapshot.revision]);
  const value = snapshot.monitoring;
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">
          {copy("Мониторинг")}
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {copy(
            "Опциональное подключение Sentry для ошибок и производительности. Выберите, какие данные собирать.",
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg bg-primary/10 p-2 text-primary">
            <Activity
              className="size-4"
              aria-hidden
            />
          </span>
          <div>
            <p className="text-sm font-medium">Sentry</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {value.value.environment}
            </p>
          </div>
          <Badge variant="secondary">
            {copy(value.value.enabled ? "Включено" : "Выключено")}
          </Badge>
          {value.readOnly && <Badge variant="outline">env</Badge>}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
        >
          {copy("Настройки Sentry")}
        </Button>
      </div>
      <MonitoringMeasurements
        value={metrics}
        error={error}
      />
      {open && (
        <IntegrationEditor
          section="monitoring"
          snapshot={snapshot}
          onClose={() => setOpen(false)}
          onSave={(next) => {
            setSnapshot(next);
            setOpen(false);
          }}
        />
      )}
    </section>
  );
}
