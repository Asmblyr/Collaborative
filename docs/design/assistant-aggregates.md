# Assistant aggregates and grouping

Implemented 2026-10-02 through the [internal MCP](internal-mcp.md).

## User flow

The assistant can answer questions such as «Какие пять площадок имеют больше
всего активных категорий?» or «Каковы сумма и среднее по этой выборке?».
It describes the collection, resolves configured business terms and computes
metrics in PostgreSQL over **all matching records**. It does not add up record
pages or download the collection into the model context.

Results can be presented as a Markdown table. A group with an exact supported
filter gets a server-generated result ID; the assistant can select it through
`present_selection`. The existing “Открыть записи” card opens that group's rows
with the original search, resolved terms and group conditions. Current rights,
schema, MCP exposure and collection UUID are revalidated before presentation
and again on click. Card counts are snapshots, while the table reads current data.

## Contract

`aggregate_items` requires `describe_collection` first:

```json
{
  "collection": "shop_categories",
  "q": "",
  "filter": "",
  "terms": null,
  "groupBy": ["shop_id"],
  "metrics": [{ "operation": "count", "field": null }],
  "orderBy": { "metric": 0, "direction": "desc" },
  "page": 1,
  "limit": 5
}
```

For a business term, use the term UUID returned by `describe_collection`.
In the assistant, null collection selects the current collection; null search
and filter inherit its page conditions. On another collection they use empty
conditions. Shared MCP itself always requires an explicit collection.

- `groupBy`: zero to three distinct physical scalar columns. An empty array
  produces one total. M2O foreign keys are supported. Related dot paths,
  virtual to-many fields, JSON and file arrays are not groupable.
- `metrics`: one to five distinct operation/field pairs. `count` with a null
  field counts rows. Field `count` and `count_distinct` exclude NULL.
  `sum`/`avg` accept integer or decimal fields; `min`/`max` additionally accept
  datetime. Available operations are advertised per direct `filterPath`.
- `orderBy`: zero-based metric index and direction; null defaults to metric
  zero descending. Ties use original group keys ascending, NULL last.
- `page`: 1–50; ungrouped totals require page 1. `limit`: 1–20 groups.
  `hasMore` refers to groups, not records. Partial groups cannot establish
  a grand total; request an ungrouped aggregate separately when needed.

The response includes ordered metric values, group keys, each group's row count,
canonical conditions and `encoding: "text"`. Numeric values remain decimal
strings to preserve bigint/numeric precision. SQL sorts original typed values
before projecting text. Empty totals have count zero and null sum/avg/min/max;
grouped queries with no matching rows have no groups. NULL differs from zero
and from an empty string.

Grouping happens before preview clipping. Long keys are clipped to 255 characters
and marked in `truncatedFields`, so groups with matching previews remain distinct.
Datetime keys use UTC ISO text and preserve database microseconds. A group gets
`selectable: false` if its exact filter cannot pass ordinary item validation:
for example clipped text, sub-millisecond dates, or filter complexity overflow.
It still contributes a valid aggregate; no misleading navigation card is created.

## Permissions and query design

The tool reloads the original human session and current permissions on every
call. Collection exposure and read grants apply, including every grouping and
metric field. The ordinary filter resolver checks relation conditions and target
fields. Administrator terms are ANDed with the query as in existing data tools.

`items/read-query.ts` provides the same predicates as item listing and counting.
Relation filters use EXISTS and do not multiply source rows. Queries run inside
the shared read-only transaction, hold the source table's schema lock, verify
stable collection identity, and retain the five-second statement timeout.
Cancellation is checked between database operations. SQL functions come from
a fixed allowlist and identifiers use Knex bindings. There are no model-provided
SQL expressions, write operations, new public endpoints or schema migrations.

Names of related entities require separate authorized reads. Grouping a foreign
key does not implicitly expose its target fields. Calendar buckets, grouping by
related labels, HAVING conditions and to-many grouping are future capabilities.
Large scans can time out; adding indexes should follow actual query plans and
workload measurements rather than automatically indexing every groupable field.

## Verification

- Isolated PostgreSQL tests cover exact large decimals, nullable/empty totals,
  native numeric sorting and group pagination, relation filters, inherited search
  and terms, ordinary API drilldown parity, long duplicate previews, timestamp
  precision, filter complexity, permissions, disabled MCP, cancellation and
  changed collection identity.
- Strict input tests reject expressions, dot paths, malformed metrics, extra
  properties and ambiguous ordering. Presentation tests preserve OR and NULL.
- Core TypeScript, ESLint and all 46 assistant tests pass.

Live GLM verification returned the five largest groups of active categories:
Wildberries_APP — 276, Ozon — 225, Yandex.Market — 140,
Yandex.lavka_APP — 106, Ozon Fresh — 105. The configured “Активные” term
resolved to `status = published`. All counts matched an independent read-only
SQL query. The first group's card opened the normal item table with the exact
status/shop filters and `1–25 из 276` in pagination.

The successful turn took 45.8 seconds, 6 model calls and 11 tool calls,
43,227 input and 1,481 output tokens. An initial development-runtime attempt
returned generic errors from several data tools; after Core reloaded, a separate
count and the full repeated request succeeded without tool errors. The initial
failure was not reproduced or conclusively diagnosed.

Screenshot: aggregate result and source records (локальный артефакт, не публикуется).
