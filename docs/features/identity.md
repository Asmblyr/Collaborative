<a id="пользователи-и-вход"></a>

# Users and sign-in

Create the first superuser in the UI with the setup secret. Later users join through invitations or configured SSO. Email is unique, but matching email addresses do not authorize automatic linking of external identities.

<a id="профиль-и-дополнительные-поля"></a>

## Profile and extensions

The base profile includes email, display name, optional first/last name, About text, avatar, and creation, profile-update, last-login, and activity timestamps. Display-name fallback is display name → first/last name → email. Existing display names are preserved. Profile editing cannot change email, status, superuser, credentials, or system timestamps.

Upload avatar uses `POST /users/me/avatar` with configured file storage, including S3: PNG, JPEG, GIF, or WebP up to 2 MiB. No external image URL or file-library permission is needed for your own avatar. Upload creates a private file; `PATCH /users/me` with `avatarId` attaches it. Another user's avatar is attached through `PATCH /users/:id/profile`, requiring users/update.

Unsaved uploads remain in the library for administrator cleanup. Owners can view their own avatar; viewing another requires users-section access or ordinary file access. An attached avatar cannot be deleted. `pictureUrl` remains in the API for compatibility and public OAuth profiles; the form does not edit it and private avatars are not exported there.

Appearance preferences include an IANA time zone, such as `Asia/Yekaterinburg`; `null` uses the device time zone. It formats profile and session dates while database/API timestamps stay UTC. `lastLoginAt` changes on new-session creation, not refresh. `lastActiveAt` is approximate: successful user access-token requests update it at most every five minutes. Service-key activity is tracked separately.

Job title, department, organization, and manager are not built into Core. New profile fields and M2O relations are configured in the system Users collection. Existing UUID-key extension collections remain supported through the compatibility API. Use supported fields, M2O/O2M/M2M relationships, and the standard form editor. An empty collection is recommended. Existing row IDs must match user IDs; each user has one profile row. An internal FK protects the association, and collection renaming preserves the setting.

Extra data opens from the personal profile and user side panel. The first `PATCH /users/me/extension` or `PATCH /users/:id/extension` creates a row with the user's ID; later calls update it. Ordinary `POST /items/:collection` cannot create profiles with random IDs. Existing rows and relationships use the standard record editor. Disabling the extension preserves data and its FK; disable it before deleting the collection.

Selecting an extension grants no permissions. Users need ordinary collection read, create for initial completion, and update for changes. For personal data, apply a row condition on `id` (or the chosen UUID key): Equals → Current user, for each action. Related collections and files have separate checks. Another user's profile additionally requires users/read or users/update; hidden rows and fields stay hidden.

Validation, computed fields, audit, and mutation hooks match ordinary collections. The extension schema is included in `GET /schema` and CLI generation; see the [SDK guide](../reference/sdk-guide.md).

<a id="настраиваемая-информация-профиля"></a>

## Configurable profile information

A superuser adds read-only virtual fields under Collections → System collections → Users. Up to 12 fields have a label, source and Show to profile owner, off by default. Arrange them alongside other profile fields in Profile form. Existing display configuration and its sources are preserved.

Sources are custom fields of the system `users` collection. Paths may traverse up to two single M2O relations to a final value, such as department → name or department → manager. Supported values include text, email, numbers, flags, dates, tags, and user references exposing only a display name with name/email fallback. Photos and arbitrary fields of linked users are not returned.

System columns, sensitive fields, files, arbitrary JSON, to-many relations, and plugin collections cannot be sources. Values are read from their source records when loading the profile, without copying.

This is an explicit, separate projection permission: managers with users/read see configured rows; owners see only rows with `selfVisible`. Ordinary collection grants are unnecessary for these specific values. The projection grants no directory access, access to other profiles, or editing rights. Choose information suitable for that audience. Only superusers configure it.

Deleting a source, changing a relation target, marking it sensitive, or dropping/recreating a column hides the affected row until reconfiguration. Binding validation includes field names and physical column identity. Source renames or database restoration with different OIDs require saving the configuration again. Missing values display Not specified.

