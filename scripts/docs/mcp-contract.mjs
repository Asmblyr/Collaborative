const string = { type: "string" };
const strings = { type: "array", items: string };
const ids = {
  type: "array",
  maxItems: 100,
  items: { type: "string", format: "uuid" },
};
const object = (
  properties,
  required = Object.keys(properties),
  additionalProperties = false,
) => ({ type: "object", properties, required, additionalProperties });
const json = (schema) => ({ "application/json": { schema } });
const response = (schema) => ({
  description: "Success",
  content: json(schema),
});
const body = (schema) => ({ required: true, content: json(schema) });
const wrapped = (properties) => response(object({ data: object(properties) }));
const scopes = { type: "array", items: { enum: ["mcp:read", "mcp:write"] } };
const timestamp = { type: "string", format: "date-time" };
const collection = object({
  id: { type: "string", format: "uuid" },
  label: string,
});
const connection = object({
  id: string,
  name: string,
  scopes,
  createdAt: timestamp,
  lastUsedAt: { type: ["string", "null"], format: "date-time" },
  expiresAt: timestamp,
  collections: { type: "array", items: collection },
});
const errors = {
  400: {
    description: "Invalid OAuth request, scope, resource, code or verifier",
  },
  401: { description: "Invalid or revoked user session / MCP credential" },
  403: { description: "User, collection or origin access denied" },
  429: { description: "Rate limited" },
};

export function mcpContract(key) {
  if (key.startsWith("GET /.well-known/oauth-")) {
    const resource = key.includes("protected-resource");
    const properties = resource
      ? {
          resource: string,
          authorization_servers: strings,
          scopes_supported: strings,
          bearer_methods_supported: strings,
        }
      : {
          issuer: string,
          authorization_endpoint: string,
          token_endpoint: string,
          registration_endpoint: string,
          revocation_endpoint: string,
          response_types_supported: strings,
          grant_types_supported: strings,
          token_endpoint_auth_methods_supported: strings,
          code_challenge_methods_supported: strings,
          scopes_supported: strings,
        };
    return {
      servers: [
        { url: "http://localhost:3000" },
        { url: "http://localhost:3001" },
      ],
      responses: { 200: response(object(properties)) },
    };
  }
  if (["GET /mcp", "POST /mcp", "DELETE /mcp"].includes(key)) {
    const post = key.startsWith("POST");
    return {
      description:
        "MCP 2025-11-25 Streamable HTTP, stateless JSON responses. Only purpose-bound MCP bearer tokens are accepted. Every tool reloads user/session, approved collection IDs and live field/row permissions. GET SSE and DELETE sessions are unsupported. Discover input/output contracts with tools/list; tools/call uses the same data kernel as the website. This JSON-RPC envelope is not a generated REST tool client.",
      security: [{ mcpBearer: [] }],
      ...(post
        ? {
            requestBody: body(
              object(
                {
                  jsonrpc: { const: "2.0" },
                  id: { type: ["string", "number"] },
                  method: string,
                  params: { type: "object", additionalProperties: true },
                },
                ["jsonrpc", "method"],
              ),
            ),
          }
        : {}),
      responses: {
        ...(post
          ? {
              200: response({ type: "object", additionalProperties: true }),
              202: { description: "Notification accepted; empty body" },
            }
          : {}),
        405: { description: "GET SSE / DELETE sessions are unsupported" },
        ...errors,
      },
    };
  }
  if (key === "OPTIONS /mcp" || key === "OPTIONS /mcp/oauth/:operation") {
    return {
      responses: {
        204: {
          description:
            "Public CORS discovery without credentials; authenticated MCP calls validate the canonical/registered callback origin",
        },
        403: errors[403],
      },
    };
  }
  if (key === "POST /mcp/oauth/register") {
    const registration = object(
      {
        client_name: { type: "string", maxLength: 120 },
        redirect_uris: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: string,
        },
        token_endpoint_auth_method: { const: "none" },
        grant_types: {
          type: "array",
          items: { enum: ["authorization_code", "refresh_token"] },
        },
        response_types: { type: "array", items: { const: "code" } },
      },
      ["redirect_uris"],
      true,
    );
    return {
      description:
        "Dynamic public-client registration. Exact HTTPS or HTTP loopback callbacks; no remote metadata fetching, client secrets or access grant.",
      requestBody: body(registration),
      responses: {
        201: response(
          object({
            ...registration.properties,
            client_id: string,
            scope: string,
          }),
        ),
        ...errors,
      },
    };
  }
  if (key === "GET /mcp/oauth/authorize") {
    const query = {
      response_type: { const: "code" },
      client_id: string,
      redirect_uri: string,
      code_challenge: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
      code_challenge_method: { const: "S256" },
      resource: string,
      scope: string,
      state: string,
    };
    return {
      query: Object.entries(query).map(([name, schema]) => ({
        name,
        in: "query",
        required: !["scope", "state"].includes(name),
        schema,
      })),
      responses: {
        302: {
          description:
            "Redirect to the signed-in website consent page; no token until explicit user approval",
        },
        ...errors,
      },
    };
  }
  if (key === "POST /mcp/oauth/token") {
    const tokenInput = object(
      {
        grant_type: { enum: ["authorization_code", "refresh_token"] },
        client_id: string,
        resource: string,
        code: string,
        redirect_uri: string,
        code_verifier: { type: "string", minLength: 43, maxLength: 128 },
        refresh_token: string,
        scope: string,
      },
      ["grant_type", "client_id", "resource"],
    );
    return {
      description:
        "Authorization code requires exact redirect, S256 verifier and approved resource. Refresh rotates; consumed credential reuse revokes the connection. Access <=300 seconds, connection <=30 days capped by parent session. All persisted credentials are hashes.",
      requestBody: {
        required: true,
        content: {
          ...json(tokenInput),
          "application/x-www-form-urlencoded": { schema: tokenInput },
        },
      },
      responses: {
        200: response(
          object({
            access_token: string,
            refresh_token: string,
            token_type: { const: "Bearer" },
            expires_in: { type: "integer", minimum: 0, maximum: 300 },
            scope: string,
          }),
        ),
        ...errors,
      },
    };
  }
  if (key === "POST /mcp/oauth/revoke") {
    const schema = object(
      { client_id: string, token: string, token_type_hint: string },
      ["client_id", "token"],
    );
    return {
      requestBody: {
        required: true,
        content: {
          ...json(schema),
          "application/x-www-form-urlencoded": { schema },
        },
      },
      responses: {
        200: {
          description:
            "Owning client connection revoked; unknown token also succeeds without disclosure",
        },
        ...errors,
      },
    };
  }
  if (key === "GET /mcp/authorizations/:request") {
    return {
      responses: {
        200: wrapped({
          name: string,
          redirectUri: string,
          scopes,
          collections: {
            type: "array",
            items: object({ ...collection.properties, name: string }),
          },
        }),
        ...errors,
      },
    };
  }
  if (key === "POST /mcp/authorizations/:request") {
    return {
      requestBody: body(
        object({
          approved: { type: "boolean" },
          write: { type: "boolean" },
          collectionIds: ids,
        }),
      ),
      responses: { 200: wrapped({ redirectUri: string }), ...errors },
    };
  }
  if (key === "GET /users/me/mcp-connections") {
    return {
      responses: {
        200: wrapped({
          url: string,
          connections: { type: "array", items: connection },
        }),
        ...errors,
      },
    };
  }
  if (key === "DELETE /users/me/mcp-connections/:id") {
    return {
      responses: {
        204: {
          description:
            "Own connection revoked immediately, including access/refresh tokens",
        },
        ...errors,
      },
    };
  }
}
