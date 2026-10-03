import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { AuthInputError } from "../auth/validation.js";

export type ApplicationAccessMode = "all" | "selected" | "domains";

export interface ApplicationAccess {
  accessMode: ApplicationAccessMode;
  emailDomains: string[];
}

function normalizeDomain(value: string): string | null {
  if (
    !value ||
    value.length > 253 ||
    /[\s\u0000-\u001f\u007f/@:%?#\\*]/.test(value)
  ) {
    return null;
  }
  const domain = domainToASCII(value).toLowerCase();
  if (!domain || domain.length > 253 || isIP(domain)) return null;
  const labels = domain.split(".");
  const validLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (labels.length < 2 || labels.some((label) => !validLabel.test(label)))
    return null;
  if (/^\d+$/.test(labels.at(-1)!)) return null;
  return domain;
}

export function parseApplicationAccess(
  input: Record<string, unknown>,
): ApplicationAccess {
  // Older clients only supplied userIds; missing settings must never broaden access.
  const accessMode =
    input.accessMode === undefined ? "selected" : input.accessMode;
  if (
    accessMode !== "all" &&
    accessMode !== "selected" &&
    accessMode !== "domains"
  ) {
    throw new AuthInputError("Invalid application access mode");
  }
  const entries = input.emailDomains === undefined ? [] : input.emailDomains;
  if (!Array.isArray(entries) || entries.length > 100) {
    throw new AuthInputError(
      "Email domains must be a list of up to 100 domains",
    );
  }
  const normalized = entries.map((entry: unknown) => {
    if (typeof entry !== "string")
      throw new AuthInputError("Invalid email domain");
    const domain = normalizeDomain(entry.trim().replace(/^@/, ""));
    if (!domain)
      throw new AuthInputError(
        "Invalid email domain; use example.com without wildcards",
      );
    return domain;
  });
  const emailDomains = [...new Set(normalized)];
  if (accessMode === "domains" && !emailDomains.length) {
    throw new AuthInputError("At least one email domain is required");
  }
  return {
    accessMode,
    emailDomains: accessMode === "domains" ? emailDomains : [],
  };
}

export function matchesEmailDomain(
  email: string,
  domains: readonly string[],
): boolean {
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0]) return false;
  const domain = normalizeDomain(parts[1]);
  return domain !== null && domains.includes(domain);
}
