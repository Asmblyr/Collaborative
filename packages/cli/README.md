# @asmblyr-collaborative/cli

Connect a TypeScript project to an Asmblyr installation and generate collection
and plugin types from the access available to the signed-in user. Node.js 22+.
Install the preview CLI alongside the SDK:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
npx asm connect --url https://asmblyr.example.test
```

From this repository, build the packages and use the workspace command:

```sh
pnpm build:packages
pnpm exec asm connect --url https://asmblyr.example.test
pnpm exec asm schema pull
pnpm exec asm generate
pnpm exec asm schema check
pnpm exec asm schema check --offline
```

With no credential, online commands open the admin sign-in/consent page. They
accept a Core API root, UI URL or UI /api root and discover the API when necessary.
Use --no-browser to open the displayed approval URL yourself. Approval grants
schema:read for 10 minutes, bound to the human session and PKCE S256. It cannot
read or change records. The credential stays in command memory; subsequent online
commands request approval again. Revoking the session also revokes this access.
AUTH_UI_URL on Core must point to the reachable admin origin.

For CI, provide ASMBLYR_ACCESS_TOKEN or --token-stdin and an explicit Core API or UI
/api root. Credentials are never written to generated files. HTTPS is required
except on localhost; HTTP redirects are rejected.

connect creates asmblyr.config.json, asmblyr.schema.json and asmblyr.schema.ts.
It preserves existing files; schema pull refreshes an existing connection.
--config, --schema-file and --types-file select relative project paths.
asm generate (also asm schema generate) rebuilds the TypeScript file from the
saved, hash-verified snapshot without network or credentials.

```ts
import { createClient } from "@asmblyr-collaborative/sdk";
import { schema } from "./asmblyr.schema.js";

const client = createClient({
  baseUrl: "https://asmblyr.example.test",
  accessToken: process.env.ASMBLYR_ACCESS_TOKEN,
  schema,
});
const articles = await client.Articles.select((a) => [a.id, a.title])
  .where((a) => a.status.eq("published").and(a.price.gte("1000.00")))
  .orderBy((a) => a.created_at.desc())
  .limit(20)
  .exec();
```

The example assumes those collections and fields exist. Runtime data access uses
your separate API credential or browser session, never the CLI schema credential.
Read/Create/Update maps distinguish required fields, readonly values and closed
choices. Collection aliases derive from technical names (articles → Articles).
collection("articles") also offers completion. Selected rows contain only the
selected properties, which remain optional to reflect effective field permissions.
Decimal/bigint values stay strings; dates/timestamps use API strings. There is no
custom TypeScript transformer or consumer build plugin.

Generated Kit model handlers expose typed methods, for example
client.plugins.calculator.calculate(input). They call the original plugin HTTP
handler. Input/output contracts and AccessGate still apply on Core; a personal
OAuth connection can also be required at execution time. Legacy actions without
generated output schemas are omitted. Browser schemas and runtime clients do not
import the Node-only generator.

schema check exits 1 if the remote schema or generated types changed. --offline
checks saved schema and source. The snapshot contains accessible field types,
permissions and generated plugin JSON contracts, without defaults, policy
conditions, records or secrets. Collection names, choices and plugin annotations
may still be private: commit generated files only when suitable for your project.
Use the same permission scope for generation and runtime requests. Core remains
the authority on current access and row conditions.

See [SDK](../sdk/README.md) and [package preparation](../../docs/reference/packages.md).
