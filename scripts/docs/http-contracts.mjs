// Hand-reviewed HTTP contracts. Route-only entries are explicitly marked in OpenAPI.
import { itemCommitBody } from "./item-commit-contract.mjs";
import { presenceBody, presenceResult } from "./presence-contract.mjs";
import { authBetaContract } from "./auth-beta-contract.mjs";
const object = { type: "object", additionalProperties: true };
const json = (schema) => ({ "application/json": { schema } });
const response = (schema, description = "Успех") => ({
  description,
  content: json(schema),
});
const body = (schema) => ({ required: true, content: json(schema) });
const wrapped = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
});
const string = { type: "string" };
const mutation = wrapped({ data: { anyOf: [object, { type: "null" }] } });
const error = {
  description:
    "Ошибка проверки, авторизации или исполнения; код HTTP определяет результат.",
};
const query = (name, schema, description) => ({
  name,
  in: "query",
  schema,
  description,
});
const fields = query(
  "fields",
  string,
  "Имена через запятую; пустое значение возвращает только ключ. Пропуск — все доступные поля.",
);
const tokenPair = wrapped({
  tokenType: { const: "Bearer" },
  accessToken: string,
  refreshToken: string,
  expiresIn: { type: "integer" },
  refreshExpiresAt: { type: "string", format: "date-time" },
});

const settingsSectionList = {
  type: "array",
  items: {
    enum: [
      "users",
      "policies",
      "plugins",
      "assistant",
      "terms",
      "services",
      "oauth",
      "files",
    ],
  },
};

export function operationContract(key) {
  const auth = authBetaContract(key);
  if (auth) {
    return auth;
  }
  if (key === "POST /presence") {
    return {
      requestBody: body(presenceBody),
      responses: {
        200: response(
          presenceResult,
          "Продление присутствия на 30 секунд и доступные участники. До 32 активных окон на сессию. Текущий пользователь идёт первым.",
        ),
        default: error,
      },
    };
  }
  if (key === "DELETE /presence/:clientId") {
    return {
      responses: {
        204: {
          description:
            "Собственное окно удалено; повтор безопасен. Другие сессии не затрагиваются.",
        },
        default: error,
      },
    };
  }
  if (key === "POST /items/:collection/commit") {
    return {
      requestBody: body(itemCommitBody),
      responses: {
        200: response(wrapped({ data: wrapped({ id: string }) })),
        409: response(
          wrapped({ code: string, message: string, requestId: string }),
          "Конфликт, включая ITEM_CHANGED. Весь черновик и его история откатываются. Ответ не содержит закрытых значений.",
        ),
        default: error,
      },
    };
  }
  if (key === "GET /settings/access") {
    return {
      responses: {
        200: response(
          wrapped({
            data: wrapped({
              sections: settingsSectionList,
              editableSections: settingsSectionList,
              canManagePolicies: {
                type: "boolean",
                description:
                  "Только человек-superuser может менять состав политик и permissions.",
              },
              delegatablePolicyIds: {
                type: "array",
                items: { type: "string", format: "uuid" },
                description:
                  "Явный набор готовых политик для назначения. Не даёт прав на соответствующий раздел и не назначает их пользователю. Superuser не ограничен этим списком.",
              },
            }),
          }),
        ),
        default: error,
      },
    };
  }
  if (key === "PUT /users/:id/delegation") {
    const ids = {
      type: "array",
      maxItems: 1000,
      uniqueItems: true,
      items: { type: "string", format: "uuid" },
    };
    return {
      requestBody: body({
        ...wrapped({ policyIds: ids }),
        additionalProperties: false,
      }),
      responses: {
        200: response(wrapped({ data: wrapped({ policyIds: ids }) })),
        default: error,
      },
    };
  }
  if (key === "PUT /policies/:id/users") {
    return {
      requestBody: body({
        ...wrapped({
          userIds: {
            type: "array",
            maxItems: 1000,
            uniqueItems: true,
            items: { type: "string", format: "uuid" },
          },
        }),
        additionalProperties: false,
      }),
      responses: {
        204: {
          description:
            "Назначения заменены атомарно. Менеджер не меняет собственные назначения или назначения superuser.",
        },
        default: error,
      },
    };
  }
  if (key === "POST /auth/login") {
    return {
      requestBody: body(wrapped({ email: string, password: string })),
      responses: {
        200: response({
          ...tokenPair,
          description: "Токены передаются напрямую, без обёртки data.",
        }),
        default: error,
      },
    };
  }
  if (key === "POST /auth/refresh") {
    return {
      requestBody: body(wrapped({ refreshToken: string })),
      responses: { 200: response(tokenPair), default: error },
    };
  }
  if (key === "GET /items/:collection") {
    return {
      query: [
        fields,
        query("page", { type: "integer", minimum: 1, default: 1 }),
        query("limit", {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 100,
        }),
        query("sort", string),
        query("direction", { enum: ["asc", "desc"] }),
        query("q", string, "Поиск по настроенным полям и связям."),
        query(
          "filter",
          string,
          "JSON группы {logic: and|or, children: [...]}; это фильтр запроса, не grant.",
        ),
      ],
      responses: {
        200: response(
          wrapped({
            data: { type: "array", items: object },
            labels: { type: "object", additionalProperties: string },
            page: wrapped({
              number: { type: "integer" },
              size: { type: "integer" },
              total: string,
              sort: string,
              direction: { enum: ["asc", "desc"] },
            }),
          }),
        ),
        default: error,
      },
    };
  }
  if (key === "GET /items/:collection/:id") {
    return {
      query: [fields],
      responses: {
        200: response(wrapped({ data: object, label: string })),
        default: error,
      },
    };
  }
  if (
    key === "POST /items/:collection" ||
    key === "PATCH /items/:collection/:id"
  ) {
    return {
      requestBody: body(object),
      responses: {
        [key.startsWith("POST") ? 201 : 200]: response(
          mutation,
          "Сохранено; data=null при отсутствии права чтения.",
        ),
        default: error,
      },
    };
  }
  if (key === "DELETE /items/:collection/:id") {
    return {
      responses: {
        204: { description: "Удалено, без тела ответа." },
        default: error,
      },
    };
  }
  return null;
}
