"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantHost } from "./assistant-host";

export function AssistantRecordButton({
  id,
  disabled,
}: {
  id: string;
  disabled: boolean;
}) {
  const assistant = useAssistantHost();
  const copy = useUiCopy();
  if (!assistant?.available || !id || id.startsWith("draft:")) {
    return null;
  }

  const label = copy("Спросить об этой записи");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={assistant.askRecord}
    >
      <Sparkles className="size-4" />
    </Button>
  );
}
