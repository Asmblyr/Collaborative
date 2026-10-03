export interface SsoDiagnostic {
  provider: string;
  phase: "authorize" | "verify";
  code?: string;
  causeCode?: string;
  attribute?: string;
  oauthError?: string;
  status?: number;
}

function property(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}

function libraryCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return /^(OAUTH_[A-Z_]+|ERR_[A-Z_]+|ETIMEDOUT|ECONNRESET|ENOTFOUND)$/.test(
    value,
  )
    ? value
    : undefined;
}

/** Copy only protocol codes and claim names. Never copy messages, causes or response bodies. */
export function ssoDiagnostic(
  provider: string,
  phase: SsoDiagnostic["phase"],
  error: unknown,
): SsoDiagnostic {
  const cause = property(error, "cause");
  const detail = property(cause, "cause");
  const attribute =
    property(cause, "attribute") ??
    property(detail, "claim") ??
    property(detail, "attribute");
  const challenge = Array.isArray(cause) ? cause[0] : undefined;
  const parameters = property(challenge, "parameters");
  const oauthError = property(error, "error") ?? property(parameters, "error");
  const status = property(error, "status");
  return {
    provider,
    phase,
    code: libraryCode(property(error, "code")),
    causeCode: libraryCode(property(cause, "code")),
    attribute:
      typeof attribute === "string" &&
      [
        "iss",
        "sub",
        "aud",
        "exp",
        "iat",
        "nonce",
        "state",
        "id_token",
        "access_token",
      ].includes(attribute)
        ? attribute
        : undefined,
    oauthError:
      typeof oauthError === "string" &&
      [
        "invalid_client",
        "invalid_grant",
        "invalid_request",
        "invalid_scope",
        "unauthorized_client",
        "access_denied",
        "server_error",
        "temporarily_unavailable",
      ].includes(oauthError)
        ? oauthError
        : undefined,
    status:
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 400 &&
      status <= 599
        ? status
        : undefined,
  };
}
