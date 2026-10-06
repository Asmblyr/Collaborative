const identifier = { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" };
const response = (description, schema) => ({
  description,
  ...(schema ? { content: { "application/json": { schema } } } : {}),
});
const candidate = {
  type: "object",
  additionalProperties: false,
  required: ["name", "populated", "connected", "problem", "keys", "fields"],
  properties: {
    name: { type: "string" },
    populated: { type: "boolean" },
    connected: { type: "boolean" },
    problem: {
      enum: [
        null,
        "unsupported-name",
        "unsupported-fields",
        "missing-key",
        "not-populated",
      ],
    },
    keys: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type"],
        properties: {
          name: identifier,
          type: { enum: ["uuid", "serial", "bigserial", "text"] },
        },
      },
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "type", "nullable"],
        properties: {
          name: { type: "string" },
          type: { type: ["string", "null"] },
          nullable: { type: "boolean" },
        },
      },
    },
  },
};

export function materializedContract(route) {
  if (route === "GET /materialized-views") {
    return {
      description:
        "Superuser-only discovery of existing materialized views in public. Reserved Core/plugin names are excluded. Discovery does not register or refresh sources.",
      responses: {
        200: response("Candidates with compatibility reasons", {
          type: "object",
          required: ["data"],
          properties: { data: { type: "array", items: candidate } },
        }),
        401: response("Authentication required"),
        403: response("Superuser required"),
      },
    };
  }
  if (route === "POST /materialized-views") {
    return {
      description:
        "Atomically register an existing populated public materialized view and presentation metadata. Requires a single UUID, positive integer/bigint or nonempty text key (maximum 255 characters) with a valid full single-column UNIQUE index. No SQL, physical changes or REFRESH are accepted. Returns the collection catalog entry. Item writes and physical structure changes remain forbidden, including for superuser.",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["name", "primaryKey"],
              properties: {
                name: identifier,
                primaryKey: identifier,
                displayName: { type: ["string", "null"], maxLength: 120 },
                folderId: { type: ["string", "null"], format: "uuid" },
                workspaceId: { type: ["string", "null"], format: "uuid" },
                displayField: { type: ["string", "null"] },
                displayTemplate: { type: ["string", "null"] },
                presentations: {
                  type: "object",
                  additionalProperties: {
                    type: "object",
                    description:
                      "Ordinary field presentation metadata; no computed/write rules or relation filters. Primary-key presentation is excluded.",
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        201: response("Connected collection", {
          type: "object",
          required: ["data"],
          properties: { data: { type: "object" } },
        }),
        400: response("Incompatible source, key or presentation"),
        403: response("Superuser required; reserved sources excluded"),
        404: response("Source does not exist"),
        409: response("Already registered"),
      },
    };
  }
  if (route === "DELETE /collections/:name/materialized-view") {
    return {
      description:
        "Disconnect the materialized collection and its catalog metadata. The PostgreSQL object, indexes and rows are retained. Relation dependencies prevent disconnection. No refresh or physical deletion is performed.",
      responses: {
        204: response("Disconnected"),
        403: response("Superuser required"),
        404: response("Materialized connection not found"),
        409: response("Dependent collections exist"),
      },
    };
  }
}
