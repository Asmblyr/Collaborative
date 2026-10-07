import type { Knex } from "knex";
import type { Principal } from "./principal.js";
import { AccessDeniedError } from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";
import { ItemError, parseItemId } from "../items/validation.js";
import { objectInput } from "../shared/input.js";

export async function requireUserReferenceRead(
  db: Knex,
  principal: Principal,
): Promise<void> {
  if (principal.kind !== "user") throw new AccessDeniedError();
  if (
    !principal.superuser &&
    !(await effectiveSettingsAccess(db, principal.id)).sections.includes(
      "users",
    )
  ) {
    throw new AccessDeniedError();
  }
}

/** A bounded projection for pickers; never expose credentials or arbitrary user columns. */
export async function listUserReferences(
  db: Knex,
  principal: Principal,
  input: unknown,
) {
  await requireUserReferenceRead(db, principal);
  const query = objectInput(input, ["q", "page", "limit", "ids"]);
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (query.q !== undefined &&
      (typeof query.q !== "string" || query.q.length > 200)) ||
    (query.ids !== undefined && typeof query.ids !== "string")
  ) {
    throw new ItemError("Invalid user reference query", 400);
  }
  const ids = typeof query.ids === "string" ? query.ids.split(",") : undefined;
  if (ids && (ids.length > 100 || !ids.length))
    throw new ItemError("Too many user IDs", 400);
  ids?.forEach((id) => parseItemId(id, "uuid"));
  const rows = db("public.asmblyr_users");
  // Existing disabled references can still be identified, but cannot be selected anew.
  if (ids) rows.whereIn("id", ids);
  else rows.where("status", "active");
  if (typeof query.q === "string" && query.q.trim()) {
    const search = `%${query.q.trim().replace(/[\\%_]/g, "\\$&")}%`;
    rows.where((builder) => {
      for (const column of ["email", "display_name", "first_name", "last_name"])
        builder.orWhereILike(column, search);
    });
  }
  const [users, count] = await Promise.all([
    rows
      .clone()
      .select(
        "id",
        db.raw(
          "concat_ws(' · ', coalesce(nullif(btrim(display_name), ''), nullif(btrim(concat_ws(' ', first_name, last_name)), '')), email) as label",
        ),
      )
      .orderBy("label")
      .orderBy("id")
      .limit(limit)
      .offset((page - 1) * limit),
    rows.clone().count<{ total: string }>("* as total").first(),
  ]);
  const data = users.map((user) => ({
    id: user.id as string,
    label: user.label as string,
  }));
  return {
    data,
    labels: Object.fromEntries(data.map((user) => [user.id, user.label])),
    page: {
      number: page,
      size: limit,
      total: count?.total ?? "0",
      sort: "label",
      direction: "asc" as const,
    },
  };
}
