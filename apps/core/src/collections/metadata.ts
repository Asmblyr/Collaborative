import { parseLabelTranslations } from "./translation-validation.js";
import type { Knex } from "knex";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
} from "./validation.js";
import { listCollections } from "./catalog-repository.js";
import { updateCollectionDisplay } from "./display.js";
import {
  parseDisplayName,
  parseCollectionMcp,
  parseCollectionHidden,
} from "./metadata-validation.js";
import { parseCollectionState } from "./state-validation.js";
import { saveCollectionState } from "./state-settings.js";

export async function updateCollectionMetadata(
  database: Knex,
  input: string,
  body: unknown,
) {
  const name = parseMutableCollectionName(input);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Object.keys(body).length ||
    Object.keys(body).some(
      (key) =>
        ![
          "displayName",
          "translations",
          "hidden",
          "mcp",
          "displayField",
          "displayTemplate",
          "state",
        ].includes(key),
    )
  ) {
    throw new CollectionInputError(
      "Expected collection display or MCP settings",
    );
  }
  const patch: Record<string, unknown> = {};
  if ("displayName" in body)
    patch.display_name = parseDisplayName(body.displayName);
  if ("translations" in body) {
    patch.translations = JSON.stringify(
      parseLabelTranslations(body.translations, true),
    );
  }
  if ("hidden" in body) patch.hidden = parseCollectionHidden(body.hidden);
  if ("mcp" in body) {
    const mcp = parseCollectionMcp(body.mcp);
    patch.mcp_enabled = mcp.enabled;
    patch.mcp_description = mcp.description;
  }
  if ("displayTemplate" in body && !("displayField" in body)) {
    throw new CollectionInputError("displayTemplate requires displayField");
  }
  return database.transaction(async (trx) => {
    // Do not lock metadata before the user table: schema operations lock in the opposite order.
    const row = await trx("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .first("id");
    if (!row) throw new CollectionNotFoundError(name);
    if ("state" in body)
      await saveCollectionState(trx, name, parseCollectionState(body.state));
    if ("displayField" in body)
      await updateCollectionDisplay(trx, name, {
        displayField: body.displayField,
        ...("displayTemplate" in body
          ? { displayTemplate: body.displayTemplate }
          : {}),
      });
    if (Object.keys(patch).length)
      await trx("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .update(patch);
    const collection = (await listCollections(trx)).find(
      (c) => c.name === name,
    );
    if (!collection) throw new CollectionNotFoundError(name);
    return collection;
  });
}
