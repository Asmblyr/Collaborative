import { monitoringConnectionSchema } from "./monitoring-contract.mjs";
const text = { type: "string" };
const identifier = { type: "string", maxLength: 120 };
const enabled = { type: "boolean" };
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const storage = object({
  enabled,
  provider: { enum: ["s3", "yandex"] },
  bucket: { type: "string", maxLength: 63 },
  region: identifier,
  endpoint: { type: "string", maxLength: 2048 },
  serviceAccountId: identifier,
});
const assistant = object({
  enabled,
  baseURL: { type: "string", maxLength: 2048 },
  model: identifier,
  api: { enum: ["responses", "chat-completions"] },
  timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
  maxOutputTokens: { type: "integer", minimum: 128, maximum: 16384 },
  effort: { enum: ["", "low", "medium", "high", "max"] },
  thinking: { type: ["boolean", "null"] },
});
const encryption = object({
  provider: { enum: ["local", "yandex-kms"] },
  keyId: identifier,
  serviceAccountId: identifier,
});
const google = object({
  enabled,
  clientId: { type: "string", maxLength: 256 },
  redirectUri: { type: "string", maxLength: 2048 },
});
const state = (value, keys) =>
  object({
    source: { enum: ["environment", "admin"] },
    readOnly: enabled,
    value,
    secrets: object(Object.fromEntries(keys.map((key) => [key, enabled]))),
  });
const snapshot = object({
  monitoring: state(monitoringConnectionSchema, ["serverDsn", "browserDsn"]),
  google: state(google, ["clientSecret"]),
  revision: { type: "string", format: "uuid" },
  storage: state(storage, ["accessKeyId", "secretAccessKey", "sessionToken"]),
  assistant: state(assistant, ["apiKey"]),
  encryption: state(encryption, []),
  bootstrap: object({ localKey: enabled, workloadIdentity: enabled }),
  savedSecretCount: { type: "integer", minimum: 0 },
});
const response = (data) => ({
  description: "Успех",
  content: { "application/json": { schema: object({ data }) } },
});
const section = {
  name: "section",
  in: "path",
  required: true,
  schema: {
    enum: ["storage", "assistant", "encryption", "google", "monitoring"],
  },
};
const secret = {
  type: ["string", "null"],
  writeOnly: true,
  maxLength: 8000,
  description:
    "До 8000 байт UTF-8. Пропуск сохраняет прежний ключ; null удаляет его. Пустая строка запрещена.",
};
const update = object({
  revision: { type: "string", format: "uuid" },
  value: {
    oneOf: [storage, assistant, encryption, google, monitoringConnectionSchema],
  },
  secrets: {
    type: "object",
    additionalProperties: false,
    allOf: [{ if: { required: ["dsn"] }, then: { maxProperties: 1 } }],
    properties: Object.fromEntries(
      [
        "accessKeyId",
        "secretAccessKey",
        "sessionToken",
        "apiKey",
        "clientSecret",
        "dsn",
        "serverDsn",
        "browserDsn",
      ].map((key) => [
        key,
        key === "dsn"
          ? {
              ...secret,
              deprecated: true,
              description:
                "Совместимый общий DSN мониторинга. Допускается отдельно от других ключей; задаёт общий DSN и очищает отдельные. null удаляет все DSN. Используйте serverDsn и browserDsn для независимой настройки.",
            }
          : secret,
      ]),
    ),
  },
});
update.required = ["revision", "value"];

export function integrationsContract(key) {
  if (!key.includes("/settings/integrations")) {
    return undefined;
  }
  const responses = {
    200: response(snapshot),
    400: { description: "Неверные параметры" },
    401: { description: "Нужна человеческая сессия" },
    403: { description: "Нужен superuser" },
    503: {
      description:
        "Провайдер или ключ шифрования недоступен; секреты не возвращаются",
    },
  };
  if (key === "GET /settings/integrations") {
    return { responses };
  }
  responses[409] = {
    description:
      "Настройки изменились, группа заблокирована env, подключение выключено или хранилище содержит файлы",
  };
  if (key.endsWith("/test")) {
    responses[200] = response(object({ ok: { const: true } }));
    responses[429] = { description: "Слишком много проверок" };
  }
  return {
    parameters: [section],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: key.endsWith("/test")
            ? {
                anyOf: [
                  update,
                  {
                    type: "object",
                    maxProperties: 0,
                    description:
                      "Для подключения из env сервер проверяет текущую конфигурацию",
                  },
                ],
              }
            : update,
        },
      },
    },
    responses,
  };
}
