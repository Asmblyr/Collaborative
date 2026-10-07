import type { Knex } from "knex";
import type { ItemField } from "./types.js";
import type { Access } from "../permissions/access.js";
import { AccessDeniedError } from "../permissions/access.js";
import { requireUserReferenceRead } from "../auth/user-references.js";
import { ItemError, parseItemId } from "./validation.js";

export async function validateUserReferenceWrites(
  db: Knex.Transaction,
  fields: Map<string, ItemField>,
  values: Record<string, unknown>,
  before: Record<string, unknown> | null,
  access?: Access,
): Promise<void> {
  const ids = [
    ...new Set(
      Object.entries(values)
        .filter(
          ([name, value]) =>
            value != null &&
            value !== before?.[name] &&
            fields.get(name)?.relation?.collection === "@users",
        )
        .map(([, value]) => parseItemId(String(value), "uuid")),
    ),
  ];
  if (!ids.length) {
    return;
  }
  if (!access) {
    throw new AccessDeniedError();
  }
  await requireUserReferenceRead(db, access.principal);
  const users = await db("public.asmblyr_users")
    .whereIn("id", ids)
    .where("status", "active")
    .select("id")
    .forShare();
  if (users.length !== ids.length) {
    throw new ItemError("Related user is unavailable", 409);
  }
}
