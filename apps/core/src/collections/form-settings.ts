import type { Knex } from "knex";
import { listCollections } from "./catalog-repository.js";
import { parseFormLayout } from "./form-layout.js";
import { CollectionNotFoundError, parseMutableCollectionName } from "./validation.js";

export async function updateCollectionForm(database: Knex, input: string, body: unknown) {
  const name = parseMutableCollectionName(input);
  return database.transaction(async (transaction) => {
    if (!await transaction("asmblyr_collections").withSchema("public").where({ name }).first("id")) throw new CollectionNotFoundError(name);
    await transaction.raw("LOCK TABLE ?? IN ACCESS SHARE MODE", [`public.${name}`]);
    const collection = (await listCollections(transaction)).find((c) => c.name === name)!;
    const formLayout = parseFormLayout(body, collection.fields);
    await transaction("asmblyr_collections").withSchema("public").where({ name })
      .update({ form_layout: formLayout ? JSON.stringify(formLayout) : null });
    return formLayout;
  });
}
