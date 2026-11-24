import type { Knex } from "knex";
import {
  settingsSections,
  type SettingsSection,
} from "@asmblyr-collaborative/contracts";
import {
  AccessDeniedError,
  grantFor,
  type Access,
} from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";
import {
  listUserReferences,
  normalizeSearchText,
} from "../auth/user-references.js";
import { objectInput } from "../shared/input.js";
import { isRowScopedRead } from "./collection-scope.js";
import { ToolArgumentError } from "./errors.js";
import type { ToolDefinition } from "./tool-definitions.js";

const COLLECTION_ACTIONS = ["read", "create", "update", "delete"] as const;
const MAX_POLICIES = 100;
const MAX_DELEGATABLE_POLICIES = 200;

function readOnlyDefinition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
): ToolDefinition {
  return {
    name,
    description,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
    parameters: {
      type: "object",
      properties,
      additionalProperties: false,
      required: Object.keys(properties),
    },
  };
}

export const directoryToolDefinitions: ToolDefinition[] = [
  readOnlyDefinition(
    "my_permissions",
    "Inspect the current user's effective permissions summary: superuser flag, accessible MCP-enabled collections with permitted actions and rowScoped indicator, readable/editable settings sections, and delegatable policies (id and name) the user is allowed to assign.",
    {},
  ),
  readOnlyDefinition(
    "list_users",
    "Read-only user directory lookup (case-insensitive, ё/е normalized). Users with 'users' settings read access receive id, displayName, email and status (optional status filter). Other users receive minimal active user references (id and label) for @users relations without exposing credentials or disabled accounts.",
    {
      q: {
        type: ["string", "null"],
        maxLength: 200,
        description:
          'Optional search text matching name or email (ё/е normalized). Pass null or "" for no search.',
      },
      status: {
        type: ["string", "null"],
        enum: ["active", "disabled", null],
        description:
          "Optional account status filter ('active' or 'disabled'). Pass null for default scope.",
      },
      limit: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 50,
        description: "Maximum number of users to return (1-50, default 20).",
      },
    },
  ),
  readOnlyDefinition(
    "list_policies",
    "List access policies visible to the current user (requires 'policies' settings read access; otherwise returns PERMISSION_DENIED). Includes id, name, description, and whether the caller can delegate/assign each policy.",
    {
      q: {
        type: ["string", "null"],
        maxLength: 200,
        description:
          'Optional policy name search (ё/е normalized). Pass null or "" for all policies.',
      },
      delegatableOnly: {
        type: ["boolean", "null"],
        description:
          "If true, return only policies the current user is permitted to delegate/assign. Pass null or false for all policies.",
      },
    },
  ),
];

export function formatUserDisplayName(row: {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string | null {
  return (
    row.display_name?.trim() ||
    [row.first_name?.trim(), row.last_name?.trim()].filter(Boolean).join(" ") ||
    null
  );
}

export function matchesNormalizedSearch(
  haystack: string,
  query: string,
): boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;
  return normalizeSearchText(haystack).includes(normalizedQuery);
}

function parseOptionalSearch(value: unknown, key: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string" || value.length > 200 || value.includes("\0")) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      `Fix argument "${key}": expected a string up to 200 characters or null.`,
      [key],
      `Invalid argument "${key}".`,
    );
  }
  return value.trim();
}

export function parseListUsersInput(args: unknown): {
  q: string;
  status: "active" | "disabled" | null;
  limit: number;
} {
  const body = objectInput(args, ["q", "status", "limit"]);
  const q = parseOptionalSearch(body.q, "q");
  let status: "active" | "disabled" | null = null;
  if (body.status !== null && body.status !== undefined) {
    if (body.status !== "active" && body.status !== "disabled") {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "status": expected "active", "disabled", or null.',
        ["status"],
        'Invalid argument "status".',
      );
    }
    status = body.status;
  }
  let limit = 20;
  if (body.limit !== null && body.limit !== undefined) {
    if (
      typeof body.limit !== "number" ||
      !Number.isInteger(body.limit) ||
      body.limit < 1 ||
      body.limit > 50
    ) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "limit": expected an integer between 1 and 50 or null.',
        ["limit"],
        'Invalid argument "limit".',
      );
    }
    limit = body.limit;
  }
  return { q, status, limit };
}

export function parseListPoliciesInput(args: unknown): {
  q: string;
  delegatableOnly: boolean;
} {
  const body = objectInput(args, ["q", "delegatableOnly"]);
  const q = parseOptionalSearch(body.q, "q");
  let delegatableOnly = false;
  if (body.delegatableOnly !== null && body.delegatableOnly !== undefined) {
    if (typeof body.delegatableOnly !== "boolean") {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "delegatableOnly": expected a boolean or null.',
        ["delegatableOnly"],
        'Invalid argument "delegatableOnly".',
      );
    }
    delegatableOnly = body.delegatableOnly;
  }
  return { q, delegatableOnly };
}

