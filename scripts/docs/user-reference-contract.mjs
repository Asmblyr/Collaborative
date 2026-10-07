export function userReferenceContract(key) {
  if (key !== "GET /users/references") return undefined;
  return {
    description:
      "Bounded system-user picker. Requires an authenticated human superuser or users section read/update permission. Returns only id and a display label (name/email); service accounts are denied. Search lists active users; explicit ids may resolve disabled users already referenced. This does not expose system tables through /items.",
    parameters: [
      { name: "q", in: "query", schema: { type: "string", maxLength: 200 } },
      {
        name: "page",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 10000, default: 1 },
      },
      {
        name: "limit",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      {
        name: "ids",
        in: "query",
        schema: { type: "string" },
        description:
          "Up to 100 comma-separated UUIDs; invalid IDs and unknown query parameters are rejected.",
      },
    ],
    responses: {
      200: {
        description: "User reference page",
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["data", "labels", "page"],
              properties: {
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["id", "label"],
                    properties: {
                      id: { type: "string", format: "uuid" },
                      label: { type: "string" },
                    },
                  },
                },
                labels: {
                  type: "object",
                  additionalProperties: { type: "string" },
                },
                page: {
                  type: "object",
                  required: ["number", "size", "total", "sort", "direction"],
                  properties: {
                    number: { type: "integer" },
                    size: { type: "integer" },
                    total: { type: "string" },
                    sort: { const: "label" },
                    direction: { const: "asc" },
                  },
                },
              },
            },
          },
        },
      },
      400: { description: "Invalid query" },
      401: { description: "Authentication required" },
      403: { description: "User directory access denied" },
    },
  };
}
