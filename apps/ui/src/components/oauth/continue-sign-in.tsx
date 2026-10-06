"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import type { ConsentDetails } from "./consent";
import { useUiCopy } from "@/lib/ui-copy";

export function ContinueOAuthSignIn({ details }: { details: ConsentDetails }) {
  const copy = useUiCopy();

  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void apiRequest<{ redirectTo: string }>(
      `/oauth/interaction/${details.uid}/complete`,
      "POST",
      {
        approve: true,
        reuse: true,
        userId: details.userId,
      },
    )
      .then((result) => window.location.replace(result.redirectTo))
      .catch((error: unknown) => {
        setError(
          error instanceof Error
            ? error.message
            : copy("Не удалось продолжить вход"),
        );
      });
  }, [details.uid, details.userId, copy]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-7 text-center shadow-sm">
        {error ? (
          <>
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(error)}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              {copy("Проверить снова ")}
            </Button>
          </>
        ) : (
          <>
            <LoaderCircle
              aria-hidden
              className="mx-auto size-6 animate-spin text-muted-foreground"
            />
            <h1 className="text-lg font-semibold">
              {copy("Входим в ")}
              {details.name}…
            </h1>
            <p
              role="status"
              className="break-all text-sm text-muted-foreground"
            >
              {details.email}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
