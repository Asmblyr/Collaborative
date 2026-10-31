"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const copy = useUiCopy();

  return (
    <main className="mx-auto flex min-h-svh max-w-lg items-center px-6 py-12">
      <section
        role="alert"
        className="w-full space-y-5 rounded-2xl border bg-card p-7 shadow-sm"
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle
            aria-hidden="true"
            className="size-5"
          />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {copy("Что-то пошло не так")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {copy(
              "Не удалось отобразить страницу. Попробуйте повторить запрос или вернитесь на главную.",
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
            onClick={reset}
          >
            {copy("Повторить")}
          </Button>
          <Button
            asChild
            variant="outline"
          >
            <Link href="/">{copy("На главную")}</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
