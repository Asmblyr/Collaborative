import {
  assistantContextContract,
  assistantDataAccessContract,
} from "./assistant-context-contract.mjs";

const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const timestamp = { type: "string", format: "date-time" };
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const summary = { type: "object", additionalProperties: true };
const activity = {
  type: "array",
  maxItems: 64,
  items: object({
    kind: { enum: ["status", "note"] },
    text: { type: "string", maxLength: 8000 },
  }),
};
const conversation = object({
  id: uuid,
  title: string,
  createdAt: timestamp,
  updatedAt: timestamp,
  compactionCount: { type: "integer", minimum: 0 },
  busyUntil: nullable(timestamp),
});
const message = object({
  id: uuid,
  role: { enum: ["user", "assistant"] },
  content: string,
  activity,
  status: {
    enum: ["pending", "completed", "failed", "cancelled", "interrupted"],
  },
  createdAt: timestamp,
  contextScope: string,
  contextLabel: string,
  truncated: { type: "boolean" },
  summary: nullable(summary),
});
const json = (schema) => ({ "application/json": { schema } });
const response = (
  schema,
  description = "Личная история текущего пользователя",
) => ({
  description,
  content: json(object({ data: schema })),
});
const id = { name: "id", in: "path", required: true, schema: uuid };
const unavailable = {
  description: "Сессия отсутствует или принадлежит другому пользователю",
};

export function assistantHistoryContract(key) {
  if (key === "GET /assistant/conversations") {
    return {
      parameters: [{ name: "before", in: "query", schema: uuid }],
      responses: {
        200: response(
          object({
            items: { type: "array", maxItems: 30, items: conversation },
            nextCursor: nullable(uuid),
          }),
        ),
        404: unavailable,
      },
    };
  }
  if (key === "POST /assistant/conversations") {
    return {
      requestBody: { required: false, content: json(object({})) },
      responses: {
        201: response(conversation, "Новая сессия с пустым контекстом"),
      },
    };
  }
  if (key === "GET /assistant/conversations/:id") {
    return {
      parameters: [
        id,
        {
          name: "before",
          in: "query",
          schema: { type: "string", pattern: "^[1-9][0-9]{0,9}$" },
        },
      ],
      responses: {
        200: response(
          object({
            conversation,
            messages: { type: "array", maxItems: 100, items: message },
            nextCursor: nullable(string),
          }),
        ),
        404: unavailable,
      },
    };
  }
  if (key === "DELETE /assistant/conversations/:id") {
    return {
      parameters: [id],
      responses: {
        204: { description: "Сессия, сообщения и краткий контекст удалены" },
        404: unavailable,
        409: { description: "В сессии ещё готовится ответ" },
      },
    };
  }
  if (key === "POST /assistant/messages") {
    const content = { type: "string", minLength: 1, maxLength: 8000 };
    const optional = {
      settings: {
        type: "object",
        additionalProperties: false,
        properties: {
          reasoningEffort: { enum: ["low", "medium", "high", "max"] },
          thinking: { type: "boolean" },
        },
      },
      context: nullable(assistantContextContract),
      dataAccess: assistantDataAccessContract,
    };
    return {
      description:
        "Человек с доступом к ассистенту. conversationId/messageId/content сохраняют сообщение в собственной сессии; legacy messages остаётся stateless. dataAccess отдельно включает инструменты базы, Google и плагинов; workspaceId должен совпадать с context. Без dataAccess сохраняется прежнее поведение: инструменты только при context. История для модели изолирована по странице и режиму доступа. NDJSON выдаёт started/progress/activity/text-delta/answer/error.",
      requestBody: {
        required: true,
        content: json({
          oneOf: [
            object(
              { conversationId: uuid, messageId: uuid, content, ...optional },
              ["conversationId", "messageId", "content"],
            ),
            object(
              {
                messages: {
                  type: "array",
                  minItems: 1,
                  maxItems: 31,
                  items: object({
                    role: { enum: ["user", "assistant"] },
                    content,
                  }),
                },
                ...optional,
              },
              ["messages"],
            ),
          ],
        }),
      },
      responses: {
        200: {
          description:
            "JSON-ответ либо поток NDJSON; в сохранённой сессии включает receipt",
          content: {
            ...json(
              object({
                data: {
                  type: "object",
                  additionalProperties: true,
                  properties: {
                    content: string,
                    activity,
                    truncated: { type: "boolean" },
                    summary,
                    conversation: object({
                      id: uuid,
                      userMessageId: uuid,
                      assistantMessageId: uuid,
                      compactionCount: { type: "integer" },
                    }),
                  },
                  required: ["content", "truncated", "summary"],
                },
              }),
            ),
            "application/x-ndjson": { schema: string },
          },
        },
        404: unavailable,
        409: {
          description:
            "Сессия занята либо messageId уже отправлен с другим содержимым",
        },
        429: { description: "Лимит запросов, модели или контекста" },
      },
    };
  }
  return null;
}
