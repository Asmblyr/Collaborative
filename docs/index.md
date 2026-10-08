# Collaborative

An open-source workspace for PostgreSQL data. The admin interface brings together
collection schemas, record editors, team permissions, files, and integrations.
The project is in early beta; each team runs its own installation.

[GitHub](https://github.com/Asmblyr/Collaborative) · [Releases](https://github.com/Asmblyr/Collaborative/releases)

<a id="начать"></a>

## Get started

- [Features and limits](./guide/features.md)
- [First-time setup](./guide/getting-started.md)
- [Docker, production, and upgrades](./guide/deployment.md)
- [HTTP API](./reference/http.md)
- [TypeScript SDK](./reference/sdk-guide.md) and [CLI](./reference/cli-guide.md)

<a id="работа-с-продуктом"></a>

## Using the product

The guides cover [data](./features/data.md), [permissions](./features/access.md),
[users](./features/identity.md), [files](./features/files.md),
[settings](./features/settings.md), [workspaces](./features/workspaces.md),
[monitoring](./features/monitoring.md), [integrations](./features/integrations.md),
[the assistant](./features/assistant.md),
[discussions and notifications](./features/notifications.md),
[localization](./features/localization.md), and [plugins](./features/plugins.md).
Each describes the current contract and its limits.
[Personal Google Drive and Sheets connections](./features/google-workspace.md) have a separate guide.
[Live collaboration](./features/realtime.md) covers presence, saved-record updates,
field locks, and transport limits.

| Task                                                             | Read more                                                       |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Collections, fields, relationships, records, filters, and search | [Data](./features/data.md)                                      |
| Table views and workspaces                                       | [Workspaces](./features/workspaces.md)                          |
| Users, sign-in, and sessions                                     | [Identity](./features/identity.md)                              |
| Policies, permissions, and row conditions                        | [Access](./features/access.md)                                  |
| Files and S3                                                     | [Files](./features/files.md)                                    |
| API authentication, pagination, errors, and examples             | [HTTP](./reference/http.md) and [SDK](./reference/sdk-guide.md) |

<a id="разработка-и-эксплуатация"></a>

## Development and operations

- [Local development and checks](./development/local-development.md)
- [Architecture](./development/architecture.md)
- [Collaborative Live architecture](./architecture/realtime.md)
- [Your first plugin](./development/first-extension.md)
- [Assistant architecture and model context](./development/assistant-architecture.md)
- [Published packages](./reference/packages.md)
- [Documentation workflow](./development/documentation.md)
- [Operations and recovery](./development/operations.md)
- [Security boundaries](./security/overview.md)
- [Branding and public assets](./assets/brand/README.md)
- [Contributing](https://github.com/Asmblyr/Collaborative/blob/main/CONTRIBUTING.md)

The site is available in English and Russian. English is the default; the language
menu opens the corresponding page in the other language. SDK and Kit guides are
maintained in their source packages and copied into `reference` during generation.
API identifiers and contracts are shared by both versions.
