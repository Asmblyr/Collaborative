# Extension registry architecture

The current extension unit is an npm or workspace package named in the root
`asmblyr.plugins` array. Core validates the package manifest, then imports its
server entry, routes, hooks and settings into the trusted Node.js process.
`plugin.ts` remains `definePlugin({})`; routes, hooks, settings and UI keep their
existing file based contracts. `asmblyr.pluginPermissions` approves declared
capabilities. Plugin collections and migration records already live in PostgreSQL.

The pnpm workspace has Core in `apps/core`, the Next.js administration UI in
`apps/ui`, Kit in `packages/kit`, the HTTP SDK in `packages/sdk`, and the CLI in
`packages/cli`. Core routes use Fastify and the existing settings RBAC; Knex
migrations own Core tables in `public`. The existing settings editor validates
ordinary plugin configuration, while Core records security events. Tests use
Node's test runner and the disposable PostgreSQL runner `scripts/test.mjs`.
Package builds generate route indexes and UI entries, so registry activation
reuses the existing source and production discovery paths.

## Registry and lifecycle

The registry is an administrative view of the configured package allowlist and
its installed PostgreSQL ownership. Package metadata is read without importing
code. A package outside the allowlist may be described by a future isolated
registry, but cannot be installed or activated by this runtime. The package
manager and deployment process install and update trusted artifacts; Core never
runs npm or package scripts from an API request.

The existing loader is the activation boundary. Server routes, hooks, UI and
model handlers are registered at startup. JavaScript modules cannot be unloaded
reliably, so a lifecycle request that changes activation records a desired state
and reports that a restart is required. The current process remains active until
the restart. Startup reconciles desired state before importing plugin code. A failed
manifest, capability check or module import is recorded for that package; Core
continues with other trusted packages and skips required dependents. A failure
while registering an already imported plugin can still prevent Core startup.
Collection ownership and settings remain after deactivation. Updates and removal
of package artifacts remain deployment operations, with backup and explicit
versioned migrations where schema changes are required.

## Manifest and resolution

Version 1 `asmblyr.manifest` continues to accept `namespace` and `capabilities`.
Optional registry metadata adds display text, publisher, Core compatibility,
and dependency ranges without changing `plugin.ts`. Package names and versions
come from `package.json`. All data is parsed before use. Required dependency
cycles, missing packages, version mismatches and Core incompatibility block
activation. Optional dependencies are descriptive and do not block activation.

The manifest stays inside the package's `package.json` under
`asmblyr.manifest`. This valid excerpt uses the existing trusted Comments
package; the root project must still list the package and approve all declared
capabilities before Core imports it:

```json
{
  "name": "@asmblyr-collaborative/plugin-comments",
  "version": "0.0.0",
  "asmblyr": {
    "manifest": {
      "version": 1,
      "namespace": "comments",
      "capabilities": [
        "identity.profile",
        "items.read",
        "collections.manage",
        "storage.own",
        "hooks.items",
        "hooks.collections",
        "settings",
        "notifications"
      ]
    }
  }
}
```

`name` must be a package name, `version` a valid semver version, and
`manifest.version` must be `1`. Optional `title`, `description`, `category`
and `publisher: { id, name }` are display metadata; Core does not infer
publisher verification. Optional `compatibility.collaborative` and
`compatibility.node` are semver ranges. Optional `dependencies` and
`optionalDependencies` map package names to semver ranges. Capability names
must belong to Kit's declared set and to the project's explicit approval list.
The package export map remains the source of executable entrypoints; manifest
metadata cannot specify a new code path. Invalid fields and unknown manifest
keys are rejected before import.

## Data and trust

Core uses versioned, additive `asmblyr_` tables for desired activation and
operation history. Operations take a PostgreSQL advisory transaction lock for
the whole dependency graph so concurrent state changes serialize. History
records actor or process instance, action, result and time without settings values
or credentials. Existing plugin settings
keep their revision checks and authorization. Secret settings are not supported:
the current settings store exposes values to the browser, so manifests cannot
declare secret fields until an external secret store is integrated.

