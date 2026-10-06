const boolean = { type: "boolean" };
const identifier = { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" };
const key = {
  type: "object",
  additionalProperties: false,
  required: ["name", "type"],
  properties: {
    name: identifier,
    type: { enum: ["uuid", "serial", "bigserial", "text"] },
  },
};
const field = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "type",
    "nullable",
    "read",
    "create",
    "update",
    "requiredOnCreate",
  ],
  properties: {
    name: identifier,
    type: { enum: ["string", "number", "boolean", "json", "strings"] },
    nullable: boolean,
    read: boolean,
    create: boolean,
    update: boolean,
    requiredOnCreate: boolean,
    enum: {
      type: "array",
      items: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
    relationKey: key.properties.type,
    filterKind: { enum: ["text", "ordered", "scalar", "none"] },
  },
};
export function schemaContract(route) {
  if (route !== "GET /schema") {
    return undefined;
  }
  return {
    description:
      "Access-scoped collection and generated plugin-model contracts for SDK type generation. Accepts ordinary API authentication or a CLI schema:read credential. No records, defaults, secrets or permission conditions. Alias relations and untyped plugin actions are excluded. Query parameters are rejected.",
    responses: {
      200: {
        description: "Accessible collection schema",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["data"],
              properties: {
                data: {
                  type: "object",
                  additionalProperties: false,
                  required: ["version", "hash", "collections"],
                  properties: {
                    version: { type: "integer", enum: [1] },
                    hash: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    methods: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "namespace",
                          "id",
                          "path",
                          "inputSchema",
                          "outputSchema",
                        ],
                        properties: {
                          namespace: { type: "string" },
                          id: { type: "string" },
                          path: { type: "string" },
                          inputSchema: {
                            type: "object",
                            description:
                              "Kit's bounded, closed JSON model-input schema",
                          },
                          outputSchema: {
                            type: "object",
                            description:
                              "Kit's bounded, closed JSON model-output schema",
                          },
                        },
                      },
                    },
                    collections: {
                      type: "array",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        required: [
                          "name",
                          "mode",
                          "primaryKey",
                          "actions",
                          "fields",
                        ],
                        properties: {
                          sourceKind: { enum: ["table", "materialized-view"] },
                          name: identifier,
                          mode: { enum: ["single", "multiple"] },
                          primaryKey: key,
                          actions: {
                            type: "object",
                            additionalProperties: false,
                            required: ["read", "create", "update", "delete"],
                            properties: {
                              read: boolean,
                              create: boolean,
                              update: boolean,
                              delete: boolean,
                            },
                          },
                          fields: { type: "array", items: field },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: "Unexpected query parameters" },
      401: { description: "Authentication required" },
      503: { description: "Database unavailable" },
    },
  };
}
