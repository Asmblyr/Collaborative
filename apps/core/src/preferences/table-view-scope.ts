import type { Knex } from "knex";
import { AccessDeniedError, type Access } from "../permissions/access.js";
import { parseId } from "../policies/validation.js";
import { ItemError } from "../items/validation.js";

export type ViewScope = "personal" | "collection" | "workspace";
export interface ViewOwner { scope: ViewScope; user_id: string | null; workspace_id: string | null; collection_id: string }

export async function activeWorkspace(db: Knex, userId: string, collectionId: string) {
  const row = await db("asmblyr_user_workspace as s").join("asmblyr_workspace_collections as m", "m.workspace_id", "s.workspace_id")
    .where({ "s.user_id": userId, "m.collection_id": collectionId }).first("s.workspace_id");
  return row?.workspace_id as string | undefined;
}
export function visibleViews(query: Knex.QueryBuilder, userId: string, workspaceId?: string) {
  query.where((where) => {
    where.where({ scope: "personal", user_id: userId }).orWhere({ scope: "collection" });
    if (workspaceId) where.orWhere({ scope: "workspace", workspace_id: workspaceId });
  });
}
export function assertViewManager(row: ViewOwner, access: Access) {
  if (row.scope === "personal" ? row.user_id !== access.principal.id : !access.principal.superuser) throw new ItemError("Saved view not found", 404);
}
export async function parseViewOwner(db: Knex, body: Record<string, unknown>, collectionId: string, access: Access, previous?: ViewOwner): Promise<ViewOwner> {
  const scope = body.scope ?? previous?.scope ?? "personal";
  if (!["personal", "collection", "workspace"].includes(scope as string)) throw new ItemError("Invalid view scope", 400);
  if (previous && scope !== previous.scope) throw new ItemError("Copy the view to change its scope", 400);
  if (scope !== "personal" && !access.principal.superuser) throw new AccessDeniedError();
  const workspaceId = body.workspaceId ?? previous?.workspace_id;
  if (scope !== "workspace" && workspaceId != null) throw new ItemError("Workspace is only allowed for workspace views", 400);
  const id = scope === "workspace" ? parseId(workspaceId) : null;
  if (previous && id !== previous.workspace_id) throw new ItemError("Copy the view to change its workspace", 400);
  if (id) {
    const membership = await db("asmblyr_workspace_collections").where({ workspace_id: id, collection_id: collectionId }).forShare().first();
    if (!membership) throw new ItemError("Collection is not in this workspace", 404);
  }
  return { scope: scope as ViewScope, user_id: scope === "personal" ? access.principal.id : null, workspace_id: id, collection_id: collectionId };
}
