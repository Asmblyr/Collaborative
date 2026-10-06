const text = { type: "string" };
const date = { type: "string", format: "date-time" };
const optionalDate = { type: ["string", "null"], format: "date-time" };
const keyProperties = {
  id: { type: "string", format: "uuid" },
  name: text,
  prefix: text,
  createdAt: date,
  expiresAt: date,
  lastUsedAt: {
    ...optionalDate,
    description: "Последний успешный обмен ключа на токен",
  },
  lastActivityAt: {
    ...optionalDate,
    description:
      "Последний успешный обмен или аутентификация HTTP-запроса токеном этого ключа",
  },
  requestCount: {
    type: "string",
    pattern: "^[0-9]+$",
    description:
      "Точный bigint строкой: HTTP-запросы с проверенным токеном, включая последующий отказ в правах. Обмены, неверные и истёкшие токены не учитываются; история до включения статистики не восстанавливается.",
  },
  revokedAt: optionalDate,
};
const keyMetadata = {
  type: "object",
  additionalProperties: false,
  required: Object.keys(keyProperties),
  properties: keyProperties,
};
const response = (data) => ({
  description: "Успех",
  content: {
    "application/json": {
      schema: { type: "object", required: ["data"], properties: { data } },
    },
  },
});

export function serviceKeyContract(operation) {
  if (operation === "GET /service-accounts/:id") {
    return {
      responses: {
        200: response({
          type: "object",
          required: [
            "id",
            "name",
            "description",
            "status",
            "createdAt",
            "policyIds",
            "keys",
            "federations",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            name: text,
            description: text,
            status: { enum: ["active", "disabled"] },
            createdAt: date,
            policyIds: {
              type: "array",
              items: { type: "string", format: "uuid" },
            },
            keys: { type: "array", items: keyMetadata },
            federations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  name: text,
                  projectId: text,
                  projectPath: text,
                  ref: text,
                  audience: text,
                  createdAt: date,
                  lastUsedAt: optionalDate,
                  revokedAt: optionalDate,
                },
              },
            },
          },
        }),
      },
    };
  }
  if (operation === "POST /service-accounts/:id/keys") {
    const properties = {
      ...keyProperties,
      secret: {
        type: "string",
        description: "Одноразовое значение; больше не возвращается",
        pattern: "^asm_sk_[A-Za-z0-9_-]{43}$",
      },
    };
    return {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: {
                name: { type: "string", minLength: 1, maxLength: 120 },
                expiresInDays: {
                  type: "integer",
                  minimum: 1,
                  maximum: 365,
                  default: 90,
                },
              },
            },
          },
        },
      },
      responses: {
        201: response({
          ...keyMetadata,
          required: Object.keys(properties),
          properties,
        }),
      },
    };
  }
  return undefined;
}
