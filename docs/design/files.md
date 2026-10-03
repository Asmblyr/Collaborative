# Files and object storage

Implemented API/UI: 2026-09-29. Files are a separate Core resource, not user-created
collection rows or local filesystem paths. Metadata lives in `public.asmblyr_files`;
immutable binary objects live in a private bucket under `files/<uuid>`. Structure is
protected by the existing `asmblyr_` prefix rule. Generic `/items` does not expose them.

## First release

- `/files` admin library with pagination, contextual header search, drag/drop and
  multiple uploads (sequential, up to 20 per selection), safe raster previews.
- Native floating right dialog: title, description, original filename/type/size,
  download, explicit delete confirmation and latest 100 audit events.
- Library browsing, upload, metadata editing, history and deletion require an
  active human superuser. Metadata/download/preview of a linked file inherit read
  access to its collection field. An unlinked ID grants no access. Service
  principals can read linked files through their collection grants.
- Files are capped at 25 MiB each. BFF and Core both enforce the cap, including
  chunked requests. This first implementation buffers bounded uploads to support
  authentication retry and known S3 content length. Downloads stream through Core
  and BFF; no public or presigned URLs, no credentials in the browser.
- Binary content is immutable. Metadata patches accept only title/description.
- Raster signature checks allow PNG/JPEG/GIF/WebP preview. Client MIME alone never
  enables preview. HTML/SVG and other content are attachment-only, with nosniff and
  CSP sandbox. This is not antivirus scanning or an image transformation pipeline.

## API

| Method | Route                            | Contract                                                                                                                 |
| ------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/files?search=&page=1&limit=25` | `{data, meta}`; limit 1–100                                                                                              |
| POST   | `/files`                         | Raw bytes, `Content-Type: application/octet-stream`, percent-encoded `X-File-Name`, optional `X-File-Type`; 201 `{data}` |
| GET    | `/files/:id`                     | Public metadata, no object key/bucket/credentials                                                                        |
| GET    | `/files/resolve?ids=uuid,uuid`   | Up to 100 IDs; returns only accessible metadata                                                                          |
| PATCH  | `/files/:id`                     | `{title?, description?}`                                                                                                 |
| GET    | `/files/:id/content`             | Authenticated download                                                                                                   |
| GET    | `/files/:id/content?preview=1`   | Safe raster types only                                                                                                   |
| GET    | `/files/:id/events`              | Latest 100 events, including after deletion                                                                              |
| DELETE | `/files/:id`                     | Idempotent deletion; 204                                                                                                 |

## Database and S3 consistency

S3 and PostgreSQL do not share a transaction:

1. Record an `uploading` intent before PUT. A random UUID is the object key;
   original filenames cannot overwrite other objects.
2. Hold a row lock during the bounded PUT; commit `ready` and create audit together.
3. A failed/ambiguous PUT leaves `failed`, so an administrator can delete the ID
   and clean up a potentially uploaded object. A process crash leaves `uploading`;
   after 15 minutes the stale intent is eligible for deletion.
4. Deletion first checks actual file/gallery values in managed collections and
   returns 409 while any record uses the file. It then commits `deleting` before
   the object DELETE, hiding content immediately.
   After object deletion, metadata removal and audit commit together. A failure
   retains the tombstone for an idempotent retry. No silent loss of cleanup work.
5. Storage identity is persisted. Changing driver/bucket configuration does not
   redirect old IDs to objects in a different bucket; access returns 503.

Metadata changes record actor, time, request ID and changed fields before/after in
`asmblyr_file_events`. No-op updates do not create events. Binary data and tokens
are never recorded. History survives file/user removal. Retention is not automated.
Migration rollback refuses to drop populated metadata or audit tables; it never
deletes cloud objects.

## Storage drivers and credentials

- `s3`: official AWS SDK v3, configurable endpoint/region, its standard credentials
  chain. Local HTTP endpoints are permitted only at localhost/127.0.0.1.
- `yandex`: S3 HTTP object operations with `Authorization: Bearer <IAM token>`.
  OIDC assertions are exchanged at `https://auth.yandex.cloud/oauth/token` for the
  configured YC service account. Cache is in memory, early refreshed at most every
  nine minutes with concurrent exchange deduplication. Exchange errors are sanitized.
