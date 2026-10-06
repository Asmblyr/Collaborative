"use client";

import type { AssistantTurnSummary } from "@asmblyr-collaborative/contracts";
import { usageLabel } from "./assistant-usage";
import { useUiCopy } from "@/lib/ui-copy";

export function AssistantUsageSummary({
  summary,
}: {
  summary: AssistantTurnSummary;
}) {
  const copy = useUiCopy();

  const partial =
    summary.usageSamples.inputTokens < summary.modelCalls ||
    summary.usageSamples.outputTokens < summary.modelCalls;
  const model = summary.models.length
    ? summary.models.join(", ")
    : copy("{{value0}} (запрошена)", { value0: summary.requestedModel });
  const seconds = (summary.durationMs / 1000).toLocaleString(
    copy.locale === "en" ? "en-US" : "ru-RU",
    {
      maximumFractionDigits: 1,
    },
  );
  return (
    <div
      className="space-y-1 text-[11px] leading-4 text-muted-foreground"
      aria-label={copy("Расход за сообщение")}
    >
      <p className="break-words">
        {model} · {seconds} {copy(" с ")}
      </p>
      <p>
        {copy("Вызовы модели: ")}
        {summary.modelCalls} {copy(" · инструментов: ")}
        {summary.toolCalls}
        {summary.toolErrors > 0 &&
          copy(" · ошибок инструментов: {{value0}}", {
            value0: summary.toolErrors,
          })}
      </p>
      <p className="tabular-nums">
        {copy("Токены: вход ")}
        {usageLabel(summary, "inputTokens", copy.locale)} {copy(" · выход")}{" "}
        {usageLabel(summary, "outputTokens", copy.locale)}
      </p>
      {partial && (
        <p>
          {copy(
            "Расход известен не полностью. «≥» — сумма известных значений, «—» — нет данных. ",
          )}
        </p>
      )}
    </div>
  );
}
