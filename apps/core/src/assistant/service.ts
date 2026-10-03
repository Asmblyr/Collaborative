import { assistantConfigFromEnv, type AssistantConfig } from "./config.js";
import {
  createAssistantProvider,
  AssistantProviderError,
  type AssistantGenerate,
} from "./provider.js";
import { randomUUID } from "node:crypto";
import type { AssistantContext } from "./context-input.js";
import type { AssistantTools, AssistantRun } from "./tool-contract.js";
import { assistantLimits, parseAssistantInput } from "./validation.js";
import {
  applyAssistantDefaults,
  initialAssistantDefaults,
  type AssistantDefaults,
} from "./settings.js";
import type { AssistantJournal } from "./telemetry/journal.js";
import { AssistantTurnMetrics } from "./telemetry/turn-metrics.js";
import type { AssistantProgress } from "@asmblyr/contracts";
import { createProgress } from "./progress.js";

export class AssistantService {
  private readonly pending = new Set<string>();
  private readonly buckets = new Map<
    string,
    { count: number; until: number }
  >();
  constructor(
    private readonly config: AssistantConfig,
    private readonly generate: AssistantGenerate = createAssistantProvider(
      config,
    ),
  ) {}

  status(defaults: AssistantDefaults = initialAssistantDefaults) {
    const config = applyAssistantDefaults(this.config, defaults);
    return {
      available: defaults.enabled,
      model: config.model,
      limits: assistantLimits,
      settings: {
        reasoningOptions: config.reasoningOptions,
        defaultEffort: config.defaultEffort,
        thinking: config.thinking,
        defaultThinking: config.defaultThinking,
      },
    };
  }

  async respond(
    userId: string,
    body: unknown,
    signal?: AbortSignal,
    defaults: AssistantDefaults = initialAssistantDefaults,
    journal?: AssistantJournal,
    resolveTools?: (
      context: AssistantContext | null,
    ) => Promise<AssistantTools | undefined>,
    onProgress?: (progress: AssistantProgress) => void,
    onText?: AssistantRun["onText"],
  ) {
    if (!defaults.enabled)
      throw new AssistantProviderError(
        503,
        "assistant_disabled",
        "Ассистент отключён администратором",
      );
    const input = parseAssistantInput(
      body,
      applyAssistantDefaults(this.config, defaults),
    );
    const now = Date.now();
    for (const [id, bucket] of this.buckets)
      if (bucket.until <= now) this.buckets.delete(id);
    if (this.pending.has(userId) || this.pending.size >= 16)
      throw new AssistantProviderError(
        429,
        "assistant_busy",
        "Дождитесь завершения текущего ответа.",
      );
    const bucket = this.buckets.get(userId) ?? {
      count: 0,
      until: now + 60_000,
    };
    if (
      bucket.count >= 10 ||
      (!this.buckets.has(userId) && this.buckets.size >= 4096)
    ) {
      throw new AssistantProviderError(
        429,
        "assistant_rate_limit",
        "Слишком много сообщений. Попробуйте через минуту.",
      );
    }
    bucket.count++;
    this.buckets.set(userId, bucket);
    this.pending.add(userId);
    let tools: AssistantTools | undefined;
    try {
      if (signal?.aborted)
        throw new AssistantProviderError(
          499,
          "assistant_cancelled",
          "Запрос отменён",
        );
      tools = resolveTools
        ? await resolveTools(input.context ?? null)
        : undefined;
      const turnId = randomUUID();
      const metrics = new AssistantTurnMetrics(turnId, this.config.model);
      if (journal) await journal.startTurn(turnId, userId);
      let callIndex = 0;
      const progress = createProgress(onProgress);
      const run: AssistantRun = {
        tools,
        onText,
        record: (generate) => {
          callIndex++;
          progress.model();
          const observed = () => metrics.recordModel(generate);
          return journal
            ? journal.record(this.config, input, userId, observed, {
                turnId,
                callIndex,
              })
            : observed();
        },
        recordTool: (execute, name) => {
          progress.tool(name);
          return metrics.recordTool(execute);
        },
      };
      const generate = () =>
        this.generate(input, signal, defaults.instructions, run);
      try {
        const answer =
          "recordsCalls" in this.generate
            ? await generate()
            : await run.record(generate);
        if (signal?.aborted)
          throw new AssistantProviderError(
            499,
            "assistant_cancelled",
            "Запрос остановлен",
          );
        const summary = metrics.finish("succeeded");
        await journal?.finishTurn(summary);
        return {
          content: answer.content,
          truncated: answer.truncated,
          summary,
          ...(tools ? { proposals: tools.proposals } : {}),
          ...(tools?.selections?.length
            ? { selections: tools.selections }
            : {}),
          ...(tools?.pluginResults?.length
            ? { pluginResults: tools.pluginResults }
            : {}),
        };
      } catch (error) {
        const code =
          error instanceof AssistantProviderError
            ? error.code
            : "assistant_internal_error";
        const summary = metrics.finish(
          code === "assistant_cancelled" ? "cancelled" : "failed",
          code,
        );
        await journal?.finishTurn(summary);
        if (error instanceof AssistantProviderError) error.summary = summary;
        throw error;
      }
    } finally {
      try {
        await tools?.close?.();
      } finally {
        this.pending.delete(userId);
      }
    }
  }
}

export function assistantFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  warn: (message: string) => void = () => {},
) {
  try {
    const config = assistantConfigFromEnv(env);
    return config ? new AssistantService(config) : null;
  } catch (error) {
    // Config validation messages contain variable names only; never print environment values.
    warn(
      error instanceof Error
        ? error.message
        : "Invalid assistant configuration",
    );
    return null;
  }
}
