import { AuthInputError } from "../auth/validation.js";
import { parseApplicationAccess, type ApplicationAccess } from "./access.js";

export interface ApplicationInput extends ApplicationAccess {
  name: string;
  description: string;
  enabled: boolean;
  clientType: "public" | "confidential";
  redirectUris: string[];
  userIds: string[];
  audience: string;
  scopes: string[];
}

function text(value: unknown, label: string, max: number, empty = false): string {
  if (
    typeof value !== "string" ||
    (!empty && !value.trim()) ||
    value.length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new AuthInputError(`Invalid ${label}`);
  return value.trim();
}

function strings(value: unknown, label: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) throw new AuthInputError(`Invalid ${label}`);
  return [...new Set(value.map((entry) => text(entry, label, 2048)))];
}

export function parseApplication(value: unknown): ApplicationInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthInputError("Invalid application");
  const input = value as Record<string, unknown>;
  const allowed = [
    "name",
    "description",
    "enabled",
    "clientType",
    "redirectUris",
    "userIds",
    "accessMode",
    "emailDomains",
    "audience",
    "scopes",
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new AuthInputError("Unknown application setting");
  const name = text(input.name, "name", 120);
  const description = text(input.description, "description", 1000, true);
  if (typeof input.enabled !== "boolean") throw new AuthInputError("Invalid enabled value");
  if (input.clientType !== "public" && input.clientType !== "confidential")
    throw new AuthInputError("Invalid client type");
  const redirectUris = strings(input.redirectUris, "redirect URI", 10);
  if (!redirectUris.length) throw new AuthInputError("At least one redirect URI is required");
  for (const uri of redirectUris) {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      throw new AuthInputError("Invalid redirect URI");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const insecure = url.protocol !== "https:" && !(local && url.protocol === "http:");
    if (insecure || url.username || url.password || url.hash || uri.includes("*")) {
      throw new AuthInputError(
        "Redirect URI requires HTTPS, no wildcard or fragment (HTTP allowed on localhost)",
      );
    }
  }
  const userIds = strings(input.userIds, "user ID", 1000);
  if (
    userIds.some(
      (id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    )
  ) {
    throw new AuthInputError("Invalid user ID");
  }
  const audience = text(input.audience, "audience", 200, true);
  const scopes = strings(input.scopes, "scope", 30);
  if (
    scopes.some(
      (scope) =>
        !/^[\x21\x23-\x5b\x5d-\x7e]{1,160}$/.test(scope) ||
        ["openid", "profile", "email", "offline_access"].includes(scope),
    )
  )
    throw new AuthInputError("Invalid service scope");
  if (scopes.length && !audience) throw new AuthInputError("Service scopes require an audience");
  const access = parseApplicationAccess(input);
  return {
    ...access,
    name,
    description,
    enabled: input.enabled,
    clientType: input.clientType,
    redirectUris,
    userIds: access.accessMode === "all" ? [] : userIds,
    audience,
    scopes,
  };
}