API: `GET|PUT /users/profile-display`, `GET /users/profile-display/sources`, `GET /users/me/profile-display`, and `GET /users/:id/profile-display`. Tests run with `node scripts/test.mjs core-profile`.

<a id="пароль-и-сессии"></a>

## Passwords and sessions

Passwords are stored separately as Argon2id hashes. Access/refresh tokens are random opaque values; only SHA-256 hashes are stored. Access lasts 15 minutes, sessions up to 30 days, and refresh rotates. Reusing a consumed refresh token revokes its session.

Browsers receive a separate opaque HttpOnly `asmblyr_session` cookie, SameSite=Lax and Secure on HTTPS. Its database value is hashed. Sessions last up to 30 days without sliding expiry; every request checks expiration, revocation, and user status. Browsers receive no refresh tokens, so tabs and replicas share a database-validated session without refresh races. Profiles allow editing personal information/passwords and viewing/revoking sessions.

Browser sign-in endpoints are `/api/auth/browser/login`, `/api/auth/browser/invitations/claim`, `/api/auth/browser/passkeys/options`, and `/api/auth/browser/passkeys/login`. Success returns `{ok:true}`; the secret is sent only through Set-Cookie. Logout uses `POST /api/auth/browser/logout`. Cookie-authenticated mutations and all browser-auth operations require an exact Origin matching `AUTH_UI_URL`; missing or foreign origins are rejected. Explicit Authorization takes precedence over cookies.

Upgrading from the former BFF requires signing in again: old access/refresh cookies are unused. Data, users, passkeys, and API sessions are preserved.

`SESSION_COOKIE_DOMAIN` optionally shares only the main session cookie with trusted applications under one parent domain; an empty value keeps it host-only. For example, `admin.example.test` and `portal.example.test` may use `example.test`. The value must match the public origin's parent domain, must not be an IP, top-level domain or public suffix, and every receiving subdomain must be trusted. Cookie sharing alone does not authenticate another product: it must validate the session through the trusted Core and map the exact external subject to its own account and permissions. Passkey and SSO challenge cookies remain host-only. Sign-in/logout clear both the current host-only and configured domain session cookie; duplicate session cookies are rejected. Changing the public hostname requires one sign-in on the new origin and new passkeys; it does not move or revoke existing database sessions. Shared sessions keep the original expiry (up to 30 days), revocation and active-user checks.

Administrators specify an email and share a one-time `/invite#token=…` link through any channel. It expires after seven days and signs in without email delivery or a mandatory password. The fragment is removed before submission; GET alone does not consume it. It proves possession of the invitation secret, not ownership of the mailbox. After sign-in, add a password, passkey, or linked SSO for future access. Consumed invitations cannot be reused.

