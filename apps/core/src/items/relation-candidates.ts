import {
  selectRowPermissions,
  projectRow,
  applyRowAccess,
} from "../permissions/row-access.js";
import type { Knex } from "knex";
import { listCollections } from "../collections/catalog-repository.js";
import { AccessDeniedError, type Access } from "../permissions/access.js";
import type { ItemListQuery } from "./list-query.js";
import { itemReadQuery } from "./read-query.js";
import { relationContext, type RelationAddress } from "./relation-context.js";
import { selectedColumns } from "./service.js";
import { resolveRecordLabels } from "./record-labels.js";

// Availability is applied before both pagination and counting. Mutation-time
// checks remain authoritative if another request links a candidate meanwhile.
export async function listRelationCandidates(
  database: Knex,
  address: RelationAddress,
  access: Access,
  input: ItemListQuery,
) {
  const { alias, id, target, allowed, abilities } = await relationContext(
    database,
    address,
    access,
  );
  if (!abilities.attach) throw new AccessDeniedError();
  const name = alias.related_collection;
  const key = target.settings.primaryKey.name;
  const catalog =
    input.q !== undefined || input.filter !== undefined
      ? await listCollections(database)
      : [];
  const { query, options } = itemReadQuery(
    database,
    name,
    target,
    allowed,
    input,
    catalog,
    access,
  );
  if (alias.kind === "o2m") {
    applyRowAccess(query, database, access, name, "read", [
      alias.through_field,
    ]);
    query.whereNull(alias.through_field);
  } else {
    query.whereNotExists(
      database({ candidate_link: `public.${alias.through_collection}` })
        .select(database.raw("1"))
        .where("candidate_link." + alias.through_field, id)
        .whereRaw("?? = ??", [
          "candidate_link." + alias.related_field!,
          `${name}.${key}`,
        ]),
    );
  }
  const { page, limit, sort, direction, offset } = options;
  const [data, count] = await Promise.all([
    query
      .clone()
      .select(selectedColumns(target, allowed))
      .modify((builder) =>
        selectRowPermissions(builder, database, access, name),
      )
      .orderBy(sort, direction, "last")
      .modify((builder) => {
        if (sort !== key) builder.orderBy(key);
      })
      .limit(limit)
      .offset(offset),
    query.clone().count<{ total: string }>("* as total").first(),
  ]);
  return {
    data: data.map((row: Record<string, unknown>) =>
      projectRow(row, access, name, key),
    ),
    labels: await resolveRecordLabels(
      database,
      name,
      data.map((row: Record<string, unknown>) => String(row[key])),
      access,
    ),
    page: {
      number: page,
      size: limit,
      total: count?.total ?? "0",
      sort,
      direction,
    },
  };
}
