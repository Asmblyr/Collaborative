"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { itemHref } from "@/lib/item-location";
import { useUiCopy } from "@/lib/ui-copy";

export function RecordLinkButton({
  collection,
  id,
}: {
  collection: string;
  id: string;
}) {
  const copy = useUiCopy();

  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        new URL(itemHref(collection, id), window.location.origin).href,
      );
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return (
    <div className="shrink-0 text-right">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copyLink}
        aria-label={copy("Скопировать ссылку на запись")}
      >
        {status === "copied" ? (
          <Check aria-hidden="true" />
        ) : (
          <Link2 aria-hidden="true" />
        )}
        {status === "copied" ? copy("Скопировано") : copy("Ссылка")}
      </Button>
      <span
        role="status"
        className={
          status === "error" ? "block text-xs text-destructive" : "sr-only"
        }
      >
        {status === "error"
          ? copy("Не удалось скопировать ссылку")
          : status === "copied"
            ? copy("Ссылка скопирована")
            : ""}
      </span>
    </div>
  );
}
