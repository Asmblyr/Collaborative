import type { Knex } from "knex";
import type {
  SystemCollectionRecord,
  SystemRecordPage,
} from "@asmblyr-collaborative/contracts";
import { parseItem, parseItemId, ItemError } from "../items/validation.js";
import { databaseValues } from "../items/database-values.js";
import { validateFileWrites } from "../files/references.js";
import { objectInput } from "../shared/input.js";
import { customFields, lockSystemCollection } from "./repository.js";
import { systemCollection } from "./registry.js";

export async function listSystemRecords(
  db: Knex,
  name: string,
  input: unknown,
): Promise<SystemRecordPage> {
  const collection = systemCollection(name);
  const query = objectInput(input, ["page", "q"]);
  const page = query.page === undefined ? 1 : Number(query.page);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    (query.q !== undefined &&
      (typeof query.q !== "string" || query.q.length > 200))
  ) {
    throw new ItemError("Invalid page or search query", 400);
  }
  const rows = db(collection.table)
    .withSchema("public")
    .select("id", collection.label);
  if (typeof query.q === "string" && query.q.trim()) {
    const escaped = query.q.trim().replace(/[\\%_]/g, "\\$&");
    rows.whereILike(collection.label, `%${escaped}%`);
  }
  const result = await rows
    .orderBy(collection.label)
    .orderBy("id")
    .offset((page - 1) * 25)
    .limit(26);
  return {
    records: result
      .slice(0, 25)
      .map((row) => ({ id: row.id, label: row[collection.label], values: {} })),
    page,
    hasMore: result.length > 25,
  };
}

export async function readSystemRecord(
  db: Knex,
  name: string,
  id: string,
): Promise<SystemCollectionRecord> {
  parseItemId(id, "uuid");
  return db.transaction(async (transaction) => {
    const collection = await lockSystemCollection(
      transaction,
      name,
      "ACCESS SHARE",
    );
    const fields = await customFields(transaction, name);
    const columns = fields.map((field) => field.field_name);
    const row = await transaction(collection.table)
      .withSchema("public")
      .where({ id })
      .first("id", collection.label, ...columns);
    if (!row) {
      throw new ItemError("Record not found", 404);
    }
    return {
      id: row.id,
      label: row[collection.label],
      values: Object.fromEntries(
        columns.map((column) => [column, row[column]]),
      ),
    };
  });
}

export async function updateSystemRecord(
  db: Knex,
  name: string,
  id: string,
  body: unknown,
  actorId: string,
) {
  parseItemId(id, "uuid");
  const input = objectInput(body, ["values"]);
  return db.transaction(async (transaction) => {
    const collection = await lockSystemCollection(
      transaction,
      name,
      "ROW EXCLUSIVE",
    );
    const row = await transaction(collection.table)
      .withSchema("public")
      .where({ id })
      .forUpdate()
      .first("id");
    if (!row) {
      throw new ItemError("Record not found", 404);
    }
    const custom = await customFields(transaction, name);
    const fields = new Map(
      custom.map((field) => [
        field.field_name,
        { ...field.definition, presentation: field.presentation },
      ]),
    );
    // The allowlist contains only fields created through the owned-field registry.
    const values = parseItem(input.values, fields, false);
    await validateFileWrites(transaction, values, fields, {
      kind: "user",
      id: actorId,
    });
    await transaction(collection.table)
      .withSchema("public")
      .where({ id })
      .update(databaseValues(values, fields));
    return readSystemRecord(transaction, name, id);
  });
}
