"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AssistantProgress,
  AssistantTurnSummary,
} from "@asmblyr/contracts";
import type { FilterProposal } from "./assistant-context-types";
import { AssistantRequest, AssistantResponseError } from "./assistant-stream";
import {
  conversationInput,
  welcomeMessage,
  type AssistantMessage,
  type AssistantSettings,
} from "./assistant-types";
import {
  contextLabel,
  contextScope,
  type PageContext,
} from "./assistant-context-types";
import { useAssistantContext } from "./assistant-context";
import { useAssistantStatus } from "./use-assistant-status";
import { replaceTurnMessage } from "./assistant-turn-message";

interface SendSnapshot {
  messages: { role: "user" | "assistant"; content: string }[];
  settings: AssistantSettings;
  context: PageContext | null;
}

export function useAssistant(
  open: boolean,
  context: PageContext | null = null,
) {
  const collectionDisplayName = useAssistantContext()?.collectionDisplayName;
  const { status, settings, setSettings } = useAssistantStatus(open);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    welcomeMessage,
  ]);
  const [draft, setDraft] = useState("");
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
    if (!content || active.current || !status.available || !status.limits) {
      return false;
    }
    if (content.length > status.limits.maxMessageChars) {
      setError("Сообщение слишком длинное.");
      return false;
    }
    const controller = new AssistantRequest();
    active.current = controller;
    const messageId = crypto.randomUUID();
    const replyId = crypto.randomUUID();
    const scope = contextScope(retrySnapshot ? retrySnapshot.context : context);
    // Keep visible history, but never carry another page's context into this turn.
    const snapshot: SendSnapshot =
      retrySnapshot ??
      structuredClone({
        messages: conversationInput(
          messages.filter((m) => m.contextScope === scope),
          content,
          status,
        ),
        settings,
        context,
      });
    const label = contextLabel(snapshot.context, collectionDisplayName);
    setMessages((previous) => [
      ...previous,
      {
        id: messageId,
        role: "user",
        content,
        contextScope: scope,
        contextLabel: label,
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
        const result = await controller.send(
          snapshot,
          (next) => {
            if (active.current === controller) {
              setProgress(next);
            }
          },
          (text) => {
            if (active.current !== controller) {
              return;
            }
            setMessages((previous) =>
              replaceTurnMessage(previous, {
                id: replyId,
                role: "assistant",
                content: text,
                contextScope: scope,
                streaming: true,
              }),
            );
          },
        );
        if (typeof result.content !== "string") {
          throw new Error("Не удалось прочитать ответ ассистента");
        }
        if (active.current !== controller) {
          return;
        }
        setMessages((previous) =>
          replaceTurnMessage(previous, {
            id: replyId,
            role: "assistant",
            content: result.content,
            truncated: result.truncated,
            proposals: result.proposals as FilterProposal[] | undefined,
            selections: result.selections,
            pluginResults: result.pluginResults,
            summary: result.summary,
            contextScope: scope,
          }),
        );
      } catch (failure) {
        if (active.current !== controller) {
          return;
        }
        if (
          controller.stopping ||
          (failure instanceof AssistantResponseError &&
            failure.code === "assistant_cancelled")
        ) {
          setMessages((previous) =>
            replaceTurnMessage(previous, {
              id: replyId,
              role: "assistant",
              content: controller.text || "Запрос остановлен.",
              cancelled: true,
              contextScope: scope,
              summary:
                failure instanceof AssistantResponseError
                  ? failure.summary
                  : undefined,
            }),
          );
          return;
        }
        if (controller.text) {
          setMessages((previous) =>
            replaceTurnMessage(previous, {
              id: replyId,
              role: "assistant",
              content: controller.text,
              failed: true,
              contextScope: scope,
              summary:
                failure instanceof AssistantResponseError
                  ? failure.summary
                  : undefined,
            }),
          );
        } else {
          if (failure instanceof AssistantResponseError) {
            setErrorSummary(failure.summary);
          }
          setMessages((previous) =>
            previous.filter((message) => message.id !== messageId),
          );
          setDraft((previous) => previous || content);
        }
        setRetryPrompt({ content, snapshot });
        setError(
          failure instanceof Error &&
            failure.name !== "TimeoutError" &&
            failure.name !== "TypeError"
            ? failure.message
            : "Не удалось дождаться ответа. Проверьте соединение и попробуйте ещё раз.",
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

  function restart() {
    const controller = active.current;
    active.current = null;
    controller?.abort();
    setPending(false);
    setStopping(false);
    setProgress(null);
    setMessages([welcomeMessage]);
    setDraft("");
    setError(null);
    setErrorSummary(undefined);
    setRetryPrompt(null);
  }

  return {
    status,
    settings,
    setSettings,
    messages,
    draft,
    setDraft,
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
  };
}
