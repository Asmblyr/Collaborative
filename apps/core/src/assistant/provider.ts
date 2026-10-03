import OpenAI from "openai";
import type { AssistantConfig } from "./config.js";
import { assistantLimits, type AssistantInput } from "./validation.js";
import { buildAssistantInstructions } from "./instructions.js";
import type { AssistantResponseMetadata } from "./telemetry/usage.js";
import { providerConversation, type ToolCall } from "./provider-step.js";
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

async function executeTool(
  tool: ToolCall,
  run: AssistantRun | undefined,
  signal: AbortSignal,
): Promise<object> {
  let args: unknown;
  try {
    const raw =
      typeof tool.arguments === "string"
        ? tool.arguments
        : JSON.stringify(tool.arguments);
    if (!raw || raw.length > 12000) return { error: "Invalid JSON arguments" };
    args = JSON.parse(raw);
  } catch {
    return { error: "Invalid JSON arguments" };
  }
  return (
    (await run?.tools?.execute(tool.name, args, signal)) ?? {
      error: "Tool unavailable",
    }
  );
}

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
    const publicText: string[] = [];
    let truncated = false;

    // A turn has a hard cost bound in addition to timeout and context limits.
    for (let step = 0; step < 8; step++) {
      checkAssistantSignal(timeout, externalSignal);
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
                run.onText?.({
                  type: "text-delta",
                  delta: text,
                  reset: emitted === 0,
                });
                emitted += text.length;
              }
            : undefined;
          const answer = await conversation.next(onDelta);
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
      if (text) {
        publicText.push(text);
      }
      truncated ||= answer.truncated;

      if (!answer.calls.length) {
        return {
          content: publicText.join("\n\n"),
          truncated,
          metadata: answer.metadata,
        };
      }
      for (const tool of answer.calls) {
        checkAssistantSignal(timeout, externalSignal);
        const execute = () => executeTool(tool, run, signal);
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
