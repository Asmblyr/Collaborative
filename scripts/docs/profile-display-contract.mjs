const string = { type: "string" };
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const entry = object({
  id: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,64}$" },
  label: { type: "string", minLength: 1, maxLength: 100 },
  path: {
    type: "array",
    minItems: 1,
    maxItems: 3,
    items: { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" },
  },
  selfVisible: { type: "boolean" },
});
const config = object({
  title: { type: "string", maxLength: 100 },
  entries: { type: "array", maxItems: 12, items: entry },
});
const types = [
  "text",
  "email",
  "integer",
  "bigint",
  "decimal",
  "boolean",
  "date",
  "datetime",
  "tags",
  "user",
];
const result = object({
  title: string,
  entries: {
    type: "array",
    items: object({
      id: string,
      label: string,
      type: { enum: types },
      value: {
        anyOf: [
          string,
          { type: "number" },
          { type: "boolean" },
          { type: "array", items: string },
          { type: "null" },
        ],
      },
    }),
  },
});
const json = (schema) => ({ "application/json": { schema } });
const responses = (schema) => ({
  200: { description: "Успех", content: json(object({ data: schema })) },
  default: { description: "Ошибка входа, доступа, проверки или сервера" },
});

export function profileDisplayContract(key) {
  if (key === "GET /users/profile-display") {
    return { responses: responses(config) };
  }
  if (key === "PUT /users/profile-display") {
    return {
      requestBody: { required: true, content: json(config) },
      responses: responses(config),
    };
  }
  if (key === "GET /users/profile-display/sources") {
    return {
      query: [
        {
          name: "path",
          in: "query",
          schema: string,
          description:
            "Префикс одиночных связей через точку; пустой — дополнительные поля пользователя.",
        },
      ],
      responses: responses({
        type: "array",
        items: object({
          name: string,
          label: string,
          type: { enum: [...types, "relation"] },
        }),
      }),
    };
  }
  if (
    [
      "GET /users/me/profile-display",
      "GET /users/:id/profile-display",
    ].includes(key)
  ) {
    return { responses: responses(result) };
  }
  return null;
}
