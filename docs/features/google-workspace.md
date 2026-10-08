<a id="google-workspace-в-ассистенте"></a>

# Google Workspace in the assistant

The optional `@asmblyr-collaborative/plugin-google-workspace` package adds Google Drive file search, text and Google Docs reading, Google Sheets structure, and range reads. Writes are prepared as proposals with exact data; the user reviews them in a side panel and selects Confirm change.

<a id="настроика-установки"></a>

## Installation configuration

Enable Drive API and Sheets API in Google Cloud. Create a separate OAuth web client for the assistant with an External audience. Register `https://admin.example.com/connections/google/callback`; local development may use `http://localhost:3000/connections/google/callback`.

Open Google Workspace at `/admin/settings/integrations`, enter client ID, redirect URI, and a write-only client secret, then enable it. Configure a [local or Yandex KMS key](./connections.md) on the server. Configuration testing checks parameters and encryption; a real OAuth connection validates the client secret and registered callback.

Alternatively set `GOOGLE_WORKSPACE_ENABLED=true`, `GOOGLE_WORKSPACE_CLIENT_ID`, `GOOGLE_WORKSPACE_CLIENT_SECRET`, and `GOOGLE_WORKSPACE_REDIRECT_URI` in Core. Any of these environment settings locks the entire admin group. Enable the package in root `asmblyr.plugins` and approve `connections.google` in `asmblyr.pluginPermissions`. Removing the package removes its tools but preserves personal connections until explicitly disconnected.

Requested scopes are `openid`, `email`, `profile`, full `drive`, and `spreadsheets`. Access follows the user's file permissions, including shared-drive ACLs. Google Testing permits only listed testers; refresh tokens for these scopes normally expire after seven days. Public applications need Google verification and a published privacy policy. Workspace administrators may block third-party apps. See [Google OAuth](https://developers.google.com/identity/protocols/oauth2) and [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

<a id="личное-подключение"></a>

## Personal connection

Open Connections in the assistant or `/settings?tab=applications`, select Connect Google, and consent in Google. The connection belongs to the active human. Service accounts, other users, and administrators cannot use it through the interface. Collaborative sign-in and Google API connection are separate flows; email never automatically links profiles.

OAuth uses authorization code, PKCE S256, state, nonce, issuer, ID-token, and subject validation through `openid-client`. The flow binds to the user, client configuration, and HttpOnly browser cookie, expires after ten minutes, and is single-use. Callback requires an active Collaborative session. Disabling the connection during callback cancels the flow.

Tokens and PKCE proof are encrypted in PostgreSQL with per-record AAD. Switching local/KMS re-encrypts these secrets in the same transaction. KMS failures never automatically fall back to local encryption.

Tokens refresh on the server. `invalid_grant`, client changes, or revoked access require reconnecting. Tokens never reach the model, plugin, or browser JavaScript. Disconnecting deletes local secrets/proposals and then attempts to revoke the Google grant. If revocation fails, the UI asks the user to revoke it in Google too. Encryption failure sets personal status `unavailable`; account metadata and local disconnect remain available. An external request already in flight cannot be reliably cancelled.

<a id="инструменты-и-ограничения"></a>

## Tools and limits

| Tool             | Behavior                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `find-files`     | Name search, 25 files per page, source URLs, next-page token                                                 |
| `read-text`      | Text files and plaintext Google Docs export, up to 30 KB with explicit truncation                            |
| `describe-sheet` | Spreadsheet title, tab names and dimensions                                                                  |
| `read-cells`     | Explicit A1 rectangle, up to 500 cells and 36 KB                                                             |
| `propose-write`  | Propose text-file creation/replacement, rename, trash, spreadsheet creation, cell replacement, or row append |

Sheets values use RAW mode, so strings do not become formulas. Rectangle dimensions must match the values array. `append_cells` adds rows after the logical table Google finds within the given range and shifts later rows; confirmation explains this.

Native Google Docs content editing, arbitrary binary documents, OCR, Slides, file attachments, and continuous indexing are outside this package.

Tools require an active personal connection, approved capability, and enabled data access in Assistant connections. Page context is separate and unnecessary for Google. A connection allows chat without collection grants but adds no Core data access. Disabling a collection in MCP keeps it closed while personal Google tools remain available.

Documents and cells are untrusted data. Requested excerpts are sent to the configured AI provider. Granting access does not initiate a crawl of all files.

Drive calls use `www.googleapis.com/drive/v3`; Sheets calls, including creation and writes, use `sheets.googleapis.com/v4`. Tool errors distinguish reconnect requirements, Google denial, missing files, rate limits, invalid parameters, and network failure. Fixed messages prevent Google error contents and tokens reaching the model. A failed request does not prove lack of file access.

Proposals expire after twenty minutes, with up to 32 pending per user. Payloads are encrypted; confirmation binds to the same owner and connection. The model has no confirmation tool. HTTP confirmation executes the saved payload and accepts no replacement content from the browser. File versions or range values are checked before writing, but a small race remains between that check and Google's write because PostgreSQL and Google share no transaction.

Confirmation is single-use. Failure after sending the write becomes `uncertain`: inspect the file before proposing again. Restarting during a write leaves `executing`, without retry. Audit records only provider, operation kind, and outcome. Cleanup removes expired proposals and flows.

Cards show Completed, Rejected, Failed, or Check result. The last covers uncertain and surviving executing states and does not claim Google left the file unchanged. Changed targets show a rejection reason and suggest a new proposal.

View result remains available after completion. The side panel shows the original proposal, bounded outcome, and status refresh. Refresh performs only GET and never repeats a write. If a confirmation response is lost, the UI reconciles server status while preventing a second submission.

Successful operations store an encrypted bounded result: file/spreadsheet link, changed cell/row counts, and range when supplied by Google. Arbitrary provider responses are not stored. Links are built from IDs on Google domains. Existing targets keep their link even when the outcome is unknown; new files receive one only after a confirmed response with their ID.

Rejection records `cancelled` without sending a Google write. Proposal/result viewing remains limited to the original twenty-minute lifetime, owner, and connection. Expiry or disconnection disables server-side viewing. Restored chat history does not activate old cards.

Core `/connections/google`, OAuth start/callback, and owner-bound `/connections/google/writes/:id` contracts appear in [HTTP API](../reference/http.md). The plugin uses ordinary H3 file routes and `defineModelContext`; Kit generates schemas. Disposable-database tests with a local Google adapter: `node scripts/test.mjs core-connections`.
