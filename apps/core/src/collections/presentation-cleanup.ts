import type { Knex } from "knex";
import { formFields, reconcileForm, type FormLayout } from "./form-layout.js";
import { templateFields } from "./label-template.js";

export async function removePresentationField(
  database: Knex,
  collection: string,
  field: string,
) {
  const row = await database("asmblyr_collections")
    .withSchema("public")
    .where({ name: collection })
    .forUpdate()
    .first<{
      form_layout: FormLayout | null;
      display_template: string | null;
    }>("form_layout", "display_template");
  if (!row) return;
  const names = row.form_layout
    ? row.form_layout.tabs.flatMap((tab) => [...formFields(tab.children)])
    : [];
  // Conditions can refer to an unplaced field, so include all still-existing columns.
  const columns = await database("information_schema.columns")
    .where({ table_schema: "public", table_name: collection })
    .select<{ column_name: string }[]>("column_name");
  const form = reconcileForm(
    row.form_layout,
    [...new Set([...names, ...columns.map((c) => c.column_name)])].filter(
      (n) => n !== field,
    ),
  );
  await database("asmblyr_collections")
    .withSchema("public")
    .where({ name: collection })
    .update({
      form_layout: form ? JSON.stringify(form) : null,
      display_template:
        row.display_template &&
        templateFields(row.display_template).includes(field)
          ? null
          : row.display_template,
    });
}
