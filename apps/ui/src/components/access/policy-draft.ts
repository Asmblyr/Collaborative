import type { PermissionFilter } from "@asmblyr-collaborative/contracts";
import type { Action, Permission } from "./types";

export interface DraftGrant {
  collection: string;
  action: Action;
  fields: string[];
  rowFilter?: PermissionFilter | null;
}

export function grantId(collection: string, action: Action): string {
  return `${collection}:${action}`;
}

export function policyDraft(
  policyId: string | undefined,
  permissions: Permission[],
): DraftGrant[] {
  if (!policyId) {
    return [];
  }
  const grants = new Map<string, DraftGrant>();
  const conditional: DraftGrant[] = [];
  const filteredScopes = new Set(
    permissions.flatMap((permission) =>
      "collection" in permission &&
      permission.rowFilter &&
      permission.policyIds.includes(policyId)
        ? [grantId(permission.collection, permission.action)]
        : [],
    ),
  );
  for (const permission of permissions) {
    if (
      !("collection" in permission) ||
      !permission.policyIds.includes(policyId)
    ) {
      continue;
    }
    const key = grantId(permission.collection, permission.action);
    if (filteredScopes.has(key)) {
      conditional.push({
        collection: permission.collection,
        action: permission.action,
        fields: [...permission.fields],
        rowFilter: permission.rowFilter ?? null,
      });
      continue;
    }
    const previous = grants.get(key);
    const fields =
      previous?.fields.includes("*") || permission.fields.includes("*")
        ? ["*"]
        : [
            ...new Set([...(previous?.fields ?? []), ...permission.fields]),
          ].sort();
    grants.set(key, {
      collection: permission.collection,
      action: permission.action,
      fields,
    });
  }
  return [...grants.values(), ...conditional].sort(
    (a, b) =>
      a.collection.localeCompare(b.collection) ||
      a.action.localeCompare(b.action),
  );
}

export function isSimpleUnconditionalGrant(grant: DraftGrant): boolean {
  return !grant.rowFilter && grant.fields.includes("*");
}

export function toggleUnconditionalGrant(
  grants: DraftGrant[],
  collection: string,
  action: Action,
): { kind: "toggled"; grants: DraftGrant[] } | { kind: "open_dialog" } {
  const matching = grants.filter(
    (grant) => grant.collection === collection && grant.action === action,
  );
  if (matching.length === 0) {
    return {
      kind: "toggled",
      grants: [
        ...grants,
        { collection, action, fields: ["*"], rowFilter: null },
      ],
    };
  }
  if (matching.length === 1 && isSimpleUnconditionalGrant(matching[0])) {
    return {
      kind: "toggled",
      grants: grants.filter(
        (grant) =>
          !(grant.collection === collection && grant.action === action),
      ),
    };
  }
  return { kind: "open_dialog" };
}
