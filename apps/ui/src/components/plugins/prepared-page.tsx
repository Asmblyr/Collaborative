"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { PluginPageProps } from "@asmblyr/kit/ui";
import type { PluginPreparedAction } from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";
import { loadPreparedAction } from "./action-client";
import { clearPluginPageState, reportPluginPageState, type PluginPageState } from "./page-state";

export function PreparedPluginPage({
  namespace,
  pageId,
  draftId,
  component: View,
  request,
}: {
  namespace: string;
  pageId: string;
  draftId: string | null;
  component: ComponentType<PluginPageProps>;
  request: PluginPageProps["request"];
}) {
  const [prepared, setPrepared] = useState<PluginPreparedAction>();
  const [candidate, setCandidate] = useState<PluginPreparedAction>();
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [started, setStarted] = useState(!draftId);
  const [busy, setBusy] = useState(false);
  const state = useRef<PluginPageState>({ dirty: false, busy: false });
  const [key] = useState(() => Symbol("plugin-page"));
  const report = useCallback(
    (next: PluginPageState) => {
      state.current = next;
      setBusy(next.busy);
      reportPluginPageState(key, next);
    },
    [key],
  );
  useEffect(() => () => clearPluginPageState(key), [key]);
  useEffect(() => {
    if (!draftId) return;
    const controller = new AbortController();
    void loadPreparedAction(namespace, draftId, controller.signal)
      .then((draft) => {
        if (controller.signal.aborted) return;
        if (draft.namespace !== namespace || draft.pageId !== pageId)
          throw new Error("Эта форма предназначена для другой страницы.");
        if (state.current.dirty || state.current.busy) setCandidate(draft);
        else setPrepared(draft);
        setStarted(true);
        setError("");
        setResolved(draftId);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          failure instanceof Error ? failure.message : "Не удалось открыть подготовленную форму.",
        );
        setResolved(draftId);
      });
    return () => controller.abort();
  }, [namespace, pageId, draftId, retry]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (state.current.dirty || state.current.busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, []);

  const waiting = draftId && resolved !== draftId;
  return (
    <div className="space-y-4">
      {waiting && (
        <p role="status" className="text-sm text-muted-foreground">
          Открываем подготовленную форму…
        </p>
      )}
      {error && (
        <div role="alert" className="space-y-3 rounded-xl border p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
            Повторить
          </Button>
        </div>
      )}
      {candidate && (
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm">
            Есть новый подготовленный расчёт. Открыть его вместо ваших текущих значений?
          </p>
          <div className="flex gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                if (state.current.busy) return;
                setPrepared(candidate);
                setCandidate(undefined);
              }}
            >
              Открыть новый расчёт
            </Button>
            <Button variant="outline" onClick={() => setCandidate(undefined)}>
              Оставить текущий
            </Button>
          </div>
        </div>
      )}
      {(started || !draftId) && (
        <View
          key={prepared?.draftId ?? "empty"}
          request={request}
          preparedAction={prepared}
          onStateChange={report}
        />
      )}
    </div>
  );
}
