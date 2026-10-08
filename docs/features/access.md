<a id="права-и-политики"></a>

# Permissions and policies

<a id="модель"></a>

## Model

A permission is an independent access rule. A policy groups any number of permissions, and one permission may belong to several policies. A user can receive several policies; their grants are combined. There are no deny rules.

Each permission targets either a collection or a settings section. Collection grants specify `create/read/update/delete`, fields, and an optional `rowFilter`. Without a condition, they apply to every row. Settings grants specify `section`, `action: read | update`, and `fields: ["*"]`. Update includes viewing; read does not allow changes.

Editing a shared permission directly affects all policies using it. The policy configuration editor saves its own set atomically without accidentally modifying another policy through a shared permission.

<a id="проверка"></a>

## Enforcement

Core loads the active principal and current database grants. Revoking a policy does not require replacing a user's token. Services shared by HTTP, Kit, and internal MCP enforce actions, fields, and related-record access.

The primary key remains the identifier of a readable record. A successful write without read permission can return `data: null`. System routes have their own access checks and are not ordinary items.

<a id="приложения-в-политиках"></a>

## Applications in policies

An application with policy-managed access appears in the policy editor's Applications tab. Allow sign-in admits the user to SSO; the checkboxes below assign external-service permissions from its configured catalog. Grants from multiple policies combine without deny rules. No assignment means no sign-in, including for a Collaborative superuser: that role does not imply external-service administration.

`GET /policies/applications` supplies the editor catalog and requires a human with policies/read or update. Full configuration through `POST /policies` and `PATCH /policies/:id` accepts optional `applications: [{ appId, scopes }]`. Empty `scopes` allows sign-in only; empty `applications` clears the policy's application assignments. Omitting applications on update preserves them.

Application grants, data grants, and users save in one transaction. `GET /policies/:id` returns the same list. Unknown applications and permissions are rejected.

Only a human superuser may edit a policy's contents. Delegating an existing policy also delegates its application rights: managers need an explicit allowed set and cannot change themselves or superusers. OAuth grants do not grant Core API access. See [integrations](./integrations.md#policy-managed-access) for token and revocation behavior.

<a id="условия-записеи"></a>

## Row conditions

Click a collection action in the policy editor and select No access, All records, or Conditional. Each condition has a field, operator, and value. Field search matches labels and technical names; operators depend on type. Values can be literals or compatible context parameters with discoverable descriptions. Groups support AND/OR. Field selection is a separate collapsed section.

Apply updates the draft; access changes only after saving the whole policy.

```json
{
  "collection": "articles",
  "action": "read",
  "fields": ["title", "body"],
  "rowFilter": {
    "logic": "and",
    "children": [
      {
        "field": "author_id",
        "op": "eq",
        "value": { "kind": "context", "path": "user.id" }
      },
      {
        "field": "status",
        "op": "eq",
        "value": { "kind": "literal", "value": "published" }
      }
    ]
  }
}
```

`rowFilter: null` explicitly removes a condition. Omitting it when patching a permission preserves the old condition. Settings sections do not support conditions. The configuration editor considers the condition when selecting a shared permission, keeping other policies independent.

Core/Contracts owns the parameter catalog: `user.id`, `user.email`, `service.id`, `actor.id`, and `request.now`. Values come from the authenticated principal and server time; clients cannot supply context. Incompatible types are rejected on save. A missing principal parameter invalidates the **entire rule**, including OR branches. Corrupt or outdated conditions also fail closed.

Conditions support direct scalar fields, including ID, M:1 foreign keys, and timestamps, with the ordinary operators for each type. `exists/notExists`, dotted paths, JSON, repeaters, and file arrays are unsupported. Groups must be nonempty: maximum depth 3, 20 conditions/30 nodes, and 8192 JSON characters. Literals are strings; value lists are arrays of strings.

