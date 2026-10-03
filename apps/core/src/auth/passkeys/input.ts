import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AuthInputError, parseUserId } from "../validation.js";

export function parsePasskeyResponse(value: unknown): {
  challengeId: string;
  response: RegistrationResponseJSON & AuthenticationResponseJSON;
  name: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AuthInputError("Passkey response is required");
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["challengeId", "response", "name"].includes(key),
    ) ||
    !input.response ||
    typeof input.response !== "object" ||
    Array.isArray(input.response)
  ) {
    throw new AuthInputError("Invalid passkey response");
  }
  const name = input.name ?? "Passkey";
  const response = input.response as Record<string, unknown>;
  if (
    typeof response.id !== "string" ||
    !/^[A-Za-z0-9_-]{1,2048}$/.test(response.id) ||
    typeof response.rawId !== "string" ||
    response.type !== "public-key" ||
    !response.response ||
    typeof response.response !== "object" ||
    Array.isArray(response.response)
  ) {
    throw new AuthInputError("Invalid passkey credential");
  }
  if (typeof name !== "string" || !name.trim() || name.length > 120) {
    throw new AuthInputError("Invalid passkey name");
  }
  return {
    challengeId: parseUserId(input.challengeId),
    response: input.response as RegistrationResponseJSON &
      AuthenticationResponseJSON,
    name: name.trim(),
  };
}
