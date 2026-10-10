const string = { type: "string" };
const boolean = { type: "boolean" };
const nullableString = { type: ["string", "null"] };
const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const stringMap = { type: "object", additionalProperties: string };
const strings = { type: "array", items: string };
const response = (data) => ({
  description: "Успех; private, no-store",
  content: { "application/json": { schema: object({ data }) } },
});
const error = { description: "Ошибка авторизации, проверки или конфликта" };
const id = {
  name: "id",
  in: "path",
  required: true,
  schema: string,
  description: "Base64url идентификатор имени пакета",
};
const query = (name, schema) => ({ name, in: "query", schema });
const entry = object({
  id: string,
  packageName: string,
  namespace: nullableString,
  title: string,
  description: nullableString,
  category: nullableString,
  publisher: {
    anyOf: [object({ id: string, name: string }), { type: "null" }],
  },
  version: string,
  latestAvailableVersion: nullableString,
  manifestVersion: { const: 1 },
  status: {
    enum: ["healthy", "disabled", "restart_required", "incompatible", "failed"],
  },
  desiredState: { enum: ["enabled", "disabled"] },
  actualState: { enum: ["enabled", "disabled", "failed"] },
  instanceId: string,
  pendingRestart: boolean,
  lastError: nullableString,
  loaded: boolean,
  desiredEnabled: boolean,
  restartRequired: boolean,
  compatible: boolean,
  issues: strings,
  capabilities: strings,
  dependencies: stringMap,
  optionalDependencies: stringMap,
  compatibility: {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["collaborative"],
        properties: { collaborative: string, node: string },
      },
      { type: "null" },
    ],
  },
  actions: object({ enable: boolean, disable: boolean, configure: boolean }),
});

export function extensionRegistryContract(key) {
  const prefix = "/settings/extension-registry";
  if (key === `GET ${prefix}`) {
    return {
      parameters: [
        query("page", { type: "integer", minimum: 1, default: 1 }),
        query("limit", {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        }),
        query("search", { type: "string", maxLength: 120 }),
        query("status", string),
        query("category", string),
        query("sort", { enum: ["title", "version", "status"] }),
      ],
      responses: {
        200: {
          description: "Успех; private, no-store",
          content: {
            "application/json": {
              schema: object({
                data: { type: "array", items: entry },
                page: { type: "integer" },
                limit: { type: "integer" },
                total: { type: "integer" },
              }),
            },
          },
        },
        default: error,
      },
    };
  }
  if (
    !key.startsWith(`GET ${prefix}/:id`) &&
    !key.startsWith(`POST ${prefix}/:id`)
  ) {
    return null;
  }
  let data;
  if (key === `GET ${prefix}/:id`) {
    data = entry;
  } else if (key === `GET ${prefix}/:id/versions`) {
    data = {
      type: "array",
      items: object({
        version: string,
        source: { const: "project-package" },
        installed: boolean,
      }),
    };
  } else if (key === `GET ${prefix}/:id/dependencies`) {
    data = object({ required: stringMap, optional: stringMap });
  } else if (key === `GET ${prefix}/:id/permissions`) {
    data = object({ declared: strings, approvalIssue: nullableString });
  } else if (key === `GET ${prefix}/:id/health`) {
    data = object({
      status: string,
      issues: strings,
      restartRequired: boolean,
      desiredState: { enum: ["enabled", "disabled"] },
      actualState: { enum: ["enabled", "disabled", "failed"] },
      pendingRestart: boolean,
      lastError: nullableString,
      instanceId: string,
    });
  } else if (key === `GET ${prefix}/:id/history`) {
    data = {
      type: "array",
      items: object({
        id: string,
        package_name: string,
        action: string,
        result: string,
        error_code: nullableString,
        error_message: nullableString,
        actor_id: nullableString,
        instance_id: nullableString,
        created_at: { type: "string", format: "date-time" },
      }),
    };
  } else if (
    key === `POST ${prefix}/:id/enable` ||
    key === `POST ${prefix}/:id/disable`
  ) {
    data = object({ ...entry.properties, changed: boolean });
  } else {
    return null;
  }
  return {
    parameters: [id],
    responses: {
      200: response(data),
      400: error,
      401: error,
      403: error,
      404: error,
      409: error,
      default: error,
    },
  };
}
