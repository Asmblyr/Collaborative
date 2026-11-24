"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Sparkles, X } from "lucide-react";
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
  AssistantSkillSummary,
  AssistantTurnSummary,
} from "@asmblyr-collaborative/contracts";
import { AssistantProgress } from "./assistant-progress";
import { AssistantSelectionCard } from "./assistant-selection";
import { AssistantPluginResultCard } from "./assistant-plugin-result";
import { AssistantConnectionWrite } from "./assistant-connection-write";
import { AssistantWriteProposal } from "./assistant-write-proposal";
import { AssistantRecordCard } from "./assistant-record-card";
import { AssistantFormCard } from "./assistant-form-card";
import { AssistantUsageSummary } from "./assistant-usage-summary";
import { AssistantScrollOnSend } from "./assistant-scroll-on-send";
import { useUiCopy } from "@/lib/ui-copy";
import { assistantContextBoundaries } from "./assistant-context-state";
import { AssistantContextBoundary } from "./assistant-context-boundary";
import { AssistantCopyAnswer } from "./assistant-copy-answer";
import { AssistantSkillMenu } from "./assistant-skill-menu";
import {
  filterAndGroupSkills,
  parseSlashSkillQuery,
  stripSlashSkillPrefix,
} from "./assistant-skills-state";

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
  onRegenerate,
  maxLength,
  contextControl,
  welcomeContext = null,
  skills = [],
  skillsLoading = false,
  currentCollection = null,
  selectedSkill = null,
  onSelectSkill,
  onSkillMenuOpenChange,
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
  onRegenerate?: () => void;
  maxLength: number;
  contextControl?: React.ReactNode;
  welcomeContext?: PageContext | null;
  errorSummary?: AssistantTurnSummary;
  skills?: readonly AssistantSkillSummary[];
  skillsLoading?: boolean;
  currentCollection?: string | null;
  selectedSkill?: AssistantSkillSummary | null;
  onSelectSkill?: (skill: AssistantSkillSummary | null) => void;
  onSkillMenuOpenChange?: (open: boolean) => void;
}) {
  const copy = useUiCopy();

  const input = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const skillListboxId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [dismissedSlashDraft, setDismissedSlashDraft] = useState<string | null>(
    null,
  );
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);

  const slashQuery = parseSlashSkillQuery(draft);
  const effectiveDismissed =
    dismissedSlashDraft !== null && dismissedSlashDraft === draft;
  const menuMode: "slash" | "picker" | null = pickerOpen
    ? "picker"
    : slashQuery !== null && !effectiveDismissed
      ? "slash"
      : null;
  const menuOpen = menuMode !== null && !pending && sendEnabled;
  const activeQuery = menuMode === "picker" ? pickerQuery : (slashQuery ?? "");

  const groupedSkills = useMemo(
    () => filterAndGroupSkills(skills, activeQuery, currentCollection),
    [skills, activeQuery, currentCollection],
  );
  const safeActiveIndex =
    groupedSkills.flatSkills.length > 0
      ? Math.min(activeSkillIndex, groupedSkills.flatSkills.length - 1)
      : 0;

  useEffect(() => {
    onSkillMenuOpenChange?.(menuOpen);
    return () => {
      onSkillMenuOpenChange?.(false);
    };
  }, [menuOpen, onSkillMenuOpenChange]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      if (
        composerRef.current &&
        event.target instanceof Node &&
        !composerRef.current.contains(event.target)
      ) {
        setPickerOpen(false);
        setPickerQuery("");
        if (slashQuery !== null) {
          setDismissedSlashDraft(draft);
        }
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setPickerOpen(false);
        setPickerQuery("");
        if (slashQuery !== null) {
          setDismissedSlashDraft(draft);
        }
        input.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [menuOpen, slashQuery, draft]);

  function closeSkillMenu() {
    setPickerOpen(false);
    setPickerQuery("");
    if (slashQuery !== null) {
      setDismissedSlashDraft(draft);
    }
    input.current?.focus();
  }

  function attachSkill(skill: AssistantSkillSummary) {
    onSelectSkill?.(skill);
    if (draft.startsWith("/")) {
      onDraft(stripSlashSkillPrefix(draft));
    }
    setPickerOpen(false);
    setPickerQuery("");
    setDismissedSlashDraft(null);
    setActiveSkillIndex(0);
    input.current?.focus();
  }

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
      setPickerOpen(false);
      setPickerQuery("");
      setDismissedSlashDraft(null);
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
                    skills={skills}
                    onPrompt={(prompt) => {
                      onDraft(prompt);
                      input.current?.focus();
                    }}
                    onSkillExample={(skill, prompt) => {
                      onSelectSkill?.(skill);
                      onDraft(prompt);
                      setPickerOpen(false);
                      setPickerQuery("");
                      setDismissedSlashDraft(null);
                      input.current?.focus();
                    }}
                  />
                )}
                {conversationMessages.map((message, index) => {
                  const isLastMessage =
                    index === conversationMessages.length - 1;
                  const trimmedContent = message.content.trim();
                  const redundantStatusBubble =
                    message.role === "assistant" &&
                    ((Boolean(message.cancelled) &&
                      trimmedContent === copy("Запрос остановлен.")) ||
                      (Boolean(message.failed) &&
                        trimmedContent ===
                          copy("Не удалось завершить ответ.")));
                  const showContentBubble =
                    Boolean(trimmedContent) && !redundantStatusBubble;
                  const showInlineRetry = Boolean(
                    isLastMessage &&
                      !pending &&
                      onRetry &&
                      (message.cancelled || message.failed),
                  );

                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                    >
                      {contextBoundaries.has(message.id) && (
                        <AssistantContextBoundary
                          label={message.contextLabel}
                        />
                      )}
                      <Message
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <MessageContent
                          className={
                            message.role === "user"
                              ? "max-w-[88%]"
                              : "max-w-full"
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
                          {message.role === "user" && message.skillSlug && (
                            <div className="flex justify-end">
                              <span
                                className="inline-flex max-w-full items-center gap-1 rounded-md border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-primary"
                                title={
                                  message.skillTitle
                                    ? copy("Активное умение: {{value0}}", {
                                        value0: message.skillTitle,
                                      })
                                    : `/${message.skillSlug}`
                                }
                              >
                                <Sparkles
                                  className="size-2.5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="truncate">
                                  /{message.skillSlug}
                                </span>
                              </span>
                            </div>
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
                          {showContentBubble && (
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
                                "Ответ достиг ограничения длины. Можно попросить продолжить.",
                              )}
                            </p>
                          )}
                          {(message.cancelled || message.failed) && (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <p>
                                {message.cancelled
                                  ? copy("Ответ остановлен.")
                                  : copy(
                                      "Ответ не завершён: соединение прервалось или произошла ошибка.",
                                    )}
                              </p>
                              {showInlineRetry && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1.5 px-2.5 text-xs"
                                  disabled={pending || !sendEnabled}
                                  onClick={onRetry}
                                >
                                  <RotateCcw className="size-3" />
                                  {copy("Повторить")}
                                </Button>
                              )}
                            </div>
                          )}
                          <AssistantCopyAnswer
                            message={message}
                            onRegenerate={
                              isLastMessage ? onRegenerate : undefined
                            }
                            regenerateDisabled={pending || !sendEnabled}
                          />
                          {message.role === "assistant" &&
                            message.proposals?.map(
                              (proposal, proposalIndex) => (
                                <AssistantFilterProposal
                                  key={proposalIndex}
                                  proposal={proposal}
                                />
                              ),
                            )}
                          {message.role === "assistant" &&
                            message.connectionWrites?.map((proposal) => (
                              <AssistantConnectionWrite
                                key={proposal.id}
                                proposal={proposal}
                              />
                            ))}
                          {message.role === "assistant" &&
                            message.writeProposals?.map((proposal) => (
                              <AssistantWriteProposal
                                key={proposal.proposalId}
                                proposal={proposal}
                              />
                            ))}
                          {message.role === "assistant" &&
                            message.records?.map((record) => (
                              <AssistantRecordCard
                                key={`${record.collection}:${record.recordId}`}
                                record={record}
                              />
                            ))}
                          {message.role === "assistant" &&
                            message.forms?.map((form, formIndex) => (
                              <AssistantFormCard
                                key={`${form.collection}:${formIndex}`}
                                form={form}
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
                  );
                })}
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
                {copy("Повторить")}
              </Button>
            )}
            {errorSummary && <AssistantUsageSummary summary={errorSummary} />}
          </div>
        )}
        <div
          ref={composerRef}
          className="relative"
        >
          <AssistantSkillMenu
            open={menuOpen}
            mode={menuMode ?? "slash"}
            query={activeQuery}
            onQueryChange={(nextQuery) => {
              setPickerQuery(nextQuery);
              setActiveSkillIndex(0);
            }}
            collectionSkills={groupedSkills.collectionSkills}
            generalSkills={groupedSkills.generalSkills}
            totalCount={skills.length}
            activeIndex={safeActiveIndex}
            onActiveIndexChange={setActiveSkillIndex}
            selectedSlug={selectedSkill?.slug ?? null}
            loading={skillsLoading}
            onSelect={attachSkill}
            onClose={closeSkillMenu}
            listboxId={skillListboxId}
          />
          <InputGroup className="bg-background">
            {selectedSkill && (
              <InputGroupAddon
                align="block-start"
                className="pb-0 pt-2"
              >
                <span
                  data-slot="assistant-selected-skill"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs text-foreground"
                  title={copy("Активное умение: {{value0}}", {
                    value0: selectedSkill.title,
                  })}
                >
                  <span className="shrink-0 font-mono text-[11px] font-medium text-primary">
                    /{selectedSkill.slug}
                  </span>
                  <span className="truncate text-xs font-medium">
                    · {selectedSkill.title}
                  </span>
                  <button
                    type="button"
                    className="ml-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/15 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={copy("Убрать умение")}
                    disabled={pending}
                    onClick={() => {
                      onSelectSkill?.(null);
                      input.current?.focus();
                    }}
                  >
                    <X
                      className="size-3"
                      aria-hidden="true"
                    />
                  </button>
                </span>
              </InputGroupAddon>
            )}
            <InputGroupTextarea
              ref={input}
              value={draft}
              onChange={(event) => {
                const nextValue = event.target.value;
                onDraft(nextValue);
                setActiveSkillIndex(0);
                if (
                  dismissedSlashDraft !== null &&
                  nextValue !== dismissedSlashDraft
                ) {
                  setDismissedSlashDraft(null);
                }
              }}
              aria-label={copy("Сообщение ассистенту")}
              aria-describedby="assistant-input-hint"
              aria-expanded={menuMode === "slash" && menuOpen}
              aria-controls={menuOpen ? skillListboxId : undefined}
              aria-activedescendant={
                menuMode === "slash" &&
                menuOpen &&
                groupedSkills.flatSkills[safeActiveIndex]
                  ? `${skillListboxId}-option-${safeActiveIndex}`
                  : undefined
              }
              placeholder={copy("Спросите что-нибудь…")}
              rows={2}
              maxLength={maxLength}
              className="max-h-[min(8rem,20cqh)] min-h-12 text-sm"
              onKeyDown={(event) => {
                if (menuMode === "slash" && menuOpen) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    if (groupedSkills.flatSkills.length > 0) {
                      setActiveSkillIndex(
                        (safeActiveIndex + 1) % groupedSkills.flatSkills.length,
                      );
                    }
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    if (groupedSkills.flatSkills.length > 0) {
                      setActiveSkillIndex(
                        (safeActiveIndex -
                          1 +
                          groupedSkills.flatSkills.length) %
                          groupedSkills.flatSkills.length,
                      );
                    }
                    return;
                  }
                  if (
                    (event.key === "Tab" ||
                      (event.key === "Enter" && !event.shiftKey)) &&
                    !event.nativeEvent.isComposing
                  ) {
                    const candidate = groupedSkills.flatSkills[safeActiveIndex];
                    if (candidate) {
                      event.preventDefault();
                      attachSkill(candidate);
                      return;
                    }
                    if (event.key === "Tab") {
                      event.preventDefault();
                      return;
                    }
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSkillMenu();
                    return;
                  }
                }
                if (
                  event.key === "Backspace" &&
                  !draft &&
                  selectedSkill &&
                  !pending
                ) {
                  event.preventDefault();
                  onSelectSkill?.(null);
                  return;
                }
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
              className="assistant-composer-actions justify-between gap-2"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {onSelectSkill && (
                  <InputGroupButton
                    type="button"
                    variant={selectedSkill || menuOpen ? "secondary" : "ghost"}
                    size="xs"
                    className="h-6 shrink-0 gap-1 px-2 text-[11px] font-medium"
                    disabled={pending || !sendEnabled}
                    aria-label={copy("Выбрать умение")}
                    aria-expanded={menuOpen}
                    aria-haspopup="listbox"
                    aria-controls={menuOpen ? skillListboxId : undefined}
                    title={copy("Введите / для выбора умения")}
                    onClick={() => {
                      if (menuOpen) {
                        closeSkillMenu();
                      } else {
                        setPickerQuery("");
                        setActiveSkillIndex(0);
                        setPickerOpen(true);
                      }
                    }}
                  >
                    <span
                      className="font-mono text-primary"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <span>{copy("Умения")}</span>
                  </InputGroupButton>
                )}
                <span
                  id="assistant-input-hint"
                  className="truncate text-[11px] font-normal text-muted-foreground"
                >
                  {copy("Shift + Enter — новая строка")}
                </span>
              </div>
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="shrink-0 rounded-full"
                disabled={!draft.trim() || pending || !sendEnabled}
                aria-label={copy("Отправить сообщение")}
              >
                <ArrowUp />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
        <p className="assistant-composer-notice mt-2 text-center text-[11px] leading-4 text-muted-foreground">
          {copy(
            "Запрошенные данные передаются AI-провайдеру · ответы стоит проверять",
          )}
        </p>
      </form>
    </div>
  );
}
