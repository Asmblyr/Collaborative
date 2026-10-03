import type { Knex } from "knex";
import {
  AccessDeniedError,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import {
  relationContext,
  type RelationAddress,
  type RelationContext,
} from "./relation-context.js";
import { createItem, deleteItem, getItem, updateItem } from "./service.js";
import { requireRelatedRead } from "./related.js";
import { ItemError, parseItemId } from "./validation.js";
import type { MutationContext } from "./events-repository.js";

function parseChanges(body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "attach" && key !== "detach")
  ) {
    throw new ItemError("Expected attach and/or detach arrays", 400);
  }
  const input = body as Record<string, unknown>;
  const list = (value: unknown) => {
    if (value === undefined) return [];
    if (
      !Array.isArray(value) ||
      value.length > 100 ||
      value.some((id) => typeof id !== "string" || !id || id.length > 255)
    ) {
      throw new ItemError("Expected up to 100 item identifiers", 400);
    }
    return [...new Set(value as string[])].sort();
  };
  const attach = list(input.attach),
    detach = list(input.detach);
  if (!attach.length && !detach.length)
    throw new ItemError("No relation changes", 400);
  return { attach, detach };
}

async function attachItem(
  transaction: Knex.Transaction,
  context: RelationContext,
  targetId: string,
  access: Access,
  mutation: MutationContext,
) {
  const { alias, id, target, through, allowed } = context;
  const key = target.settings.primaryKey.name;
  const parsedId = parseItemId(targetId, target.settings.primaryKey.type);
  await getItem(
    transaction,
    alias.related_collection,
    targetId,
    allowed,
    undefined,
    access,
  );
  if (alias.kind === "o2m") {
    const child = await transaction(alias.related_collection)
      .withSchema("public")
      .where(key, parsedId)
      .forUpdate()
      .first(alias.through_field);
    if (!child) throw new ItemError("Item not found", 404);
    if (
      child[alias.through_field] !== null &&
      String(child[alias.through_field]) !== String(id)
    ) {
      throw new ItemError(
        "Record already belongs to another parent; unlink it there first",
        409,
        "RELATION_PARENT_CONFLICT",
      );
    }
    await updateItem(
      transaction,
      alias.related_collection,
      targetId,
      { [alias.through_field]: id },
      mutation,
      requireGrant(access, alias.related_collection, "update"),
    );
  } else {
    const values = {
      [alias.through_field]: id,
      [alias.related_field!]: parsedId,
    };
    const exists = await transaction(alias.through_collection)
      .withSchema("public")
      .where(values)
      .first(through.settings.primaryKey.name);
    if (!exists)
      await createItem(
        transaction,
        alias.through_collection,
        values,
        mutation,
        requireGrant(access, alias.through_collection, "create"),
      );
  }
}

async function detachLink(
  transaction: Knex.Transaction,
  context: RelationContext,
  linkId: string,
  access: Access,
  mutation: MutationContext,
) {
  const { alias, id, through } = context;
  const key = through.settings.primaryKey.name;
  const parsedId = parseItemId(linkId, through.settings.primaryKey.type);
  const row = await transaction(alias.through_collection)
    .withSchema("public")
    .where(key, parsedId)
    .where(alias.through_field, id)
    .forUpdate()
    .first(key);
  if (!row) throw new ItemError("Link not found for this record", 404);
  if (alias.kind === "o2m") {
    await updateItem(
      transaction,
      alias.related_collection,
      linkId,
      { [alias.through_field]: null },
      mutation,
      requireGrant(access, alias.related_collection, "update"),
    );
  } else {
    requireGrant(access, alias.through_collection, "delete");
    await deleteItem(transaction, alias.through_collection, linkId, mutation);
  }
}

export async function changeRelationItems(
  database: Knex,
  address: RelationAddress,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  mutation = { ...mutation, access };
  const changes = parseChanges(body);
  await database.transaction(async (transaction) => {
    const context = await relationContext(transaction, address, access, true);
    if (
      (changes.attach.length && !context.abilities.attach) ||
      (changes.detach.length && !context.abilities.detach)
    ) {
      throw new AccessDeniedError();
    }
    for (const id of changes.detach)
      await detachLink(transaction, context, id, access, mutation);
    for (const id of changes.attach)
      await attachItem(transaction, context, id, access, mutation);
  });
}

export async function createRelationItem(
  database: Knex,
  address: RelationAddress,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  mutation = { ...mutation, access };
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ItemError("Expected item values", 400);
  return database.transaction(async (transaction) => {
    const context = await relationContext(transaction, address, access, true);
    if (!context.abilities.create) throw new AccessDeniedError();
    const { alias, id, target } = context;
    if (alias.kind === "o2m" && alias.through_field in body) {
      throw new ItemError("Parent relation is set automatically", 400);
    }
    const values = {
      ...body,
      ...(alias.kind === "o2m" ? { [alias.through_field]: id } : {}),
    };
    await requireRelatedRead(
      transaction,
      alias.related_collection,
      values,
      access,
    );
    const item = await createItem(
      transaction,
      alias.related_collection,
      values,
      mutation,
      requireGrant(access, alias.related_collection, "create"),
    );
    const itemId = String(item[target.settings.primaryKey.name]);
    if (alias.kind === "m2m")
      await attachItem(transaction, context, itemId, access, mutation);
    return { id: itemId };
  });
}
