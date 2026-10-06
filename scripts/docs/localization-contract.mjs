const messages = { type: "object", additionalProperties: { type: "string" } };
const labels = {
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: { type: "string" },
    description: { type: "string" },
    placeholder: { type: "string" },
  },
};
const preferenceProperties = {
  theme: { enum: ["light", "dark", "system"] },
  style: { enum: ["neutral", "ocean", "coral"] },
  locale: { enum: ["ru", "en"] },
};
const response = (data) => ({
  description: "Успех",
  content: {
    "application/json": {
      schema: { type: "object", required: ["data"], properties: { data } },
    },
  },
});
const error = {
  description: "Проверка входных данных, аутентификация или ошибка сервера",
};

export function localizationContract(key) {
  if (key === "GET /translations") {
    return {
      parameters: [
        {
          name: "locale",
          in: "query",
          schema: { enum: ["ru", "en"], default: "ru" },
        },
      ],
      responses: {
        200: response({
          type: "object",
          required: [
            "version",
            "locale",
            "fallbackLocale",
            "core",
            "plugins",
            "schema",
          ],
          additionalProperties: false,
          properties: {
            version: { const: 1 },
            locale: preferenceProperties.locale,
            fallbackLocale: { const: "ru" },
            core: messages,
            plugins: { type: "object", additionalProperties: messages },
            schema: {
              type: "object",
              additionalProperties: {
                type: "object",
                required: ["label", "fields"],
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  fields: { type: "object", additionalProperties: labels },
                },
              },
            },
          },
        }),
        400: error,
        401: error,
        default: error,
      },
    };
  }
  if (
    ["GET /users/me/preferences", "PATCH /users/me/preferences"].includes(key)
  ) {
    const result = {
      type: "object",
      required: ["theme", "style", "locale"],
      additionalProperties: false,
      properties: {
        ...preferenceProperties,
        theme: { anyOf: [preferenceProperties.theme, { type: "null" }] },
      },
    };
    return {
      ...(key.startsWith("PATCH")
        ? {
            requestBody: {
              required: true,
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    minProperties: 1,
                    additionalProperties: false,
                    properties: preferenceProperties,
                  },
                },
              },
            },
          }
        : {}),
      responses: {
        200: response(result),
        400: error,
        401: error,
        403: error,
        default: error,
      },
    };
  }
  return null;
}
