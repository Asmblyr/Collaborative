import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  AssistantConversation,
  AssistantConversationDetail,
  AssistantConversationPage,
  AssistantHistoryMessage,
  AssistantTurnSummary,
  AssistantActivity,
} from "@asmblyr-collaborative/contracts";
import { AssistantProviderError } from "./provider.js";

export interface ConversationRow {
  id: string;
  user_id: string;
  title: string;
  created_at: Date;
  updated_at: Date;
  next_sequence: number;
  compaction_count: number;
  active_message_id: string | null;
  busy_until: Date | null;
}

export interface HistoryMessageRow {
  id: string;
  conversation_id: string;
  sequence: number;
  role: "user" | "assistant";
  reply_to: string | null;
  content: string;
  activity: AssistantActivity[];
  request_hash: string | null;
  status: AssistantHistoryMessage["status"];
  context_scope: string;
  context_label: string;
  truncated: boolean;
  summary: AssistantTurnSummary | null;
  created_at: Date;
}

export const conversationTable = (db: Knex) =>
  db<ConversationRow>("asmblyr_assistant_conversations").withSchema("public");
export const historyMessageTable = (db: Knex) =>
  db<HistoryMessageRow>("asmblyr_assistant_messages").withSchema("public");

export function conversationValue(row: ConversationRow): AssistantConversation {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    compactionCount: row.compaction_count,
    busyUntil:
      row.busy_until && row.busy_until.getTime() > Date.now()
        ? row.busy_until.toISOString()
        : null,
  };
}

export async function ownedConversation(
  db: Knex,
  owner: string,
  id: string,
  lock = false,
) {
  const query = conversationTable(db).where({ id, user_id: owner });
  const row = await (lock ? query.forUpdate() : query).first();
  if (!row) {
    throw new AssistantProviderError(
      404,
      "assistant_conversation_unavailable",
      "Сессия недоступна.",
    );
  }
  return row;
}

export async function recoverConversation(
  db: Knex,
  row: ConversationRow,
): Promise<void> {
  if (
    row.active_message_id &&
    (!row.busy_until || row.busy_until.getTime() <= Date.now())
  ) {
    await historyMessageTable(db)
      .where({ id: row.active_message_id, status: "pending" })
      .update({ status: "interrupted" });
    await conversationTable(db)
      .where({ id: row.id })
      .update({ active_message_id: null, busy_until: null });
    row.active_message_id = null;
    row.busy_until = null;
  }
}

export async function createConversation(
  db: Knex,
  owner: string,
): Promise<AssistantConversation> {
  const [row] = await conversationTable(db)
    .insert({ id: randomUUID(), user_id: owner })
    .returning("*");
  return conversationValue(row);
}

export async function listConversations(
  db: Knex,
  owner: string,
  before?: string,
): Promise<AssistantConversationPage> {
  const query = conversationTable(db).where({ user_id: owner });
  if (before) {
    const anchor = await ownedConversation(db, owner, before);
    query.whereRaw("(updated_at, id) < (?, ?::uuid)", [
      anchor.updated_at,
      anchor.id,
    ]);
  }
  const rows = await query
    .orderBy("updated_at", "desc")
    .orderBy("id", "desc")
    .limit(31);
  return {
    items: rows.slice(0, 30).map(conversationValue),
    nextCursor: rows.length > 30 ? rows[29].id : null,
  };
}

export async function readConversation(
  db: Knex,
  owner: string,
  id: string,
  before?: number,
): Promise<AssistantConversationDetail> {
  return db.transaction(async (trx) => {
    const row = await ownedConversation(trx, owner, id, true);
    await recoverConversation(trx, row);
    const query = historyMessageTable(trx).where({ conversation_id: id });
    if (before !== undefined) {
      query.where("sequence", "<", before);
    }
    const messages = await query.orderBy("sequence", "desc").limit(101);
    const page = messages.slice(0, 100);
    return {
      conversation: conversationValue(row),
      messages: page.reverse().map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        activity: message.activity,
        status: message.status,
        createdAt: message.created_at.toISOString(),
        contextScope: message.context_scope,
        contextLabel: message.context_label,
        truncated: message.truncated,
        summary: message.summary,
      })),
      nextCursor: messages.length > 100 ? String(messages[99].sequence) : null,
    };
  });
}

export async function deleteConversation(
  db: Knex,
  owner: string,
  id: string,
): Promise<void> {
  await db.transaction(async (trx) => {
    const row = await ownedConversation(trx, owner, id, true);
    await recoverConversation(trx, row);
    if (row.active_message_id) {
      throw new AssistantProviderError(
        409,
        "assistant_conversation_busy",
        "Дождитесь завершения ответа.",
      );
    }
    await conversationTable(trx).where({ id, user_id: owner }).delete();
  });
}
