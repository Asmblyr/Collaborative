"use client";

import { useCallback, useRef, useState } from "react";
import type { AssistantConversationDetail } from "@asmblyr-collaborative/contracts";
import { AssistantDraftStore } from "./assistant-draft-store";
import {
  prependAssistantHistory,
  restoreAssistantMessages,
} from "./assistant-history-messages";
import { welcomeMessage, type AssistantMessage } from "./assistant-types";
import { useAssistantHistory } from "./use-assistant-history";

export function useAssistantConversation(open: boolean, onRestore: () => void) {
  const [messages, setMessages] = useState<AssistantMessage[]>([
    welcomeMessage,
  ]);
  const [drafts] = useState(() => new AssistantDraftStore());
  const [draft, setCurrentDraft] = useState("");
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const creating = useRef(false);

  const setDraft = useCallback(
    (update: string | ((previous: string) => string)) => {
      setCurrentDraft(drafts.write(update));
    },
    [drafts],
  );

  const selectDraft = useCallback(
    (id: string | null) => {
      setCurrentDraft(drafts.select(id));
      setSavedDraftId(null);
    },
    [drafts],
  );

  const removeDraft = useCallback(
    (id: string) => {
      setCurrentDraft(drafts.remove(id));
    },
    [drafts],
  );

  const restore = useCallback(
    (detail: AssistantConversationDetail, prepend: boolean) => {
      const savedMessages = restoreAssistantMessages(detail.messages);
      setMessages((previous) => [
        welcomeMessage,
        ...(prepend
          ? prependAssistantHistory(previous, savedMessages)
          : savedMessages),
      ]);
      if (!prepend) {
        selectDraft(detail.conversation.id || null);
      }
      onRestore();
    },
    [onRestore, selectDraft],
  );

  const history = useAssistantHistory(open, restore, removeDraft);

  async function newSession(): Promise<boolean> {
    if (creating.current || history.loading) {
      return false;
    }
    creating.current = true;
    try {
      const previousId = history.conversation?.id;
      const session = await history.create();
      selectDraft(session.id);
      if (previousId && drafts.has(previousId)) {
        setSavedDraftId(previousId);
      }
      setMessages([welcomeMessage]);
      onRestore();
      return true;
    } finally {
      creating.current = false;
    }
  }

  return {
    messages,
    setMessages,
    draft,
    setDraft,
    selectDraft,
    hasDraft: (id: string) => drafts.has(id),
    savedDraftId:
      savedDraftId && drafts.has(savedDraftId) ? savedDraftId : null,
    newSession,
    history,
  };
}
