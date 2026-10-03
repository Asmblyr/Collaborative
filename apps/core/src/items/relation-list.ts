import { applyRowAccess } from "../permissions/row-access.js";
import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { relationContext, type RelationAddress } from "./relation-context.js";
import { parseItemListQuery, type ItemListQuery } from "./list-query.js";
import { applyItemSearch, searchableColumns } from "./search.js";
import { recordLabelPlan } from "./record-label.js";
import { relationDisplay } from "./relation-display.js";
import { listCollections } from "../collections/catalog-repository.js";
import { relationSearchPaths } from "./relation-search.js";
import { resolveRecordLabels } from "./record-labels.js";

export async function listRelationItems(
  database: Knex,
  address: RelationAddress,
  access: Access,
  query: ItemListQuery,
) {
  const context = await relationContext(database, address, access);
  const { alias, id, target, through, allowed, abilities } = context;
  const display = relationDisplay(context);
  const { page, limit, offset, q, sort, direction } = parseItemListQuery(
    {
      page: query.page,
      limit: query.limit ?? String(display.pageSize),
      q: query.q,
      sort: query.sort ?? display.sortField,
      direction: query.direction ?? display.direction,
    },
    alias.related_collection,
    target,
    allowed,
  );
  const key = target.settings.primaryKey.name;
  const labels = recordLabelPlan(
    target.settings,
    target.fields.values(),
    allowed,
    alias.presentation?.relation?.labelField ? display.labelField : null,
  );
  const labelProjection = Object.fromEntries(
    labels.columns.map((name, index) => [`label_${index}`, `t.${name}`]),
  );
  const columns = searchableColumns(key, target.fields.values(), allowed).map(
    (name) => `t.${name}`,
  );
  const base = database({ t: `public.${alias.related_collection}` });
  let linkKey = `t.${key}`;
  if (alias.kind === "m2m") {
    base
      .join(
        { j: `public.${alias.through_collection}` },
        `j.${alias.related_field}`,
        `t.${key}`,
      )
      .where(`j.${alias.through_field}`, id);
    linkKey = `j.${through.settings.primaryKey.name}`;
  } else base.where(`t.${alias.through_field}`, id);
  applyRowAccess(
    base,
    database,
    access,
    alias.related_collection,
    "read",
    [
      ...display.columns,
      ...labels.columns,
      sort,
      ...(alias.kind === "o2m" ? [alias.through_field] : []),
    ],
    "t",
    key,
  );
  if (
    alias.kind === "m2m" &&
    access.rowRules?.has(`${alias.through_collection}:read`)
  )
    applyRowAccess(
      base,
      database,
      access,
      alias.through_collection,
      "read",
      [],
      "j",
    );
  const catalog = q ? await listCollections(database) : [];
  const current = catalog.find(
    (entry) => entry.name === alias.related_collection,
  );
  // Qualify the outer fields: M2M lists also join a junction with its own key.
  const relations = current
    ? relationSearchPaths(current, catalog, access, allowed).map((path) => ({
        ...path,
        sourceField: `t.${path.sourceField}`,
        sourceKey: `t.${path.sourceKey}`,
      }))
    : [];
  applyItemSearch(
    base,
    columns,
    q,
    target.settings.primaryKey.type,
    database,
    relations,
    access,
    alias.related_collection,
  );
  const projection = Object.fromEntries(
    display.columns.map((name, index) => [`value_${index}`, `t.${name}`]),
  );
  const [rows, count] = await Promise.all([
    base
      .clone()
      .select({
        id: `t.${key}`,
        linkId: linkKey,
        ...projection,
        ...labelProjection,
      })
      .orderBy(`t.${sort}`, direction, "last")
      .orderBy(`t.${key}`)
      .orderBy(linkKey)
      .limit(limit)
      .offset(offset),
    base.clone().count<{ total: string }>("* as total").first(),
  ]);
  const resolved = alias.presentation?.relation?.labelField
    ? {}
    : await resolveRecordLabels(
        database,
        alias.related_collection,
        rows.map((row) => String(row.id)),
        access,
      );
  return {
    data: rows.map((row) => ({
      id: String(row.id),
      linkId: String(row.linkId),
      label:
        resolved[String(row.id)] ??
        labels.label(
          Object.fromEntries(
            labels.columns.map((name, index) => [name, row[`label_${index}`]]),
          ),
        ),
      values: Object.fromEntries(
        display.columns.map((name, index) => [name, row[`value_${index}`]]),
      ),
    })),
    page: {
      number: page,
      size: limit,
      total: count?.total ?? "0",
      sort,
      direction,
    },
    abilities,
    display,
  };
}
