"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantProgress,
  AssistantSkillSummary,
  AssistantTurnSummary,
  AssistantDataAccess,
} from "@asmblyr-collaborative/contracts";
import type { FilterProposal } from "./assistant-context-types";
import { AssistantRequest, AssistantResponseError } from "./assistant-stream";
import {
  contextLabel,
  contextScope,
  type PageContext,
} from "./assistant-context-types";
import { useAssistantContext } from "./assistant-context";
import { useAssistantStatus } from "./use-assistant-status";
import {
  lastAssistantTurn,
  removeTrailingTurn,
  replaceTurnMessage,
  type LastAssistantTurn,
} from "./assistant-turn-message";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantConversation } from "./use-assistant-conversation";
import {
  cloneRetrySnapshot,
  createSendSnapshot,
  type SendSnapshot,
} from "./assistant-skills-state";

export function useAssistant(
  open: boolean,
  context: PageContext | null = null,
  dataAccess?: AssistantDataAccess,
  onSkillUnavailable?: () => void,
) {
  const copy = useUiCopy();

  const collectionDisplayName = useAssistantContext()?.collectionDisplayName;
  const { status, settings, setSettings, availability, reload } =
    useAssistantStatus(open);
  const [pending, setPending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<AssistantProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorSummary, setErrorSummary] = useState<
    AssistantTurnSummary | undefined
  >();
  const [selectedSkill, setSelectedSkill] =
    useState<AssistantSkillSummary | null>(null);
  const [retryPrompt, setRetryPrompt] = useState<{
    content: string;
    snapshot: SendSnapshot;
    skillTitle?: string;
  } | null>(null);
  const [lastCompletedPrompt, setLastCompletedPrompt] = useState<{
    assistantId: string;
    content: string;
    snapshot: SendSnapshot;
    skillTitle?: string;
  } | null>(null);
  const active = useRef<AssistantRequest | null>(null);
  const resetErrors = useCallback(() => {
    setError(null);
    setErrorSummary(undefined);
    setRetryPrompt(null);
    setLastCompletedPrompt(null);
    setSelectedSkill(null);
  }, []);
  const conversation = useAssistantConversation(
    open && status.available && availability.phase !== "denied",
    resetErrors,
  );
  const { messages, setMessages, draft, setDraft, history } = conversation;

  useEffect(
    () => () => {
      const controller = active.current;
      active.current = null;
      controller?.abort();
    },
    [],
  );

  function send(
    input: string,
    retrySnapshot?: SendSnapshot,
    replaceTurn?: Pick<LastAssistantTurn, "userId" | "assistantId">,
    retrySkillTitle?: string,
  ) {
    const content = input.trim();
    if (
      !content ||
      active.current ||
      history.loading ||
      availability.phase !== "ready" ||
      !status.available ||
      !status.limits
    ) {
      return false;
    }
    if (content.length > status.limits.maxMessageChars) {
      setError(copy("Сообщение слишком длинное."));
      return false;
    }
    const controller = new AssistantRequest();
    active.current = controller;
    const messageId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    const startedAt = Date.now();
    // Keep visible history, but never carry another page's context into this turn.
    const snapshot: SendSnapshot = retrySnapshot
      ? cloneRetrySnapshot(retrySnapshot, dataAccess)
      : createSendSnapshot({
          content,
          messageId,
          settings,
          context,
          dataAccess,
          skillSlug: selectedSkill?.slug ?? null,
        });
    const skillTitle = retrySnapshot ? retrySkillTitle : selectedSkill?.title;
    if (!retrySnapshot && selectedSkill) {
      setSelectedSkill(null);
    }
    const scope = contextScope(snapshot.context, snapshot.dataAccess);
    const label = contextLabel(
      snapshot.context,
      collectionDisplayName,
      copy,
      snapshot.dataAccess,
    );
    setMessages((previous) => {
      const base = replaceTurn
        ? removeTrailingTurn(previous, replaceTurn)
        : previous;
      return [
        ...base,
        {
          id: messageId,
          role: "user",
          content,
          contextScope: scope,
          contextLabel: label,
          ...(snapshot.skillSlug
            ? {
                skillSlug: snapshot.skillSlug,
                ...(skillTitle ? { skillTitle } : {}),
              }
            : {}),
        },
        {
          id: replyId,
          role: "assistant",
          content: "",
          streaming: true,
          activity: [],
          startedAt,
          contextScope: scope,
        },
      ];
    });
    setPending(true);
    setStopping(false);
    setProgress(null);
    setError(null);
    setErrorSummary(undefined);
    setRetryPrompt(null);
    void (async () => {
      try {
        const session = await history.ensure(controller.controller.signal);
        conversation.selectDraft(session.id);
        const result = await controller.send(
          { ...snapshot, messageId, conversationId: session.id },
          (next) => {
            if (active.current === controller) {
              setProgress(next);
            }
          },
          undefined,
          () => {
            if (active.current !== controller) {
              return;
            }
            setMessages((previous) =>
              replaceTurnMessage(previous, {
                id: replyId,
                role: "assistant",
                content: controller.text,
                activity: [...controller.activity],
                activityDraft: controller.activityDraft,
                startedAt,
                streaming: true,
                contextScope: scope,
              }),
            );
          },
        );
        if (typeof result.content !== "string") {
          throw new Error(copy("Не удалось прочитать ответ ассистента"));
        }
        if (active.current !== controller) {
          return;
        }
        const savedReplyId = result.conversation?.assistantMessageId ?? replyId;
        setMessages((previous) =>
          replaceTurnMessage(
            previous,
            {
              id: savedReplyId,
              role: "assistant",
              content: result.content,
              activity: result.activity ?? controller.activity,
              truncated: result.truncated,
              proposals: result.proposals as FilterProposal[] | undefined,
              selections: result.selections,
              pluginResults: result.pluginResults,
              connectionWrites: result.connectionWrites,
              writeProposals: result.writeProposals,
              records: result.records,
              forms: result.forms,
              summary: result.summary,
              contextScope: scope,
            },
            replyId,
          ),
        );
        setLastCompletedPrompt({
          assistantId: savedReplyId,
          content,
          snapshot,
          skillTitle,
        });
        if (result.conversation) {
          history.update(result.conversation);
        }
      } catch (failure) {
        if (active.current !== controller) {
          return;
        }
        const savedReplyId =
          failure instanceof AssistantResponseError
            ? (failure.conversation?.assistantMessageId ?? replyId)
            : replyId;
        if (failure instanceof AssistantResponseError && failure.conversation) {
          history.update(failure.conversation);
        }
        const cancelled =
          controller.stopping ||
          (failure instanceof AssistantResponseError &&
            failure.code === "assistant_cancelled");
        const summary =
          failure instanceof AssistantResponseError
            ? failure.summary
            : undefined;
        setMessages((previous) =>
          replaceTurnMessage(
            previous,
            {
              id: savedReplyId,
              role: "assistant",
              content: controller.text,
              cancelled,
              failed: !cancelled,
              activity: controller.activity,
              activityDraft: controller.activityDraft,
              contextScope: scope,
              summary,
            },
            replyId,
          ),
        );
        setRetryPrompt({ content, snapshot, skillTitle });
        if (cancelled) {
          return;
        }
        if (!controller.text) {
          setErrorSummary(summary);
        }
        if (
          failure instanceof AssistantResponseError &&
          failure.code === "skill_unavailable"
        ) {
          onSkillUnavailable?.();
          setError(copy("Умение недоступно"));
          return;
        }
        setError(
          failure instanceof Error &&
            failure.name !== "TimeoutError" &&
            failure.name !== "TypeError"
            ? failure.message
            : copy(
                "Не удалось дождаться ответа. Проверьте соединение и попробуйте ещё раз.",
              ),
        );
      } finally {
        if (active.current === controller) {
          active.current = null;
          setPending(false);
          setStopping(false);
          setProgress(null);
        }
      }
    })();
    return true;
  }

  async function restart() {
    if (active.current || history.loading) {
      return;
    }
    try {
      if (!(await conversation.newSession())) {
        return;
      }
    } catch {
      setError(copy("Не удалось создать сессию."));
      return;
    }
    setPending(false);
    setStopping(false);
    setProgress(null);
  }

  const trailingTurn = lastAssistantTurn(messages);
  const canRetry = Boolean(retryPrompt || trailingTurn?.incomplete);
  const canRegenerate = Boolean(trailingTurn && !trailingTurn.incomplete);

  return {
    status,
    availability,
    reloadStatus: reload,
    statusReady: availability.phase === "ready",
    sendEnabled:
      availability.phase === "ready" && status.available && !history.loading,
    settings,
    setSettings,
    selectedSkill,
    setSelectedSkill,
    messages,
    draft,
    setDraft,
    hasDraft: conversation.hasDraft,
    savedDraftId: conversation.savedDraftId,
    pending,
    stopping,
    progress,
    stop: () => {
      if (!active.current) {
        return;
      }
      setStopping(true);
      active.current.stop();
    },
    error,
    errorSummary,
    send,
    restart,
    retry: canRetry
      ? () => {
          const prompt = retryPrompt?.content ?? trailingTurn?.content;
          if (!prompt) {
            return;
          }
          const replace = trailingTurn?.incomplete ? trailingTurn : undefined;
          if (
            send(
              prompt,
              retryPrompt?.snapshot,
              replace,
              retryPrompt?.skillTitle,
            )
          ) {
            setDraft((previous) => (previous === prompt ? "" : previous));
          }
        }
      : undefined,
    regenerate: canRegenerate
      ? () => {
          if (!trailingTurn) {
            return;
          }
          const completed =
            lastCompletedPrompt?.assistantId === trailingTurn.assistantId
              ? lastCompletedPrompt
              : undefined;
          send(
            trailingTurn.content,
            completed?.snapshot,
            trailingTurn,
            completed?.skillTitle,
          );
        }
      : undefined,
    history,
  };
}
