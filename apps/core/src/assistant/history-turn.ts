import { createHash, randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  AssistantConversationReceipt,
  AssistantStreamEvent,
} from "@asmblyr-collaborative/contracts";
import { AssistantProviderError } from "./provider.js";
import {
  conversationScope,
  type ConversationSubmission,
} from "./history-input.js";
import {
  conversationTable,
  historyMessageTable,
  ownedConversation,
  recoverConversation,
  type HistoryMessageRow,
} from "./history-repository.js";

type Answer = Extract<AssistantStreamEvent, { type: "answer" }>["data"];

export interface SavedTurn {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  scope: string;
  cached?: Answer;
}

export async function beginSavedTurn(
  db: Knex,
  owner: string,
  input: ConversationSubmission,
): Promise<SavedTurn> {
  return db.transaction(async (trx) => {
    const conversation = await ownedConversation(
      trx,
      owner,
      input.conversationId,
      true,
    );
    await recoverConversation(trx, conversation);
    const scope = conversationScope(input.context, input.dataAccess);
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          content: input.content,
          context: input.context,
          ...(input.dataAccess ? { dataAccess: input.dataAccess } : {}),
          settings: input.settings,
        }),
      )
      .digest("hex");
    const existing = await historyMessageTable(trx)
      .where({ id: input.messageId })
      .first();
    if (existing) {
      if (
        existing.conversation_id !== conversation.id ||
        existing.content !== input.content ||
        existing.context_scope !== scope ||
        existing.role !== "user" ||
        existing.request_hash !== requestHash
      ) {
        throw new AssistantProviderError(
          409,
          "assistant_message_conflict",
          "Сообщение уже используется.",
        );
      }
      const reply = await historyMessageTable(trx)
        .where({ reply_to: existing.id })
        .first();
      if (reply?.status === "completed" && reply.summary) {
        const receipt: AssistantConversationReceipt = {
          id: conversation.id,
          userMessageId: existing.id,
          assistantMessageId: reply.id,
          compactionCount: conversation.compaction_count,
        };
        return {
          conversationId: conversation.id,
          userMessageId: existing.id,
          assistantMessageId: reply.id,
          scope,
          cached: {
            content: reply.content,
            activity: reply.activity,
            truncated: reply.truncated,
            summary: reply.summary,
            conversation: receipt,
          },
        };
      }
      throw new AssistantProviderError(
        409,
        "assistant_message_already_submitted",
        "Сообщение уже отправлено. Для повторной попытки отправьте новый запрос.",
      );
    }
    if (conversation.active_message_id) {
      throw new AssistantProviderError(
        409,
        "assistant_conversation_busy",
        "В этой сессии уже готовится ответ.",
      );
    }
    const assistantMessageId = randomUUID();
    const pageLabel =
      input.context?.collection ??
      input.context?.page ??
      (input.dataAccess ? "Без контекста страницы" : "");
    const contextLabel = input.context?.record
      ? `${pageLabel} · ${input.context.record.id}`
      : pageLabel;
    const label =
      input.dataAccess?.enabled === false
        ? `${contextLabel} · без доступа к данным`
        : contextLabel;
    const common = {
      conversation_id: conversation.id,
      context_scope: scope,
      context_label: label,
    };
    await historyMessageTable(trx).insert([
      {
        ...common,
        id: input.messageId,
        sequence: conversation.next_sequence + 1,
        role: "user",
        request_hash: requestHash,
        content: input.content,
        status: "completed",
      },
      {
        ...common,
        id: assistantMessageId,
        sequence: conversation.next_sequence + 2,
        role: "assistant",
        reply_to: input.messageId,
        status: "pending",
      },
    ]);
    await conversationTable(trx)
      .where({ id: conversation.id })
      .update({
        title:
          conversation.title ||
          input.content.replace(/\s+/g, " ").slice(0, 100),
        next_sequence: conversation.next_sequence + 2,
        active_message_id: assistantMessageId,
        // The whole turn shares the provider timeout, configured up to ten minutes.
        busy_until: new Date(Date.now() + 11 * 60_000),
        updated_at: new Date(),
      });
    return {
      conversationId: conversation.id,
      userMessageId: input.messageId,
      assistantMessageId,
      scope,
    };
  });
}

export async function finishSavedTurn(
  db: Knex,
  owner: string,
  turn: SavedTurn,
  result: Pick<
    HistoryMessageRow,
    "content" | "status" | "summary" | "truncated"
  > &
    Partial<Pick<HistoryMessageRow, "activity">>,
): Promise<AssistantConversationReceipt> {
  return db.transaction(async (trx) => {
    const conversation = await ownedConversation(
      trx,
      owner,
      turn.conversationId,
      true,
    );
    if (conversation.active_message_id !== turn.assistantMessageId) {
      throw new AssistantProviderError(
        409,
        "assistant_turn_expired",
        "Запрос уже завершён или прерван.",
      );
    }
    await historyMessageTable(trx)
      .where({ id: turn.assistantMessageId, status: "pending" })
      .update({
        ...result,
        ...(result.activity
          ? { activity: trx.raw("?::jsonb", [JSON.stringify(result.activity)]) }
          : {}),
      });
    await conversationTable(trx).where({ id: conversation.id }).update({
      active_message_id: null,
      busy_until: null,
      updated_at: new Date(),
    });
    return {
      id: conversation.id,
      userMessageId: turn.userMessageId,
      assistantMessageId: turn.assistantMessageId,
      compactionCount: conversation.compaction_count,
    };
  });
}
