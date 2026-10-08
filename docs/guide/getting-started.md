<a id="локальныи-запуск"></a>

# Local setup

Install Node.js 22+, pnpm 11.13.1, and Docker Compose. Run commands from the repository root.

In a Unix shell, use `cp -n apps/core/.env.example apps/core/.env` instead of
`Copy-Item` below. Preserve any existing environment file.

```powershell
pnpm install --frozen-lockfile
pnpm db:up
if (!(Test-Path apps/core/.env)) { Copy-Item apps/core/.env.example apps/core/.env }
pnpm db:migrate
pnpm dev
```

Copy the example only if you do not have an `.env` file. Before first-time setup,
set a random `ASMBLYR_SETUP_TOKEN` of at least 32 characters in that file. Keep it out of Git.

| Component        | Address                       |
| ---------------- | ----------------------------- |
| Admin UI         | `http://localhost:3000`       |
| Core             | `http://127.0.0.1:3001`       |
| PostgreSQL       | `127.0.0.1:5433`              |
| First-time setup | `http://localhost:3000/setup` |

At `/setup`, enter the setup secret, email, and a password of at least 12 characters.
This creates the first superuser. Once a user exists, the endpoint closes and you
can remove the setup secret from configuration. Public password registration is not available.

`pnpm dev` first builds SDK, Kit, and bundled plugins. The server-side UI setting
`CORE_URL` points to local Core by default. `GET /health` checks the process;
`/ready` checks the database and required migrations.

`pnpm db:down` stops PostgreSQL without deleting its volume. Do not add `-v` if
you need to retain the data. Run `pnpm db:migrate` before upgrading an existing
installation; rolling back DDL can destroy data.

For Docker Compose installation, external PostgreSQL/S3, and production upgrades,
see [deployment](./deployment.md).

<a id="документация"></a>

## Documentation

```powershell
pnpm docs:dev
pnpm docs:build
```

The first command generates the reference pages. The static site is built into
`docs/.vitepress/dist` and can be served by any static host. English is at `/` and
Russian at `/ru/`. OpenAPI is also available as JSON. Use the browser's print
feature to print pages; there is no separate PDF book pipeline.
