import { parseId, PolicyInputError } from "./validation.js";

export function parsePolicyIds(
  body: unknown,
  key: "policyIds" | "userIds",
): string[] {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new PolicyInputError(`Expected ${key}`);
  }
  const input = body as Record<string, unknown>;
  const values = input[key];
  if (
    Object.keys(input).length !== 1 ||
    !Array.isArray(values) ||
    values.length > 1000
  ) {
    throw new PolicyInputError(`Expected ${key}`);
  }
  const ids = values.map(parseId);
  if (new Set(ids).size !== ids.length) {
    throw new PolicyInputError(`Duplicate ${key}`);
  }
  return ids;
}
