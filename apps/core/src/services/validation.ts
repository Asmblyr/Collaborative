import { objectInput, textInput } from "../shared/input.js";
import { AuthInputError } from "../auth/validation.js";
import { parseId } from "../policies/validation.js";

export function parseAccount(value: unknown) {
  const body = objectInput(value, [
    "name",
    "description",
    "status",
    "policyIds",
  ]);
  const status = body.status ?? "active";
  if (status !== "active" && status !== "disabled")
    throw new AuthInputError("Invalid status");
  const policies = body.policyIds ?? [];
  if (!Array.isArray(policies) || policies.length > 100)
    throw new AuthInputError("Invalid policies");
  return {
    name: textInput(body.name, 120),
    description: textInput(body.description ?? "", 500, true),
    status,
    policyIds: [...new Set(policies.map(parseId))],
  };
}

export function parseKey(value: unknown) {
  const body = objectInput(value, ["name", "expiresInDays"]);
  const days = body.expiresInDays ?? 90;
  if (
    typeof days !== "number" ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    throw new AuthInputError("Key lifetime must be 1–365 days");
  }
  return { name: textInput(body.name, 120), days };
}
