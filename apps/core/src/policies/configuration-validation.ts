import {
  parseCreatePermission,
  type CreatePermissionInput,
} from "../permissions/validation.js";
import { parseId, parseName, PolicyInputError } from "./validation.js";
import type { ApplicationGrant } from "../oauth/policy-access.js";

export interface PolicyConfigurationInput {
  name: string;
  permissions: CreatePermissionInput[];
  userIds: string[];
  applications?: ApplicationGrant[];
}

export function hasPolicyConfiguration(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    ("permissions" in body || "userIds" in body || "applications" in body)
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
    Object.keys(input).some(
      (key) =>
        !["name", "permissions", "userIds", "applications"].includes(key),
    ) ||
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
  let applications: ApplicationGrant[] | undefined;
  if (input.applications !== undefined) {
    if (!Array.isArray(input.applications) || input.applications.length > 100) {
      throw new PolicyInputError("Invalid application permissions");
    }
    applications = input.applications.map((entry: unknown) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw new PolicyInputError("Invalid application permission");
      }
      const grant = entry as Record<string, unknown>;
      if (
        Object.keys(grant).some((key) => !["appId", "scopes"].includes(key)) ||
        !Array.isArray(grant.scopes) ||
        grant.scopes.length > 30 ||
        grant.scopes.some(
          (scope) => typeof scope !== "string" || scope.length > 160,
        )
      ) {
        throw new PolicyInputError("Invalid application permission");
      }
      return {
        appId: parseId(grant.appId),
        scopes: [...new Set(grant.scopes as string[])].sort(),
      };
    });
    if (
      new Set(applications.map((grant) => grant.appId)).size !==
      applications.length
    ) {
      throw new PolicyInputError("Duplicate application in policy");
    }
  }
  return {
    name: parseName({ name: input.name }),
    permissions,
    userIds,
    applications,
  };
}
