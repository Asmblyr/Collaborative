import {
  parseCreatePermission,
  type CreatePermissionInput,
} from "../permissions/validation.js";
import { parseId, parseName, PolicyInputError } from "./validation.js";

export interface PolicyConfigurationInput {
  name: string;
  permissions: CreatePermissionInput[];
  userIds: string[];
}

export function hasPolicyConfiguration(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    ("permissions" in body || "userIds" in body)
  );
}

export function parsePolicyConfiguration(
  body: unknown,
): PolicyConfigurationInput {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new PolicyInputError("Expected policy configuration");
  }
  const input = body as Record<string, unknown>;
  if (
    Object.keys(input).length !== 3 ||
    !Object.hasOwn(input, "name") ||
    !Object.hasOwn(input, "permissions") ||
    !Object.hasOwn(input, "userIds") ||
    !Array.isArray(input.permissions) ||
    input.permissions.length > 1000 ||
    !Array.isArray(input.userIds) ||
    input.userIds.length > 1000
  ) {
    throw new PolicyInputError("Expected name, permissions and userIds");
  }
  const permissions = input.permissions.map(parseCreatePermission);
  const scopes = permissions.map(
    (permission) =>
      `${"section" in permission ? "settings:" + permission.section : "collection:" + permission.collection}:${permission.action}`,
  );
  if (
    new Set(scopes).size !== scopes.length &&
    permissions.some(
      (permission, index) =>
        scopes.indexOf(scopes[index]) !== index &&
        !(
          ("collection" in permission && permission.rowFilter) ||
          permissions.some(
            (other, otherIndex) =>
              otherIndex !== index &&
              scopes[otherIndex] === scopes[index] &&
              "collection" in other &&
              other.rowFilter,
          )
        ),
    )
  ) {
    throw new PolicyInputError("Duplicate collection action in policy");
  }
  const userIds = input.userIds.map(parseId);
  if (new Set(userIds).size !== userIds.length) {
    throw new PolicyInputError("Duplicate user in policy");
  }
  return { name: parseName({ name: input.name }), permissions, userIds };
}
