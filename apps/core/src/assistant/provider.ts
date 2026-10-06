import OpenAI from "openai";
import type { AssistantConfig } from "./config.js";
import { assistantLimits, type AssistantInput } from "./validation.js";
import { buildAssistantInstructions } from "./instructions.js";
import type { AssistantResponseMetadata } from "./telemetry/usage.js";
import { providerConversation } from "./provider-step.js";
import { maxAssistantModelCalls } from "./budget.js";
import { createToolExecutor } from "./tool-execution.js";
import { toolDiagnosticCode } from "../tools/errors.js";
import {
  AssistantProviderError,
  checkAssistantSignal,
  providerFailure,
} from "./provider-error.js";
import type { AssistantRun } from "./tool-contract.js";

export { AssistantProviderError } from "./provider-error.js";

export interface AssistantAnswer {
  content: string;
  truncated: boolean;
  metadata?: AssistantResponseMetadata;
}

export type AssistantGenerate = (
  input: AssistantInput,
  signal?: AbortSignal,
  customInstructions?: string | null,
  run?: AssistantRun,
) => Promise<AssistantAnswer>;

export function createAssistantProvider(
  config: AssistantConfig,
  fetchImpl?: typeof fetch,
) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeout: config.timeoutMs,
    maxRetries: 0,
    logLevel: "off",
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
    fetchOptions: { redirect: "error" },
  });
  const generate: AssistantGenerate = async (
    input,
    externalSignal,
    customInstructions = null,
    run,
  ) => {
    const timeout = AbortSignal.timeout(config.timeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([externalSignal, timeout])
      : timeout;
    const instructions = buildAssistantInstructions(
      customInstructions,
      run?.tools?.context,
    );
    const conversation = providerConversation(
      client,
      config,
      input,
      instructions,
      run?.tools?.definitions ?? [],
      signal,
    );
    let resultSize = 0;
    const executor = createToolExecutor(run, signal);

    // A turn has a hard cost bound in addition to timeout and context limits.
    for (let step = 0; step < maxAssistantModelCalls; step++) {
      checkAssistantSignal(timeout, externalSignal);
      const remaining = Math.min(
        maxAssistantModelCalls - step,
        run?.remainingModelCalls?.() ?? maxAssistantModelCalls,
      );
      const finalize =
        Boolean(run?.tools?.definitions.length) &&
        (remaining <= 1 || executor.finalize);
      const provisional = Boolean(run?.tools?.definitions.length) && !finalize;
      let provisionalText = "";
      const call = async () => {
        try {
          checkAssistantSignal(timeout, externalSignal);
          let emitted = 0;
          const onDelta = run?.onText
            ? (delta: string) => {
                const text = delta.slice(
                  0,
                  assistantLimits.maxMessageChars - emitted,
                );
                if (!text || signal.aborted) {
                  return;
                }
                if (provisional) {
                  provisionalText += text;
                }
                run.onText?.({
                  type: "text-delta",
                  delta: text,
                  reset: emitted === 0,
                  ...(provisional ? { provisional: true } : {}),
                });
                emitted += text.length;
              }
            : undefined;
          const answer = await conversation.next(onDelta, finalize);
          if (finalize && answer.calls.length) {
            throw new AssistantProviderError(
              429,
              "assistant_step_limit",
              "Провайдер запросил инструмент вместо итогового ответа. Доступные шаги закончились.",
              answer.metadata,
            );
          }
          if (!answer.calls.length && !answer.content.trim()) {
            throw new AssistantProviderError(
              502,
              "assistant_empty_response",
              "Провайдер вернул пустой ответ. Попробуйте меньшую глубину размышления.",
              answer.metadata,
            );
          }
          if (answer.calls.length && answer.truncated) {
            throw new AssistantProviderError(
              502,
              "assistant_tool_truncated",
              "Провайдер не завершил вызов инструмента: достигнуто ограничение длины ответа.",
              answer.metadata,
            );
          }
          return {
            ...answer,
            content: answer.content.slice(0, assistantLimits.maxMessageChars),
            truncated:
              answer.truncated ||
              answer.content.length > assistantLimits.maxMessageChars,
          };
        } catch (error) {
          if (provisionalText.trim()) {
            run?.onActivity?.({ kind: "note", text: provisionalText.trim() });
          }
          throw providerFailure(
            error,
            config.api,
            config.zai,
            timeout,
            externalSignal,
          );
        }
      };
      const answer = run ? await run.record(call) : await call();
      checkAssistantSignal(timeout, externalSignal);
      const text = answer.content.trim();

      if (!answer.calls.length) {
        if (provisional) {
          // Promote the completed step; never mix earlier commentary into the answer.
          run?.onText?.({ type: "text-delta", delta: text, reset: true });
        }
        return {
          content: text,
          truncated: answer.truncated,
          metadata: answer.metadata,
        };
      }
      const presentationOnly =
        Boolean(text) &&
        answer.calls.every(
          (tool) =>
            tool.name === "present_selection" ||
            tool.name === "present_plugin_result",
        );
      if (text && !presentationOnly) {
        run?.onActivity?.({ kind: "note", text });
      }
      let presentationSucceeded = presentationOnly;
      let promoted = false;
      try {
        for (const tool of answer.calls) {
          checkAssistantSignal(timeout, externalSignal);
          const execute = () => executor.execute(tool);
          let result: object;
          try {
            result = run?.recordTool
              ? await run.recordTool(execute, tool.name)
              : await execute();
          } catch (error) {
            checkAssistantSignal(timeout, externalSignal);
            throw error;
          }
          checkAssistantSignal(timeout, externalSignal);
          resultSize += JSON.stringify(result).length;
          if (resultSize > 60000) {
            throw new AssistantProviderError(
              502,
              "assistant_context_limit",
              "Результаты слишком велики для одного запроса. Запросите меньше записей или полей.",
            );
          }
          conversation.result(tool, result);
          if (
            !("presented" in result && result.presented === true) ||
            !(
              "requiresUserClick" in result && result.requiresUserClick === true
            ) ||
            toolDiagnosticCode(result) !== null
          ) {
            presentationSucceeded = false;
          }
        }
        if (presentationSucceeded) {
          // Presentation adds a verified UI card, not new data for another model call.
          promoted = true;
          run?.onText?.({ type: "text-delta", delta: text, reset: true });
          return {
            content: text,
            truncated: answer.truncated,
            metadata: answer.metadata,
          };
        }
      } finally {
        if (presentationOnly && !promoted) {
          run?.onActivity?.({ kind: "note", text });
        }
      }
    }
    throw new AssistantProviderError(
      429,
      "assistant_step_limit",
      "Достигнут лимит восьми обращений к модели. Уточните запрос.",
    );
  };
  return Object.assign(generate, { recordsCalls: true });
}
