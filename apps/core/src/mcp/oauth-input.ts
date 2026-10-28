import { createHash, randomBytes } from "node:crypto";
import { objectInput } from "../shared/input.js";

export class McpOAuthError extends Error {
  constructor(
    readonly error: string,
    readonly statusCode = 400,
  ) {
    super(error);
  }
}
export const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("base64url");
export function text(value: unknown, max = 2048): string {
  if (typeof value !== "string" || value.length > max) {
    throw new McpOAuthError("invalid_request");
  }
  return value;
}
export function clientId(value: unknown): string {
  const id = text(value, 64);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id)) {
    throw new McpOAuthError("invalid_client");
  }
  return id;
}
export function redirectUri(value: unknown): string {
  const raw = text(value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new McpOAuthError("invalid_redirect_uri");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== raw
  ) {
    throw new McpOAuthError("invalid_redirect_uri");
  }
  return raw;
}
export function scopes(value: unknown): string[] {
  const parts = [
    ...new Set(
      text(value ?? "mcp:read", 100)
        .split(" ")
        .filter(Boolean),
    ),
  ];
  if (
    !parts.length ||
    parts.some((part) => !["mcp:read", "mcp:write"].includes(part))
  ) {
    throw new McpOAuthError("invalid_scope");
  }
  return parts.includes("mcp:write") ? ["mcp:read", "mcp:write"] : ["mcp:read"];
}
export function registration(body: unknown): {
  name: string;
  redirects: string[];
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new McpOAuthError("invalid_client_metadata");
  }
  const input = body as Record<string, unknown>;
  const name = text(input.client_name ?? "MCP client", 120).trim();
  if (
    !name ||
    !Array.isArray(input.redirect_uris) ||
    !input.redirect_uris.length ||
    input.redirect_uris.length > 8 ||
    (input.token_endpoint_auth_method &&
      input.token_endpoint_auth_method !== "none")
  ) {
    throw new McpOAuthError("invalid_client_metadata");
  }
  for (const [key, allowed] of [
    ["grant_types", ["authorization_code", "refresh_token"]],
    ["response_types", ["code"]],
  ] as const) {
    if (
      input[key] !== undefined &&
      (!Array.isArray(input[key]) ||
        (input[key] as unknown[]).some(
          (value) => !allowed.includes(value as never),
        ))
    ) {
      throw new McpOAuthError("invalid_client_metadata");
    }
  }
  return {
    name,
    redirects: [...new Set(input.redirect_uris.map(redirectUri))],
  };
}
export function authorization(
  query: unknown,
  resource: string,
): {
  clientId: string;
  redirect: string;
  challenge: string;
  scopes: string[];
  state: string;
  resource: string;
} {
  const value = objectInput(query, [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method",
    "resource",
  ]);
  if (
    value.response_type !== "code" ||
    value.code_challenge_method !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(text(value.code_challenge, 43))
  ) {
    throw new McpOAuthError("invalid_request");
  }
  if (value.resource !== resource) {
    throw new McpOAuthError("invalid_target");
  }
  return {
    clientId: clientId(value.client_id),
    redirect: redirectUri(value.redirect_uri),
    challenge: text(value.code_challenge),
    scopes: scopes(value.scope),
    state: text(value.state ?? ""),
    resource,
  };
}
