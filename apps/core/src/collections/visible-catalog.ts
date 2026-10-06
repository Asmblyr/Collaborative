import type { Knex } from "knex";
import { grantFor, type Access } from "../permissions/access.js";
import { listCollections } from "./service.js";
import { reconcileForm } from "./form-layout.js";
import { canReadLabelPath } from "./label-paths.js";
import { templateFields } from "./label-template.js";
import { visibleFieldBehavior } from "./field-behavior-visibility.js";

/** The same principal-scoped metadata projection serves the catalog and translations. */
export async function visibleCatalog(database: Knex, access: Access) {
  const collections = await listCollections(database);
  const visibleCollections = collections.flatMap((collection) => {
    const readonly = collection.sourceKind === "materialized-view";
    const create = readonly
      ? null
      : grantFor(access, collection.name, "create");
    const read = grantFor(access, collection.name, "read");
    const update = readonly
      ? null
      : grantFor(access, collection.name, "update");
    const remove = readonly
      ? null
      : grantFor(access, collection.name, "delete");
    if (!create && !read && !update && !remove) {
      return [];
    }
    const visible = new Set([
      ...(create ?? []),
      ...(read ?? []),
      ...(update ?? []),
    ]);
    const allFields = visible.has("*");
    return [
      {
        ...collection,
        state:
          collection.state && (allFields || visible.has(collection.state.field))
            ? collection.state
            : null,
        formLayout: reconcileForm(
          collection.formLayout,
          collection.fields
            .filter((f) => allFields || visible.has(f.name))
            .map((f) => f.name),
        ),
        displayTemplate:
          collection.displayTemplate &&
          templateFields(collection.displayTemplate).every((f) =>
            canReadLabelPath(f, collection, collections, access),
          )
            ? collection.displayTemplate
            : null,
        fields: (allFields
          ? collection.fields
          : collection.fields.filter((field) => visible.has(field.name))
        ).map((field) =>
          visibleFieldBehavior(field, collection, collections, access),
        ),
        timestamps: {
          createdAt:
            collection.timestamps.createdAt &&
            (allFields || visible.has("created_at")),
          updatedAt:
            collection.timestamps.updatedAt &&
            (allFields || visible.has("updated_at")),
        },
        access: {
          create,
          read,
          update,
          delete: Boolean(remove),
          structure:
            access.principal.superuser &&
            !collection.name.startsWith("plugin_"),
        },
      },
    ];
  });
  return visibleCollections;
}
