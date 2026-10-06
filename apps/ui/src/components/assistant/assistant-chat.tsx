"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { AssistantMessage } from "./assistant-types";
import type { PageContext } from "./assistant-context-types";
import { AssistantWelcome } from "./assistant-welcome";
import { AssistantMessageContent } from "./assistant-message-content";
import { AssistantFilterProposal } from "./assistant-filter-proposal";
import type {
  AssistantProgress as Progress,
  AssistantTurnSummary,
} from "@asmblyr-collaborative/contracts";
import { AssistantProgress } from "./assistant-progress";
import { AssistantSelectionCard } from "./assistant-selection";
import { AssistantPluginResultCard } from "./assistant-plugin-result";
import { AssistantConnectionWrite } from "./assistant-connection-write";
import { AssistantUsageSummary } from "./assistant-usage-summary";
import { AssistantScrollOnSend } from "./assistant-scroll-on-send";
import { useUiCopy } from "@/lib/ui-copy";
import { assistantContextBoundaries } from "./assistant-context-state";
import { AssistantContextBoundary } from "./assistant-context-boundary";
import { AssistantCopyAnswer } from "./assistant-copy-answer";

export function AssistantChat({
  messages,
  draft,
  pending,
  progress,
  stopping,
  onStop,
  onDraft,
  onSend,
  sendEnabled,
  error,
  errorSummary,
  onRetry,
  maxLength,
  contextControl,
  welcomeContext = null,
}: {
  messages: AssistantMessage[];
  draft: string;
  pending: boolean;
  progress: Progress | null;
  stopping: boolean;
  onStop: () => void;
  onDraft: (value: string) => void;
  onSend: (value: string) => boolean;
  sendEnabled: boolean;
  error: string | null;
  onRetry?: () => void;
  maxLength: number;
  contextControl?: React.ReactNode;
  welcomeContext?: PageContext | null;
  errorSummary?: AssistantTurnSummary;
}) {
  const copy = useUiCopy();

  const input = useRef<HTMLTextAreaElement>(null);
  const conversationMessages = messages.filter(
    (message) => message.id !== "welcome",
  );
  const lastUserMessage = messages.findLast(
    (message) => message.role === "user",
  );
  const contextBoundaries = assistantContextBoundaries(conversationMessages);
  function submit() {
    if (onSend(draft)) {
      onDraft("");
      input.current?.focus();
    }
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 min-w-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <AssistantScrollOnSend messageId={lastUserMessage?.id} />
          <MessageScroller>
            <MessageScrollerViewport
              aria-label={copy("Сообщения чата")}
              tabIndex={0}
            >
              <MessageScrollerContent className="gap-5 px-4 pb-5 pt-3">
                {conversationMessages.length === 0 && !pending && (
                  <AssistantWelcome
                    context={welcomeContext}
                    onPrompt={(prompt) => {
                      onDraft(prompt);
                      input.current?.focus();
                    }}
                  />
                )}
                {conversationMessages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                  >
                    {contextBoundaries.has(message.id) && (
                      <AssistantContextBoundary label={message.contextLabel} />
                    )}
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent
                        className={
                          message.role === "user" ? "max-w-[88%]" : "max-w-full"
                        }
                      >
                        <MessageHeader>
                          {message.role === "user" ? copy("Вы") : "Asmblyr"}
                        </MessageHeader>
                        {message.contextLabel && (
                          <p className="text-[10px] text-muted-foreground">
                            {message.contextLabel}
                          </p>
                        )}
                        {message.role === "assistant" && (
                          <AssistantProgress
                            activity={message.activity}
                            draft={message.activityDraft}
                            working={Boolean(message.streaming && pending)}
                            startedAt={message.startedAt}
                            progress={progress}
                            summary={message.summary}
                            stopping={stopping}
                            onStop={onStop}
                          />
                        )}
                        {message.content && (
                          <div
                            className={`min-w-0 rounded-2xl px-3 py-2.5 ${
                              message.role === "user"
                                ? "whitespace-pre-wrap rounded-br-md bg-primary text-sm leading-6 text-primary-foreground [overflow-wrap:anywhere]"
                                : "rounded-bl-md bg-muted/60"
                            }`}
                          >
                            {message.role === "user" ? (
                              message.content
                            ) : (
                              <AssistantMessageContent
                                content={message.content}
                              />
                            )}
                          </div>
                        )}
                        {message.truncated && (
                          <p className="text-xs text-muted-foreground">
                            {copy(
                              "Ответ достиг ограничения длины. Можно попросить продолжить. ",
                            )}
                          </p>
                        )}
                        {(message.cancelled || message.failed) && (
                          <p className="text-xs text-muted-foreground">
                            {message.cancelled
                              ? copy("Ответ остановлен.")
                              : copy(
                                  "Ответ не завершён: соединение прервалось или произошла ошибка.",
                                )}
                          </p>
                        )}
                        <AssistantCopyAnswer message={message} />
                        {message.role === "assistant" &&
                          message.proposals?.map((proposal, index) => (
                            <AssistantFilterProposal
                              key={index}
                              proposal={proposal}
                            />
                          ))}
                        {message.role === "assistant" &&
                          message.connectionWrites?.map((proposal) => (
                            <AssistantConnectionWrite
                              key={proposal.id}
                              proposal={proposal}
                            />
                          ))}
                        {message.role === "assistant" &&
                          message.selections?.map((selection) => (
                            <AssistantSelectionCard
                              key={selection.resultId}
                              selection={selection}
                            />
                          ))}
                        {message.role === "assistant" &&
                          message.pluginResults?.map((result) => (
                            <AssistantPluginResultCard
                              key={result.draftId}
                              result={result}
                            />
                          ))}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton aria-label={copy("К последнему сообщению")}>
              <ArrowDown className="size-4" />
            </MessageScrollerButton>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <form
        className="assistant-composer shrink-0 border-t bg-background/60 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {contextControl}
        {error && (
          <div
            role="alert"
            className="mb-3 max-h-28 space-y-2 overflow-y-auto rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive"
          >
            <p>{copy(error)}</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || !sendEnabled}
                onClick={onRetry}
              >
                <RotateCcw />
                {copy("Повторить ")}
              </Button>
            )}
            {errorSummary && <AssistantUsageSummary summary={errorSummary} />}
          </div>
        )}
        <InputGroup className="bg-background">
          <InputGroupTextarea
            ref={input}
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
            aria-label={copy("Сообщение ассистенту")}
            aria-describedby="assistant-input-hint"
            placeholder={copy("Спросите что-нибудь…")}
            rows={2}
            maxLength={maxLength}
            className="max-h-[min(8rem,20cqh)] min-h-12 text-sm"
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <InputGroupAddon
            align="block-end"
            className="assistant-composer-actions justify-between"
          >
            <span
              id="assistant-input-hint"
              className="text-[11px] font-normal text-muted-foreground"
            >
              {copy("Shift + Enter — новая строка ")}
            </span>
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="rounded-full"
              disabled={!draft.trim() || pending || !sendEnabled}
              aria-label={copy("Отправить сообщение")}
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="assistant-composer-notice mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          {copy(
            "Запрошенные данные передаются AI-провайдеру · ответы стоит проверять ",
          )}
        </p>
      </form>
    </div>
  );
}
