<a id="деиствия-плагинов-http-mcp-и-ассистент"></a>

# Plugin actions: HTTP, MCP, and the assistant

The current contract uses H3 v2 file routing, typed annotations, and one handler. There is no public MCP endpoint yet. See [Kit](../reference/kit-guide.md) for plugin development.

<a id="объявление"></a>

## Declaration

server/api/calculator/calculate.post.ts:

```ts
import {
  AccessGate,
  defineHandler,
  defineModelAnnotation,
  defineModelContext,
} from "@asmblyr-collaborative/kit";
import type { CalculationInput } from "../../../shared/calculation.ts";

const annotate = defineModelAnnotation({
  title: "Calculate price",
  description: "Calculate subscription cost from the user's parameters.",
  middleware: AccessGate.authenticated,
  readOnly: true,
  page: "home",
});

export default defineModelContext<CalculationInput>(
  defineHandler(async (event) => {
    // Core validated JSON before entry; use ordinary H3 and domain logic here.
    const input = (await event.req.json()) as CalculationInput;
    return { total: input.users * input.monthlyPrice * input.months };
  }),
  annotate,
);
```

See [calculator](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/calculator/server/api/calculator/calculate.post.ts) for minor-unit arithmetic and rounding. The snippet demonstrates declaration, not monetary arithmetic.

- File paths determine method and URL. Model handlers require a static .post.ts route inside their namespace. IDs derive from the remaining path, joining nested segments with hyphens. Collisions stop startup.
- plugin.ts remains definePlugin({}). There is no manual registry, separate server/actions directory, or generic /extensions/:namespace/actions/:action route.
- defineModelContext explicitly publishes a tool. Plain H3 endpoints are invisible to MCP. Annotations use native H3 metadata.
- Middleware supports AccessGate.authenticated or AccessGate.superuser. Additional domain middleware belongs inside defineHandler.
- Page optionally names the page accepting a prepared result. ReadOnly defaults false; set true for calculations.
- Legacy defineAction/defineActionContract remain deprecated for compatibility. New code uses this API. bindModelDefinition is for Core's loader, not plugin authors.

<a id="генерация-и-валидация"></a>

## Generation and validation

The plugin builder analyzes Input and the inner handler's return type before TypeScript erases them. Async results are unwrapped from Promise. An explicit output interface is optional.

Supported types: strings, numbers, booleans, literals, null, field unions, arrays (including readonly), and nested objects with known keys. Root input/output must be objects. Every property is required; represent absence with null. Extra keys are forbidden, including in nested objects.

Any, unknown, optional properties, recursion, index signatures, classes, functions, tuples, and non-JSON types fail the build rather than silently accepting arbitrary data. Complexity limits are 20 levels and 1000 nodes. Plugins need a tsconfig. The direct wrapper call must be the default export or initializer of a default-exported local variable. Aliased defineModelContext imports work; arbitrary wrapper factories do not.

JSDoc supplies property descriptions and constraints:

```ts
export interface CalculationInput {
  /**
   * Number of users.
   * @title Users
   * @integer
   * @minimum 1
   * @maximum 100000
   */
  users: number;
}
```

Normal comments become descriptions. Supported tags: @title, @description, @integer, @minimum, @maximum, @multipleOf, @minLength, @maxLength, @minItems, @maxItems. Numeric constraints apply to simple property types. Incompatible types, unknown tags, and invalid bounds fail generation.

Schemas go to .asmblyr/models/&lt;route-path&gt;.json and the production route index. .asmblyr is ignored. Type/schema failures leave previous dist output intact. The source loader regenerates schemas before loading handlers, so shared-type changes apply after a development Core restart. Missing schemas on annotated handlers prevent loading.

Core validates input before and output after the handler, using Zod from generated JSON Schema. A generic alone does not validate at runtime outside Core.

Forms import JSON and use useAction&lt;Input, Output&gt;(model, props, options) from @asmblyr-collaborative/kit/ui/use-action. modelField from @asmblyr-collaborative/kit/model returns field label/description. Enable resolveJsonModule:true in tsconfig. Browser code must not import server handlers or root Kit. Run pnpm build:plugins for initial generation; pnpm dev already does this before UI startup.

<a id="права-и-данные"></a>

## Permissions and data

AccessGate.authenticated allows authenticated humans or services, not collection access. AccessGate.superuser adds superuser checks; discovery hides those tools from others and calls recheck access.

