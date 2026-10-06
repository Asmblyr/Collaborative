const string = { type: "string" };
const callback = {
  type: "string",
  pattern: "^http://127\\.0\\.0\\.1:[0-9]+/callback$",
};
const secret = { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" };
function object(properties) {
  return {
    type: "object",
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}
function response(properties) {
  return {
    description: "Success; cache-control: no-store",
    content: {
      "application/json": { schema: object({ data: object(properties) }) },
    },
  };
}
export function cliAuthContract(key) {
  if (key === "GET /auth/cli/config") {
    return {
      description:
        "Public CLI discovery. Returns the configured admin consent URL; no credential or session is issued.",
      responses: {
        200: response({ authorizationUrl: { type: "string", format: "uri" } }),
      },
    };
  }
  if (key === "POST /auth/cli/authorize" || key === "POST /auth/cli/token") {
    const authorize = key.endsWith("authorize");
    const properties = authorize
      ? { redirectUri: callback, challenge: secret, state: secret }
      : {
          redirectUri: callback,
          code: secret,
          verifier: {
            type: "string",
            minLength: 43,
            maxLength: 128,
            pattern: "^[A-Za-z0-9._~-]+$",
          },
        };
    const output = authorize
      ? { redirectTo: string }
      : {
          accessToken: {
            type: "string",
            pattern: "^asm_sc_[A-Za-z0-9_-]{43}$",
          },
          scope: { const: "schema:read" },
          expiresIn: { const: 600 },
        };
    return {
      description: authorize
        ? "Human-session approval for CLI schema generation. The code is session-bound, expires after 60 seconds and requires PKCE S256 plus an exact loopback redirect."
        : "Public one-use PKCE exchange. Issues a 10-minute credential accepted only by GET /schema; session revocation also revokes this access. Credentials are never usable for item reads/writes.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: object(properties) } },
      },
      responses: {
        200: response(output),
        400: { description: "Invalid request" },
        401: {
          description: authorize
            ? "Active human session required"
            : "Invalid, expired or consumed code; invalid PKCE or revoked session",
        },
        429: { description: "Rate limited" },
      },
    };
  }
}
