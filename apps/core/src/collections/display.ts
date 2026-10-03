import type { Knex } from "knex";
import { listCollections } from "./catalog-repository.js";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
} from "./validation.js";
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
    await transaction.raw("LOCK TABLE ?? IN ROW EXCLUSIVE MODE", [
      `public.${name}`,
    ]);
    const collection = (await listCollections(transaction)).find(
      (entry) => entry.name === name,
    )!;
    const displayTemplate = parseLabelTemplate(
      "displayTemplate" in body ? body.displayTemplate : null,
      [
        collection.primaryKey.name,
        ...collection.fields
          .filter((f) =>
            [
              "text",
              "email",
              "integer",
              "decimal",
              "boolean",
              "datetime",
            ].includes(f.type),
          )
          .map((f) => f.name),
      ],
    );
    if (
      displayField !== null &&
      displayField !== collection.primaryKey.name &&
      !collection.fields.some(
        (field) =>
          field.name === displayField &&
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
