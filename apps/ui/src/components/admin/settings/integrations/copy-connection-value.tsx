"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { usePortalContainer } from "@asmblyr-collaborative/kit/ui/portal-container";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUiCopy } from "@/lib/ui-copy";

/** Only used for public configuration values; SecretFields never renders this. */
export function CopyConnectionValue({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const copy = useUiCopy();
  const container = usePortalContainer();
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    if (status !== "copied") {
      return;
    }
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);

  const copied = status === "copied";
  const hint = copied
    ? copy("Скопировано")
    : copy("Копировать {{value0}}", { value0: label });
  let feedback = "";
  if (status === "error") {
    feedback = copy(
      "Не удалось скопировать. Выделите значение и скопируйте вручную.",
    );
  } else if (copied) {
    feedback = copy("Скопировано");
  }

  async function copyValue() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute right-1 top-1"
            aria-label={hint}
            disabled={!value}
            onClick={() => void copyValue()}
          >
            {copied ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent portalContainer={container}>{hint}</TooltipContent>
      </Tooltip>
      <span
        role="status"
        className={
          status === "error"
            ? "mt-1 block text-xs text-muted-foreground"
            : "sr-only"
        }
      >
        {feedback}
      </span>
    </>
  );
}
