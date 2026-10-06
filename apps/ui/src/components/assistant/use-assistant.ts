"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AssistantProgress,
  AssistantTurnSummary,
  AssistantDataAccess,
} from "@asmblyr-collaborative/contracts";
import type { FilterProposal } from "./assistant-context-types";
import { AssistantRequest, AssistantResponseError } from "./assistant-stream";
import type { AssistantSettings } from "./assistant-types";
import {
  contextLabel,
  contextScope,
  retryDataAccess,
  type PageContext,
} from "./assistant-context-types";
import { useAssistantContext } from "./assistant-context";
import { useAssistantStatus } from "./use-assistant-status";
import { replaceTurnMessage } from "./assistant-turn-message";
import { useUiCopy } from "@/lib/ui-copy";
import { useAssistantConversation } from "./use-assistant-conversation";

interface SendSnapshot {
  content: string;
  messageId: string;
  settings: AssistantSettings;
  context: PageContext | null;
  dataAccess?: AssistantDataAccess;
}

export function useAssistant(
  open: boolean,
  context: PageContext | null = null,
  dataAccess?: AssistantDataAccess,
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
  const [retryPrompt, setRetryPrompt] = useState<{
    content: string;
    snapshot: SendSnapshot;
  } | null>(null);
  const active = useRef<AssistantRequest | null>(null);
  const resetErrors = useCallback(() => {
    setError(null);
    setErrorSummary(undefined);
    setRetryPrompt(null);
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

  function send(input: string, retrySnapshot?: SendSnapshot) {
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
      ? structuredClone({
          ...retrySnapshot,
          dataAccess: retryDataAccess(
            retrySnapshot.context,
            retrySnapshot.dataAccess,
            dataAccess,
          ),
        })
      : structuredClone({
          content,
          messageId,
          settings,
          context,
          ...(dataAccess ? { dataAccess } : {}),
        });
    const scope = contextScope(snapshot.context, snapshot.dataAccess);
    const label = contextLabel(
      snapshot.context,
      collectionDisplayName,
      copy,
      snapshot.dataAccess,
    );
    setMessages((previous) => [
      ...previous,
      {
        id: messageId,
        role: "user",
        content,
        contextScope: scope,
        contextLabel: label,
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
    ]);
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
        setMessages((previous) =>
          replaceTurnMessage(previous, {
            id: replyId,
            role: "assistant",
            content: result.content,
            activity: result.activity ?? controller.activity,
            truncated: result.truncated,
            proposals: result.proposals as FilterProposal[] | undefined,
            selections: result.selections,
            pluginResults: result.pluginResults,
            connectionWrites: result.connectionWrites,
            summary: result.summary,
            contextScope: scope,
          }).map((message) =>
            message.id === replyId && result.conversation
              ? { ...message, id: result.conversation.assistantMessageId }
              : message,
          ),
        );
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
              content:
                controller.text ||
                copy(
                  cancelled
                    ? "Запрос остановлен."
                    : "Не удалось завершить ответ.",
                ),
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
        if (cancelled) {
          return;
        }
        if (!controller.text) {
          setErrorSummary(summary);
        }
        setRetryPrompt({ content, snapshot });
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

  return {
    status,
    availability,
    reloadStatus: reload,
    statusReady: availability.phase === "ready",
    sendEnabled:
      availability.phase === "ready" && status.available && !history.loading,
    settings,
    setSettings,
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
    retry: retryPrompt
      ? () => {
          if (send(retryPrompt.content, retryPrompt.snapshot)) {
            setDraft((previous) =>
              previous === retryPrompt.content ? "" : previous,
            );
          }
        }
      : undefined,
    history,
  };
}
