"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { MessageFooter } from "@/components/ui/message";
import { useUiCopy } from "@/lib/ui-copy";
import { AssistantIconButton } from "./assistant-icon-button";
import type { AssistantMessage } from "./assistant-types";

type CopyResult = {
  content: string;
  state: "copying" | "copied" | "error";
};

export function AssistantCopyAnswer({
  message,
}: {
  message: AssistantMessage;
}) {
  const copy = useUiCopy();
  const [result, setResult] = useState<CopyResult | null>(null);
  const state = result?.content === message.content ? result.state : "idle";

  useEffect(() => {
    if (result?.state !== "copied") {
      return;
    }

    const timeout = window.setTimeout(() => setResult(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [result]);

  if (
    message.role !== "assistant" ||
    message.streaming ||
    !message.content.trim()
  ) {
    return null;
  }

  const failed = state === "error";
  const copied = state === "copied";
  const label = copied ? copy("Скопировано") : copy("Копировать ответ");
  let feedback = "";
  if (failed) {
    feedback = copy(
      "Не удалось скопировать. Выделите текст ответа и скопируйте вручную.",
    );
  } else if (copied) {
    feedback = copy("Ответ скопирован");
  }

  async function copyAnswer() {
    const content = message.content;
    setResult({ content, state: "copying" });

    try {
      await navigator.clipboard.writeText(content);
      setResult({ content, state: "copied" });
    } catch {
      setResult({ content, state: "error" });
    }
  }

  return (
    <MessageFooter className="gap-2">
      <AssistantIconButton
        label={label}
        size="icon-xs"
        disabled={state === "copying"}
        onClick={() => void copyAnswer()}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </AssistantIconButton>
      <span
        role="status"
        className={failed ? "font-normal" : "sr-only"}
      >
        {feedback}
      </span>
    </MessageFooter>
  );
}
