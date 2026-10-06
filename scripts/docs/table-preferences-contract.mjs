const fields = { type: "array", maxItems: 500, items: { type: "string" } };
const tableColumns = {
  type: "object",
  additionalProperties: false,
  required: ["order", "hidden"],
  properties: {
    order: fields,
    hidden: fields,
    widths: {
      type: "object",
      maxProperties: 500,
      additionalProperties: { type: "integer", minimum: 80, maximum: 1200 },
      description:
        "Per-field widths in CSS pixels. Keys must be readable collection fields. Omitted keys use the default width; an empty map resets all widths.",
    },
  },
};
const sort = {
  type: "object",
  additionalProperties: false,
  required: ["field", "direction"],
  properties: {
    field: { type: "string" },
    direction: { enum: ["asc", "desc"] },
    order: { enum: ["field", "relevance"] },
  },
};
const pageSize = { enum: [10, 25, 50, 100] };
const data = {
  type: "object",
  additionalProperties: false,
  required: ["collectionId", "hasSaved", "columns", "pageSize", "sort"],
  properties: {
    collectionId: { type: "string", format: "uuid" },
    hasSaved: { type: "boolean" },
    columns: { anyOf: [tableColumns, { type: "null" }] },
    pageSize,
    sort,
  },
};
const json = (schema) => ({ "application/json": { schema } });

export function tablePreferencesContract(key) {
  if (
    ![
      "GET /users/me/table-preferences/:collection",
      "PATCH /users/me/table-preferences/:collection",
    ].includes(key)
  ) {
    return undefined;
  }
  const requestBody = key.startsWith("PATCH ")
    ? {
        required: true,
        content: json({
          type: "object",
          additionalProperties: false,
          minProperties: 1,
          properties: { columns: tableColumns, pageSize, sort },
        }),
      }
    : undefined;
  return {
    description:
      "Human caller with read access to the collection; only their own table preferences. PATCH merges supplied properties. Columns are reconciled against readable fields on GET; missing personal settings fall back to a visible default view. Resizing does not require record update permission.",
    ...(requestBody ? { requestBody } : {}),
    responses: {
      200: {
        description: "Effective personal table preferences",
        content: json({
          type: "object",
          required: ["data"],
          properties: { data },
        }),
      },
      400: { description: "Invalid preferences or inaccessible column/width" },
      401: { description: "Authentication required" },
      403: {
        description: "Human identity and collection read permission required",
      },
      404: { description: "Collection not found" },
      default: { description: "Request or server error" },
    },
  };
}
