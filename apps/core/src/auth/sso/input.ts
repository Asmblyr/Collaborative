import { AuthInputError } from "../validation.js";

export class SsoError extends Error {
  readonly statusCode = 400;
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("SSO request must be an object");
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    throw new AuthInputError("Unknown SSO request property");
  }
  return value as Record<string, unknown>;
}

function browserToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new SsoError(
      "SSO_INVALID_FLOW",
      "Start sign-in again in this browser",
    );
  }
  return value;
}

export function safeReturnTo(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  ) {
    return "/";
  }
  const target = new URL(value, "https://asmblyr.invalid");
  if (
    target.origin !== "https://asmblyr.invalid" ||
    target.pathname.startsWith("//")
  )
    return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}

export interface SsoStart {
  browserToken: string;
  intent: "login" | "link";
  returnTo: string;
  uiOrigin: string;
}

export function parseSsoStart(value: unknown): SsoStart {
  const input = object(value, [
    "browserToken",
    "intent",
    "returnTo",
    "uiOrigin",
  ]);
  if (
    (input.intent !== "login" && input.intent !== "link") ||
    typeof input.uiOrigin !== "string"
  ) {
    throw new AuthInputError("SSO intent and UI origin are required");
  }
  return {
    browserToken: browserToken(input.browserToken),
    intent: input.intent,
    returnTo:
      input.intent === "link"
        ? "/settings?tab=security"
        : safeReturnTo(input.returnTo),
    uiOrigin: input.uiOrigin,
  };
}

export interface SsoCallback {
  browserToken: string;
  query: string;
  state: string;
}

export function parseSsoCallback(value: unknown): SsoCallback {
  const input = object(value, ["browserToken", "query"]);
  if (typeof input.query !== "string" || input.query.length > 8192) {
    throw new AuthInputError("Invalid callback query");
  }
  const query = new URLSearchParams(input.query);
  const state = query.get("state");
  for (const key of ["state", "code", "error", "iss"]) {
    if (query.getAll(key).length > 1)
      throw new AuthInputError("Duplicate callback parameter");
  }
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state)) {
    throw new SsoError(
      "SSO_INVALID_FLOW",
      "Invalid or missing authorization state",
    );
  }
  return {
    browserToken: browserToken(input.browserToken),
    query: input.query,
    state,
  };
}
