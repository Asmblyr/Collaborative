const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const string = { type: "string" };
const boolean = { type: "boolean" };
const jsonValue = {
  description: "JSON value; dates, datetime, decimal and bigint use strings.",
};
const fieldTypes = [
  "text",
  "integer",
  "bigint",
  "boolean",
  "datetime",
  "date",
  "email",
  "decimal",
  "json",
  "uuid",
  "file",
  "files",
];
const names = ["users", "files", "policies", "workspaces", "service_accounts"];
const presentation = {
  type: "object",
  description:
    "Standard field presentation (labels/translations, interface, choices, constraints, layout and display). Behavior rules, sensitive history and relation filters are rejected.",
  additionalProperties: true,
};
const field = object(
  {
    name: string,
    type: string,
    managed: boolean,
    required: boolean,
    nullable: boolean,
    defaultValue: jsonValue,
    presentation,
  },
  ["name", "type", "managed", "required", "nullable"],
);
const collection = object({
  name: { enum: names },
  fields: { type: "array", items: field },
});
const values = {
  type: "object",
  additionalProperties: jsonValue,
  description:
    "Only registered custom fields; builtin fields are always rejected on write and excluded on read.",
};
const record = object({
  id: { type: "string", format: "uuid" },
  label: string,
  values,
});
const json = (schema) => ({ "application/json": { schema } });
const success = (schema) => ({
  description: "Успех",
  content: json(object({ data: schema })),
});
const error = {
  description:
    "Validation, authentication, authorization, missing entity or dependency conflict.",
};
const responses = (schema, status = 200) => ({
  [status]: success(schema),
  400: error,
  401: error,
  403: error,
  404: error,
  409: error,
  default: error,
});
const body = (schema) => ({ required: true, content: json(schema) });

export function systemCollectionsContract(key) {
  if (key === "GET /system-collections") {
    return { responses: responses({ type: "array", items: collection }) };
  }
  if (
    [
      "POST /system-collections/:name/fields/:field/configuration",
      "PUT /system-collections/:name/fields/:field/configuration",
    ].includes(key)
  ) {
    const create = key.startsWith("POST");
    const definition = object(
      {
        ...(create
          ? {
              name: { ...string, pattern: "^[a-z][a-z0-9_]{0,62}$" },
              type: { enum: fieldTypes },
            }
          : {}),
        required: { const: false },
        nullable: { const: true },
        defaultValue: jsonValue,
      },
      create ? ["name", "type"] : [],
    );
    return {
      requestBody: body({
        ...object({ field: definition, presentation }, create ? ["field"] : []),
        minProperties: 1,
      }),
      responses: responses(collection, create ? 201 : 200),
    };
  }
  if (key === "DELETE /system-collections/:name/fields/:field") {
    return {
      responses: {
        204: {
          description:
            "Custom column and its values removed. Builtins and dependent views are protected.",
        },
        401: error,
        403: error,
        404: error,
        409: error,
        default: error,
      },
    };
  }
  if (key === "GET /system-collections/:name/records") {
    return {
      query: [
        {
          name: "q",
          in: "query",
          schema: { ...string, maxLength: 200 },
          description:
            "Search builtin record labels. Custom values are omitted from this selector.",
        },
        {
          name: "page",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
          description: "25 records per page, stable order by label and ID.",
        },
      ],
      responses: responses(
        object({
          records: { type: "array", items: record },
          page: { type: "integer" },
          hasMore: boolean,
        }),
      ),
    };
  }
  if (key === "GET /system-collections/:name/records/:id") {
    return { responses: responses(record) };
  }
  if (key === "PATCH /system-collections/:name/records/:id") {
    return {
      requestBody: body(object({ values: { ...values, minProperties: 1 } })),
      responses: responses(record),
    };
  }
  return null;
}
