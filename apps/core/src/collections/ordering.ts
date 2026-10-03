import type { Knex } from "knex";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
} from "./validation.js";
import {
  parseCollectionLocation,
  validateCollectionLocation,
  type CollectionLocation,
} from "./navigation.js";

interface OrderedRow {
  name: string;
  sort_order: number;
  folder_id: string | null;
  parent_collection: string | null;
}

export async function lockCollectionOrder(
  transaction: Knex.Transaction,
): Promise<void> {
  await transaction.raw(
    "SELECT pg_advisory_xact_lock(hashtext('asmblyr'), hashtext('collection_order'))",
  );
}

export async function nextSortOrder(
  transaction: Knex.Transaction,
  folderId: string | null,
  parentCollection: string | null = null,
): Promise<number> {
  const result = await transaction.raw<{ rows: { next: number }[] }>(
    `
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
    FROM public.asmblyr_collections WHERE folder_id IS NOT DISTINCT FROM ?::uuid
      AND parent_collection IS NOT DISTINCT FROM ?::text
  `,
    [folderId, parentCollection],
  );
  return result.rows[0].next;
}

async function groupRows(
  transaction: Knex.Transaction,
  location: CollectionLocation,
): Promise<OrderedRow[]> {
  const result = await transaction.raw<{ rows: OrderedRow[] }>(
    `
    SELECT name, sort_order, folder_id, parent_collection FROM public.asmblyr_collections
    WHERE folder_id IS NOT DISTINCT FROM ?::uuid
      AND parent_collection IS NOT DISTINCT FROM ?::text ORDER BY sort_order, name
  `,
    [location.folderId, location.parentCollection],
  );
  return result.rows;
}

async function writeOrder(
  transaction: Knex.Transaction,
  rows: OrderedRow[],
  location: CollectionLocation,
) {
  for (const [sortOrder, row] of rows.entries()) {
    if (
      row.folder_id === location.folderId &&
      row.parent_collection === location.parentCollection &&
      row.sort_order === sortOrder
    )
      continue;
    await transaction("asmblyr_collections")
      .withSchema("public")
      .where({ name: row.name })
      .update({
        folder_id: location.folderId,
        parent_collection: location.parentCollection,
        sort_order: sortOrder,
      });
  }
}

export async function moveCollection(
  database: Knex,
  nameInput: unknown,
  body: unknown,
): Promise<CollectionLocation> {
  const name = parseMutableCollectionName(nameInput);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => !["folderId", "parentCollection", "before"].includes(key),
    ) ||
    (!("folderId" in body) && !("parentCollection" in body))
  ) {
    throw new CollectionInputError(
      "Expected a folderId or parentCollection and optional before collection",
    );
  }
  const input = body as {
    folderId?: unknown;
    parentCollection?: unknown;
    before?: unknown;
  };
  const location = parseCollectionLocation(input);
  const before =
    input.before === undefined || input.before === null
      ? null
      : parseMutableCollectionName(input.before);

  return database.transaction(async (transaction) => {
    await lockCollectionOrder(transaction);
    await validateCollectionLocation(transaction, name, location);
    const source = await transaction<OrderedRow>("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .first("name", "folder_id", "parent_collection", "sort_order");
    if (!source) throw new CollectionNotFoundError(name);
    const sameGroup =
      source.folder_id === location.folderId &&
      source.parent_collection === location.parentCollection;
    if (before === name && sameGroup) return location;

    const destination = (await groupRows(transaction, location)).filter(
      (row) => row.name !== name,
    );
    const index =
      before === null
        ? destination.length
        : destination.findIndex((row) => row.name === before);
    if (index < 0)
      throw new CollectionInputError(
        "Before collection must have the same navigation parent",
      );
    destination.splice(index, 0, source);

    if (!sameGroup) {
      const previousLocation = {
        folderId: source.folder_id,
        parentCollection: source.parent_collection,
      };
      const previous = (await groupRows(transaction, previousLocation)).filter(
        (row) => row.name !== name,
      );
      await writeOrder(transaction, previous, previousLocation);
    }
    await writeOrder(transaction, destination, location);
    return location;
  });
}

export async function promoteCollectionChildren(
  transaction: Knex.Transaction,
  name: string,
) {
  const parent = await transaction<OrderedRow>("asmblyr_collections")
    .withSchema("public")
    .where({ name })
    .first();
  if (!parent) throw new CollectionNotFoundError(name);
  const location = {
    folderId: parent.folder_id,
    parentCollection: parent.parent_collection,
  };
  const siblings = await groupRows(transaction, location);
  const children = await groupRows(transaction, {
    folderId: null,
    parentCollection: name,
  });
  // Keep the children at the removed parent's position; their own descendants stay attached.
  await writeOrder(
    transaction,
    siblings.flatMap((row) => (row.name === name ? children : [row])),
    location,
  );
}
