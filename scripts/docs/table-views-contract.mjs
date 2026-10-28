const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const string = { type: "string" };
const strings = { type: "array", items: string };
const definition = object({
  columns: object(
    {
      order: strings,
      hidden: strings,
      widths: { type: "object", additionalProperties: { type: "number" } },
    },
    ["order", "hidden"],
  ),
  sort: object(
    {
      field: string,
      direction: { enum: ["asc", "desc"] },
      order: { enum: ["field", "relevance"] },
    },
    ["field", "direction"],
  ),
  pageSize: { enum: [10, 25, 50, 100] },
  filter: {
    type: ["object", "null"],
    additionalProperties: true,
    description:
      "Validated logic/children filter tree; paths must remain readable.",
  },
  q: string,
});
const view = object({
  id: { type: "string", format: "uuid" },
  name: string,
  scope: { enum: ["personal", "workspace", "collection"] },
  workspaceId: { type: ["string", "null"], format: "uuid" },
  isDefault: { type: "boolean" },
  editable: { type: "boolean" },
  definition: { anyOf: [definition, { type: "null" }] },
  available: { type: "boolean" },
  createdAt: { type: "string", format: "date-time" },
  updatedAt: { type: "string", format: "date-time" },
});

export function tableViewsContract(key) {
  if (
    ![
      "GET /table-views/:collection",
      "GET /table-views/:collection/default",
    ].includes(key)
  ) {
    return;
  }
  const data = key.endsWith("/default")
    ? { anyOf: [view, { type: "null" }] }
    : { type: "array", items: view };
  return {
    description:
      "Human account with collection read access. Personal and collection views plus views for the requested workspace containing this collection. Definitions are reconciled with readable fields. Reading does not change the saved workspace preference. Default priority: personal, workspace, collection.",
    query: [
      {
        name: "workspaceId",
        in: "query",
        required: false,
        schema: {
          anyOf: [{ type: "string", format: "uuid" }, { const: "all" }],
        },
        description:
          "Explicit workspace context. all excludes workspace-scoped views. Omission uses the account's saved workspace for compatibility. Unknown/nonmember workspace has no workspace views; no collection access is granted.",
      },
    ],
    responses: {
      200: {
        description: "Permitted views",
        content: { "application/json": { schema: object({ data }) } },
      },
      400: { description: "Invalid or repeated workspaceId" },
      401: { description: "Authentication required" },
      403: {
        description: "Human account and collection read permission required",
      },
      404: { description: "Collection not found" },
    },
  };
}
