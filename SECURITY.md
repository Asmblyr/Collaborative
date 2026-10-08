# Security

<!-- languages -->

[English](SECURITY.md) · [Русский](SECURITY.ru.md)

<!-- /languages -->

The project is in early beta. Changes are assessed against current main; supported stable release branches have not yet been announced.

## Reporting a vulnerability

If Report a vulnerability is available under [Security](https://github.com/Asmblyr/Collaborative/security), use it for a private report. Otherwise open an issue requesting a private channel without exploitation details or user data.

Never publish live tokens, passwords, dumps, user data, or details of an unfixed vulnerability. Private reports should include version/commit, minimal reproduction with fictional data, impact, and required access.

## Deployment

Use a separate installation per team. Workspaces do not isolate companies. Keep PostgreSQL/S3 private and provide HTTPS, installation-specific configuration, and backups.

Server plugins run trusted code inside Core. Capability approval is not a sandbox. Do not install untrusted server packages.

See [security boundaries](docs/security/overview.md) and [operations/recovery](docs/development/operations.md).
