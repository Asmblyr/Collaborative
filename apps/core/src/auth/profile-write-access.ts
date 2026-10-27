import type { Knex } from "knex";
import type { AuthenticatedUser } from "./tokens.js";
import type { ProfileChanges } from "./profile-input.js";
import { effectiveSettingsAccess } from "../settings/access.js";
import { AccessDeniedError } from "../permissions/access.js";

const profileColumns = {
  first_name: "firstName",
  last_name: "lastName",
  display_name: "displayName",
  description: "description",
  avatar_id: "avatarId",
  picture_url: "avatarId",
} as const;

export async function nativeProfileWriteFields(
  db: Knex,
  actor: AuthenticatedUser,
  userId = actor.id,
): Promise<Set<string>> {
  const fields = new Set(Object.values(profileColumns));
  if (actor.superuser) {
    return fields;
  }
  const settings = await effectiveSettingsAccess(db, actor.id);
  if (settings.editableSections.includes("users")) {
    return fields;
  }
  if (actor.id !== userId) {
    return new Set();
  }
  const config = await db("public.asmblyr_user_form")
    .where({ id: 1 })
    .first("self_access");
  return new Set([
    "avatarId",
    ...[...fields].filter((field) => config.self_access[field] === "write"),
  ]);
}

export async function requireProfileWrite(
  db: Knex,
  actor: AuthenticatedUser,
  userId: string,
  changes: ProfileChanges,
): Promise<void> {
  await db("public.asmblyr_user_form").where({ id: 1 }).forShare().first();
  const writable = await nativeProfileWriteFields(db, actor, userId);
  for (const column of Object.keys(changes) as (keyof ProfileChanges)[]) {
    if (!writable.has(profileColumns[column])) {
      throw new AccessDeniedError();
    }
  }
}
