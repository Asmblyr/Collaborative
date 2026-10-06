import {
  applyRowAccess,
  selectRowPermissions,
  projectRow,
} from "../permissions/row-access.js";
import type { Knex } from "knex";
import type { Collection } from "../collections/types.js";
import { listCollections } from "../collections/catalog-repository.js";
import { grantFor, type Access } from "../permissions/access.js";
import { resolveNestedLabels } from "./nested-labels.js";
import { recordLabelPlan } from "./record-label.js";

// One authoritative label for lists, search, direct links and relationship
// pickers. Expand at most one readable M2O, in batches rather than per row.
export async function resolveRecordLabels(
  database: Knex,
  name: string,
  ids: string[],
  access: Access,
  suppliedCatalog?: Collection[],
): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const catalog = suppliedCatalog ?? (await listCollections(database));
  const collection = catalog.find((entry) => entry.name === name);
  const allowed = grantFor(access, name, "read");
  if (!collection || !allowed) return {};
  if (collection.displayTemplate?.includes("."))
    return resolveNestedLabels(
      database,
      collection,
      ids,
      catalog,
      access,
      allowed,
    );
  const key = collection.primaryKey.name;
  const readable = (field: string) =>
    field === key || allowed.includes("*") || allowed.includes(field);
  const plan = recordLabelPlan(collection, collection.fields, allowed);
  const reference = collection.fields
    .filter((field) => field.relation?.kind === "m2o" && readable(field.name))
    .sort(
      (a, b) =>
        Number(b.name === collection.displayField) -
          Number(a.name === collection.displayField) ||
        Number(b.searchable === true) - Number(a.searchable === true) ||
        (a.presentation?.order ?? 0) - (b.presentation?.order ?? 0),
    )[0];
  const relation =
    reference?.relation?.kind === "m2o" ? reference.relation : undefined;
  const target = catalog.find((entry) => entry.name === relation?.collection);
  const targetAllowed = target ? grantFor(access, target.name, "read") : null;
  // A configured private display field must fall back to the ID, not infer a
  // name via another readable field.
  const expand = Boolean(
    target &&
      targetAllowed &&
      reference &&
      collection.displayField !== key &&
      (!collection.displayField || readable(collection.displayField)),
  );
  const columns = [
    ...new Set([...plan.columns, ...(expand ? [reference!.name] : [])]),
  ];
  const rawRows = await database(name)
    .withSchema("public")
    .whereIn(key, ids)
    .select(columns)
    .modify((query) => {
      applyRowAccess(query, database, access, name);
      selectRowPermissions(query, database, access, name);
    });
  const rows: Record<string, unknown>[] = rawRows.map(
    (row: Record<string, unknown>) => projectRow(row, access, name, key),
  );
  const related = new Map<string, string>();
  if (expand && target && targetAllowed && reference) {
    const targetKey = target.primaryKey.name;
    const foreignIds: string[] = [
      ...new Set<string>(
        rows
          .map((row: Record<string, unknown>) => row[reference.name])
          .filter((id: unknown) => id != null)
          .map(String),
      ),
    ];
    if (foreignIds.length) {
      const targetPlan = recordLabelPlan(target, target.fields, targetAllowed);
      const rawTargets = await database(target.name)
        .withSchema("public")
        .whereIn(targetKey, foreignIds)
        .select(targetPlan.columns)
        .modify((query) => {
          applyRowAccess(query, database, access, target.name);
          selectRowPermissions(query, database, access, target.name);
        });
      const targets = rawTargets.map((row: Record<string, unknown>) =>
        projectRow(row, access, target.name, targetKey),
      );
      for (const row of targets) {
        const label = targetPlan.label(row);
        if (label !== String(row[targetKey]))
          related.set(String(row[targetKey]), label);
      }
    }
  }
  return Object.fromEntries(
    rows.map((row: Record<string, unknown>) => {
      const id = String(row[key]);
      const own = plan.label(row);
      const relatedLabel = reference
        ? related.get(String(row[reference.name]))
        : undefined;
      return [
        id,
        (own === id ||
          (!collection.displayTemplate &&
            reference?.name === collection.displayField)) &&
        relatedLabel
          ? relatedLabel
          : own,
      ];
    }),
  );
}
