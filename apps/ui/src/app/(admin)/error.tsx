"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { WorkspaceLink as Link } from "@/components/workspaces/workspace-link";
import { useUiCopy } from "@/lib/ui-copy";

export default function AdminErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = useUiCopy();

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl items-center py-8">
      <section
        role="alert"
        className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm"
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle
            aria-hidden="true"
            className="size-5"
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight">
            {copy("Не удалось загрузить раздел")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy(
              "Во время загрузки данных произошла ошибка. Ваши сохранённые данные в порядке — попробуйте обновить раздел.",
            )}
          </p>
          {error.digest && (
            <p className="font-mono text-xs text-muted-foreground">
              {copy("Код ошибки: {{value0}}", { value0: error.digest })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={reset}
          >
            {copy("Повторить")}
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
          >
            <Link href="/">{copy("На главную")}</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
