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
