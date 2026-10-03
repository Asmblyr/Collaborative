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
import { createItem, getItem, updateItem } from "./service.js";
import { requireRelatedRead } from "./related.js";
import { ItemError, parseItemId } from "./validation.js";
import type { MutationContext } from "./events-repository.js";

function attributes(context: RelationContext, body: unknown) {
  if (context.alias.kind !== "m2m")
    throw new ItemError(
      "Junction attributes require a many-to-many relation",
      400,
    );
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new ItemError("Expected link attributes", 400);
  if (
    context.alias.through_field in body ||
    context.alias.related_field! in body
  ) {
    throw new ItemError(
      "Relation keys are set automatically and cannot be reassigned",
      400,
    );
  }
  return body as Record<string, unknown>;
}

async function scopedLink(
  database: Knex,
  context: RelationContext,
  linkId: string,
  access: Access,
  lock = false,
) {
  if (context.alias.kind !== "m2m")
    throw new ItemError(
      "Junction attributes require a many-to-many relation",
      400,
    );
  const key = context.through.settings.primaryKey;
  const query = database(context.alias.through_collection)
    .withSchema("public")
    .where(key.name, parseItemId(linkId, key.type))
    .where(context.alias.through_field, context.id);
  if (lock) query.forUpdate();
  const row = await query.first(context.alias.related_field!);
  if (!row) throw new ItemError("Link not found for this record", 404);
  await getItem(
    database,
    context.alias.related_collection,
    String(row[context.alias.related_field!]),
    context.allowed,
    undefined,
    access,
  );
}

export async function getRelationLink(
  database: Knex,
  address: RelationAddress,
  linkId: string,
  access: Access,
) {
  const context = await relationContext(database, address, access);
  const allowed = requireGrant(
    access,
    context.alias.through_collection,
    "read",
  );
  await scopedLink(database, context, linkId, access);
  return getItem(
    database,
    context.alias.through_collection,
    linkId,
    allowed,
    undefined,
    access,
  );
}

export async function updateRelationLink(
  database: Knex,
  address: RelationAddress,
  linkId: string,
  body: unknown,
  access: Access,
  mutation: MutationContext,
  expectedValues?: Record<string, unknown>,
) {
  return database.transaction(async (transaction) => {
    const context = await relationContext(transaction, address, access, true);
    requireGrant(access, context.alias.through_collection, "read");
    const allowed = requireGrant(
      access,
      context.alias.through_collection,
      "update",
    );
    const values = attributes(context, body);
    await scopedLink(transaction, context, linkId, access, true);
    await requireRelatedRead(
      transaction,
      context.alias.through_collection,
      values,
      access,
    );
    await updateItem(
      transaction,
      context.alias.through_collection,
      linkId,
      values,
      { ...mutation, access },
      allowed,
      expectedValues,
    );
    return { id: linkId };
  });
}

export async function insertRelationLink(
  transaction: Knex.Transaction,
  context: RelationContext,
  targetId: string,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  if (!context.abilities.attach) throw new AccessDeniedError();
  const values = attributes(context, body);
  const { alias, through, target } = context;
  const targetKey = parseItemId(targetId, target.settings.primaryKey.type);
  await getItem(
    transaction,
    alias.related_collection,
    targetId,
    context.allowed,
    undefined,
    access,
  );
  const keys = {
    [alias.through_field]: context.id,
    [alias.related_field!]: targetKey,
  };
  if (
    await transaction(alias.through_collection)
      .withSchema("public")
      .where(keys)
      .first(through.settings.primaryKey.name)
  ) {
    throw new ItemError("Record is already linked", 409);
  }
  await requireRelatedRead(
    transaction,
    alias.through_collection,
    values,
    access,
  );
  const item = await createItem(
    transaction,
    alias.through_collection,
    { ...values, ...keys },
    { ...mutation, access },
    requireGrant(access, alias.through_collection, "create"),
  );
  return { id: String(item[through.settings.primaryKey.name]) };
}

export async function createRelationLink(
  database: Knex,
  address: RelationAddress,
  targetId: string,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  return database.transaction(async (transaction) =>
    insertRelationLink(
      transaction,
      await relationContext(transaction, address, access, true),
      targetId,
      body,
      access,
      mutation,
    ),
  );
}

export async function createRelationWithLink(
  database: Knex,
  address: RelationAddress,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["item", "link"].includes(key))
  ) {
    throw new ItemError("Expected item and link values", 400);
  }
  const input = body as { item: unknown; link: unknown };
  return database.transaction(async (transaction) => {
    const context = await relationContext(transaction, address, access, true);
    if (!context.abilities.create) throw new AccessDeniedError();
    attributes(context, input.link);
    await requireRelatedRead(
      transaction,
      context.alias.related_collection,
      input.item,
      access,
    );
    const item = await createItem(
      transaction,
      context.alias.related_collection,
      input.item,
      { ...mutation, access },
      requireGrant(access, context.alias.related_collection, "create"),
    );
    const id = String(item[context.target.settings.primaryKey.name]);
    await insertRelationLink(
      transaction,
      context,
      id,
      input.link,
      access,
      mutation,
    );
    return { id };
  });
}
