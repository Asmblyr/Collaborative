import type { Knex } from "knex";
import type { Access } from "../permissions/access.js";
import { objectInput, textInput } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import { ItemError } from "../items/validation.js";
import { validateView, viewContext } from "./table-view-validation.js";
import {
  activeWorkspace,
  assertViewManager,
  parseViewOwner,
  visibleViews,
  type ViewOwner,
} from "./table-view-scope.js";

const table = (db: Knex) => db("asmblyr_table_views").withSchema("public");
interface ViewRow extends ViewOwner {
  id: string;
  name: string;
  definition: unknown;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}
const project = (
  row: ViewRow,
  definition: ReturnType<typeof validateView> | null,
  access: Access,
) => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  workspaceId: row.workspace_id,
  isDefault: row.is_default,
  editable:
    row.scope === "personal"
      ? row.user_id === access.principal.id
      : access.principal.superuser,
  definition,
  available: definition !== null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listTableViews(db: Knex, name: string, access: Access) {
  const ctx = await viewContext(db, name, access);
  const workspaceId = await activeWorkspace(db, access.principal.id, ctx.id);
  const rows = await table(db)
    .where({ collection_id: ctx.id })
    .modify((q) => visibleViews(q, access.principal.id, workspaceId))
    .orderBy("name")
    .select<ViewRow[]>("*");
  return rows.map((row) => {
    try {
      return project(row, validateView(row.definition, ctx, true), access);
    } catch {
      return project(row, null, access);
    }
  });
}

export async function defaultTableView(db: Knex, name: string, access: Access) {
  const views = await listTableViews(db, name, access);
  return (
    ["personal", "workspace", "collection"]
      .map((scope) =>
        views.find(
          (view) => view.scope === scope && view.isDefault && view.available,
        ),
      )
      .find(Boolean) ?? null
  );
}

export async function saveTableView(
  db: Knex,
  collection: string,
  access: Access,
  value: unknown,
  id?: string,
) {
  const body = objectInput(value, [
    "name",
    "definition",
    "scope",
    "workspaceId",
    "isDefault",
  ]);
  const name = textInput(body.name, 60);
  if (body.isDefault !== undefined && typeof body.isDefault !== "boolean")
    throw new ItemError("Invalid default flag", 400);
  const ctx = await viewContext(db, collection, access);
  const definition = validateView(body.definition, ctx);
  try {
    return await db.transaction(async (trx) => {
      // Serialize each collection's view/default changes, including different shared-view creators.
      await trx("asmblyr_collections")
        .withSchema("public")
        .where({ id: ctx.id })
        .forUpdate()
        .first("id");
      const current = id
        ? await table(trx)
            .where({ id: parseId(id), collection_id: ctx.id })
            .first<ViewRow>()
        : undefined;
      if (id && !current) throw new ItemError("Saved view not found", 404);
      if (current) assertViewManager(current, access);
      const owner = await parseViewOwner(trx, body, ctx.id, access, current);
      const isDefault = body.isDefault ?? current?.is_default ?? false;
      if (isDefault)
        await table(trx).where(owner).update({ is_default: false });
      let row: ViewRow;
      const values = {
        name,
        definition: JSON.stringify(definition),
        is_default: isDefault,
        updated_at: trx.fn.now(),
      };
      if (current) {
        [row] = await table(trx)
          .where({ id: current.id })
          .update(values)
          .returning("*");
      } else {
        const count = await table(trx)
          .where(owner)
          .count<{ total: string }>("* as total")
          .first();
        if (Number(count?.total) >= 30)
          throw new ItemError(
            "You can save up to 30 views per scope and collection",
            409,
          );
        [row] = await table(trx)
          .insert({ ...owner, ...values, created_by: access.principal.id })
          .returning("*");
      }
      return project(row, definition, access);
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    )
      throw new ItemError("A view with this name already exists", 409);
    throw error;
  }
}

export async function deleteTableView(
  db: Knex,
  name: string,
  access: Access,
  id: string,
) {
  const ctx = await viewContext(db, name, access);
  await db.transaction(async (trx) => {
    const row = await table(trx)
      .where({ id: parseId(id), collection_id: ctx.id })
      .forUpdate()
      .first<ViewRow>();
    if (!row) throw new ItemError("Saved view not found", 404);
    assertViewManager(row, access);
    await table(trx).where({ id: row.id }).delete();
  });
}
