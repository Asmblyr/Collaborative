import type { CollectionRow, EndpointActor } from "@asmblyr/kit";
import type { Comment } from "../../shared/comments.js";
import type entries from "../collections/entries.js";

export function presentComment(
  row: CollectionRow<typeof entries>,
  actor: EndpointActor,
): Comment {
  const own = row.author_id === actor.id && row.author_kind === actor.kind;
  let author: Comment["author"] = null;
  if (
    row.author_id &&
    (row.author_kind === "user" || row.author_kind === "service")
  ) {
    author = {
      id: row.author_id,
      kind: row.author_kind,
      name: row.author_name,
    };
  }

  return {
    id: row.id,
    body: row.body,
    author,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isOwn: own,
    canEdit: own,
    canDelete: own,
  };
}
