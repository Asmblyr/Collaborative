# Deploying Collaborative

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

Production uses matching Core and UI images from one commit. Connect PostgreSQL 17+ and S3 separately. SDK, Kit, Contracts, and bundled plugins build from monorepo source without prior npm publication.

## Docker Compose

Build both targets from one checkout with the same build identifier:

```sh
docker build --target core --build-arg DEPLOYMENT_VERSION=local -t collaborative-core:local .
docker build --target ui --build-arg DEPLOYMENT_VERSION=local -t collaborative-ui:local .
```

Copy deploy/env.example to a private file outside the repository. Set DATABASE_URL, a random ASMBLYR_SETUP_TOKEN of at least 32 characters, the public AUTH_UI_URL origin, and SECRETS_LOCAL_KEY as described in [connections](../docs/features/connections.md). Configure S3 through admin settings or env; the bucket must already exist.

```sh
export ASMBLYR_CORE_IMAGE=collaborative-core:local
export ASMBLYR_UI_IMAGE=collaborative-ui:local
export ASMBLYR_ENV_FILE=/private/collaborative.env
docker compose -f deploy/compose.yaml up -d --wait
```

Compose runs migrations in a short-lived Core process, then starts Core/UI. The default public address is `http://localhost:3000`, with /api. UI_PORT/BIND_ADDRESS control port publication. Point an external HTTPS reverse proxy to that port. AUTH_UI_URL must match the browser origin. Create the first administrator at /setup.

Core's public listener handles API and forwards pages to UI; Next does not proxy API. UI receives only internal CORE_URL and shared SESSION_COOKIE_PREFIX, without database, S3, or provider secrets. Set SESSION_COOKIE_PREFIX in Compose's environment if changing it. Pin both production images to the same release and their respective digests.

## Kubernetes and Helm

The [chart](helm/collaborative) creates two Deployments, two ClusterIP Services, optional Ingress, and a migration Job, all scoped to the release namespace. It creates no database, bucket, CRDs, cluster roles, ingress controller, or cert-manager.

Prepare the namespace and a collaborative-core Secret with Core parameters from deploy/env.example. The Secret and external database must exist before Helm: migrations run as a pre-install/upgrade hook.

Example private values:

```yaml
publicUrl: https://admin.example.com
existingSecret: collaborative-core
images:
  core:
    repository: ghcr.io/asmblyr/collaborative-core
    digest: sha256:REPLACE_WITH_VERIFIED_CORE_DIGEST
  ui:
    repository: ghcr.io/asmblyr/collaborative-ui
    digest: sha256:REPLACE_WITH_VERIFIED_UI_DIGEST
ingress:
  enabled: true
  className: your-ingress-class
  tlsSecretName: admin-tls
core:
  replicas: 1
ui:
  replicas: 1
```

```sh
helm upgrade --install collaborative deploy/helm/collaborative \
  --namespace collaborative --values /private/collaborative-values.yaml \
  --wait --timeout 10m
```

TLS Secrets also belong to the release namespace. Use ingress.annotations for controller-specific settings: assistant stream timeouts must cover OPENAI_API_TIMEOUT_MS, response buffering should be disabled, and body limits must match Core uploads. The chart uses ordinary Prefix paths without regex, rewrite-target, or snippets.

For an external Gateway, disable ingress and reproduce these routes:

| Prefix                                        | Target    |
| --------------------------------------------- | --------- |
| /api, /sign/sso, /connections/google/callback | Core:3001 |
| /oauth/interaction                            | UI:3000   |
| /oauth, including /oauth/complete/:uid        | Core:3001 |
| /                                             | UI:3000   |

Longest Prefix wins. OAuth interaction cookies are scoped to /oauth; consent and server completion use separate branches. UI server rendering forwards the user session to Core. Public callbacks and HTTPS origin remain on one domain.

CoreEnv holds nonsecret Core configuration. TRUST_PROXY is a comma-separated allowlist of trusted ingress addresses/CIDRs; forwarded IPs are untrusted by default. Use actual proxy addresses and restrict Core network access: trusting an entire network without NetworkPolicy enables client-IP spoofing. Private images use image.pullSecrets.

Mount OAuth signing keys and other Core files from precreated Secrets. Each key becomes a file under /run/secrets/&lt;name&gt;:

```yaml
coreSecretFiles:
  - name: oauth
    secretName: collaborative-oauth
coreEnv:
  OAUTH_ISSUER_URL: https://admin.example.com/oauth
  OAUTH_KEYS_FILE: /run/secrets/oauth/keys.json
```

Here collaborative-oauth contains keys.json. See [operations](../docs/development/operations.md) for key creation. Files mount read-only into Core/migrations, never UI. Roll out Core after env/key changes; replicas need identical settings. Compose can mount equivalent files with a private volumes override for Core/migrations.

Core probes: /health for process liveness and /ready for database/migrations. UI /healthz is database-independent. Containers run nonroot, without service-account tokens, and with read-only root filesystems. Bounded emptyDir volumes hold temporary files/UI cache. Configure component resources independently.

## Replicas and upgrades

Core/UI default to one replica each. PostgreSQL shares sessions, credential limits, assistant daily/minute quotas, leases, cancellation requests, and prepared plugin forms across replicas. Active Core checks remote cancellation every 500 ms. Forms are owner-bound and expire after twenty minutes. Process-local limits additionally protect each Core. Custom plugins own their external effects and shared state.

An active response belongs to one connection. Stopping Core interrupts it; generation does not resume seamlessly on another replica. History remains and interrupted requests can be retried. Sticky sessions are unnecessary.

Both images share DEPLOYMENT_VERSION (commit SHA in CI). Next uses it to detect client/server mismatch, not for version-based routing or preserving old JavaScript during rollout. Strict zero-downtime UI upgrades need retained old assets or whole-release switching after readiness. Do not mix arbitrary Core/UI versions.

Back up PostgreSQL before upgrading. Migrations must remain compatible with old Core replicas still serving during rollout. Helm waits for migrations and stops on failure. Helm rollback does not roll back PostgreSQL. Uninstalling the release preserves external database, S3, and precreated Secrets.

## CI and registry

GitHub Actions checks code, builds two images, tests them against disposable PostgreSQL, and validates Helm. Successful main/release-tag workflows publish:

- ghcr.io/asmblyr/collaborative-core
- ghcr.io/asmblyr/collaborative-ui
- oci://ghcr.io/asmblyr/charts/collaborative

Images use sha-&lt;commit&gt;, edge for main, and versions for v\* tags. Main charts use 0.1.0-edge.&lt;run-number&gt;; release charts use the Git-tag version. [GitHub Releases](https://github.com/Asmblyr/Collaborative/releases) lists artifact versions/digests.

Build unpublished changes locally and install the repository chart. CI does not deploy servers.

```sh
node scripts/test.mjs container-split collaborative-core:local collaborative-ui:local
node scripts/chart-check.mjs
```

Container checks create/remove disposable PostgreSQL and a Docker network.

## Compatibility and local development stack

The legacy app monolith target and deploy/compose.monolith.yaml remain for existing installations. Current CI publishes split images. Deploy/local/compose.yaml supplies a development stack with external PostgreSQL/MinIO services. MinIO uses AGPL.

Copy deploy/local/env.example to a private file, set secrets, then run:

```sh
docker compose --env-file /private/local.env -p asmblyr-local -f deploy/local/compose.yaml up -d --build --wait
```

Default address: `http://localhost:3300`. Stop with down without -v to retain data. See [operations](../docs/development/operations.md) for backups/recovery.
