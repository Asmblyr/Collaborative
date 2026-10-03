import type { AssistantTurnSummary, AssistantUsage } from "@asmblyr/contracts";

export function usageLabel(
  summary: AssistantTurnSummary,
  key: keyof AssistantUsage,
): string {
  const value = summary.usage[key];
  if (value === null) return "—";
  const partial = summary.usageSamples[key] < summary.modelCalls;
  return `${partial ? "≥ " : ""}${value.toLocaleString("ru-RU")}`;
}
