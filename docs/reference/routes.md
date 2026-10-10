# HTTP route matrix

Generated from Core and the reviewed access catalog. 235 declarations.

This describes access boundaries; integration tests verify enforcement. Dynamic plugin routes and internal oidc-provider endpoints are not listed individually.

| Method and path | Access | Source in the repository |
| --- | --- | --- |
| `GET /assistant/conversations` | Active human with chat access; own conversations only | `apps/core/src/assistant/history-routes.ts` |
| `POST /assistant/conversations` | Active human with chat access; creates an own conversation with empty context | `apps/core/src/assistant/history-routes.ts` |
| `DELETE /assistant/conversations/:id` | Active human with chat access; own idle conversation only | `apps/core/src/assistant/history-routes.ts` |
| `GET /assistant/conversations/:id` | Active human with chat access; own history only, including for superusers | `apps/core/src/assistant/history-routes.ts` |
| `POST /assistant/filter/validate` | Human: superuser OR at least one read/create/update grant; tools authorize separately | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages` | Human: superuser OR at least one read/create/update grant; tools authorize separately | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/messages/:id/cancel` | Human: superuser OR at least one read/create/update grant; tools authorize separately | `apps/core/src/assistant/routes.ts` |
| `POST /assistant/selection/validate` | Human: superuser OR at least one read/create/update grant; tools authorize separately | `apps/core/src/assistant/routes.ts` |
| `GET /assistant/status` | Human: superuser OR at least one read/create/update grant; tools authorize separately | `apps/core/src/assistant/routes.ts` |
| `POST /auth/browser/google/start` | Active user, exact AUTH_UI_URL Origin; proof in an HttpOnly cookie. | `apps/core/src/auth/browser/google.ts` |
| `POST /auth/browser/invitations/claim` | Exact AUTH_UI_URL Origin; credential rate limits for sign-in. HttpOnly session cookie; logout is idempotent and revokes only the current session. | `apps/core/src/auth/browser/routes.ts` |
| `POST /auth/browser/login` | Exact AUTH_UI_URL Origin; credential rate limits for sign-in. HttpOnly session cookie; logout is idempotent and revokes only the current session. | `apps/core/src/auth/browser/routes.ts` |
| `POST /auth/browser/logout` | Exact AUTH_UI_URL Origin; credential rate limits for sign-in. HttpOnly session cookie; logout is idempotent and revokes only the current session. | `apps/core/src/auth/browser/routes.ts` |
| `POST /auth/browser/passkeys/login` | Exact AUTH_UI_URL Origin; credential rate limits for sign-in. HttpOnly session cookie; logout is idempotent and revokes only the current session. | `apps/core/src/auth/browser/routes.ts` |
| `POST /auth/browser/passkeys/options` | Exact AUTH_UI_URL Origin; credential rate limits for sign-in. HttpOnly session cookie; logout is idempotent and revokes only the current session. | `apps/core/src/auth/browser/routes.ts` |
| `POST /auth/cli/authorize` | Active human session approves a 60-second one-use PKCE S256 code for an exact loopback callback. | `apps/core/src/auth/cli/routes.ts` |
| `GET /auth/cli/config` | Public CLI discovery; configured admin consent URL only. No credential. | `apps/core/src/auth/cli/routes.ts` |
| `POST /auth/cli/token` | One-use code + PKCE verifier + exact callback. Issues 10-minute schema:read access only; rate-limited. | `apps/core/src/auth/cli/routes.ts` |
| `POST /auth/federation-token` | Signed GitLab CI assertion and active federation | `apps/core/src/services/federation-routes.ts` |
| `POST /auth/invitations/accept` | One-time invitation token and new password | `apps/core/src/auth/routes.ts` |
| `POST /auth/invitations/claim` | One-time invitation/recovery token creates a human session. Recovery revokes prior sessions and sign-in methods | `apps/core/src/auth/routes.ts` |
| `POST /auth/login` | Email/password verification with rate limiting | `apps/core/src/auth/routes.ts` |
| `POST /auth/logout` | Refresh token in body or session Bearer token | `apps/core/src/auth/routes.ts` |
| `GET /auth/me` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/routes.ts` |
| `POST /auth/passkeys/login` | One-time challenge, stored passkey signature, exact origin/RP ID, user verification, and active user | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /auth/passkeys/options` | Public five-minute WebAuthn challenge; shared credential rate limit | `apps/core/src/auth/passkeys/routes.ts` |
| `GET /auth/providers` | Public provider IDs and labels | `apps/core/src/auth/sso/routes.ts` |
| `POST /auth/refresh` | Valid refresh token; rotation and replay protection | `apps/core/src/auth/routes.ts` |
| `POST /auth/service-token` | Valid service key | `apps/core/src/services/routes.ts` |
| `POST /auth/setup` | Setup secret and no existing users; rate-limited | `apps/core/src/auth/routes.ts` |
| `GET /auth/setup/status` | Public initial-setup status | `apps/core/src/auth/routes.ts` |
| `POST /auth/sso/:provider/callback` | SSO flow, state/PKCE, and provider-response validation | `apps/core/src/auth/sso/routes.ts` |
| `POST /auth/sso/:provider/start` | Start SSO; linking requires an active user session | `apps/core/src/auth/sso/routes.ts` |
| `GET /collections` | Active principal; accessible collections and fields only | `apps/core/src/collections/routes.ts` |
| `POST /collections` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `DELETE /collections/:name` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/lifecycle-routes.ts` |
| `PUT /collections/:name/display` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/fields` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `DELETE /collections/:name/fields/:field` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/lifecycle-routes.ts` |
| `PATCH /collections/:name/fields/:field` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/fields/:field/configuration` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/fields/:field/configuration` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/fields/:field/impact` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/lifecycle-routes.ts` |
| `PUT /collections/:name/fields/:field/presentation` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/fields/:field/search` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PATCH /collections/:name/folder` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/form` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/impact` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/lifecycle-routes.ts` |
| `DELETE /collections/:name/materialized-view` | Human superuser; dependency-checked catalog disconnection removes metadata/grants and preserves the PostgreSQL object/data | `apps/core/src/collections/materialized-routes.ts` |
| `PATCH /collections/:name/navigation` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `POST /collections/:name/relations` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PUT /collections/:name/relations/:field/search` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PATCH /collections/:name/settings` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `GET /collections/:name/terms` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/terms/routes.ts` |
| `DELETE /collections/:name/terms/:id` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/terms/routes.ts` |
| `PUT /collections/:name/terms/:id` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/terms/routes.ts` |
| `DELETE /connections/google` | Active human session; deletes own tokens, flows, and proposals and attempts Google grant revocation | `apps/core/src/connections/routes.ts` |
| `GET /connections/google` | Active human session; own connection status without tokens | `apps/core/src/connections/routes.ts` |
| `GET /connections/google/callback` | Result redirect; connection requires active session, one-time state/browser proof, and matching owner. | `apps/core/src/auth/browser/google.ts` |
| `POST /connections/google/callback` | Active human session; own flow, browser proof, state/nonce/PKCE, and unchanged client configuration | `apps/core/src/connections/routes.ts` |
| `POST /connections/google/start` | Active human session; owner's one-time OAuth flow with browser proof and PKCE | `apps/core/src/connections/routes.ts` |
| `DELETE /connections/google/writes/:id` | Active human session; cancel own pending proposal | `apps/core/src/connections/routes.ts` |
| `GET /connections/google/writes/:id` | Active human session; own unexpired proposal and the same active connection | `apps/core/src/connections/routes.ts` |
| `POST /connections/google/writes/:id/confirm` | Active human session; one-time confirmation of own proposal with connection/source revalidation; not an MCP tool | `apps/core/src/connections/routes.ts` |
| `GET /extensions` | Active principal; enabled UI-plugin metadata | `apps/core/src/plugins/ui-routes.ts` |
| `GET /extensions/:namespace/drafts/:id` | Active principal; prepared draft bound to its principal and namespace, with TTL | `apps/core/src/plugins/action-draft-routes.ts` |
| `GET /files` | Human with files/read or update; superuser bypass. Shared team library | `apps/core/src/files/routes.ts` |
| `POST /files` | Human with files/update; superuser bypass. Upload up to 25 MiB, metadata validation, and protection of used references | `apps/core/src/files/routes.ts` |
| `DELETE /files/:id` | Human with files/update; superuser bypass. Upload up to 25 MiB, metadata validation, and protection of used references | `apps/core/src/files/routes.ts` |
| `GET /files/:id` | Active principal: superuser, human with files/read/update, or accessible reference in a readable record field; other files are hidden | `apps/core/src/files/routes.ts` |
| `PATCH /files/:id` | Human with files/update; superuser bypass. Update title/description and private/public visibility of one ready file; publication/revocation is audited. | `apps/core/src/files/routes.ts` |
| `GET /files/:id/content` | Active principal: superuser, human with files/read/update, or accessible reference in a readable record field; other files are hidden | `apps/core/src/files/routes.ts` |
| `GET /files/:id/events` | Human with files/read or update; superuser bypass. Shared team library | `apps/core/src/files/routes.ts` |
| `GET /files/resolve` | Active principal: superuser, human with files/read/update, or accessible reference in a readable record field; other files are hidden | `apps/core/src/files/routes.ts` |
| `GET /filter-presets/:collection` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/items/filter-preset-routes.ts` |
| `POST /filter-presets/:collection` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/items/filter-preset-routes.ts` |
| `DELETE /filter-presets/:collection/:id` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/items/filter-preset-routes.ts` |
| `PUT /filter-presets/:collection/:id` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/items/filter-preset-routes.ts` |
| `POST /folders` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `DELETE /folders/:id` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PATCH /folders/:id` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `PATCH /folders/:id/order` | Human superuser; system and plugin-owned structure has additional protection | `apps/core/src/collections/routes.ts` |
| `GET /health` | Public process liveness check | `apps/core/src/app.ts` |
| `GET /item-events/:collection` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `GET /items/:collection` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `PATCH /items/:collection` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `POST /items/:collection` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `DELETE /items/:collection/:id` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `PATCH /items/:collection/:id` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id/related` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `GET /items/:collection/:id/relations/:field` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-routes.ts` |
| `PATCH /items/:collection/:id/relations/:field` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-routes.ts` |
| `POST /items/:collection/:id/relations/:field` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-routes.ts` |
| `GET /items/:collection/:id/relations/:field/candidates` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-routes.ts` |
| `GET /items/:collection/:id/relations/:field/links/:linkId` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-link-routes.ts` |
| `PATCH /items/:collection/:id/relations/:field/links/:linkId` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/:id/relations/:field/links/to/:targetId` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/:id/relations/:field/records` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/relation-link-routes.ts` |
| `POST /items/:collection/commit` | Active principal; own read/create/update grants and fields of every affected record. expectedValues requires reading changed fields; conflict rolls back the whole commit | `apps/core/src/items/relation-routes.ts` |
| `GET /materialized-views` | Human superuser; discovers existing public materialized views without registration/REFRESH, excluding Core/plugin objects | `apps/core/src/collections/materialized-routes.ts` |
| `POST /materialized-views` | Human superuser; atomically imports a populated public materialized view with supported fields and a stable unique key. Presentation/location metadata only, no SQL/DDL/REFRESH or grants to others | `apps/core/src/collections/materialized-routes.ts` |
| `GET /monitoring/browser` | Active human session; public browser DSN and permitted flags only, never server DSN. Service tokens rejected | `apps/core/src/monitoring/routes.ts` |
| `GET /notifications` | Active human session; own enabled-plugin notifications, with record access rechecked | `apps/core/src/notifications/routes.ts` |
| `POST /notifications/:id/read` | Active human session; own notification and current record access | `apps/core/src/notifications/routes.ts` |
| `POST /notifications/read-all` | Active human session; own notifications up to the list snapshot boundary | `apps/core/src/notifications/routes.ts` |
| `GET /oauth-apps` | Human with oauth/read or update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `POST /oauth-apps` | Human with oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `PUT /oauth-apps/:id` | Human with oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `POST /oauth-apps/:id/secret` | Human with oauth/update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `GET /oauth-apps/status` | Human with oauth/read or update; superuser bypass | `apps/core/src/oauth/routes.ts` |
| `GET /oauth-interactions/:uid` | Human; interaction UID, own session, application rules, and consent | `apps/core/src/oauth/interactions.ts` |
| `POST /oauth-interactions/:uid` | Human; interaction UID, own session, application rules, and consent | `apps/core/src/oauth/interactions.ts` |
| `ALL /oauth/*` | oidc-provider protocol endpoints: discovery/JWKS are public; other routes use OAuth/OIDC checks | `apps/core/src/oauth/routes.ts` |
| `POST /oauth/complete/:uid` | Current user, signed OAuth interaction cookies, and matching Origin; user ID must match the session | `apps/core/src/oauth/interactions.ts` |
| `GET /permissions` | Human with policies/read or update; superuser bypass | `apps/core/src/permissions/routes.ts` |
| `POST /permissions` | Human superuser only: edit policy contents and permissions | `apps/core/src/permissions/routes.ts` |
| `DELETE /permissions/:id` | Human superuser only: edit policy contents and permissions | `apps/core/src/permissions/routes.ts` |
| `GET /permissions/:id` | Human with policies/read or update; superuser bypass | `apps/core/src/permissions/routes.ts` |
| `PATCH /permissions/:id` | Human superuser only: edit policy contents and permissions | `apps/core/src/permissions/routes.ts` |
| `GET /permissions/me` | Active principal; own permissions only | `apps/core/src/permissions/routes.ts` |
| `GET /policies` | Human with policies/read or update; superuser bypass | `apps/core/src/policies/routes.ts` |
| `POST /policies` | Human superuser only: edit policy contents and permissions | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id` | Human superuser only: edit policy contents and permissions | `apps/core/src/policies/routes.ts` |
| `GET /policies/:id` | Human with policies/read or update; superuser bypass | `apps/core/src/policies/routes.ts` |
| `PATCH /policies/:id` | Human superuser only: edit policy contents and permissions | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id/permissions/:permissionId` | Human superuser only: edit policy contents and permissions | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/permissions/:permissionId` | Human superuser only: edit policy contents and permissions | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/users` | Human superuser OR policies/update with policy in allowed set; atomic assignment replacement without changing self or superusers | `apps/core/src/policies/routes.ts` |
| `DELETE /policies/:id/users/:userId` | Human superuser OR policies/update with policy in allowed set; manager cannot change self or superusers | `apps/core/src/policies/routes.ts` |
| `PUT /policies/:id/users/:userId` | Human superuser OR policies/update with policy in allowed set; manager cannot change self or superusers | `apps/core/src/policies/routes.ts` |
| `GET /policies/applications` | Human with policies/read or update; policy-managed application catalog without secrets | `apps/core/src/policies/routes.ts` |
| `POST /presence` | Active human session; each heartbeat checks collection/row read or section access. Files requires human files/read or update, or superuser. Returns only ID, name, avatar, and window count; no email, sessions, or record values | `apps/core/src/presence/routes.ts` |
| `DELETE /presence/:clientId` | Active human session; remove only its own window without requiring continued read access | `apps/core/src/presence/routes.ts` |
| `GET /public/files/:id/content` | Unauthenticated: explicitly public ready files only. Private/deleted files return 404; no-store/CSP/nosniff. No listing or metadata. | `apps/core/src/files/public-routes.ts` |
| `GET /ready` | Public readiness check without secrets | `apps/core/src/health/readiness.ts` |
| `DELETE /realtime/locks` | Active human session; release only own lease with matching clientId, even after losing read/update | `apps/core/src/realtime/routes.ts` |
| `POST /realtime/locks` | Active human session; read/update on the specified field and row. Atomic 30-second lease; 409 FIELD_LOCKED on conflict | `apps/core/src/realtime/routes.ts` |
| `GET /realtime/stream` | Active human session through Bearer or HttpOnly cookie; scope uses the same collection/row read rules as GET /items. Stream rechecks access and closes when lost. Presence belongs only to this session | `apps/core/src/realtime/stream.ts` |
| `GET /schema` | Active human or service account: accessible collections, wire types, field grants. No records, defaults, or policy conditions; private/no-store. Accepts scoped CLI schema:read and includes permission-gated generated plugin model contracts | `apps/core/src/schema/routes.ts` |
| `GET /search` | Active principal; collection action/fields, related data, and history checked separately | `apps/core/src/items/routes.ts` |
| `GET /service-accounts` | Human with services/read or update; superuser bypass | `apps/core/src/services/routes.ts` |
| `POST /service-accounts` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/routes.ts` |
| `GET /service-accounts/:id` | Human with services/read or update; superuser bypass | `apps/core/src/services/routes.ts` |
| `PUT /service-accounts/:id` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/routes.ts` |
| `POST /service-accounts/:id/federations` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/federation-routes.ts` |
| `DELETE /service-accounts/:id/federations/:federationId` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/federation-routes.ts` |
| `POST /service-accounts/:id/keys` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/routes.ts` |
| `DELETE /service-accounts/:id/keys/:keyId` | Human superuser OR services/update; all current/requested service policies must be in the allowed set, including key/federation operations | `apps/core/src/services/routes.ts` |
| `GET /settings/access` | Active human; view/edit sections and allowed policy-assignment set from current database state | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/assistant` | Human with assistant/read or update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `PUT /settings/assistant` | Human with assistant/update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `GET /settings/assistant/telemetry` | Human with assistant/read or update; superuser bypass | `apps/core/src/settings/routes.ts` |
| `GET /settings/extension-registry` | Human with plugins/read or update; superuser bypass; configured packages only | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id/dependencies` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/registry-routes.ts` |
| `POST /settings/extension-registry/:id/disable` | Human with plugins/update; superuser bypass; saves desired state until restart | `apps/core/src/plugins/registry-routes.ts` |
| `POST /settings/extension-registry/:id/enable` | Human with plugins/update; superuser bypass; saves desired state until restart | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id/health` | Human with plugins/read or update; current process snapshot | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id/history` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id/permissions` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/extension-registry/:id/versions` | Human with plugins/read or update; installed version only | `apps/core/src/plugins/registry-routes.ts` |
| `GET /settings/integrations` | Active human superuser only; safe parameters and key-presence flags, without secret values | `apps/core/src/integrations/routes.ts` |
| `PUT /settings/integrations/:section` | Superuser only; environment groups cannot change; revision checks and atomic re-encryption on protection changes | `apps/core/src/integrations/routes.ts` |
| `POST /settings/integrations/:section/test` | Superuser only; credential rate limit; test without saving settings | `apps/core/src/integrations/routes.ts` |
| `GET /settings/monitoring` | Human superuser only; current-instance local metrics, without DSNs or user data | `apps/core/src/monitoring/routes.ts` |
| `GET /settings/options/collections` | Human with policies/read or update; schema projection without records | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/policies` | Human with users, policies, or services read/update; IDs and names only | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/options/users` | Human with oauth/read or update; IDs and emails only | `apps/core/src/settings/access-routes.ts` |
| `GET /settings/plugins` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/plugins/:namespace` | Human with plugins/read or update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `PUT /settings/plugins/:namespace` | Human with plugins/update; superuser bypass | `apps/core/src/plugins/settings-routes.ts` |
| `GET /settings/terms` | Human with terms/read or update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `POST /settings/terms` | Human with terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `PUT /settings/terms/:id` | Human with terms/update; superuser bypass | `apps/core/src/terms/routes.ts` |
| `POST /sign/sso/:provider` | Exact AUTH_UI_URL Origin; configured provider; linking requires an active session. | `apps/core/src/auth/browser/sso.ts` |
| `GET /sign/sso/:provider/callback` | One-time state/PKCE and browser proof; linking checks owner session. | `apps/core/src/auth/browser/sso.ts` |
| `GET /system-collections` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `DELETE /system-collections/:name/fields/:field` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `POST /system-collections/:name/fields/:field/configuration` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `PUT /system-collections/:name/fields/:field/configuration` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `GET /system-collections/:name/records` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `GET /system-collections/:name/records/:id` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `PATCH /system-collections/:name/records/:id` | Active human superuser. Allowed system entities and registered custom fields only; built-in columns protected | `apps/core/src/system-collections/routes.ts` |
| `GET /table-views/:collection` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/preferences/table-view-routes.ts` |
| `POST /table-views/:collection` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/preferences/table-view-routes.ts` |
| `DELETE /table-views/:collection/:id` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/preferences/table-view-routes.ts` |
| `PUT /table-views/:collection/:id` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /table-views/:collection/default` | Human with collection access; personal owner, shared views editable by superusers | `apps/core/src/preferences/table-view-routes.ts` |
| `GET /translations` | Active human or service account; schema limited to accessible collections/fields, static enabled-plugin catalogs, no records/defaults | `apps/core/src/translations/routes.ts` |
| `GET /users` | Human with users/read or update OR policies/read or update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `POST /users` | Human with users/update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/access` | Human with users/read or update; superuser bypass | `apps/core/src/auth/user-routes.ts` |
| `PUT /users/:id/delegation` | Human superuser only: explicit allowed set of existing policies for a user's assignments | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/extension` | Active user with users/read and ordinary collection read grants | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/:id/extension` | Active user with users/update and ordinary collection read/create/update grants | `apps/core/src/auth/profile-extension-routes.ts` |
| `POST /users/:id/invitation` | Human superuser OR users/update; re-invitation within the allowed set only, excluding accounts with their own delegation | `apps/core/src/auth/user-routes.ts` |
| `GET /users/:id/profile` | Active user with users/read; public profile information without credentials | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/:id/profile` | Active user with users/update; profile fields only, without status/privilege changes | `apps/core/src/auth/profile-extension-routes.ts` |
| `GET /users/:id/profile-display` | Active human with users/read or superuser; configured target-user profile projection | `apps/core/src/auth/profile-display-routes.ts` |
| `POST /users/:id/recovery` | Fresh human superuser; another active ordinary user only. One-time 30-minute recovery link, audited and not delegated | `apps/core/src/auth/user-routes.ts` |
| `GET /users/me` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/profile-routes.ts` |
| `PATCH /users/me` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/profile-routes.ts` |
| `POST /users/me/avatar` | Own human session; private raster image up to 2 MiB, configured storage, and credential rate limit | `apps/core/src/auth/profile-avatar-routes.ts` |
| `GET /users/me/extension` | Own human session and ordinary collection read grants; hidden rows/fields remain hidden | `apps/core/src/auth/profile-extension-routes.ts` |
| `PATCH /users/me/extension` | Own human session; read plus create/update, with ordinary row/field/relation/file rules | `apps/core/src/auth/profile-extension-routes.ts` |
| `GET /users/me/identities` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/sso/routes.ts` |
| `DELETE /users/me/identities/:id` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/sso/routes.ts` |
| `GET /users/me/oauth-apps` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/oauth/consent-routes.ts` |
| `DELETE /users/me/oauth-apps/:id` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/oauth/consent-routes.ts` |
| `GET /users/me/passkeys` | Own active human session; public passkey information only | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/passkeys` | Own session-bound challenge, recent sign-in, WebAuthn verification; up to ten passkeys | `apps/core/src/auth/passkeys/routes.ts` |
| `DELETE /users/me/passkeys/:id` | Own passkey, recent human sign-in; cannot remove the last sign-in method | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/passkeys/options` | Own active human session authenticated within five minutes | `apps/core/src/auth/passkeys/routes.ts` |
| `POST /users/me/password` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/profile-routes.ts` |
| `POST /users/me/password/setup` | Own fresh human session; only if no password exists | `apps/core/src/auth/profile-routes.ts` |
| `GET /users/me/preferences` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/preferences/routes.ts` |
| `PATCH /users/me/preferences` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/preferences/routes.ts` |
| `GET /users/me/profile-display` | Active human; own values from preconfigured selfVisible paths only, without arbitrary collection reads | `apps/core/src/auth/profile-display-routes.ts` |
| `GET /users/me/sessions` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/profile-routes.ts` |
| `DELETE /users/me/sessions/:id` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/auth/profile-routes.ts` |
| `GET /users/me/table-preferences/:collection` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/preferences/routes.ts` |
| `PATCH /users/me/table-preferences/:collection` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/preferences/routes.ts` |
| `PUT /users/me/workspace` | Human, own profile/resource only; workspace additionally checks visibility | `apps/core/src/workspaces/routes.ts` |
| `GET /users/profile-display` | Human superuser only; profile-block configuration | `apps/core/src/auth/profile-display-routes.ts` |
| `PUT /users/profile-display` | Human superuser only; explicitly grants a bounded projection to user managers and, with selfVisible, the profile owner | `apps/core/src/auth/profile-display-routes.ts` |
| `GET /users/profile-display/sources` | Human superuser only; permitted custom fields and M2O paths without record data | `apps/core/src/auth/profile-display-routes.ts` |
| `GET /users/profile-extension` | Active user with users/read; selected collection/key names | `apps/core/src/auth/profile-extension-routes.ts` |
| `PUT /users/profile-extension` | Human superuser only; binds an ordinary UUID collection without granting access or deleting data | `apps/core/src/auth/profile-extension-routes.ts` |
| `GET /users/references` | Human session: superuser or users-section read; only user IDs/labels with bounded search/pagination; service keys forbidden | `apps/core/src/auth/user-routes.ts` |
| `GET /workspaces` | Human; workspaces containing accessible collections only (superusers see all) | `apps/core/src/workspaces/routes.ts` |
| `POST /workspaces` | Human superuser | `apps/core/src/workspaces/routes.ts` |
| `DELETE /workspaces/:id` | Human superuser | `apps/core/src/workspaces/routes.ts` |
| `PUT /workspaces/:id` | Human superuser | `apps/core/src/workspaces/routes.ts` |
