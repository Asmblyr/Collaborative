const boolean = { type: "boolean" };
const number = { type: "number", minimum: 0 };
const integer = { type: "integer", minimum: 0 };
const text = { type: "string" };
const rate = { type: "number", minimum: 0, maximum: 1 };
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

export const monitoringConnectionSchema = object({
  enabled: boolean,
  environment: {
    type: "string",
    minLength: 1,
    maxLength: 64,
    description: "Без пробелов, слешей и зарезервированного имени None.",
  },
  release: { type: "string", maxLength: 120 },
  errorsCore: boolean,
  errorsBrowser: boolean,
  performanceCore: boolean,
  performanceBrowser: boolean,
  databaseSpans: boolean,
  tracesSampleRate: rate,
});

export function monitoringContract(key) {
  let data;
  if (key === "GET /monitoring/browser") {
    data = object({
      enabled: boolean,
      dsn: {
        ...text,
        description:
          "Только публичный браузерный DSN; пустая строка при отключении. Серверный DSN не возвращается.",
      },
      environment: text,
      release: text,
      errors: boolean,
      performance: boolean,
      tracesSampleRate: rate,
    });
  } else if (key === "GET /settings/monitoring") {
    data = object({
      issue: { enum: [null, "configuration_unavailable"] },
      enabled: boolean,
      windowSeconds: { const: 900 },
      maxSamplesPerRoute: { const: 2000 },
      maxRoutes: { const: 128 },
      routesLimited: boolean,
      routes: {
        type: "array",
        maxItems: 128,
        items: object({
          route: text,
          samples: { ...integer, maximum: 2000 },
          limited: boolean,
          errors: integer,
          p50Ms: number,
          p95Ms: number,
          p99Ms: number,
        }),
      },
      runtime: {
        anyOf: [
          { type: "null" },
          object({
            rssMb: integer,
            heapUsedMb: integer,
            eventLoopP99Ms: number,
            poolUsed: integer,
            poolFree: integer,
            poolPending: integer,
          }),
        ],
      },
    });
  } else {
    return undefined;
  }
  return {
    responses: {
      200: {
        description:
          "Успех; private, no-store. Метрики только текущего экземпляра Core.",
        content: { "application/json": { schema: object({ data }) } },
      },
      401: {
        description:
          "Нужна активная человеческая сессия; сервисные токены не допускаются.",
      },
      ...(key.startsWith("GET /settings")
        ? { 403: { description: "Нужен superuser; право не делегируется." } }
        : {}),
      503: { description: "База/конфигурация недоступна." },
    },
  };
}
