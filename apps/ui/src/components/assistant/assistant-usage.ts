import type {
  AssistantTurnSummary,
  AssistantUsage,
  UiLocale,
} from "@asmblyr-collaborative/contracts";

export function usageLabel(
  summary: AssistantTurnSummary,
  key: keyof AssistantUsage,
  locale: UiLocale = "ru",
): string {
  const value = summary.usage[key];
  if (value === null) return "—";
  const partial = summary.usageSamples[key] < summary.modelCalls;
  return `${partial ? "≥ " : ""}${value.toLocaleString(locale === "en" ? "en-US" : "ru-RU")}`;
}
