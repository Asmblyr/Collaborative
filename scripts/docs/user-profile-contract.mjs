const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const timestamp = { type: "string", format: "date-time" };
const patch = {
  displayName: nullable({ ...string, maxLength: 120 }),
  firstName: nullable({ ...string, maxLength: 120 }),
  lastName: nullable({ ...string, maxLength: 120 }),
  description: nullable({ ...string, maxLength: 2000 }),
  pictureUrl: nullable({
    ...string,
    maxLength: 2048,
    format: "uri",
    description:
      "Public HTTPS URL, no credentials or fragment. Exported in OAuth profile claims.",
  }),
  avatarId: nullable(uuid),
};
const profile = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "email",
    "superuser",
    "hasPassword",
    ...Object.keys(patch),
    "createdAt",
    "updatedAt",
    "lastLoginAt",
    "lastActiveAt",
  ],
  properties: {
    id: uuid,
    email: { ...string, format: "email" },
    superuser: { type: "boolean" },
    hasPassword: { type: "boolean" },
    ...patch,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastLoginAt: nullable(timestamp),
    lastActiveAt: nullable(timestamp),
  },
};
const json = (schema) => ({ "application/json": { schema } });
const body = (schema) => ({ required: true, content: json(schema) });
const response = (schema) => ({
  description: "Успех",
  content: json({
    type: "object",
    required: ["data"],
    properties: { data: schema },
  }),
});
const error = {
  description: "Ошибка проверки, входа, доступа, конфликта или сервера",
};
const responses = (schema) => ({
  200: response(schema),
  400: error,
  401: error,
  403: error,
  404: error,
  409: error,
  default: error,
});
const binding = nullable({
  type: "object",
  additionalProperties: false,
  required: ["collection", "key"],
  properties: { collection: string, key: string },
});
const extension = nullable({
  type: "object",
  required: ["collection", "userId", "exists", "data"],
  additionalProperties: false,
  properties: {
    collection: string,
    userId: uuid,
    exists: { type: "boolean" },
    data: nullable({
      type: "object",
      additionalProperties: true,
      description:
        "Consumer fields filtered by current row and field permissions. Null when absent or no longer readable.",
    }),
  },
});

export function userProfileContract(key) {
  if (
    ["GET /users/me", "GET /auth/me", "GET /users/:id/profile"].includes(key)
  ) {
    return { responses: responses(profile) };
  }
  if (["PATCH /users/me", "PATCH /users/:id/profile"].includes(key)) {
    return {
      requestBody: body({
        type: "object",
        minProperties: 1,
        additionalProperties: false,
        properties: patch,
      }),
      responses: responses(profile),
    };
  }
  if (key === "GET /users/profile-extension")
    return { responses: responses(binding) };
  if (key === "PUT /users/profile-extension")
    return {
      requestBody: body({
        type: "object",
        required: ["collection"],
        additionalProperties: false,
        properties: { collection: nullable(string) },
      }),
      responses: responses(binding),
    };
  if (["GET /users/me/extension", "GET /users/:id/extension"].includes(key))
    return { responses: responses(extension) };
  if (["PATCH /users/me/extension", "PATCH /users/:id/extension"].includes(key))
    return {
      requestBody: body({
        type: "object",
        required: ["collection", "values"],
        additionalProperties: false,
        properties: {
          collection: string,
          values: {
            type: "object",
            additionalProperties: true,
            description:
              "Schema-validated create/update values. Primary key and account fields cannot be supplied.",
          },
        },
      }),
      responses: responses(extension),
    };
  if (key === "POST /users/me/avatar")
    return {
      requestBody: {
        required: true,
        content: {
          "application/octet-stream": {
            schema: {
              type: "string",
              format: "binary",
              description:
                "PNG, JPEG, GIF or WebP; maximum 2 MiB. Upload does not attach the avatar until profile save.",
            },
          },
        },
      },
      responses: {
        201: response({
          type: "object",
          required: ["id"],
          additionalProperties: true,
          properties: { id: uuid },
        }),
        400: error,
        401: error,
        413: error,
        429: error,
        503: error,
        default: error,
      },
    };
  return null;
}
