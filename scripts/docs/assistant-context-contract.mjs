const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const boundedInteger = (minimum, maximum) => ({
  type: "integer",
  minimum,
  maximum,
});
const boundedString = (maxLength) => ({ type: "string", maxLength });
const workspaceId = {
  anyOf: [{ type: "string", format: "uuid" }, { type: "null" }],
};

export const assistantDataAccessContract = object({
  enabled: { type: "boolean" },
  workspaceId,
});
const table = object(
  {
    page: boundedInteger(1, 2147483647),
    size: boundedInteger(1, 100),
    sort: boundedString(63),
    direction: { enum: ["asc", "desc"] },
    order: { enum: ["field", "relevance"] },
    q: boundedString(255),
    filter: boundedString(8192),
    selectedCount: boundedInteger(0, 100),
    editorOpen: { type: "boolean" },
  },
  [
    "page",
    "size",
    "sort",
    "direction",
    "q",
    "filter",
    "selectedCount",
    "editorOpen",
  ],
);
const collection = { type: "string", pattern: "^[a-z][a-z0-9_]{0,62}$" };
const record = object({ id: { type: "string", minLength: 1, maxLength: 255 } });

/** Mirrors the three mutually exclusive runtime context shapes. */
export const assistantContextContract = {
  description:
    "Контекст раздела, таблицы или сохранённой записи. Core проверяет workspace, MCP и права чтения. Данные черновика не принимаются.",
  oneOf: [
    object(
      {
        page: {
          anyOf: [
            {
              enum: [
                "home",
                "collections",
                "files",
                "access",
                "services",
                "settings",
                "system-settings",
                "search",
              ],
            },
            {
              type: "string",
              pattern: "^extensions/[a-z][a-z0-9_]{0,30}/[a-z][a-z0-9-]{0,31}$",
            },
          ],
        },
        workspaceId,
      },
      ["page"],
    ),
    object({ page: { const: "items" }, workspaceId, collection, table }, [
      "page",
      "collection",
      "table",
    ]),
    object({ page: { const: "items" }, workspaceId, collection, record }, [
      "page",
      "collection",
      "record",
    ]),
  ],
};
