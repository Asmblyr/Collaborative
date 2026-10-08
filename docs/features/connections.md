<a id="подключения-и-защита-секретов"></a>

# Connections and secret protection

Superusers manage connections at `/admin/settings/integrations`. Each list entry opens a side panel with safe parameters, key status, connection testing, and an enable switch. Core picks up changes without restart, including other instances using the same database.

[Sentry monitoring](./monitoring.md) has a separate page at `/admin/settings/monitoring`. DSNs use the same write-only secrets, revisions, local encryption/Yandex KMS, and environment priority.

<a id="источники-настроек"></a>

## Configuration sources

Nonempty Core environment parameters take precedence over admin settings. The entire corresponding group becomes read-only; the API rejects changes with 409. Empty example variables do not lock a group. Explicit `ASSISTANT_ENABLED=false` or `FILES_STORAGE=disabled` disables and locks that connection. Incomplete environment configuration is not supplemented with saved admin keys.

Environment changes require a Core restart. Admin changes apply automatically.

The API returns safe values such as API URL, model, bucket, region, source, and key-presence flags. URLs containing credentials, query strings, or fragments are rejected. Secrets are write-only: omission preserves the old value, `null` removes it, and an empty string is invalid. Disabling a connection retains its parameters and secrets.

Read-only S3 settings allow selecting/copying the bucket, region, endpoint, and service-account ID. Access keys cannot be revealed or copied; provider and enable switches remain locked.

`GET /settings/integrations`, `PUT /settings/integrations/:section`, and `POST /settings/integrations/:section/test` require an active human superuser. Sections are `storage`, `assistant`, and `encryption`. Updates supply the current `revision`; stale or concurrent requests return 409. Delegated files/update or assistant/update grants do not expose connection keys. Connection tests allow 12 requests per minute under the credential rate-limit rules.

<a id="фаилы-и-ассистент"></a>

## Files and assistant

S3 supports bucket, region, HTTPS endpoint, and separate access/secret/session keys. Yandex Object Storage also supports OIDC → IAM federation without a permanent S3 key: configure bucket and service-account ID in the admin, and `YC_OIDC_TOKEN_FILE` with a refreshed projected token on the server. Existing `FILES_YC_*` settings continue to work. Operators create the bucket, federation, service account, and IAM policies.

The S3 test runs HeadBucket without uploading files. Core prevents changing storage location while files exist; moving files is a separate operator task. Disabling storage preserves metadata, but uploading/downloading bytes requires an enabled connection.

The AI provider supports OpenAI-compatible Responses and Chat Completions, base URL, model, output limit, timeout, and supported reasoning/thinking settings. Its API key is encrypted. Testing calls `GET /models` without generating content. This checks endpoint availability, not access to a particular model; some compatible providers do not implement model listing. Instructions and telemetry remain on the Assistant page.

<a id="шифрование"></a>

## Encryption

Reversible secrets saved by these admin settings are stored in PostgreSQL as versioned ciphertext. Passwords and session/access tokens remain hashes. OAuth signing keys and environment secrets remain operator configuration.

OAuth application secrets and protocol payloads retain their existing encryption using `OAUTH_KEYS_FILE`. The connection-secret provider does not change active OAuth sessions.

| Mode       | Admin configuration                   | Server bootstrap                                                                                     |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Local      | Select the local provider             | `SECRETS_LOCAL_KEY`: 32 random bytes, base64url                                                      |
| Yandex KMS | Symmetric key and service-account IDs | `YC_OIDC_TOKEN_FILE`: projected OIDC token, federation, and `kms.keys.encrypterDecrypter` on the key |

Local encryption uses AES-256-GCM with a random nonce and AAD binding each secret to its installation and field. KMS uses native REST encrypt/decrypt with AAD and a short-lived federated token; the KMS key is never sent to the application. Each secret is limited to 8000 UTF-8 bytes. Lockbox is not involved: KMS protects ciphertext stored in the database.

Changing provider or KMS key ID validates the new key, decrypts with the old one, and re-encrypts in one transaction. Failure preserves the previous state; there is no automatic fallback to the local key. Change provider in the admin first, then optionally lock it with `SECRETS_PROVIDER`, `SECRETS_YC_KMS_KEY_ID`, and `SECRETS_YC_SERVICE_ACCOUNT_ID`. An incompatible environment override blocks secret reads until configuration is consistent again.

The bootstrap key is not set through the admin. Do not replace it with a random new value on an existing installation: old ciphertext requires the old key. Database backups need a separate protected copy of the local key or continued access to the relevant KMS key versions. After moving to KMS, the old local key may still be needed to restore older backups.

Neither secrets nor ciphertext appear in audit logs or API responses. Audit events contain only section, provider, and key count. Settings remain viewable while KMS is unavailable, but connections need successful secret retrieval. Existing clients may retain decrypted keys in memory until configuration changes or the process stops.

See [Yandex Workload Identity Federation](https://yandex.cloud/en/docs/iam/concepts/workload-identity) and [KMS symmetric encryption](https://yandex.cloud/en/docs/kms/concepts/symmetric-encryption).
