const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const string = { type: "string" };
const bool = { type: "boolean" };
const nullableString = { type: ["string", "null"] };
const response = (data) => ({
  description: "Успех",
  content: { "application/json": { schema: object({ data }) } },
});
const requestBody = (schema) => ({
  required: true,
  content: { "application/json": { schema } },
});
const status = object({
  provider: { const: "google" },
  enabled: bool,
  unavailable: bool,
  connected: bool,
  reconnect: bool,
  email: nullableString,
  connectedAt: nullableString,
});
const proposal = object({
  id: { type: "string", format: "uuid" },
  provider: { const: "google" },
  operation: {
    enum: [
      "create_text",
      "update_text",
      "rename_file",
      "trash_file",
      "create_sheet",
      "update_cells",
      "append_cells",
    ],
  },
  target: string,
  title: string,
  content: string,
  expiresAt: { type: "string", format: "date-time" },
  status: {
    enum: [
      "pending",
      "executing",
      "cancelled",
      "succeeded",
      "failed",
      "uncertain",
    ],
  },
  url: nullableString,
  result: {
    anyOf: [
      object({
        url: nullableString,
        updatedCells: { type: ["integer", "null"], minimum: 0 },
        updatedRows: { type: ["integer", "null"], minimum: 0 },
        range: { ...nullableString, maxLength: 200 },
      }),
      { type: "null" },
    ],
  },
  failure: { enum: ["target_changed", null] },
});
export function connectionsContract(key) {
  if (!key.includes("/connections/google")) {
    return undefined;
  }
  const responses = {
    400: { description: "Неверный OAuth flow или параметры" },
    401: { description: "Нужна активная человеческая сессия" },
    403: { description: "Сервисным аккаунтам подключение недоступно" },
    404: {
      description:
        "Предложение недоступно, истекло или принадлежит другому пользователю",
    },
    409: {
      description:
        "Нужно переподключение, провайдер выключен или изменились исходные данные",
    },
    429: { description: "Превышен лимит" },
    503: { description: "Провайдер или шифрование недоступны" },
  };
  if (key === "GET /connections/google") {
    return { responses: { ...responses, 200: response(status) } };
  }
  if (key === "DELETE /connections/google") {
    return {
      responses: {
        ...responses,
        200: response(object({ disconnected: { const: true }, revoked: bool })),
      },
    };
  }
  if (key === "POST /connections/google/start") {
    return {
      requestBody: requestBody(object({})),
      responses: {
        ...responses,
        200: response(
          object({
            url: string,
            browserToken: {
              ...string,
              description: "Только для HttpOnly cookie UI, не для ассистента",
            },
          }),
        ),
      },
    };
  }
  if (key === "POST /connections/google/callback") {
    return {
      requestBody: requestBody(
        object({
          browserToken: { ...string, maxLength: 128 },
          query: { ...string, maxLength: 12000 },
        }),
      ),
      responses: { ...responses, 200: response(status) },
    };
  }
  if (key.endsWith("/confirm")) {
    return {
      requestBody: requestBody(object({})),
      responses: {
        ...responses,
        200: response({
          oneOf: [
            object({
              status: { const: "succeeded" },
              result: {
                type: "object",
                additionalProperties: true,
                description:
                  "Ограниченный ответ Google: ID файла/таблицы или число изменённых ячеек",
              },
            }),
            object({ status: { const: "uncertain" }, message: string }),
          ],
        }),
      },
    };
  }
  if (key.startsWith("DELETE")) {
    return {
      responses: {
        ...responses,
        200: response(object({ cancelled: { const: true } })),
      },
    };
  }
  return {
    description:
      "Owner-bound preview and final receipt until the proposal's existing 20-minute expiry. GET never executes a write. Cancelled proposals remain reviewable; executing/uncertain operations cannot be replayed. Result URLs are constructed from Google file IDs; provider response bodies are not retained.",
    responses: { ...responses, 200: response(proposal) },
  };
}
