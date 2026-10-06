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
import type {
  AssistantProgress,
  AssistantActivity,
  AssistantDataAccess,
} from "@asmblyr-collaborative/contracts";
import { createAssistantActivity } from "./activity.js";
import { createProgress } from "./progress.js";
import { checkAssistantSignal } from "./provider-error.js";
import { maxAssistantModelCalls } from "./budget.js";
import {
  compactionInstructions,
  type PrepareAssistantHistory,
} from "./history-context.js";

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
      dataAccess?: AssistantDataAccess,
    ) => Promise<AssistantTools | undefined>,
    onProgress?: (progress: AssistantProgress) => void,
    onText?: AssistantRun["onText"],
    prepareHistory?: PrepareAssistantHistory,
    onActivity?: (activity: AssistantActivity) => void,
  ) {
    if (!defaults.enabled)
      throw new AssistantProviderError(
        503,
        "assistant_disabled",
        "Ассистент отключён администратором",
      );
    let input = parseAssistantInput(
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
    const timeout = AbortSignal.timeout(this.config.timeoutMs);
    const turnSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let tools: AssistantTools | undefined;
    try {
      checkAssistantSignal(timeout, signal);
      tools = resolveTools
        ? await resolveTools(input.context ?? null, input.dataAccess)
        : undefined;
      const turnId = randomUUID();
      const metrics = new AssistantTurnMetrics(turnId, this.config.model);
      if (journal) await journal.startTurn(turnId, userId);
      let callIndex = 0;
      let compacting = false;
      let recordedInput = input;
      const activity = createAssistantActivity(onActivity);
      const progress = createProgress((next) => {
        if (next.phase === "tool" || compacting || next.modelCalls === 1) {
          activity.append({ kind: "status", text: next.label });
        }
        onProgress?.(next);
      });
      const run: AssistantRun = {
        tools,
        onText,
        onActivity: activity.append,
        remainingModelCalls: () => maxAssistantModelCalls - callIndex,
        record: (generate) => {
          if (callIndex >= maxAssistantModelCalls) {
            throw new AssistantProviderError(
              429,
              "assistant_step_limit",
              "Достигнут лимит восьми обращений к модели. Уточните запрос.",
            );
          }
          callIndex++;
          progress.model(compacting ? "Сжимаю контекст диалога" : undefined);
          const observed = () => metrics.recordModel(generate);
          return journal
            ? journal.record(this.config, recordedInput, userId, observed, {
                turnId,
                callIndex,
              })
            : observed();
        },
        recordTool: (execute, name) => {
          progress.tool(name);
          const knownName = tools?.definitions.some(
            (tool) => tool.name === name,
          )
            ? name
            : "unknown";
          return metrics.recordTool(execute, knownName);
        },
      };
      const generate = () =>
        this.generate(input, turnSignal, defaults.instructions, run);
      try {
        if (prepareHistory) {
          input = await prepareHistory(input, async (source) => {
            checkAssistantSignal(timeout, signal);
            compacting = true;
            const summaryInput = {
              messages: [{ role: "user" as const, content: source }],
              reasoningEffort: this.config.reasoningOptions.includes("low")
                ? ("low" as const)
                : input.reasoningEffort,
              thinking: this.config.thinking === "required",
            };
            recordedInput = summaryInput;
            try {
              const summarize = () =>
                this.generate(
                  summaryInput,
                  turnSignal,
                  compactionInstructions,
                  {
                    record: run.record,
                    remainingModelCalls: run.remainingModelCalls,
                  },
                );
              const result =
                "recordsCalls" in this.generate
                  ? await summarize()
                  : await run.record(summarize);
              return result.content;
            } finally {
              compacting = false;
              recordedInput = input;
            }
          });
          recordedInput = input;
        }
        checkAssistantSignal(timeout, signal);
        const answer =
          "recordsCalls" in this.generate
            ? await generate()
            : await run.record(generate);
        checkAssistantSignal(timeout, signal);
        const summary = metrics.finish("succeeded");
        await journal?.finishTurn(summary);
        return {
          content: answer.content,
          activity: activity.snapshot(),
          truncated: answer.truncated,
          summary,
          ...(tools ? { proposals: tools.proposals } : {}),
          ...(tools?.selections?.length
            ? { selections: tools.selections }
            : {}),
          ...(tools?.pluginResults?.length
            ? { pluginResults: tools.pluginResults }
            : {}),
          ...(tools?.connectionWrites?.length
            ? { connectionWrites: tools.connectionWrites }
            : {}),
        };
      } catch (error) {
        try {
          checkAssistantSignal(timeout, signal);
        } catch (deadlineError) {
          error = deadlineError;
        }
        const code =
          error instanceof AssistantProviderError
            ? error.code
            : "assistant_internal_error";
        const summary = metrics.finish(
          code === "assistant_cancelled" ? "cancelled" : "failed",
          code,
        );
        await journal?.finishTurn(summary);
        if (error instanceof AssistantProviderError) {
          error.summary = summary;
          error.activity = activity.snapshot();
        }
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
