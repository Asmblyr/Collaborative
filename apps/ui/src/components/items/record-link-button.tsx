"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { itemHref } from "@/lib/item-location";

export function RecordLinkButton({ collection, id }: { collection: string; id: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  useEffect(() => {
    if (status === "idle") return;
    const timer = window.setTimeout(() => setStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [status]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(new URL(itemHref(collection, id), window.location.origin).href);
      setStatus("copied");
    } catch { setStatus("error"); }
  }
  return <div className="shrink-0 text-right">
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label="Скопировать ссылку на запись">
      {status === "copied" ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />}
      {status === "copied" ? "Скопировано" : "Ссылка"}
    </Button>
    <span role="status" className={status === "error" ? "block text-xs text-destructive" : "sr-only"}>
      {status === "error" ? "Не удалось скопировать ссылку" : status === "copied" ? "Ссылка скопирована" : ""}
    </span>
  </div>;
}
