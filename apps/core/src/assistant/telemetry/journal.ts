import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { AssistantConfig } from "../config.js";
import type { AssistantInput } from "../validation.js";
import { AssistantProviderError, type AssistantAnswer } from "../provider.js";
import type { AssistantResponseMetadata } from "./usage.js";
import type { AssistantTurnSummary } from "@asmblyr/contracts";
import { createTurnJournal } from "./turn-journal.js";

export interface AssistantJournal {
  startTurn(id: string, userId: string): Promise<void>;
  finishTurn(summary: AssistantTurnSummary): Promise<void>;
  record<T extends AssistantAnswer>(
    config: AssistantConfig,
    input: AssistantInput,
    userId: string,
    generate: () => Promise<T>,
    turn?: { turnId: string; callIndex: number },
  ): Promise<T>;
}

function providerName(config: AssistantConfig): string {
  if (config.zai) return "zai";
  if (new URL(config.baseURL).hostname === "api.openai.com") return "openai";
  return "compatible";
}

export function createAssistantJournal(
  database: Knex,
  warn: (id: string) => void,
): AssistantJournal {
  const table = () => database("asmblyr_assistant_requests").withSchema("public");
  return {
    ...createTurnJournal(database, warn),
    async record<T extends AssistantAnswer>(
      config: AssistantConfig,
      input: AssistantInput,
      userId: string,
      generate: () => Promise<T>,
      turn?: { turnId: string; callIndex: number },
    ) {
      const id = randomUUID(),
        started = performance.now();
      try {
        await table()
          .insert({
            id,
            user_id: userId,
            started_at: new Date(),
            turn_id: turn?.turnId ?? id,
            call_index: turn?.callIndex ?? 1,
            provider: providerName(config),
            api: config.api,
            requested_model: config.model,
            reasoning_effort:
              config.api === "responses" || input.thinking ? input.reasoningEffort : null,
            thinking: config.thinking === "unsupported" ? null : input.thinking,
          })
          .timeout(5000, { cancel: true });
      } catch {
        throw new AssistantProviderError(
          503,
          "assistant_telemetry_unavailable",
          "Не удалось записать AI-запрос. Попробуйте позже.",
        );
      }
      async function finish(
        status: string,
        metadata?: AssistantResponseMetadata,
        errorCode: string | null = null,
        truncated: boolean | null = null,
      ) {
        try {
          const usage = metadata?.usage;
          await table()
            .where({ id })
            .update({
              status,
              finished_at: new Date(),
              duration_ms: Math.round(performance.now() - started),
              error_code: errorCode,
              truncated,
              model: metadata?.model ?? null,
              response_id: metadata?.responseId ?? null,
              request_id: metadata?.requestId ?? null,
              finish_reason: metadata?.finishReason ?? null,
              input_tokens: usage?.inputTokens ?? null,
              output_tokens: usage?.outputTokens ?? null,
              total_tokens: usage?.totalTokens ?? null,
              cached_tokens: usage?.cachedTokens ?? null,
              reasoning_tokens: usage?.reasoningTokens ?? null,
            })
            .timeout(5000, { cancel: true });
        } catch {
          // Keep the pending row and the successful answer. Never log provider errors or content.
          warn(id);
        }
      }
      let answer: T;
      try {
        answer = await generate();
      } catch (error) {
        const providerError = error instanceof AssistantProviderError ? error : null;
        await finish(
          providerError?.code === "assistant_cancelled" ? "cancelled" : "failed",
          providerError?.metadata,
          providerError?.code ?? "assistant_internal_error",
        );
        throw error;
      }
      await finish("succeeded", answer.metadata, null, answer.truncated);
      return answer;
    },
  };
}
