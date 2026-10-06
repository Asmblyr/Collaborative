"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUiCopy } from "@/lib/ui-copy";

export function ItemRecordLoading({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const copy = useUiCopy();

  return (
    <div
      className="space-y-6"
      aria-busy={!message}
    >
      {message ? (
        <div className="space-y-4">
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(message)}
          </p>
          <Button
            variant="outline"
            onClick={onRetry}
          >
            {copy("Повторить ")}
          </Button>
        </div>
      ) : (
        <>
          <p
            role="status"
            className="sr-only"
          >
            {copy("Загрузка записи… ")}
          </p>
          <Skeleton className="h-9 w-full" />
          <div
            aria-hidden="true"
            className="space-y-6"
          >
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="space-y-2"
              >
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
