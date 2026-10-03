import type { Knex } from "knex";
import {
  grantFor,
  requireHuman,
  AccessDeniedError,
  type Access,
} from "../permissions/access.js";
import { objectInput, textInput } from "../shared/input.js";
import { parseId } from "../policies/validation.js";
import { ItemError } from "../items/validation.js";

const table = (db: Knex) => db("asmblyr_workspaces").withSchema("public");
const members = (db: Knex) =>
  db("asmblyr_workspace_collections").withSchema("public");
const selections = (db: Knex) =>
  db("asmblyr_user_workspace").withSchema("public");
function requireManager(access: Access) {
  requireHuman(access);
  if (!access.principal.superuser) throw new AccessDeniedError();
}

export async function listWorkspaces(db: Knex, access: Access) {
  requireHuman(access);
  const [rows, links, selection] = await Promise.all([
    table(db).orderBy("name").select("id", "name", "description"),
    members(db)
      .join("asmblyr_collections as c", "c.id", "collection_id")
      .select("workspace_id", "c.name"),
    selections(db)
      .where({ user_id: access.principal.id })
      .first("workspace_id"),
  ]);
  const visible = (name: string) =>
    ["read", "create", "update"].some((action) =>
      grantFor(access, name, action as "read" | "create" | "update"),
    );
  const workspaces = rows
    .map((row) => ({
      ...row,
      collections: links
        .filter((link) => link.workspace_id === row.id && visible(link.name))
        .map((link) => link.name),
    }))
    .filter((row) => access.principal.superuser || row.collections.length > 0);
  return {
    workspaces,
    selectedId: workspaces.some((w) => w.id === selection?.workspace_id)
      ? (selection.workspace_id as string)
      : null,
  };
}

function input(value: unknown) {
  const body = objectInput(value, ["name", "description", "collections"]);
  if (
    !Array.isArray(body.collections) ||
    body.collections.length > 500 ||
    body.collections.some((v) => typeof v !== "string")
  ) {
    throw new ItemError("Supply up to 500 collection names", 400);
  }
  return {
    name: textInput(body.name, 120),
    description: textInput(body.description ?? "", 500, true),
    collections: [...new Set(body.collections as string[])],
  };
}

export async function saveWorkspace(
  db: Knex,
  access: Access,
  value: unknown,
  id?: string,
) {
  requireManager(access);
  const body = input(value);
  try {
    return await db.transaction(async (trx) => {
      await trx.raw(
        "SELECT pg_advisory_xact_lock(hashtextextended('asmblyr.workspaces', 0))",
      );
      const collections = body.collections.length
        ? await trx("asmblyr_collections")
            .withSchema("public")
            .whereIn("name", body.collections)
            .select("id")
        : [];
      if (collections.length !== body.collections.length)
        throw new ItemError("Some collections no longer exist", 404);
      let row;
      if (id) {
        [row] = await table(trx)
          .where({ id: parseId(id) })
          .update({
            name: body.name,
            description: body.description,
            updated_at: trx.fn.now(),
          })
          .returning("id");
        if (!row) throw new ItemError("Workspace not found", 404);
      } else {
        const count = await table(trx)
          .count<{ total: string }>("* as total")
          .first();
        if (Number(count?.total) >= 100)
          throw new ItemError("You can create up to 100 workspaces", 409);
        [row] = await table(trx)
          .insert({ name: body.name, description: body.description })
          .returning("id");
      }
      await members(trx).where({ workspace_id: row.id }).delete();
      if (collections.length)
        await members(trx).insert(
          collections.map((collection) => ({
            workspace_id: row.id,
            collection_id: collection.id,
          })),
        );
      return { id: row.id, ...body };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "23505")
        throw new ItemError("Workspace name already exists", 409);
      if (error.code === "23503")
        throw new ItemError("Some collections no longer exist", 404);
    }
    throw error;
  }
}

export async function selectWorkspace(db: Knex, access: Access, body: unknown) {
  requireHuman(access);
  const input = objectInput(body, ["workspaceId"]);
  const id = input.workspaceId === null ? null : parseId(input.workspaceId);
  if (
    id &&
    !(await listWorkspaces(db, access)).workspaces.some((w) => w.id === id)
  )
    throw new ItemError("Workspace not found", 404);
  try {
    await selections(db)
      .insert({ user_id: access.principal.id, workspace_id: id })
      .onConflict("user_id")
      .merge({ workspace_id: id });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23503"
    )
      throw new ItemError("Workspace not found", 404);
    throw error;
  }
  return { workspaceId: id };
}

export async function deleteWorkspace(db: Knex, access: Access, id: string) {
  requireManager(access);
  if (
    !(await table(db)
      .where({ id: parseId(id) })
      .delete())
  )
    throw new ItemError("Workspace not found", 404);
}
