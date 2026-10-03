import type { AssistantTurnSummary, AssistantUsage } from "@asmblyr/contracts";
import { AssistantProviderError, type AssistantAnswer } from "../provider.js";
import type { AssistantResponseMetadata } from "./usage.js";

export class AssistantTurnMetrics {
  private readonly started = performance.now();
  private readonly models = new Set<string>();
  private modelCalls = 0;
  private toolCalls = 0;
  private toolErrors = 0;
  private readonly usage: AssistantUsage = {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    cachedTokens: null,
    reasoningTokens: null,
  };
  private readonly samples: Record<keyof AssistantUsage, number> = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
  };

  constructor(
    private readonly turnId: string,
    private readonly requestedModel: string,
  ) {}

  private collect(metadata?: AssistantResponseMetadata) {
    if (!metadata) return;
    if (metadata.model) this.models.add(metadata.model);
    for (const key of Object.keys(this.usage) as (keyof AssistantUsage)[]) {
      const value = metadata.usage[key];
      if (value === null) continue;
      this.usage[key] = (this.usage[key] ?? 0) + value;
      this.samples[key]++;
    }
  }

  async recordModel<T extends AssistantAnswer>(generate: () => Promise<T>): Promise<T> {
    this.modelCalls++;
    try {
      const answer = await generate();
      this.collect(answer.metadata);
      return answer;
    } catch (error) {
      if (error instanceof AssistantProviderError) this.collect(error.metadata);
      throw error;
    }
  }

  async recordTool(execute: () => Promise<object>): Promise<object> {
    this.toolCalls++;
    try {
      const result = await execute();
      if ("error" in result || ("isError" in result && result.isError === true)) {
        this.toolErrors++;
      }
      return result;
    } catch (error) {
      this.toolErrors++;
      throw error;
    }
  }

  finish(
    status: AssistantTurnSummary["status"],
    errorCode: string | null = null,
  ): AssistantTurnSummary {
    return {
      turnId: this.turnId,
      requestedModel: this.requestedModel,
      models: [...this.models],
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      toolErrors: this.toolErrors,
      durationMs: Math.round(performance.now() - this.started),
      status,
      errorCode,
      usage: { ...this.usage },
      usageSamples: { ...this.samples },
    };
  }
}
