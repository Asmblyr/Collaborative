// Hand-reviewed HTTP contracts. Route-only entries are explicitly marked in OpenAPI.
import { itemCommitBody } from "./item-commit-contract.mjs";
import { presenceBody, presenceResult } from "./presence-contract.mjs";
import { authBetaContract } from "./auth-beta-contract.mjs";
import { browserAuthContract } from "./browser-auth-contract.mjs";
import { localizationContract } from "./localization-contract.mjs";
import { schemaContract } from "./schema-contract.mjs";
import { integrationsContract } from "./integrations-contract.mjs";
import { serviceKeyContract } from "./service-key-contract.mjs";
import { connectionsContract } from "./connections-contract.mjs";
import { materializedContract } from "./materialized-contract.mjs";
import { cliAuthContract } from "./cli-auth-contract.mjs";
import { notificationsContract } from "./notifications-contract.mjs";
import { assistantHistoryContract } from "./assistant-history-contract.mjs";
import { searchContract } from "./search-contract.mjs";
import { monitoringContract } from "./monitoring-contract.mjs";
import { tablePreferencesContract } from "./table-preferences-contract.mjs";
import { userProfileContract } from "./user-profile-contract.mjs";
import { profileDisplayContract } from "./profile-display-contract.mjs";
import { systemCollectionsContract } from "./system-collections-contract.mjs";
import { oauthPolicyContract } from "./oauth-policy-contract.mjs";
import { userReferenceContract } from "./user-reference-contract.mjs";
import { extensionRegistryContract } from "./extension-registry-contract.mjs";
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
  const extensionRegistry = extensionRegistryContract(key);
  if (extensionRegistry) return extensionRegistry;
  const userReference = userReferenceContract(key);
  if (userReference) return userReference;
  const oauthPolicy = oauthPolicyContract(key);
  if (oauthPolicy) return oauthPolicy;
  const browser = browserAuthContract(key);
  if (browser) return browser;
  const systemCollections = systemCollectionsContract(key);
  if (systemCollections) {
    return systemCollections;
  }
  const profile = userProfileContract(key);
  const display = profileDisplayContract(key);
  if (display) return display;
  if (profile) {
    return profile;
  }
  const tablePreferences = tablePreferencesContract(key);
  if (tablePreferences) {
    return tablePreferences;
  }
  const monitoring = monitoringContract(key);
  if (monitoring) {
    return monitoring;
  }
  const search = searchContract(key);
  if (search) {
    return search;
  }
  const assistantHistory = assistantHistoryContract(key);
  if (assistantHistory) {
    return assistantHistory;
  }
  const notifications = notificationsContract(key);
  if (notifications) {
    return notifications;
  }
  const cliAuth = cliAuthContract(key);
  if (cliAuth) {
    return cliAuth;
  }
  const materialized = materializedContract(key);
  if (materialized) {
    return materialized;
  }
  const connections = connectionsContract(key);
  if (connections) {
    return connections;
  }
  const serviceKey = serviceKeyContract(key);
  if (serviceKey) {
    return serviceKey;
  }
  const integrations = integrationsContract(key);
  if (integrations) {
    return integrations;
  }
  const schema = schemaContract(key);
  if (schema) {
    return schema;
  }
  const localization = localizationContract(key);
  if (localization) {
    return localization;
  }
  if (key === "GET /public/files/:id/content") {
    return {
      parameters: [
        query(
          "preview",
          { enum: ["1"] },
          "Показать только поддержанное растровое превью",
        ),
      ],
      responses: {
        200: {
          description:
            "Байты явно опубликованного ready-файла; no-store, nosniff и ограничительная CSP. Attachment по умолчанию.",
          content: {
            "application/octet-stream": {
              schema: { type: "string", format: "binary" },
            },
          },
        },
        404: error,
        default: error,
      },
    };
  }
  if (key === "PATCH /files/:id") {
    return {
      requestBody: body({
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 255 },
          description: { type: "string", maxLength: 4000 },
          visibility: { enum: ["private", "public"] },
        },
      }),
      responses: {
        200: response(
          mutation,
          "Обновлён ready-файл. visibility=private отзывает будущие публичные скачивания.",
        ),
        default: error,
      },
    };
  }
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
  if (key === "GET /realtime/stream") {
    return {
      parameters: [
        query(
          "clientId",
          { type: "string", format: "uuid" },
          "ID открытого окна",
        ),
        query(
          "scope",
          { type: "string", maxLength: 1024 },
          "JSON scope из PresenceInput",
        ),
      ],
      responses: {
        200: {
          description:
            "SSE envelope; heartbeat-комментарии, событие presence.changed при подключении и изменении присутствия",
          content: { "text/event-stream": { schema: { type: "string" } } },
        },
        default: error,
      },
    };
  }
  if (key === "POST /realtime/locks" || key === "DELETE /realtime/locks") {
    const lockBody = wrapped({
      collection: string,
      recordId: string,
      field: string,
      clientId: { type: "string", format: "uuid" },
    });
    return {
      requestBody: body(lockBody),
      responses: key.startsWith("POST")
        ? {
            200: response(
              wrapped({ data: object }),
              "Получена или продлена lease поля",
            ),
            default: error,
          }
        : {
            204: {
              description: "Собственная lease освобождена или уже отсутствует",
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
          wrapped({
            code: string,
            message: string,
            details: object,
            requestId: string,
          }),
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
        query(
          "q",
          string,
          "Буквальный поиск по читаемым настроенным полям и связям.",
        ),
        query(
          "order",
          { enum: ["field", "relevance"] },
          "При q без явных sort/direction используется relevance; иначе field. Без q эффективный режим field. При relevance sort/direction разрешают равные совпадения.",
        ),
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
              order: { enum: ["field", "relevance"] },
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
