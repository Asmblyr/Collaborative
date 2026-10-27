import { systemCollectionFieldSchema } from "./system-collections-contract.mjs";
import { userProfileContract } from "./user-profile-contract.mjs";
const object = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
const layout = {
  anyOf: [
    {
      type: "object",
      description:
        "Version 1 FormLayout: 1–12 tabs containing field/group nodes, at most three nested group levels. Fields and condition references must belong to the safe profile schema.",
      properties: {
        version: { const: 1 },
        tabs: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: { type: "object" },
        },
      },
      required: ["version", "tabs"],
    },
    { type: "null" },
  ],
};
const fields = { type: "array", items: systemCollectionFieldSchema };
const selfAccess = {
  type: "object",
  additionalProperties: { enum: ["read", "write"] },
  description:
    "Explicit owner grants for native profile fields (firstName, lastName, displayName, description) and registered custom columns. Native fields default to read only; custom fields default to hidden. Own avatar is freely editable. Does not grant user administration or related-row access.",
};
const config = object({ fields, layout, selfAccess });
const values = {
  type: "object",
  additionalProperties: true,
  description:
    "JSON values keyed by safe profile field names. Date, datetime, decimal and bigint values use strings. Hidden fields and condition literals are omitted.",
};
const user =
  userProfileContract("GET /users/me").responses[200].content[
    "application/json"
  ].schema.properties.data;
const result = object({
  canEditAvatar: { type: "boolean" },
  user,
  fields,
  layout,
  values,
  readOnlyFields: { type: "array", items: { type: "string" } },
});
const error = {
  description: "Validation, authentication, authorization or entity error.",
};
const responses = (data) => ({
  200: {
    description: "Success",
    content: { "application/json": { schema: object({ data }) } },
  },
  400: error,
  401: error,
  403: error,
  404: error,
  409: error,
  default: error,
});
const body = (schema) => ({
  required: true,
  content: { "application/json": { schema } },
});
export function userFormContract(key) {
  if (key === "GET /system-collections/users/form")
    return { responses: responses(config) };
  if (key === "PUT /system-collections/users/form")
    return {
      requestBody: body(object({ layout, selfAccess })),
      responses: responses(config),
    };
  if (["GET /users/me/form", "GET /users/:id/form"].includes(key))
    return { responses: responses(result) };
  if (["PATCH /users/me/form", "PATCH /users/:id/form"].includes(key))
    return {
      requestBody: body(
        object(
          {
            values,
            avatarId: {
              anyOf: [{ type: "string", format: "uuid" }, { type: "null" }],
            },
          },
          ["values"],
        ),
      ),
      responses: responses(result),
    };
  return null;
}
