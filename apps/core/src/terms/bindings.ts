import type { Knex } from "knex";
import { lockedCollectionSettings } from "../collections/settings-repository.js";
import { parseMutableCollectionName } from "../collections/validation.js";
import { collectionSchema } from "../items/schema-repository.js";
import { listCollections } from "../collections/catalog-repository.js";
import { plainFilter } from "../items/filter-wire.js";
import { ItemError } from "../items/validation.js";
import type { Access } from "../permissions/access.js";
import { objectInput } from "../shared/input.js";
import { parseTermId } from "./validation.js";
import { boundTerms, listTerms, writeBinding } from "./repository.js";
import { termFilter } from "./filters.js";

async function bindingData(db: Knex, name: string) {
  const [schema, catalog] = await Promise.all([
    collectionSchema(db, name),
    listCollections(db),
  ]);
  return { schema, catalog, allowed: ["*"] };
}

export async function listBindings(db: Knex, name: string, access: Access) {
  parseMutableCollectionName(name);
  const data = await bindingData(db, name);
  const [terms, bound] = await Promise.all([
    listTerms(db),
    boundTerms(db, data.schema.settings.internalId),
  ]);
  const bindings = bound.map((term) => {
    let valid = true;
    try {
      termFilter(name, term.filter, data, access);
    } catch {
      valid = false;
    }
    return { termId: term.id, filter: term.filter, valid };
  });
  return { terms, bindings };
}

export async function saveBinding(
  db: Knex,
  name: string,
  termId: unknown,
  body: unknown,
  access: Access,
): Promise<void> {
  parseMutableCollectionName(name);
  const id = parseTermId(termId);
  const input = objectInput(body, ["filter"]);
  await db.transaction(async (trx) => {
    const settings = await lockedCollectionSettings(trx, name, "ACCESS SHARE");
    await trx("asmblyr_collections")
      .withSchema("public")
      .where({ id: settings.internalId })
      .forUpdate()
      .first("id");
    const term = await trx("asmblyr_terms")
      .withSchema("public")
      .where({ id })
      .first("id");
    if (!term) throw new ItemError("Term not found", 404);
    const current = await boundTerms(trx, settings.internalId);
    if (!current.some((entry) => entry.id === id) && current.length >= 20) {
      throw new ItemError("Можно связать до 20 терминов с коллекцией", 409);
    }
    const filter = termFilter(
      name,
      input.filter,
      await bindingData(trx, name),
      access,
    );
    await writeBinding(trx, settings.internalId, id, plainFilter(filter));
  });
}

export async function removeBinding(
  db: Knex,
  name: string,
  termId: unknown,
): Promise<void> {
  parseMutableCollectionName(name);
  const id = parseTermId(termId);
  const data = await bindingData(db, name);
  await db("asmblyr_collection_terms")
    .withSchema("public")
    .where({ collection_id: data.schema.settings.internalId, term_id: id })
    .delete();
}

export async function replaceBindings(
  db: Knex,
  name: string,
  body: unknown,
  access: Access,
): Promise<void> {
  parseMutableCollectionName(name);
  const input = objectInput(body, ["bindings"]);
  if (!Array.isArray(input.bindings) || input.bindings.length > 20) {
    throw new ItemError("Ожидается до 20 условий терминов", 400);
  }
  const bindings = input.bindings.map((entry) => {
    const value = objectInput(entry, ["termId", "filter"]);
    return { termId: parseTermId(value.termId), filter: value.filter };
  });
  if (
    new Set(bindings.map((binding) => binding.termId)).size !== bindings.length
  ) {
    throw new ItemError("Термины не должны повторяться", 400);
  }
  await db.transaction(async (trx) => {
    const settings = await lockedCollectionSettings(trx, name, "ACCESS SHARE");
    await trx("asmblyr_collections")
      .withSchema("public")
      .where({ id: settings.internalId })
      .forUpdate()
      .first("id");
    const [terms, data] = await Promise.all([
      listTerms(trx),
      bindingData(trx, name),
    ]);
    const validated = bindings.map((binding) => {
      if (!terms.some((term) => term.id === binding.termId))
        throw new ItemError("Term not found", 404);
      return {
        ...binding,
        filter: plainFilter(termFilter(name, binding.filter, data, access)),
      };
    });
    await trx("asmblyr_collection_terms")
      .withSchema("public")
      .where({ collection_id: settings.internalId })
      .delete();
    for (const binding of validated)
      await writeBinding(
        trx,
        settings.internalId,
        binding.termId,
        binding.filter,
      );
  });
}