```ts
const items = useItems(event);
await items.update("articles", id, { title });
```

useItems(event) is shared by ordinary endpoints and model handlers. It uses the current caller and enforces collection/action/field access, relationships, validation, and Core history. Actors cannot be replaced or elevated. HTTP/MCP share the handler and items service. Denial returns HTTP 403 or MCP PERMISSION_DENIED without inaccessible record contents. Every MCP call rechecks session and permissions.

MCP additionally intersects collection publication: mcp.enabled=false blocks reading/writing, including filters, search, labels, and relation changes, even for superusers. HTTP grants are unaffected. ReadOnly:true blocks items create/update/delete/commit in both channels.

MCP deletion also rejects cascades/setNull/setDefault that could touch disabled collections, including cascade chains. This conservative schema check does not inspect hidden rows and applies even to empty child tables.

useActionContext(event) exposes actor, superuser, signal, and items. It does not expose full useAsmblyr context, privileged plugin storage, Knex, tokens, or cookies. Shared items enforces row rules. Query filters are not access policies; plugins cannot replace actors or expand grants.

Packages are trusted server code, without a sandbox. ReadOnly restricts supplied items, not an external client imported by a plugin. MCP hints reflect readOnly; arbitrary code has openWorldHint=true.

<a id="вызов-и-транзакции"></a>

## Invocation and transactions

- Core: POST /calculator/calculate.
- UI: POST /api/calculator/calculate directly in Core with a browser session.
- MCP: plugin_calculator\_\_calculate, JSON text and structured content.
- HTTP response: `{ data: { namespace, actionId, input, output } }`.

Handlers receive a normalized POST with validated JSON, excluding original auth headers, cookies, and query. H3 middleware runs in both channels. Return a JSON object: Response, redirect, streaming, header/status mutation are unsupported. Unwrapped endpoints retain the full HTTP API.

Each items write and its history are transactional; the arbitrary handler as a whole is not. Use items.commit for linked writes. Failure after a completed write, including output-schema failure, does not roll it back. Never automatically retry a timed-out write before checking its outcome.

Calls are limited to ten seconds and results to 48 KB. Cancellation stops waiting and blocks later items calls/prepared-form creation but cannot guarantee rollback of an already started write. Trusted handlers must observe signal.

<a id="подготовленная-форма-и-ответ-ассистента"></a>

## Prepared forms and assistant results

A successful action with page creates a private input/output snapshot lasting twenty minutes: at most 32 per user and 256 per installation. PostgreSQL storage makes snapshots available across replicas and restarts until expiry. Form values never appear in URLs.

GET /extensions/:namespace/drafts/:id checks session, owner, namespace, and action access. Foreign/expired snapshots both return 404. Data-permission changes do not reread a snapshot from collections: it is the owner's already completed action result, not a new data query.

The assistant explains the result and calls present_plugin_result with a successful result ID from the current response. An Open page button appears; there is no automatic navigation. The result includes requiresUserClick:true. Forged IDs are rejected. A prepared form alone does not prove data changed.

useAction reports dirty/busy state to the host, validates IDs/output schema, and protects the form during assistant navigation or snapshot replacement. A universal guard for all menu navigation is not yet implemented. Partial forms and reading current manual drafts are unsupported. Fine-grained action permissions and public MCP remain future work.

<a id="проверка-изменении"></a>

## Change review

- Source and built discovery agree on routes/schemas, without a parallel registry.
- HTTP/MCP share a handler, H3 middleware, and input/output validation.
- Plain endpoints stay hidden from MCP; calls recheck superuser and revoked access.
- Items enforces action/field access, MCP publication, related collections, and read-only behavior.
- Forms use generated schemas without server imports.
- Owner/TTL checks, dirty-form protection, and user-click navigation remain intact.
- Documentation and calculator match the current API.

```sh
pnpm build:plugins
pnpm build:examples
node scripts/test.mjs core-plugins
```

The runner creates/removes disposable PostgreSQL databases. Never run integration tests directly on the project database. Verify UI changes in a browser too.

<a id="личные-подключения"></a>

## Personal connections

Annotation connection:"google" requires an active personal connection and approved connections.google capability. useActionContext(event).connections.google exposes a restricted broker without credentials. `proposeWrite` prepares an owner-bound proposal; Core owns confirmation and never exposes it in MCP. The Google plugin retains H3 file routes and type-generated schemas, without separate tool registration. See [Google Workspace](../features/google-workspace.md).
