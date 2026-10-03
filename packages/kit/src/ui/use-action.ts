"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { modelField, modelValidator, type ModelDefinition } from "../model-schema.js";
import type { PluginPageProps } from "../ui.js";
import type { PluginActionResult } from "@asmblyr/contracts";

/** Owns form values and calculation lifecycle; hosts remount it when accepting a new draft. */
export function useAction<Input extends object, Output extends object>(
  contract: ModelDefinition,
  props: Pick<PluginPageProps, "request" | "preparedAction" | "onStateChange">,
  options: { path: string; initialInput: Input },
) {
  type Values = Partial<Input>;
  const inputValidator = useMemo(() => modelValidator<Input>(contract.inputSchema), [contract]);
  const outputValidator = useMemo(() => modelValidator<Output>(contract.outputSchema), [contract]);
  const [input, setInput] = useState<Values>(() => {
    if (props.preparedAction && props.preparedAction.actionId !== contract.id) {
      throw new Error("Prepared form belongs to another action");
    }
    return inputValidator.parse(props.preparedAction?.input ?? options.initialInput);
  });
  const [output, setOutput] = useState<Output | null>(() =>
    props.preparedAction ? outputValidator.parse(props.preparedAction.output) : null,
  );
  const [baseline, setBaseline] = useState(() => JSON.stringify(input));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  const dirty = JSON.stringify(input) !== baseline;
  const report = props.onStateChange;
  useEffect(() => {
    report({ dirty, busy });
  }, [report, dirty, busy]);
  useEffect(
    () => () => {
      active.current?.abort();
      report({ dirty: false, busy: false });
    },
    [report],
  );

  function setField<Key extends keyof Values>(key: Key, value: Values[Key]) {
    if (active.current) return;
    setInput((current) => ({ ...current, [key]: value }));
    setOutput(null);
    setError("");
  }

  async function run() {
    if (active.current) return;
    const parsed = inputValidator.safeParse(input);
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => {
            const field = modelField(contract.inputSchema, String(issue.path[0]));
            const label = field.title ?? issue.path.join(".");
            return label ? `${label}: ${issue.message}` : issue.message;
          })
          .join("; "),
      );
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      const { data: result } = await props.request<{ data: PluginActionResult }>(options.path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      if (result.actionId !== contract.id) throw new Error("Response belongs to another action");
      if (controller.signal.aborted) return;
      setOutput(outputValidator.parse(result.output));
      setBaseline(JSON.stringify(input));
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Не удалось выполнить действие.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      if (active.current === controller) active.current = null;
    }
  }

  const reset = useCallback(() => {
    if (active.current) return;
    setInput(JSON.parse(baseline) as Values);
    setOutput(null);
    setError("");
  }, [baseline]);
  return { input, output, busy, dirty, error, setField, run, reset };
}
