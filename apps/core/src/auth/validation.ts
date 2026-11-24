import { InputError as AuthInputError } from "../shared/input.js";
export { AuthInputError };

export class InvalidCredentialsError extends Error {
  readonly statusCode = 401;

  constructor() {
    super("Invalid credentials");
  }
}

export class AuthConflictError extends Error {
  readonly statusCode = 409;
}

export class UserNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("User not found");
  }
}

export function parseUserId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new AuthInputError("Invalid user id");
  }
  return value;
}

export function normalizedEmail(value: unknown): string {
  if (typeof value !== "string")
    throw new AuthInputError("Valid email is required");
  const email = value.trim().toLowerCase();
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthInputError("Valid email is required");
  }
  return email;
}

export function parsePassword(value: unknown, minLength = 1): string {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > 1024
  ) {
    throw new AuthInputError(
      `Password must be between ${minLength} and 1024 characters`,
    );
  }
  return value;
}

export function parseLogin(value: unknown): {
  email: string;
  password: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Email and password are required");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "email" && key !== "password")) {
    throw new AuthInputError("Email and password are required");
  }
  return {
    email: normalizedEmail(input.email),
    password: parsePassword(input.password),
  };
}

export function parseRefresh(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Refresh token is required");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 1 ||
    typeof input.refreshToken !== "string" ||
    !/^asm_rt_[A-Za-z0-9_-]{43}$/.test(input.refreshToken)
  ) {
    throw new AuthInputError("Refresh token is required");
  }
  return input.refreshToken;
}

export function parseSetup(value: unknown): {
  email: string;
  password: string;
  setupToken: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Email, password and setup token are required");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["email", "password", "setupToken"].includes(key),
    ) ||
    typeof input.setupToken !== "string" ||
    input.setupToken.length > 1024
  ) {
    throw new AuthInputError("Email, password and setup token are required");
  }
  return {
    email: normalizedEmail(input.email),
    password: parsePassword(input.password, 12),
    setupToken: input.setupToken,
  };
}

export function parseInvite(value: unknown): string {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("email" in value)
  ) {
    throw new AuthInputError("Email is required");
  }
  return normalizedEmail(value.email);
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseOptionalPolicyId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !uuidPattern.test(value)) {
    throw new AuthInputError("Invalid policy id");
  }
  return value;
}

export function parseInviteInput(value: unknown): {
  email: string;
  policyId: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Email is required");
  }
  const input = value as Record<string, unknown>;
  if (
    !("email" in input) ||
    Object.keys(input).some((key) => key !== "email" && key !== "policyId")
  ) {
    throw new AuthInputError("Email is required");
  }
  return {
    email: normalizedEmail(input.email),
    policyId: parseOptionalPolicyId(input.policyId),
  };
}

export function splitEmailTokens(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseBulkInviteInput(value: unknown): {
  emails: string[];
  policyId: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Emails are required");
  }
  const input = value as Record<string, unknown>;
  if (
    !("emails" in input) ||
    Object.keys(input).some((key) => key !== "emails" && key !== "policyId")
  ) {
    throw new AuthInputError("Emails are required");
  }
  let rawEmails: string[];
  if (typeof input.emails === "string") {
    rawEmails = splitEmailTokens(input.emails);
  } else if (
    Array.isArray(input.emails) &&
    input.emails.every((entry) => typeof entry === "string")
  ) {
    rawEmails = input.emails.flatMap((entry) => splitEmailTokens(entry));
  } else {
    throw new AuthInputError("Emails must be a string or array of strings");
  }
  if (!rawEmails.length) {
    throw new AuthInputError("At least one email is required");
  }
  if (rawEmails.length > 200) {
    throw new AuthInputError("Too many emails in a single batch");
  }
  return {
    emails: rawEmails,
    policyId: parseOptionalPolicyId(input.policyId),
  };
}

export type UsersStatusFilter = "all" | "active" | "disabled" | "invited";

export interface UsersListQuery {
  q: string;
  status: UsersStatusFilter;
  policyId: string | null;
  department: string | null;
  page: number;
  limit: number;
}

const allowedUsersQueryKeys = new Set([
  "q",
  "status",
  "policyId",
  "department",
  "page",
  "limit",
]);

export function parseUsersListQuery(value: unknown): UsersListQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const input = value as Record<string, unknown>;
  const keys = Object.keys(input).filter((key) => input[key] !== undefined);
  if (!keys.length) {
    return null;
  }
  if (keys.some((key) => !allowedUsersQueryKeys.has(key))) {
    throw new AuthInputError("Invalid users query parameter");
  }

  let q = "";
  if (input.q !== undefined) {
    if (typeof input.q !== "string" || input.q.length > 200) {
      throw new AuthInputError("Invalid search query");
    }
    q = input.q.trim();
  }

  let status: UsersStatusFilter = "all";
  if (input.status !== undefined && input.status !== "") {
    if (
      input.status !== "all" &&
      input.status !== "active" &&
      input.status !== "disabled" &&
      input.status !== "invited"
    ) {
      throw new AuthInputError("Invalid status filter");
    }
    status = input.status;
  }

  let policyId: string | null = null;
  if (input.policyId !== undefined && input.policyId !== "") {
    if (
      typeof input.policyId !== "string" ||
      (input.policyId !== "__none__" && !uuidPattern.test(input.policyId))
    ) {
      throw new AuthInputError("Invalid policyId filter");
    }
    policyId = input.policyId;
  }

  let department: string | null = null;
  if (input.department !== undefined && input.department !== "") {
    if (typeof input.department !== "string" || input.department.length > 200) {
      throw new AuthInputError("Invalid department filter");
    }
    department = input.department.trim() || null;
  }

  let page = 1;
  if (input.page !== undefined && input.page !== "") {
    const parsed = Number(input.page);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
      throw new AuthInputError("Invalid page parameter");
    }
    page = parsed;
  }

  let limit = 25;
  if (input.limit !== undefined && input.limit !== "") {
    const parsed = Number(input.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 200) {
      throw new AuthInputError("Invalid limit parameter");
    }
    limit = parsed;
  }

  return { q, status, policyId, department, page, limit };
}

export function parseUserStatus(value: unknown): "active" | "disabled" {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !("status" in value) ||
    (value.status !== "active" && value.status !== "disabled")
  ) {
    throw new AuthInputError(
      "Valid status ('active' or 'disabled') is required",
    );
  }
  return value.status;
}

export function parseInvitationAcceptance(value: unknown): {
  token: string;
  password: string;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("token" in value) ||
    !("password" in value) ||
    typeof value.token !== "string" ||
    !/^asm_inv_[A-Za-z0-9_-]{43}$/.test(value.token)
  ) {
    throw new AuthInputError("Invitation token and password are required");
  }
  return { token: value.token, password: parsePassword(value.password, 12) };
}