Invitations require users/update. Managers can re-invite only unactivated accounts without password, passkey, or SSO, whose policies all belong to their allowed set. Their own account and users with delegation rights are excluded. UI controls and server checks enforce this independently. See [delegation](./access.md#bounded-policy-delegation).

<a id="passkey-и-восстановление"></a>

## Passkeys and recovery

SimpleWebAuthn implements discoverable credentials with required device user verification and checks for challenge, signature, origin, RP ID, and counter. Challenges are single-use, expire in five minutes, and registration binds to the session. Accounts support up to ten passkeys; private keys stay on the device.

Adding/removing passkeys and setting the first password require sign-in within the past five minutes; refresh does not extend this period. The last available sign-in method cannot be removed.

A freshly authenticated superuser can issue a one-time 30-minute recovery link to an active ordinary user. Claiming it revokes prior sessions, password, passkeys, SSO links, and OAuth consents. Issuing it alone resets nothing. Recovery is not delegated to managers and cannot target superusers. Operators recover locked-out administrators on the server using `scripts/operations/admin-recover.mjs`; see [operations](../development/operations.md).

`AUTH_UI_URL` sets the exact public origin and is mandatory in production. HTTPS is required except for `localhost` and its `.localhost` subdomains, used by local ingress. The browser must resolve these names to loopback and support them as secure contexts. Optional `PASSKEY_RP_ID` must match the hostname. Domain changes require new passkeys. Core also binds the challenge to an HttpOnly browser cookie.

<a id="подключение-cli"></a>

## CLI connection

`asm connect` opens `/sdk/connect` for sign-in and schema consent. It uses PKCE S256, a one-time 60-second code, and an exact `127.0.0.1` callback on a random port. The session-bound `schema:read` token lasts ten minutes and is accepted only by `GET /schema`, never for record reads or writes.

The CLI does not persist the token. Another online request requires sign-in or a separate API key from env/stdin. See [CLI](../reference/cli-guide.md).

## SSO

Configured providers support OIDC and OAuth. The provider key determines the public `/sign/sso/<provider>/callback` URL. Core serves `POST /sign/sso/:provider` and its callback, validates browser proof, and creates the session. Programmatic `/auth/sso/:provider/start` and `/callback` endpoints remain available.

OIDC validates discovery, issuer, state, PKCE, and nonce. New providers are linked from an already authenticated account; matching email alone never links accounts. Provider secrets stay in server configuration.

There is no separate MFA flow, general LDAP/SAML connector, or self-service email password recovery. SMTP is unnecessary for the first beta. The shared credential-endpoint rate limit lives in PostgreSQL; additional route limits are process-local. Core's built-in public listener sees browser connections directly. Behind an external reverse proxy, the shared source limit applies to the proxy address because Core does not trust external forwarded headers.

Sources: `apps/core/src/auth` and `apps/core/src/auth/browser`. External application authorization is covered under [integrations](./integrations.md).

## Profile fields and form

Configure profiles under **Collections → Show system collections → Users**. Add ordinary optional fields, M2O relationships, or read-only virtual fields rooted in existing custom user fields and single relationships. **Profile form** reuses the collection form designer: order, half/full widths, tabs, sections and preview. Both the account profile and the administrative user card use this form. Profile sections keep their headings and share the main field grid without nested cards or horizontal insets; the profile form preview uses the same presentation. Avatars keep their dedicated uploader. Built-in identity, authentication and privilege columns remain protected.

For a custom field, select **Owner access** in the form designer: hidden by default, read only, or read and edit. These are explicit own-row grants, enforced in Core. Related rows still require ordinary collection read permissions; file permissions remain enforced. Other users' custom columns remain superuser-only. Visibility in the form is not an authorization rule.

Legacy profile-extension collections, values, relationships and policies remain untouched and accessible from existing profiles. Existing display projections become virtual fields in Users; their exact sources and owner visibility are preserved. The separate Profile extension and Profile display settings are removed from the Users settings screen. The legacy APIs remain compatible. No automatic data migration or privilege expansion occurs.

New routes: GET/PUT /system-collections/users/form (human superuser), GET/PATCH /users/me/form (own human session), GET/PATCH /users/:id/form (users/read or users/update). GET responses omit hidden fields and layout conditions referring to them. PATCH is atomic across native and custom user fields. Deleting a custom field removes its owner grant, so recreating its name cannot recover old privileges.

Verification: core-profile and core-system-collections through scripts/test.mjs, UI unit tests, typecheck, lint and production builds.

Own native profile fields (first name, last name, display name and About) are read only by default for ordinary users. A superuser explicitly enables owner writes for each field in the system Users form. Custom fields keep their existing hidden/read/write grants. Human users with users/update can manage native profiles, and superusers retain their administration access. The legacy PATCH /users/me and unified form enforce the same checks; mixed unauthorized writes are rejected atomically. Revocation takes effect on the next request and preserves saved values. Owners may freely upload/change their own avatar, subject to existing image and file validation. Passwords, sessions, appearance and personal application connections remain independently available. Legacy extension collections continue to enforce their ordinary row and field grants.
