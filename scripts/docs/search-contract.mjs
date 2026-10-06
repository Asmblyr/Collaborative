const object = { type: "object", additionalProperties: true };
const priority = {
  enum: ["primary", "secondary", null],
  description: "null restores automatic priority from the record label.",
};
const response = (properties, required = Object.keys(properties)) => ({
  description: "Success",
  content: {
    "application/json": {
      schema: {
        type: "object",
        properties: { data: { type: "object", properties, required } },
        required: ["data"],
      },
    },
  },
});

export function searchContract(key) {
  let properties;
  let required;
  let responses;
  if (key === "PUT /collections/:name/fields/:field/search") {
    properties = {
      searchable: { type: "boolean" },
      indexed: { type: "boolean" },
      searchPriority: priority,
    };
    required = ["searchable", "indexed"];
    responses = { 200: response(properties, required) };
  } else if (key === "PUT /collections/:name/relations/:field/search") {
    properties = { searchable: { type: "boolean" }, searchPriority: priority };
    required = ["searchable"];
    responses = { 200: response(properties, required) };
  } else if (
    [
      "POST /collections/:name/fields/:field/configuration",
      "PUT /collections/:name/fields/:field/configuration",
    ].includes(key)
  ) {
    properties = {
      field: {
        ...object,
        description:
          "Field definition; creation requires name matching the URL and a supported type.",
      },
      presentation: object,
      searchable: { type: "boolean" },
      relationSearchable: { type: "boolean" },
      searchPriority: priority,
    };
    required = key.startsWith("POST") ? ["field"] : [];
    responses = {
      [key.startsWith("POST") ? 201 : 200]: {
        description:
          "Field configuration saved atomically; data contains the updated collection. Index creation uses the separate search endpoint.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: { data: object },
              required: ["data"],
            },
          },
        },
      },
    };
  } else {
    return null;
  }
  return {
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            properties,
            required,
            minProperties: 1,
          },
        },
      },
    },
    responses: {
      ...responses,
      default: {
        description:
          "Invalid input, forbidden access or missing collection/field. Search settings require superuser.",
      },
    },
  };
}
