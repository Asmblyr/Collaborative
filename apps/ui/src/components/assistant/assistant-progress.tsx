import { LoaderCircle, Square } from "lucide-react";
import type { AssistantProgress as Progress } from "@asmblyr/contracts";
import { Button } from "@asmblyr/kit/ui/button";

export function AssistantProgress({
  progress,
  stopping,
  onStop,
}: {
  progress: Progress | null;
  stopping: boolean;
  onStop: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3 text-xs">
      <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" />
      <div className="min-w-0 flex-1 space-y-1" role="status" aria-live="polite">
        <p>{stopping ? "Останавливаю запрос…" : (progress?.label ?? "Подключаюсь…")}</p>
        {progress && (
          <p className="text-[11px] text-muted-foreground">
            Вызовы модели: {progress.modelCalls} · инструментов: {progress.toolCalls}
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        disabled={stopping}
        onClick={onStop}
        className="h-8 px-2 text-xs"
      >
        <Square className="size-3" />
        Остановить
      </Button>
    </div>
  );
}