"use client";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { PortalContainerContext } from "@asmblyr-collaborative/kit/ui/portal-container";
import {
  ChevronDown,
  CircleAlert,
  History,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AssistantChat } from "./assistant-chat";
import { AssistantPanel } from "./assistant-panel";
import { AssistantSettings } from "./assistant-settings";
import { AssistantConnections } from "./assistant-connections";
import { AssistantHistory } from "./assistant-history";
import { useAssistant } from "./use-assistant";
import { useAssistantContext } from "./assistant-context";
import { useAssistantHost } from "./assistant-host";
import { AssistantContextControl } from "./assistant-context-control";
import { useUiCopy } from "@/lib/ui-copy";
import { showAssistantWidget } from "./assistant-status-state";
import { AssistantAvailability } from "./assistant-availability";
import { AssistantIconButton } from "./assistant-icon-button";

export function AssistantWidget() {
  const copy = useUiCopy();

  const host = useAssistantHost()!;
  const {
    open,
    setOpen,
    contextEnabled,
    setContextEnabled,
    dataEnabled,
    setAvailable,
  } = host;
  const [historyOpen, setHistoryOpen] = useState(false);
  const page = useAssistantContext();
  const context = host.host?.context ??
    page?.context ?? { page: "home", workspaceId: null };
  // The editor's content wrapper also becomes inert during discard confirmation.
  const container = host.host?.container
    .firstElementChild as HTMLElement | null;
  const dataAccess = { enabled: dataEnabled, workspaceId: context.workspaceId };
  const assistant = useAssistant(
    open,
    contextEnabled ? context : null,
    dataAccess,
  );
  const visible = showAssistantWidget(assistant.availability, open);
  useEffect(() => {
    setAvailable(visible);
  }, [setAvailable, visible]);
  const titleId = useId(),
    descriptionId = useId();
  if (!visible) {
    return null;
  }
  let launcherLabel = copy("Открыть ассистента");
  if (open) {
    launcherLabel = copy("Свернуть ассистента");
  } else if (assistant.availability.failure) {
    launcherLabel = copy("Открыть ассистента · подключение недоступно");
  }
  const widget = (
    <PortalContainerContext.Provider value={container}>
      <div
        className={
          container
            ? "fixed bottom-[calc(7.5rem+env(safe-area-inset-bottom))] right-4 z-40 sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:right-6"
            : "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 sm:right-6"
        }
      >
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
                  aria-label={launcherLabel}
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
                  {assistant.availability.failure && !open && (
                    <CircleAlert
                      className="absolute -right-1 -top-1 size-4 rounded-full bg-popover text-destructive"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent
              side="left"
              portalContainer={container}
            >
              {copy("Ассистент")}
            </TooltipContent>
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
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              setOpen(false);
            }}
          >
            <span
              className="assistant-panel-glow"
              aria-hidden="true"
            >
              <span className="assistant-glow-halo" />
              <span className="assistant-glow-edge" />
            </span>
            <header className="assistant-header flex shrink-0 items-center gap-2 px-4 pb-3 pt-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Sparkles className="size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <h2
                    id={titleId}
                    tabIndex={-1}
                    className="truncate text-sm font-semibold outline-none"
                    title={copy("Ассистент Asmblyr ")}
                  >
                    {copy("Ассистент Asmblyr ")}
                  </h2>
                  <p
                    id={descriptionId}
                    className="truncate text-xs text-muted-foreground"
                  >
                    {assistant.status.model}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <AssistantConnections />
                <AssistantSettings
                  status={assistant.status}
                  value={assistant.settings}
                  onChange={assistant.setSettings}
                  disabled={assistant.pending || !assistant.statusReady}
                />
                <AssistantIconButton
                  label={copy("История сессий")}
                  disabled={assistant.pending || !assistant.statusReady}
                  onClick={() => {
                    setHistoryOpen((value) => !value);
                    void assistant.history.loadList();
                  }}
                >
                  <History />
                </AssistantIconButton>
                <AssistantIconButton
                  label={copy("Новая сессия")}
                  hint={copy(
                    "Новый разговор · переписка и черновики сохранятся",
                  )}
                  disabled={
                    assistant.pending ||
                    assistant.history.loading ||
                    !assistant.statusReady
                  }
                  onClick={() => {
                    setHistoryOpen(false);
                    void assistant.restart();
                  }}
                >
                  <Plus />
                </AssistantIconButton>
                <AssistantIconButton
                  label={copy("Свернуть ассистента")}
                  onClick={() => setOpen(false)}
                >
                  <X />
                </AssistantIconButton>
              </div>
            </header>
            <AssistantAvailability
              state={assistant.availability}
              onRetry={() => {
                void assistant.reloadStatus();
              }}
            />
            {historyOpen ? (
              <AssistantHistory
                items={assistant.history.items}
                selectedId={assistant.history.conversation?.id}
                loading={assistant.history.loading}
                error={assistant.history.error}
                more={Boolean(assistant.history.cursor)}
                hasDraft={assistant.hasDraft}
                onBack={() => setHistoryOpen(false)}
                onSelect={(id) => {
                  void assistant.history.select(id).then((selected) => {
                    if (selected) {
                      setHistoryOpen(false);
                    }
                  });
                }}
                onDelete={(id) => void assistant.history.remove(id)}
                onMore={() => void assistant.history.loadMore()}
              />
            ) : (
              <>
                {assistant.savedDraftId && (
                  <div
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    <span>{copy("Черновик остался в предыдущей сессии.")}</span>
                    <Button
                      size="sm"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      disabled={assistant.pending || assistant.history.loading}
                      onClick={() => {
                        if (assistant.savedDraftId) {
                          void assistant.history.select(assistant.savedDraftId);
                        }
                      }}
                    >
                      {copy("Вернуться к черновику")}
                    </Button>
                  </div>
                )}
                {Boolean(assistant.history.conversation?.compactionCount) && (
                  <p
                    className="border-t px-4 py-2 text-xs text-muted-foreground"
                    role="status"
                  >
                    {copy("Контекст сжат · полная переписка сохранена")}
                  </p>
                )}
                {assistant.history.messageCursor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mx-3 mb-1"
                    disabled={assistant.pending || assistant.history.loading}
                    onClick={() => void assistant.history.loadOlder()}
                  >
                    {copy("Показать предыдущие сообщения")}
                  </Button>
                )}
                <AssistantChat
                  messages={assistant.messages}
                  draft={assistant.draft}
                  pending={assistant.pending}
                  progress={assistant.progress}
                  stopping={assistant.stopping}
                  onStop={assistant.stop}
                  onDraft={assistant.setDraft}
                  onSend={assistant.send}
                  sendEnabled={assistant.sendEnabled}
                  error={assistant.error ?? assistant.history.error}
                  onRetry={assistant.retry}
                  errorSummary={assistant.errorSummary}
                  maxLength={assistant.status.limits?.maxMessageChars ?? 8000}
                  welcomeContext={contextEnabled ? context : null}
                  contextControl={
                    <AssistantContextControl
                      context={context}
                      enabled={contextEnabled}
                      onEnabledChange={setContextEnabled}
                      collectionDisplayName={page?.collectionDisplayName}
                      workspaceName={page?.workspaceName}
                      messages={assistant.messages}
                      pending={assistant.pending}
                      dataAccess={dataAccess}
                    />
                  }
                />
              </>
            )}
          </AssistantPanel>
        </Popover>
      </div>
    </PortalContainerContext.Provider>
  );
  return container ? createPortal(widget, container) : widget;
}