- Production: `FILES_YC_TOKEN_SOURCE=file` rereads the projected, rotating token.
- Local: `FILES_YC_TOKEN_SOURCE=kubernetes` runs `kubectl create token` against the
  explicitly configured kubeconfig, namespace, ServiceAccount and audience. This
  mode uses the developer's cluster credentials and is rejected in production.
- No CLI user IAM tokens, service account keys or OIDC assertions are persisted by
  Core. The YAML/configuration files contain only public resource identifiers.

## Yandex Cloud resources

Historically verified in a separately configured development installation.
Public examples omit the actual folder, bucket, service account and federation IDs:

- Private dev bucket: `<private-bucket>`.
- Limit: 1 GiB; STANDARD; anonymous read/list/config off; static key auth disabled.
- YC SA: `<service-account-id>` (`asmblyr-collaborative-files`).
- Federation: `<federation-id>`; audience `asmblyr-collaborative-files`.
- Exact subject: `system:serviceaccount:asmblyr-collaborative-dev:core-files`.
- Existing cluster issuer/JWKS reused and public key IDs verified against cluster.
- Isolated K8s namespace and SA created; automount off; no workload or RBAC installed.

`infra/files/provision.ps1` takes folder, bucket, JWKS and kubeconfig parameters.
Generated `resources.json` and `bucket-policy.json` remain local and are ignored by Git.
See `infra/files/README.md` for the operator commands.
YC authorization checks IAM or bucket ACL **before** applying bucket policy:
base bucket read/write is required, then policy permits only Get/Put/Delete of
`files/*` over TLS. No folder IAM grant or bucket listing. YC permits reading this
bucket's policy with its base read ACL; modifying that policy is denied.
The user explicitly approved the ACL after the initial automatic-review block.
The ACL is now applied and live object operations and negative access checks passed.

After approval, `infra/files/verify-federation.ps1 -InitializeBucketAcl` validates
the exact trust and policy, grants only the new SA the base bucket ACL, then checks
PUT/GET/DELETE plus denied subject/audience/anonymous/prefix/list/policy-write access.
It seeds a synthetic outside-prefix object using a temporary exact-key policy grant,
restores the policy, verifies denied access to that existing object, then cleans it
up with the same isolated grant. Policy propagation can lag the management API;
probe cleanup retries 403 before failing. Normal repeat checks omit
`-InitializeBucketAcl` but still need management credentials for this isolated probe.
Do not use the provisioning script as an idempotent reconciler.

For a future Core pod, mount a projected token with audience
`asmblyr-collaborative-files`, expirationSeconds 600, serviceAccountName `core-files`,
and configure `FILES_YC_TOKEN_FILE`. No deployment is created in this change.

## Next stages

File/image and gallery fields, attachment previews, download, detach, ordering,
and reference-aware deletion were implemented on 2026-09-30. A single file is a
UUID with an indexed RESTRICT foreign key; a gallery is a bounded ordered JSONB
array with a GIN index. `asmblyr_file_references` accelerates grant checks; actual
rows are checked before deletion to catch stale references from direct SQL.
Selecting/uploading files is currently limited to superusers; other callers may
retain, reorder or remove their existing attachments with field update access.
Cancelling a record draft keeps any uploaded file in the library.

Remaining: granular library/upload permissions; media folders; image transforms; multipart/streaming
uploads and resumability; automatic failed-intent cleanup; antivirus hooks and
retention. File fields are selected via **Добавить поле**, independently from the
collection relation editor. See [the five-feature contract](five-features.md).

References: [YC authentication](https://yandex.cloud/en/docs/storage/api-ref/authentication),
[WIF](https://yandex.cloud/en/docs/iam/operations/wlif/setup-wlif),
[access checks](https://yandex.cloud/en/docs/storage/security/overview).
