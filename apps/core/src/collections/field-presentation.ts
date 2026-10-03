import type { Knex } from "knex";
import { readEditableField } from "./editable-field.js";
import { parseFieldPresentation } from "./field-presentation-validation.js";
import { validateRelationPresentation } from "./relation-presentation.js";
import { parsePresentedValue } from "./presented-value.js";
import {
  lockedCollectionSettings,
  isManagedColumn,
} from "./settings-repository.js";
import {
  CollectionInputError,
  CollectionNotFoundError,
  parseMutableCollectionName,
  parseMutableFieldName,
} from "./validation.js";

export async function updateFieldPresentation(
  database: Knex,
  collection: unknown,
  field: unknown,
  body: unknown,
) {
  const name = parseMutableCollectionName(collection);
  const column = parseMutableFieldName(field);
  try {
    return await database.transaction(async (transaction) => {
      const settings = await lockedCollectionSettings(
        transaction,
        name,
        "ACCESS SHARE",
      );
      if (isManagedColumn(settings, column))
        throw new CollectionInputError(`Field is managed by Core: ${column}`);
      const alias = await transaction("asmblyr_relation_aliases")
        .withSchema("public")
        .where({ collection_name: name, field_name: column })
        .forUpdate()
        .first("field_name", "related_collection");
      if (alias) {
        const presentation = parseFieldPresentation(body, "alias");
        if (presentation.relation)
          await validateRelationPresentation(
            transaction,
            alias.related_collection,
            presentation.relation,
          );
        await transaction("asmblyr_relation_aliases")
          .withSchema("public")
          .where({ collection_name: name, field_name: column })
          .update({ presentation: JSON.stringify(presentation) });
        return presentation;
      }
      const row = await readEditableField(transaction, name, column);
      const type = row.relation_key_type
        ? "relation"
        : (row.type ?? row.data_type);
      const presentation = parseFieldPresentation(body, type);
      if (row.default_value !== null) {
        try {
          parsePresentedValue(row.default_value, presentation, row.required);
        } catch {
          throw new CollectionInputError(
            "Current default does not match the new settings; change it first",
          );
        }
      }
      await transaction("asmblyr_field_metadata")
        .withSchema("public")
        .insert({
          collection_name: name,
          field_name: column,
          presentation: JSON.stringify(presentation),
        })
        .onConflict(["collection_name", "field_name"])
        .merge({ presentation: JSON.stringify(presentation) });
      return presentation;
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "42P01"
    ) {
      throw new CollectionNotFoundError(name);
    }
    throw error;
  }
}
