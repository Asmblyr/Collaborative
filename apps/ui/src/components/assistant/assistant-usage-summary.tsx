import type { AssistantTurnSummary } from "@asmblyr/contracts";
import { usageLabel } from "./assistant-usage";

export function AssistantUsageSummary({ summary }: { summary: AssistantTurnSummary }) {
  const partial =
    summary.usageSamples.inputTokens < summary.modelCalls ||
    summary.usageSamples.outputTokens < summary.modelCalls;
  const model = summary.models.length
    ? summary.models.join(", ")
    : `${summary.requestedModel} (запрошена)`;
  const seconds = (summary.durationMs / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
  return (
    <div
      className="space-y-1 text-[11px] leading-4 text-muted-foreground"
      aria-label="Расход за сообщение"
    >
      <p className="break-words">
        {model} · {seconds} с
      </p>
      <p>
        Вызовы модели: {summary.modelCalls} · инструментов: {summary.toolCalls}
        {summary.toolErrors > 0 && ` · ошибок инструментов: ${summary.toolErrors}`}
      </p>
      <p className="tabular-nums">
        Токены: вход {usageLabel(summary, "inputTokens")} · выход{" "}
        {usageLabel(summary, "outputTokens")}
      </p>
      {partial && (
        <p>Расход известен не полностью. «≥» — сумма известных значений, «—» — нет данных.</p>
      )}
    </div>
  );
}
