export class PolicyInputError extends Error {
  readonly statusCode = 400;
}

export class PolicyNotFoundError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("Policy or target not found");
  }
}

export class PolicyConflictError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("Policy name already exists");
  }
}

export function parseId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new PolicyInputError("Invalid id");
  }
  return value;
}

export function parseName(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("name" in body) ||
    typeof body.name !== "string"
  ) {
    throw new PolicyInputError("Policy name is required");
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > 120)
    throw new PolicyInputError("Invalid policy name");
  return name;
}
