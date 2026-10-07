import { authBetaContract } from "./auth-beta-contract.mjs";

const string = { type: "string" };
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const json = (schema) => ({ "application/json": { schema } });
const cookie = {
  "Set-Cookie": {
    description:
      "HttpOnly; SameSite=Lax; Secure при HTTPS. Имя использует SESSION_COOKIE_PREFIX.",
    schema: string,
  },
};
const ok = {
  description: "Браузерная сессия создана. API tokens не возвращаются.",
  headers: cookie,
  content: json(object({ ok: { const: true } })),
};
const errors = {
  400: { description: "Некорректный запрос" },
  401: { description: "Данные входа или browser proof недействительны" },
  403: { description: "Origin не совпадает с AUTH_UI_URL" },
  429: { description: "Лимит попыток" },
};
const publicOrigin = [
  {
    url: "http://localhost:3000",
    description:
      "Публичный origin без /api; callback сохраняет зарегистрированный путь",
  },
];

export function browserAuthContract(key) {
  if (key === "POST /auth/browser/login") {
    return {
      requestBody: {
        required: true,
        content: json(object({ email: string, password: string })),
      },
      responses: { 200: ok, ...errors },
    };
  }
  if (
    [
      "POST /auth/browser/invitations/claim",
      "POST /auth/browser/passkeys/login",
      "POST /auth/browser/passkeys/options",
    ].includes(key)
  ) {
    const source = authBetaContract(key.replace("/browser", ""));
    return {
      ...source,
      responses: {
        ...source.responses,
        ...errors,
        200: key.endsWith("/options")
          ? { ...source.responses[200], headers: cookie }
          : ok,
      },
    };
  }
  if (key === "POST /auth/browser/logout") {
    return {
      responses: {
        204: {
          description: "Текущая сессия отозвана, cookies удалены",
          headers: cookie,
        },
        403: errors[403],
      },
    };
  }
  if (key === "POST /auth/browser/google/start") {
    return {
      responses: {
        200: {
          description:
            "URL для авторизации; browser proof хранится только в HttpOnly cookie",
          headers: cookie,
          content: json(
            object({ data: object({ url: { ...string, format: "uri" } }) }),
          ),
        },
        ...errors,
      },
    };
  }
  if (key === "POST /sign/sso/:provider") {
    return {
      servers: publicOrigin,
      requestBody: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              properties: { intent: { enum: ["login", "link"] }, next: string },
            },
          },
        },
      },
      responses: {
        303: {
          description:
            "Перенаправление к провайдеру или на страницу ошибки; proof в HttpOnly cookie",
          headers: { ...cookie, Location: { schema: string } },
        },
        403: errors[403],
        404: { description: "Провайдер не настроен" },
      },
    };
  }
  if (
    [
      "GET /sign/sso/:provider/callback",
      "GET /connections/google/callback",
    ].includes(key)
  ) {
    return {
      servers: publicOrigin,
      query: ["code", "state", "error"].map((name) => ({
        name,
        in: "query",
        schema: string,
      })),
      responses: {
        303: {
          description:
            "Проверены одноразовое состояние и browser proof; результат в перенаправлении. Для linking требуется текущая сессия.",
          headers: { ...cookie, Location: { schema: string } },
        },
      },
    };
  }
  if (key === "POST /oauth/complete/:uid") {
    return {
      servers: publicOrigin,
      requestBody: {
        required: true,
        content: json({
          type: "object",
          properties: {
            approve: { type: "boolean" },
            userId: string,
            reuse: { type: "boolean" },
            serviceScopes: {
              type: "array",
              maxItems: 30,
              items: { type: "string", maxLength: 160 },
              description:
                "Displayed servicePermissions.scope values. Required for explicit approval of a policy-managed application. A changed permission set returns 409 and requires a new sign-in.",
            },
          },
          required: ["approve", "userId"],
        }),
      },
      responses: {
        200: {
          description: "Решение принято; перейти на redirectTo",
          content: json(object({ data: object({ redirectTo: string }) })),
        },
        ...errors,
      },
    };
  }
}
