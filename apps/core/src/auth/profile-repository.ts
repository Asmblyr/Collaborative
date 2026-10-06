import type { Knex } from "knex";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { UserNotFoundError } from "./validation.js";

export async function readUserProfile(
  db: Knex,
  id: string,
): Promise<CurrentUser> {
  const row = await db("public.asmblyr_users as u")
    .where("u.id", id)
    .select(
      "u.id",
      "u.email",
      "u.superuser",
      "u.display_name",
      "u.first_name",
      "u.last_name",
      "u.description",
      "u.picture_url",
      "u.avatar_id",
      "u.created_at",
      "u.updated_at",
      "u.last_login_at",
      "u.last_active_at",
    )
    .select(
      db.raw(
        'EXISTS (SELECT 1 FROM public.asmblyr_password_credentials WHERE user_id = u.id) AS "hasPassword"',
      ),
    )
    .first();
  if (!row) {
    throw new UserNotFoundError();
  }
  return {
    id: row.id,
    email: row.email,
    superuser: row.superuser,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    description: row.description,
    pictureUrl: row.picture_url,
    avatarId: row.avatar_id,
    hasPassword: row.hasPassword,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    lastActiveAt: row.last_active_at?.toISOString() ?? null,
  };
}
