import { createHash } from "node:crypto";
import type { Knex } from "knex";
import type {
  FieldType,
  PrimaryKeyType,
  MaterializedViewCandidate,
} from "@asmblyr-collaborative/contracts";
import { fieldTypeFromDatabase } from "./field-types.js";
import { MaterializedViewNotPopulatedError } from "./source-access.js";

export interface MaterializedColumn {
  name: string;
  dataType: string;
  type: FieldType | null;
  nullable: boolean;
  maxLength: number | null;
}

export interface MaterializedSource {
  name: string;
  populated: boolean;
  columns: MaterializedColumn[];
  keys: { name: string; type: PrimaryKeyType }[];
  hash: string;
}

const identifier = /^[a-z][a-z0-9_]{0,62}$/;

export async function materializedSources(
  database: Knex,
  name?: string,
): Promise<MaterializedSource[]> {
  const result = await database.raw<{
    rows: {
      name: string;
      populated: boolean;
      column_name: string;
      data_type: string;
      nullable: boolean;
      max_length: number | null;
      unique_key: boolean;
    }[];
  }>(
    `
    SELECT c.relname AS name, c.relispopulated AS populated, a.attname AS column_name,
      pg_catalog.format_type(a.atttypid, NULL) AS data_type, NOT a.attnotnull AS nullable,
      CASE WHEN a.atttypid IN (1042, 1043) AND a.atttypmod >= 4 THEN a.atttypmod - 4 ELSE NULL END AS max_length,
      EXISTS (SELECT 1 FROM pg_catalog.pg_index i WHERE i.indrelid = c.oid
        AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL
        AND i.indexprs IS NULL AND i.indnkeyatts = 1 AND i.indkey[0] = a.attnum) AS unique_key
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind = 'm' AND a.attnum > 0 AND NOT a.attisdropped
      ${name === undefined ? "" : "AND c.relname = ?"}
    ORDER BY c.relname, a.attnum
  `,
    name === undefined ? [] : [name],
  );
  const sources = new Map<string, MaterializedSource>();
  for (const row of result.rows) {
    let source = sources.get(row.name);
    if (!source) {
      source = {
        name: row.name,
        populated: row.populated,
        columns: [],
        keys: [],
        hash: "",
      };
      sources.set(row.name, source);
    }
    source.columns.push({
      name: row.column_name,
      dataType: row.data_type,
      type: fieldTypeFromDatabase(row.data_type),
      nullable: row.nullable,
      maxLength: row.max_length,
    });
    const keyTypes: Record<string, PrimaryKeyType> = {
      uuid: "uuid",
      integer: "serial",
      bigint: "bigserial",
      text: "text",
      "character varying": "text",
    };
    const type = keyTypes[row.data_type];
    if (row.unique_key && type && identifier.test(row.column_name)) {
      source.keys.push({ name: row.column_name, type });
    }
  }
  for (const source of sources.values()) {
    source.hash = createHash("sha256")
      .update(JSON.stringify(source.columns))
      .digest("hex");
  }
  return [...sources.values()];
}

export function materializedProblem(
  source: MaterializedSource,
): MaterializedViewCandidate["problem"] {
  if (!identifier.test(source.name)) {
    return "unsupported-name";
  }
  if (source.columns.some((c) => !c.type || !identifier.test(c.name))) {
    return "unsupported-fields";
  }
  if (!source.keys.length) {
    return "missing-key";
  }
  if (!source.populated) {
    return "not-populated";
  }
  return null;
}

export async function verifyMaterializedSource(
  database: Knex,
  name: string,
  hash: string | null | undefined,
  key: { name: string; type: PrimaryKeyType },
  requirePopulated = true,
): Promise<void> {
  const [source] = await materializedSources(database, name);
  if (
    !source ||
    source.hash !== hash ||
    !source.keys.some((k) => k.name === key.name && k.type === key.type)
  ) {
    throw Object.assign(
      new Error(
        "Materialized view structure changed; reconnect it in Collections",
      ),
      {
        statusCode: 409,
        code: "MATERIALIZED_VIEW_CHANGED",
      },
    );
  }
  if (requirePopulated && !source.populated) {
    throw new MaterializedViewNotPopulatedError();
  }
}
