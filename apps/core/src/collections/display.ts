import type { Knex } from "knex";
import { lockedCollectionSettings } from "./settings-repository.js";
import { listCollections } from "./catalog-repository.js";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
} from "./validation.js";
import { labelTemplatePaths } from "./label-paths.js";
import { parseLabelTemplate } from "./label-template.js";

export async function updateCollectionDisplay(
  database: Knex,
  input: string,
  body: unknown,
) {
  const name = parseMutableCollectionName(input);
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) => !["displayField", "displayTemplate"].includes(k),
    ) ||
    !("displayField" in body) ||
    (body.displayField !== null && typeof body.displayField !== "string")
  ) {
    throw new CollectionInputError(
      "Expected displayField (field name or null)",
    );
  }
  const displayField = body.displayField;
  return database.transaction(async (transaction) => {
    if (
      !(await transaction("asmblyr_collections")
        .withSchema("public")
        .where({ name })
        .first("id"))
    ) {
      throw new CollectionNotFoundError(name);
    }
    await lockedCollectionSettings(transaction, name, "ACCESS SHARE", true);
    const catalog = await listCollections(transaction);
    const collection = catalog.find((entry) => entry.name === name)!;
    const displayTemplate = parseLabelTemplate(
      "displayTemplate" in body ? body.displayTemplate : null,
      labelTemplatePaths(collection, catalog),
    );
    if (
      displayField !== null &&
      displayField !== collection.primaryKey.name &&
      !collection.fields.some(
        (field) =>
          field.name === displayField &&
          !field.presentation?.sensitive &&
          ["text", "email", "integer"].includes(field.type),
      )
    ) {
      throw new CollectionInputError(
        "Choose a text, email, integer field or the primary key",
      );
    }
    await transaction("asmblyr_collections")
      .withSchema("public")
      .where({ name })
      .update({
        display_field: displayField,
        display_template: displayTemplate,
      });
    return { ...collection, displayField, displayTemplate };
  });
}
