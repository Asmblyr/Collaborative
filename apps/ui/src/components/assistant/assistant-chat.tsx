"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
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
import { suggestions, type AssistantMessage } from "./assistant-types";
import { AssistantMessageContent } from "./assistant-message-content";
import { AssistantFilterProposal } from "./assistant-filter-proposal";
import type {
  AssistantProgress as Progress,
  AssistantTurnSummary,
} from "@asmblyr/contracts";
import { AssistantProgress } from "./assistant-progress";
import { AssistantSelectionCard } from "./assistant-selection";
import { AssistantPluginResultCard } from "./assistant-plugin-result";
import { AssistantUsageSummary } from "./assistant-usage-summary";
import { AssistantScrollOnSend } from "./assistant-scroll-on-send";

export function AssistantChat({
  messages,
  draft,
  pending,
  progress,
  stopping,
  onStop,
  onDraft,
  onSend,
  error,
  errorSummary,
  onRetry,
  maxLength,
  contextControl,
}: {
  messages: AssistantMessage[];
  draft: string;
  pending: boolean;
  progress: Progress | null;
  stopping: boolean;
  onStop: () => void;
  onDraft: (value: string) => void;
  onSend: (value: string) => boolean;
  error: string | null;
  onRetry?: () => void;
  maxLength: number;
  contextControl?: React.ReactNode;
  errorSummary?: AssistantTurnSummary;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const lastUserMessage = messages.findLast(
    (message) => message.role === "user",
  );
  function submit() {
    if (onSend(draft)) {
      onDraft("");
      input.current?.focus();
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <MessageScrollerProvider autoScroll>
          <AssistantScrollOnSend messageId={lastUserMessage?.id} />
          <MessageScroller>
            <MessageScrollerViewport
              aria-label="Сообщения чата"
              tabIndex={0}
            >
              <MessageScrollerContent className="gap-5 px-4 pb-5 pt-3">
                <div className="mb-1 flex flex-col items-center gap-2 py-3 text-center">
                  <div className="flex size-10 items-center justify-center rounded-2xl border bg-muted/50">
                    <Sparkles className="size-5" />
                  </div>
                  <p className="text-sm font-medium">
                    Помощь рядом с вашими данными
                  </p>
                  <p className="max-w-64 text-xs leading-5 text-muted-foreground">
                    Вопросы, подсказки и важные события — в одном месте.
                  </p>
                </div>
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageContent
                        className={
                          message.role === "user" ? "max-w-[88%]" : "max-w-full"
                        }
                      >
                        <MessageHeader>
                          {message.role === "user" ? "Вы" : "Asmblyr"}
                        </MessageHeader>
                        {message.contextLabel && (
                          <p className="text-[10px] text-muted-foreground">
                            {message.contextLabel}
                          </p>
                        )}
                        <div
                          className={`rounded-2xl px-3 py-2.5 ${
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
                        {message.truncated && (
                          <p className="text-xs text-muted-foreground">
                            Ответ достиг ограничения длины. Можно попросить
                            продолжить.
                          </p>
                        )}
                        {(message.cancelled || message.failed) && (
                          <p className="text-xs text-muted-foreground">
                            {message.cancelled
                              ? "Ответ остановлен."
                              : "Ответ не завершён: соединение прервалось или произошла ошибка."}
                          </p>
                        )}
                        {message.role === "assistant" &&
                          message.proposals?.map((proposal, index) => (
                            <AssistantFilterProposal
                              key={index}
                              proposal={proposal}
                            />
                          ))}
                        {message.role === "assistant" && message.summary && (
                          <AssistantUsageSummary summary={message.summary} />
                        )}
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
                {pending && (
                  <MessageScrollerItem>
                    <AssistantProgress
                      progress={progress}
                      stopping={stopping}
                      onStop={onStop}
                    />
                  </MessageScrollerItem>
                )}
                {messages.length === 1 && (
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((suggestion) => (
                      <Button
                        key={suggestion}
                        variant="outline"
                        size="sm"
                        className="h-auto whitespace-normal py-1.5 text-left text-xs"
                        onClick={() => onSend(suggestion)}
                      >
                        {suggestion}
                      </Button>
                    ))}
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton aria-label="К последнему сообщению">
              <ArrowDown className="size-4" />
            </MessageScrollerButton>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
      <form
        className="shrink-0 border-t bg-background/60 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {contextControl}
        {error && (
          <div
            role="alert"
            className="mb-3 space-y-2 rounded-lg bg-destructive/10 p-3 text-xs leading-5 text-destructive"
          >
            <p>{error}</p>
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={onRetry}
              >
                <RotateCcw />
                Повторить
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
            aria-label="Сообщение ассистенту"
            aria-describedby="assistant-input-hint"
            placeholder="Спросите что-нибудь…"
            rows={2}
            maxLength={maxLength}
            className="max-h-32 min-h-16 text-sm"
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
            className="justify-between"
          >
            <span
              id="assistant-input-hint"
              className="text-[11px] font-normal text-muted-foreground"
            >
              Shift + Enter — новая строка
            </span>
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              className="rounded-full"
              disabled={!draft.trim() || pending}
              aria-label="Отправить сообщение"
            >
              <ArrowUp />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
        <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          Запрошенные данные передаются AI-провайдеру · ответы стоит проверять
        </p>
      </form>
    </div>
  );
}
