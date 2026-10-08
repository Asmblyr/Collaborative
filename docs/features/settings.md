<a id="настроики-админки"></a>

# Admin settings

`/admin/settings` is visible when the user can access at least one settings page. Navigation and pages include only permitted sections. Core checks access again on every request.

Small screens use a compact section menu above the content; wide screens use side navigation. Both show only accessible sections. Terms is the assistant's shared glossary.

The file library lives at `/files` in the main menu and is not duplicated in system settings. Policies still grant files/read and files/update, and the user access viewer shows them. If the library is the only available section, `/admin/settings` redirects there. S3/Yandex Object Storage configuration lives under Connections.

Superusers manage [connections and secret protection](./connections.md) at `/admin/settings/integrations`: S3/Yandex Object Storage, AI provider, and local encryption or Yandex KMS. Other settings grants cannot delegate this section.

Optional [Sentry monitoring](./monitoring.md) lives at `/admin/settings/monitoring`: errors, performance, SQL spans, and local p95/p99. It also requires a superuser and is disabled by default.

| Section            | Permission key | Features                                          |
| ------------------ | -------------- | ------------------------------------------------- |
| Users              | users          | List, invitations, effective access               |
| Policies           | policies       | Permissions, policies, assignments                |
| Plugins            | plugins        | Loaded packages, declarations, available settings |
| Assistant          | assistant      | Model/instructions and telemetry                  |
| Terms              | terms          | Shared glossary for the assistant                 |
| Services           | services       | Accounts, keys, federations                       |
| OAuth applications | oauth          | Applications, secrets, admission rules            |

To grant access, open a policy, select No access, View, or Edit for each settings section, save it, and assign the policy. Collection grants are configured separately.

A user with settings-only grants can open settings without data access. Users with neither see a no-access screen. Personal preferences remain at `/settings`.

Legacy `/access`, `/services`, and `/oauth-apps` URLs redirect to the current sections. `GET /settings/access` exposes settings permissions; the policy editor uses the restricted `/settings/options/collections` catalog.

Structure and workspace management are not delegated by these switches. Package installation and plugin capability approval remain project configuration. Every section supports read and update; update includes viewing, and policies combine grants. Policy and service management also enforce delegation rules.

Read allows lists, details, telemetry, and restricted selector catalogs. It cannot save, invite, assign, issue/revoke keys or federations, or replace OAuth secrets. GET never returns previously issued secrets.

`GET /settings/access` returns `sections` for viewing and `editableSections` for modification. Navigation uses the first list; pages pass read-only mode to forms. Read-only users can open side panels, conditions, and tabs, while values are protected and mutation actions hidden. The server independently checks update access. `GET /users/:id/access` shows both lists for the selected user.

The response also includes `canManagePolicies` (superusers only) and `delegatablePolicyIds` (the explicit allowed set of existing policies). For managers, policies/update permits assignments only from this set; policy contents remain read-only. For services, the set restricts assignments, keys, and federation. Superusers are unrestricted even though their array is empty. See [delegation](./access.md#bounded-policy-delegation).

Migration `20261003040000_policy_delegations.cjs` adds empty personal allowed sets for existing users, preserving assignments. Non-superusers must receive an explicit set for new assignments and can no longer edit policy contents. Down refuses to remove nonempty delegation settings.

Migration `20261003030000_settings_read_permissions.cjs` adds read and uniqueness on `(section, action)` without changing existing grants. Down refuses while read permissions exist.

Migration `20261003010000_settings_permissions.cjs` preserves collection grants and adds section targets. Down refuses while section permissions exist, preventing silent access loss.

<a id="оформление-и-язык"></a>

## Appearance and language

The Appearance tab at `/settings` separates mode (`light`, `dark`, `system`) from style (`neutral`, `ocean`, `coral`). Every color style supports light and dark modes. Preferences use `GET/PATCH /users/me/preferences`; a partial PATCH preserves other values. An empty profile returns `theme: null`, `style: "neutral"`, and `locale: "ru"`.

The interface supports RU/EN; see [translations and their API](./localization.md). Old `/system-settings/...` URLs redirect to `/admin/settings/...`. Personal settings, collections, files, and plugin pages keep their addresses.
