import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { objectInput } from "../shared/input.js";
import { ItemError } from "../items/validation.js";
import { getItem } from "../items/service.js";
import { createAuthorizedItem, updateAuthorizedItem } from "../items/writer.js";
import {
  assertWritableFields,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import {
  mutationContext,
  type MutationFactory,
} from "../items/mutation-context.js";
import { mcpActionAccess } from "../plugins/action-access.js";
import { toolReadContext } from "./read-context.js";
import { collectionSchema } from "../items/schema-repository.js";
import { requireMcpCollection } from "./collection-scope.js";
import { assertRowWrite } from "../permissions/row-access.js";

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([a], [b]) => a.localeCompare(b)),
        )
      : item,
  );
}

export async function executeWriteTool(
  db: Knex,
  access: Access,
  name: string,
  collectionId: string,
  tool: string,
  input: Record<string, unknown>,
  options: { source?: string; mutations?: MutationFactory } = {},
  signal?: AbortSignal,
): Promise<object> {
  signal?.throwIfAborted();
  if (Buffer.byteLength(canonical(input)) > 32000) {
    throw new ItemError("Write input too large", 400);
  }
  return db.transaction(async (trx) => {
    const { schema } = await toolReadContext(
      trx,
      access,
      name,
      collectionId,
      signal,
    );
    const values = objectInput(input.values, [
      ...schema.fields.keys(),
      schema.settings.primaryKey.name,
    ]);
    if (!Object.keys(values).length || Object.keys(values).length > 50) {
      throw new ItemError("Supply 1–50 changed fields", 400);
    }
    const effective = await mcpActionAccess(trx, access);
    const action = tool === "create_item" ? "create" : "update";
    assertWritableFields(values, requireGrant(effective, name, action));
    for (const field of Object.keys(values)) {
      const relation = schema.fields.get(field)?.relation;
      if (
        relation &&
        values[field] !== null &&
        !relation.collection.startsWith("@")
      ) {
        requireMcpCollection(
          (await collectionSchema(trx, relation.collection)).settings,
        );
        requireGrant(effective, relation.collection, "read");
      }
    }
    const id = input.id;
    if (tool !== "create_item" && (typeof id !== "string" || id.length > 255)) {
      throw new ItemError("Invalid item ID", 400);
    }
    if (tool === "prepare_update") {
      await assertRowWrite(
        trx,
        effective,
        name,
        "update",
        schema.settings.primaryKey.name,
        id,
        Object.keys(values),
      );
      const before = await getItem(
        trx,
        name,
        id as string,
        requireGrant(effective, name, "read"),
        Object.keys(values).join(","),
        effective,
      );
      const expectedValues = Object.fromEntries(
        Object.keys(values).map((field) => {
          if (!Object.hasOwn(before, field)) {
            throw new ItemError("Field is not readable", 403);
          }
          return [field, before[field]];
        }),
      );
      if (Buffer.byteLength(JSON.stringify(expectedValues)) > 16000) {
        throw new ItemError("Original values too large", 400);
      }
      return { collection: name, id, values, expectedValues, applied: false };
    }
    if (
      typeof input.operationId !== "string" ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(input.operationId)
    ) {
      throw new ItemError("Invalid operation ID", 400);
    }
    const expected =
      tool === "update_item"
        ? objectInput(input.expectedValues, Object.keys(values))
        : undefined;
    if (
      expected &&
      Object.keys(values).some((field) => !Object.hasOwn(expected, field))
    ) {
      throw new ItemError("Supply all original values", 400);
    }
    // Check per-row readable fields on retries too; cached metadata never grants access.
    if (tool === "update_item") {
      const readable = await getItem(
        trx,
        name,
        id as string,
        requireGrant(effective, name, "read"),
        Object.keys(values).join(","),
        effective,
      );
      if (
        Object.keys(values).some((field) => !Object.hasOwn(readable, field))
      ) {
        throw new ItemError("Field is not readable", 403);
      }
    }
    const key = {
      user_id: access.principal.id,
      source: options.source ?? "assistant",
      operation_id: input.operationId,
    };
    const hash = createHash("sha256")
      .update(canonical({ tool, name, collectionId, ...input }))
      .digest("hex");
    await trx("public.asmblyr_tool_writes")
      .insert({ ...key, input_hash: hash })
      .onConflict(["user_id", "source", "operation_id"])
      .ignore();
    const stored = await trx("public.asmblyr_tool_writes")
      .where(key)
      .forUpdate()
      .first();
    if (stored.input_hash !== hash) {
      throw new ItemError(
        "Operation ID was used with different arguments",
        409,
        "OPERATION_REUSED",
      );
    }
    if (stored.result) {
      if (tool === "update_item") {
        await assertRowWrite(
          trx,
          effective,
          name,
          "update",
          schema.settings.primaryKey.name,
          id,
          Object.keys(values),
        );
      }
      return { ...stored.result, replayed: true };
    }
    signal?.throwIfAborted();
    const mutation = (options.mutations ?? mutationContext)(effective);
    const result =
      tool === "create_item"
        ? await createAuthorizedItem(trx, effective, name, values, mutation)
        : await updateAuthorizedItem(
            trx,
            effective,
            name,
            id as string,
            values,
            mutation,
            expected,
          );
    const recordId = result.data
      ? String(result.data[schema.settings.primaryKey.name])
      : null;
    const response = {
      collection: name,
      id: recordId,
      applied: true,
      action,
      replayed: false,
    };
    await trx("public.asmblyr_tool_writes")
      .where(key)
      .update({ result: JSON.stringify(response) });
    return response;
  });
}
