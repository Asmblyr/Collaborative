<a id="фаилы-и-объектное-хранилище"></a>

# Files and object storage

Files store metadata in PostgreSQL and content in the configured S3 or Yandex Cloud backend. Collection fields reference files; Core checks access to their content.

| Operation                             | Required access                                                         |
| ------------------------------------- | ----------------------------------------------------------------------- |
| Library and file history              | Human with files/read or files/update; superuser                        |
| Upload, edit, delete                  | Human with files/update; superuser                                      |
| Metadata or download through a record | files/read, superuser, or read access to the field referencing the file |
| Resolve file references               | Only references accessible to the principal                             |

Downloads default to attachment/octet-stream. Previews use a restrictive CSP and `nosniff`. Uploads are buffered in memory and limited to 25 MiB. Storage credentials never reach the client.

<a id="настроика"></a>

## Configuration

Configure storage under Connections in the admin UI or through environment variables. Environment configuration locks the corresponding settings group in the UI. The operator provides the bucket and IAM permissions.

Yandex IAM authentication, including a federated token exchange, is an infrastructure connection. It is separate from GitLab login federation.

A new file reference requires files/read and write access to its record field. A readable record can expose an existing reference without granting library access. Revoking files/read closes the library and picker; read-only access cannot upload or edit files.

The library is shared by the installation, not restricted to the uploader. There are no per-file ACLs or workspace tenant boundaries. Stop writers when making consistent local backups.

<a id="публичная-ссылка-на-один-фаил"></a>

## Public files

Files are private by default. A human with files/update, or a superuser, can make a ready file public in its side editor or through `PATCH /files/:id`. The UI offers Copy link after saving. Invalid visibility values are rejected.

`GET /public/files/:id/content` in Core, exposed as `/api/public/files/:id/content`, serves public bytes without authentication. `preview=1` supports approved raster formats. There is no public listing or metadata endpoint. Private routes retain their access checks.

Anyone with the link can download a public file. No IAM credentials or SDK tokens are needed, and the bucket itself remains private. Switching back to private, deleting the file, or changing it to a non-ready state returns 404 before storage access. Responses use `no-store`, CSP, `nosniff`, and attachment disposition by default.

Revocation prevents future downloads; it cannot retract already downloaded bytes or a stream that has started.

<a id="ограничения"></a>

## Limits

Quotas, malware scanning, a dedicated transformation service, and automatic storage reconciliation are not implemented. PostgreSQL and S3 do not share a transaction; operators remain responsible for backup consistency and bucket privacy.

Sources: `apps/core/src/files/` and `apps/core/src/storage/`.
