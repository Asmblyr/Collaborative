"use client";
import { useId, useState } from "react";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { AssistantChat } from "./assistant-chat";
import { AssistantPanel } from "./assistant-panel";
import { AssistantSettings } from "./assistant-settings";
import { useAssistant } from "./use-assistant";
import { useAssistantContext } from "./assistant-context";
import { contextLabel } from "./assistant-context-types";

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);
  const page = useAssistantContext();
  const assistant = useAssistant(
    open,
    contextEnabled ? (page?.context ?? null) : null,
  );
  const titleId = useId(),
    descriptionId = useId();
  if (!assistant.status.available) {
    return null;
  }
  return (
    <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 sm:right-6">
      <Popover
        open={open}
        onOpenChange={setOpen}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                data-thinking={assistant.pending}
                className="assistant-launcher relative isolate size-12 rounded-2xl border-foreground/15 bg-popover text-popover-foreground shadow-lg"
                aria-label={open ? "Свернуть ассистента" : "Открыть ассистента"}
              >
                <span
                  className="assistant-launcher-glow"
                  aria-hidden="true"
                />
                {open ? (
                  <ChevronDown className="size-5" />
                ) : (
                  <Sparkles className="size-5" />
                )}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left">Ассистент</TooltipContent>
        </Tooltip>
        <AssistantPanel
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-thinking={assistant.pending}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById(titleId)?.focus();
          }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <span
            className="assistant-panel-glow"
            aria-hidden="true"
          >
            <span className="assistant-glow-halo" />
            <span className="assistant-glow-edge" />
          </span>
          <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4">
            <Sparkles className="size-4" />
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                tabIndex={-1}
                className="text-sm font-semibold outline-none"
              >
                Ассистент Asmblyr
              </h2>
              <p
                id={descriptionId}
                className="truncate text-xs text-muted-foreground"
              >
                {assistant.status.model}
              </p>
            </div>
            <AssistantSettings
              status={assistant.status}
              value={assistant.settings}
              onChange={assistant.setSettings}
              disabled={assistant.pending}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Новый диалог"
              onClick={assistant.restart}
            >
              <Plus />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Свернуть ассистента"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </header>
          <AssistantChat
            messages={assistant.messages}
            draft={assistant.draft}
            pending={assistant.pending}
            progress={assistant.progress}
            stopping={assistant.stopping}
            onStop={assistant.stop}
            onDraft={assistant.setDraft}
            onSend={assistant.send}
            error={assistant.error}
            onRetry={assistant.retry}
            errorSummary={assistant.errorSummary}
            maxLength={assistant.status.limits?.maxMessageChars ?? 8000}
            contextControl={
              <label className="mb-2.5 flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {contextEnabled
                      ? contextLabel(
                          page?.context ?? null,
                          page?.collectionDisplayName,
                        )
                      : "Без контекста страницы"}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {contextEnabled
                      ? `${page?.workspaceName ?? "Все коллекции"} · чтение данных и фильтры`
                      : "Только сообщения этого диалога"}
                  </span>
                </span>
                <Switch
                  aria-label="Передавать контекст страницы"
                  checked={contextEnabled}
                  onCheckedChange={setContextEnabled}
                />
              </label>
            }
          />
        </AssistantPanel>
      </Popover>
    </div>
  );
}