export async function executeMyPermissions(
  db: Knex,
  access: Access,
  args: unknown,
  signal?: AbortSignal,
) {
  objectInput(args, []);
  signal?.throwIfAborted();

  const collectionRows = await db("asmblyr_collections")
    .withSchema("public")
    .select<
      { name: string; display_name: string | null }[]
    >("name", "display_name")
    .where("mcp_enabled", true)
    .whereRaw("left(name, 8) <> ?", ["asmblyr_"])
    .orderBy("name");
  signal?.throwIfAborted();

  const collections = collectionRows
    .map((row) => {
      const actions = COLLECTION_ACTIONS.filter(
        (action) => grantFor(access, row.name, action) !== null,
      );
      if (!actions.length) return null;
      const rowScoped =
        isRowScopedRead(access, row.name) ||
        (!access.principal.superuser &&
          Boolean(
            access.rowRules?.has(`${row.name}:update`) ||
              access.rowRules?.has(`${row.name}:delete`),
          ));
      return {
        name: row.name,
        displayName: row.display_name ?? row.name,
        actions,
        rowScoped,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  let readableSections: SettingsSection[];
  let editableSections: SettingsSection[];
  let delegatablePolicies: { id: string; name: string }[];

  if (access.principal.superuser) {
    readableSections = [...settingsSections];
    editableSections = access.readOnly ? [] : [...settingsSections];
    delegatablePolicies = await db("asmblyr_policies")
      .withSchema("public")
      .select<{ id: string; name: string }[]>("id", "name")
      .orderBy("name")
      .limit(MAX_DELEGATABLE_POLICIES);
  } else {
    const settings = await effectiveSettingsAccess(db, access.principal.id);
    readableSections = settings.sections;
    editableSections = access.readOnly ? [] : settings.editableSections;
    delegatablePolicies = settings.delegatablePolicyIds.length
      ? await db("asmblyr_policies")
          .withSchema("public")
          .whereIn("id", settings.delegatablePolicyIds)
          .select<{ id: string; name: string }[]>("id", "name")
          .orderBy("name")
          .limit(MAX_DELEGATABLE_POLICIES)
      : [];
  }
  signal?.throwIfAborted();

  return {
    superuser: access.principal.superuser,
    readOnly: Boolean(access.readOnly),
    collections,
    settingsSections: {
      readable: readableSections,
      editable: editableSections,
    },
    delegatablePolicies,
  };
}

export async function executeListUsers(
  db: Knex,
  access: Access,
  args: unknown,
  signal?: AbortSignal,
) {
  const input = parseListUsersInput(args);
  signal?.throwIfAborted();

  const hasUsersRead =
    access.principal.superuser ||
    (await effectiveSettingsAccess(db, access.principal.id)).sections.includes(
      "users",
    );
  signal?.throwIfAborted();

  if (!hasUsersRead) {
    if (input.status === "disabled") {
      return {
        scope: "reference" as const,
        users: [] as { id: string; label: string }[],
        hasMore: false,
      };
    }
    const references = await listUserReferences(db, access.principal, {
      ...(input.q ? { q: input.q } : {}),
      page: 1,
      limit: input.limit,
    });
    signal?.throwIfAborted();
    return {
      scope: "reference" as const,
      users: references.data,
      hasMore: Number(references.page.total) > references.data.length,
    };
  }

  const query = db("asmblyr_users").withSchema("public").select<
    {
      id: string;
      email: string;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      status: "active" | "disabled";
    }[]
  >("id", "email", "display_name", "first_name", "last_name", "status");

  if (input.status) {
    query.where("status", input.status);
  }
  const normalizedQuery = normalizeSearchText(input.q);
  if (normalizedQuery) {
    const search = `%${normalizedQuery.replace(/[\\%_]/g, "\\$&")}%`;
    query.where((builder) => {
      for (const column of [
        "email",
        "display_name",
        "first_name",
        "last_name",
      ]) {
        builder.orWhereRaw(
          `replace(lower(coalesce(??, '')), 'ё', 'е') like ? escape '\\'`,
          [column, search],
        );
      }
      builder.orWhereRaw(
        `replace(lower(concat_ws(' ', coalesce(first_name, ''), coalesce(last_name, ''))), 'ё', 'е') like ? escape '\\'`,
        [search],
      );
    });
  }

  const rows = await query
    .orderByRaw(
      "replace(lower(coalesce(nullif(btrim(display_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), ''), email)), 'ё', 'е') asc",
    )
    .orderBy("email", "asc")
    .orderBy("id", "asc")
    .limit(input.limit + 1);
  signal?.throwIfAborted();

  return {
    scope: "directory" as const,
    users: rows.slice(0, input.limit).map((row) => ({
      id: row.id,
      displayName: formatUserDisplayName(row),
      email: row.email,
      status: row.status,
    })),
    hasMore: rows.length > input.limit,
  };
}

export async function executeListPolicies(
  db: Knex,
  access: Access,
  args: unknown,
  signal?: AbortSignal,
) {
  const input = parseListPoliciesInput(args);
  signal?.throwIfAborted();

  let delegatableSet: Set<string> | null = null;
  if (!access.principal.superuser) {
    const settings = await effectiveSettingsAccess(db, access.principal.id);
    if (!settings.sections.includes("policies")) {
      throw new AccessDeniedError();
    }
    delegatableSet = new Set(settings.delegatablePolicyIds);
  }
  signal?.throwIfAborted();

  const rows = await db("asmblyr_policies")
    .withSchema("public")
    .select<{ id: string; name: string }[]>("id", "name")
    .orderBy("name");
  signal?.throwIfAborted();

  const filtered = rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      description: null as string | null,
      delegatable:
        access.principal.superuser || Boolean(delegatableSet?.has(row.id)),
    }))
    .filter((policy) => {
      if (input.delegatableOnly && !policy.delegatable) return false;
      if (input.q && !matchesNormalizedSearch(policy.name, input.q)) {
        return false;
      }
      return true;
    });

  return {
    policies: filtered.slice(0, MAX_POLICIES),
    hasMore: filtered.length > MAX_POLICIES,
  };
}