Read rules restrict SQL before pagination and counting. Fields are projected per row using the matching rules: “title for everyone” plus “body for my records” never reveals someone else's body. Filters, sorting, and aggregates on conditionally readable fields apply only to rows where that field is readable. Search checks each field separately. Labels, relationship lists/candidates, files, Kit, and MCP share these boundaries.

Create checks the resulting record with server defaults. Only user-supplied fields require field grants; defaults need no separate grant. Update checks both the original and resulting row against the same matching branches for changed fields. Leaving the allowed scope, such as changing the author under an “edit my records” rule, rolls back the transaction. Bulk writes and nested drafts also roll back entirely on denial. Delete checks the original row. Write responses return readable fields only, or `data: null`.

<a id="границы-первои-версии"></a>

### Initial limitations

- Related search and filters across relationships are disabled when the source, target, or junction collection has conditional read rules. Direct foreign keys and relationship lists still work with row checks. This prevents EXISTS-based leaks until path-level conditions are supported.
- History stores diffs, not full historical snapshots. Conditional grants therefore do not expose history: only fields from unconditional read grants appear. Without those grants, history is empty, including for deleted records.
- Superusers bypass row conditions. Trusted plugin `storage.own` remains a separate restricted capability; ordinary `items` checks the caller's access.

<a id="сильные-административные-права"></a>

## Administrative privileges

- Only a human superuser can change policy contents or permissions, or create/delete policies.
- `policies/update` allows assignment and removal of existing policies from the manager's explicit allowed set. Managers cannot change their own or superusers' assignments.
- `services/update` allows service management only when all current and requested policies are in that set. Keys and federations enforce the same boundary.
- `users/update` allows invitations and viewing access; it does not itself allow changing policies.
- `superuser` bypasses ordinary data/settings grants, not validation or structural safeguards.

Settings grants do not automatically provide collection reads or DDL. Service tokens cannot use settings, even if their policy contains section grants.

<a id="пока-отсутствует"></a>

## Unsupported behavior

There are no deny rules. Table filters, workspaces, hidden collections, and MCP enablement are distinct features and do not replace permissions.

<a id="ограниченное-назначение-политик"></a>

## Bounded policy delegation

An administrator opens a user's access panel, selects existing policies under Allowed to assign, and saves the set. This is a per-user setting, not a permission inside a policy. Assigning a policy does not inherit another user's delegation rights. The set is empty by default; having a policy yourself does not allow you to give it to others.

Both checks must pass: policies/update for human assignments or services/update for services, and the policy ID in the allowed set. Read grants allow viewing. Self-assignment, policy-content changes, and editing allowed sets require a superuser.

`PUT /users/:id/delegation` accepts only `{ policyIds }` and requires a superuser. `PUT /policies/:id/users` accepts only `{ userIds }` and atomically replaces assignments of one existing policy. Individual PUT/DELETE assignments enforce the same restrictions without replacing the target user's other policies. Bulk requests may preserve existing self/superuser assignments unchanged.

A service with any policy outside the manager's set is read-only to that manager. They cannot issue/revoke keys, change federation, disable the account, or remove protected policies through PUT. A service without policies has no data access and may be configured within the manager's allowed set. Managers cannot reissue invitations for accounts with protected policies or their own delegation rights.

`GET /users` includes `hasDelegation`, indicating a nonempty personal allowed set. The UI hides re-invitation for those accounts, the manager's own account, and accounts with policies outside the set. Only administrators edit the set in the access panel; the server independently rechecks every restriction.

Checks use current database state, so revocation applies on the next request without token replacement. Delegation does not grant data access through the selected policies. Service tokens cannot manage policies or delegation.

Migration `20261003040000_policy_delegations.cjs` creates empty sets for existing managers and preserves their grants and assignments. Non-superuser managers lose unrestricted policy editing; administrators must explicitly configure their allowed set. Down refuses to remove nonempty delegation settings.

Revocation restricts future administrative actions. Existing keys and assigned policies are not automatically revoked and must be withdrawn separately. Administrator changes to an allowed policy affect all its recipients.
