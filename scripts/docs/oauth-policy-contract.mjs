const json = (schema) => ({ "application/json": { schema } });
const string = { type: "string" };
const strings = { type: "array", items: string };
const scopes = {
  ...strings,
  maxItems: 30,
  items: { ...string, maxLength: 160 },
};
const scopeLabels = {
  type: "object",
  additionalProperties: { ...string, maxLength: 120 },
};
const catalogApp = {
  type: "object",
  required: ["id", "name", "enabled", "audience", "scopes", "scopeLabels"],
  properties: {
    id: { ...string, format: "uuid" },
    name: string,
    enabled: { type: "boolean" },
    audience: string,
    scopes,
    scopeLabels,
  },
};
const appInput = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "description",
    "enabled",
    "clientType",
    "redirectUris",
    "userIds",
    "audience",
    "scopes",
  ],
  properties: {
    name: { ...string, maxLength: 120 },
    description: { ...string, maxLength: 1000 },
    enabled: { type: "boolean" },
    clientType: { enum: ["public", "confidential"] },
    redirectUris: { ...strings, minItems: 1, maxItems: 10 },
    userIds: { ...strings, maxItems: 1000 },
    accessMode: { enum: ["all", "selected", "domains"] },
    emailDomains: strings,
    audience: { ...string, maxLength: 200 },
    scopes,
    scopeLabels,
    policyManaged: {
      type: "boolean",
      description:
        "Use assigned policies instead of user/domain rules. Omission preserves the existing value; defaults to false on creation.",
    },
  },
};
const application = {
  ...appInput,
  additionalProperties: true,
  properties: {
    ...appInput.properties,
    id: { ...string, format: "uuid" },
    createdAt: { ...string, format: "date-time" },
  },
};
const response = (data) => ({
  description: "Success",
  content: json({ type: "object", required: ["data"], properties: { data } }),
});
const errors = {
  400: { description: "Invalid application or permission catalog" },
  401: { description: "Authentication required" },
  403: { description: "Human identity and settings access required" },
  default: { description: "Request or server error" },
};

export function oauthPolicyContract(key) {
  if (key === "GET /policies/applications") {
    return {
      description:
        "Catalog of policy-managed OAuth applications, including disabled applications. Requires policies/read or policies/update. Contains no client secrets. Catalog permissions do not grant access by themselves.",
      responses: {
        200: response({ type: "array", items: catalogApp }),
        ...errors,
      },
    };
  }
  if (
    !["GET /oauth-apps", "POST /oauth-apps", "PUT /oauth-apps/:id"].includes(
      key,
    )
  )
    return undefined;
  const read = key.startsWith("GET ");
  return {
    description:
      "OAuth application configuration. policyManaged defaults to false; omission on update preserves policyManaged and scopeLabels. Catalog scopes require an audience, label keys must belong to scopes. In policy mode authorization requests use openid/profile/email only; personal permissions are emitted as resource_access[audience].roles. Changing audience or policy-management mode resets consent. Existing client type cannot change.",
    ...(!read
      ? { requestBody: { required: true, content: json(appInput) } }
      : {}),
    responses: {
      [key.startsWith("POST ") ? 201 : 200]: response(
        read
          ? { type: "array", items: application }
          : {
              type: "object",
              required: ["application"],
              properties: {
                application,
                clientSecret: {
                  ...string,
                  description:
                    "Returned once for a new confidential application",
                },
              },
            },
      ),
      ...errors,
    },
  };
}
