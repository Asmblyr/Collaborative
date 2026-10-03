import type { Knex } from "knex";
import type { AggregateInput, AggregateMetric } from "./aggregate-input.js";
import type { FilterFieldType } from "../items/filter-fields.js";

export const aggregateGroupChars = 255;
export interface AggregateGroup {
  values: Record<string, string | null>;
  metrics: (string | null)[];
  count: string;
  truncatedFields: string[];
}

function metricSql(
  db: Knex,
  collection: string,
  metric: AggregateMetric,
  index: number,
): Knex.Raw {
  const alias = `m${index}`;
  if (metric.field === null) return db.raw("count(*) as ??", [alias]);
  const column = `${collection}.${metric.field}`;
  // Function names are fixed SQL, while identifiers always use Knex bindings.
  const functions = {
    count: "count(??) as ??",
    count_distinct: "count(distinct ??) as ??",
    sum: "sum(??) as ??",
    avg: "avg(??) as ??",
    min: "min(??) as ??",
    max: "max(??) as ??",
  } as const;
  return db.raw(functions[metric.operation], [column, alias]);
}

export async function aggregateQuery(
  db: Knex,
  source: Knex.QueryBuilder,
  name: string,
  input: AggregateInput,
  groupTypes: FilterFieldType[],
): Promise<{ groups: AggregateGroup[]; hasMore: boolean }> {
  const grouped = source
    .clone()
    .select(db.raw("count(*) as ??", ["row_count"]));
  for (const [index, field] of input.groupBy.entries()) {
    grouped.select(db.raw("?? as ??", [`${name}.${field}`, `g${index}`]));
    grouped.groupBy(`${name}.${field}`);
  }
  for (const [index, metric] of input.metrics.entries())
    grouped.select(metricSql(db, name, metric, index));

  const alias = "aggregate_result";
  const query = db.from(grouped.as(alias));
  query.select(db.raw("??::text as ??", [`${alias}.row_count`, "row_count"]));
  input.groupBy.forEach((_field, index) => {
    if (groupTypes[index] === "datetime") {
      query.select(
        db.raw("to_char(?? at time zone 'UTC', ?) as ??", [
          `${alias}.g${index}`,
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"',
          `g${index}`,
        ]),
      );
      return;
    }
    query.select(
      db.raw("left(??::text, ?) as ??", [
        `${alias}.g${index}`,
        aggregateGroupChars + 1,
        `g${index}`,
      ]),
    );
  });
  input.metrics.forEach((_metric, index) => {
    query.select(db.raw("??::text as ??", [`${alias}.m${index}`, `m${index}`]));
  });
  // Qualify aliases to sort native numeric/date values, never the text projection.
  query.orderBy(
    `${alias}.m${input.orderBy.metric}`,
    input.orderBy.direction,
    "last",
  );
  for (let index = 0; index < input.groupBy.length; index++)
    query.orderBy(`${alias}.g${index}`, "asc", "last");
  const rows: Record<string, string | null>[] = await query
    .limit(input.limit + 1)
    .offset((input.page - 1) * input.limit);
  const groups = rows.slice(0, input.limit).map((row): AggregateGroup => {
    const truncatedFields: string[] = [];
    const values = Object.fromEntries(
      input.groupBy.map((field, index) => {
        let value = row[`g${index}`] ?? null;
        if (value !== null && groupTypes[index] === "datetime") {
          // API predicates support milliseconds. Preserve finer database precision
          // in the result; those groups will be marked non-selectable by the parser.
          value = value.replace(/(\.\d{3})000Z$/, "$1Z");
        }
        if (value !== null && value.length > aggregateGroupChars) {
          truncatedFields.push(field);
          return [field, value.slice(0, aggregateGroupChars)];
        }
        return [field, value];
      }),
    );
    return {
      values,
      metrics: input.metrics.map((_metric, index) => row[`m${index}`] ?? null),
      count: row.row_count!,
      truncatedFields,
    };
  });
  return { groups, hasMore: rows.length > input.limit };
}