Only users with the `plugins` settings read grant can inspect registry metadata;
changing desired activation requires `plugins` update access. Current package
approval still requires a trusted deployer to edit the project allowlist and
capability approvals. A process or browser isolation contract is required before
unknown third party packages can be activated. `worker_threads`, VM and dynamic
import alone do not establish that boundary.

A future isolated runtime must accept a verified immutable artifact and a
capability grant, start it outside the Core process, expose a bounded request
protocol, report health, and stop it without access to Core's environment or
database credentials. The host must proxy only authorized operations and apply
the same caller permissions as HTTP and MCP. Browser UI would require separate
origin isolation. This is a contract boundary for future work, not an available
runtime in this release.

## API and compatibility

The administrative API uses `/settings/extension-registry` to avoid the existing
`GET /extensions` browser UI-discovery route. The registry's read endpoints
return validated metadata, activation, compatibility, dependencies, permissions,
health and history. Mutations use one lifecycle service and return a pending
restart result. Existing `/settings/plugins` and plugin HTTP routes remain valid.
The admin interface reads the new API and continues to use the existing settings
editor for non-secret configuration.

| Endpoint                                            | Result                                                                                 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /settings/extension-registry`                  | Paginated configured packages; `page`, `limit`, `search`, `status`, `category`, `sort` |
| `GET /settings/extension-registry/:id`              | One package and current activation state                                               |
| `GET /settings/extension-registry/:id/versions`     | Installed version only                                                                 |
| `GET /settings/extension-registry/:id/dependencies` | Required and optional ranges                                                           |
| `GET /settings/extension-registry/:id/permissions`  | Declared capabilities and approval issue                                               |
| `GET /settings/extension-registry/:id/health`       | Current process state and validation issues                                            |
| `GET /settings/extension-registry/:id/history`      | Activation attempts, newest first                                                      |
| `POST /settings/extension-registry/:id/enable`      | Request activation after restart                                                       |
| `POST /settings/extension-registry/:id/disable`     | Request deactivation after restart                                                     |

`id` is the base64url encoding of the package name and is supplied by the list
response. Read routes require a human `plugins/read` or `plugins/update` grant;
mutations require `plugins/update`. The API returns `400` for malformed list
queries, `401` for missing authentication, `403` for insufficient access, `404`
for an unknown ID, and `409` for a dependency or approval conflict. The
generated OpenAPI reference contains the response schemas.

Each entry reports `desiredState` from PostgreSQL (`enabled` or `disabled`) and
`actualState` from the serving Core process (`enabled`, `disabled`, or `failed`).
`instanceId` identifies that process. `pendingRestart` is true when the desired
and active enablement differ. `lastError` is the latest startup error in this
process; startup history keeps errors from earlier instances. Legacy `loaded`,
`desiredEnabled`, and `restartRequired` fields remain for existing clients.
There is no cluster-wide actual state: a load balancer may return different
instances during a rolling restart. Query each instance directly to inspect
all replicas. Lifecycle events use the Core logger and include
`extension.validation.failed`, `extension.enable.requested`,
`extension.disable.requested`, `extension.startup.succeeded`,
`extension.startup.failed`, and `extension.reconciliation.completed`.

To test locally with Docker, run
`docker run --rm --name collaborative-registry-pg -e POSTGRES_PASSWORD=localtest -p 127.0.0.1:55439:5432 -d postgres:16`,
then set `TEST_DATABASE_ADMIN_URL=postgresql://postgres:localtest@127.0.0.1:55439/postgres`
and run `node scripts/test.mjs core-integration`. Stop the container with
`docker stop collaborative-registry-pg`. If Docker is unavailable, start a local
PostgreSQL server on loopback and set `TEST_DATABASE_ADMIN_URL` accordingly.
The runner creates, migrates and drops a fresh `asmblyr_test_*` database. Never
point it at a production server. After a failed startup, inspect the Core log
event and registry history. Correct the trusted artifact or approval, then
restart Core; an API enable request cannot repair a bad artifact.
