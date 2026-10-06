import type { Knex } from "knex";
import type { Collection } from "../collections/types.js";
import type { Access } from "../permissions/access.js";
import {
  applyRowAccess,
  projectRow,
  selectRowPermissions,
} from "../permissions/row-access.js";
import {
  templateFields,
  renderLabelTemplate,
} from "../collections/label-template.js";
import { canReadLabelPath } from "../collections/label-paths.js";
import { recordLabelPlan } from "./record-label.js";

export async function resolveNestedLabels(
  db: Knex,
  source: Collection,
  ids: string[],
  catalog: Collection[],
  access: Access,
  allowed: string[],
): Promise<Record<string, string>> {
  const fallback = recordLabelPlan(
    { ...source, displayTemplate: null },
    source.fields,
    allowed,
  );
  const paths = templateFields(source.displayTemplate!);
  const usable = paths.every((p) =>
    canReadLabelPath(p, source, catalog, access),
  );
  const columns = [
    ...new Set([
      ...fallback.columns,
      ...(usable ? paths.map((p) => p.split(".")[0]) : []),
    ]),
  ];
  const raw = await db(source.name)
    .withSchema("public")
    .whereIn(source.primaryKey.name, ids)
    .select(columns)
    .modify((q) => {
      applyRowAccess(q, db, access, source.name);
      selectRowPermissions(q, db, access, source.name);
    });
  const rows: Record<string, unknown>[] = raw.map(
    (row: Record<string, unknown>) =>
      projectRow(row, access, source.name, source.primaryKey.name),
  );
  if (usable) {
    for (const path of paths.filter((p) => p.includes("."))) {
      let collection = source;
      let values = rows.map((row) => ({
        owner: row,
        value: row[path.split(".")[0]],
        available: Object.hasOwn(row, path.split(".")[0]),
      }));
      const parts = path.split(".");
      for (let index = 1; index < parts.length; index++) {
        const relation = collection.fields.find(
          (f) => f.name === parts[index - 1],
        )!.relation!;
        const target = catalog.find((c) => c.name === relation.collection)!;
        const keys = [
          ...new Set(
            values
              .filter((v) => v.available && v.value != null)
              .map((v) => String(v.value)),
          ),
        ];
        const targets: Record<string, unknown>[] = keys.length
          ? await db(target.name)
              .withSchema("public")
              .whereIn(target.primaryKey.name, keys)
              .select(target.primaryKey.name, parts[index])
              .modify((q) =>
                applyRowAccess(
                  q,
                  db,
                  access,
                  target.name,
                  "read",
                  [parts[index]],
                  target.name,
                  target.primaryKey.name,
                ),
              )
          : [];
        const byId = new Map(
          targets.map((row) => [String(row[target.primaryKey.name]), row]),
        );
        values = values.map(({ owner, value, available }) => {
          if (available && value == null) {
            return { owner, value: null, available: true };
          }
          const targetRow = byId.get(String(value));
          return {
            owner,
            value: targetRow?.[parts[index]],
            available: available && Boolean(targetRow),
          };
        });
        collection = target;
      }
      for (const entry of values) {
        if (entry.available) {
          entry.owner[path] = entry.value;
        }
      }
    }
  }
  return Object.fromEntries(
    rows.map((row) => [
      String(row[source.primaryKey.name]),
      usable
        ? (renderLabelTemplate(source.displayTemplate, row) ??
          fallback.label(row))
        : fallback.label(row),
    ]),
  );
}
