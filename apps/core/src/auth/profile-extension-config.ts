import type { Knex } from "knex";
import { objectInput } from "../shared/input.js";
import { AuthInputError, AuthConflictError } from "./validation.js";
import { parseMutableCollectionName } from "../collections/validation.js";
import { lockedCollectionSettings } from "../collections/settings-repository.js";

export interface ProfileExtensionBinding {
  collection: string;
  key: string;
}

export async function profileExtensionBinding(
  db: Knex,
  lock = false,
): Promise<ProfileExtensionBinding | null> {
  const query = db("public.asmblyr_profile_extension").where({ id: 1 });
  if (lock) {
    query.forShare();
  }
  const setting = await query.first("collection_id");
  if (!setting?.collection_id) {
    return null;
  }
  const row = await db("public.asmblyr_collections")
    .where({ id: setting.collection_id })
    .first("name", "primary_key_name");
  return row ? { collection: row.name, key: row.primary_key_name } : null;
}

/** Bind a consumer-owned UUID collection; its primary key becomes the user identity. */
export async function configureProfileExtension(
  db: Knex,
  input: unknown,
): Promise<ProfileExtensionBinding | null> {
  const body = objectInput(input, ["collection"]);
  if (!Object.hasOwn(body, "collection")) {
    throw new AuthInputError("Select a profile collection or null");
  }
  const name =
    body.collection === null
      ? null
      : parseMutableCollectionName(body.collection);
  return db.transaction(async (trx) => {
    await trx("public.asmblyr_profile_extension")
      .where({ id: 1 })
      .forUpdate()
      .first("id");
    if (!name) {
      await trx("public.asmblyr_profile_extension")
        .where({ id: 1 })
        .update({ collection_id: null });
      return null;
    }
    const settings = await lockedCollectionSettings(trx, name);
    if (
      settings.sourceKind === "materialized-view" ||
      settings.mode !== "multiple" ||
      settings.primaryKey.type !== "uuid"
    ) {
      throw new AuthInputError(
        "Profile extension requires a regular collection with a UUID primary key",
      );
    }
    const constraint = await trx("pg_constraint")
      .where({ conname: "asmblyr_user_profile_owner" })
      .whereRaw("conrelid = ?::regclass", [`public.${name}`])
      .first("oid");
    if (!constraint) {
      const invalid = await trx(`${name} as profile`)
        .withSchema("public")
        .leftJoin(
          "asmblyr_users as usr",
          "usr.id",
          `profile.${settings.primaryKey.name}`,
        )
        .whereNull("usr.id")
        .first(`profile.${settings.primaryKey.name}`);
      if (invalid) {
        throw new AuthConflictError(
          "Existing profile record IDs must match user IDs; select an empty collection",
        );
      }
      await trx.schema.withSchema("public").alterTable(name, (table) => {
        table
          .foreign(settings.primaryKey.name, "asmblyr_user_profile_owner")
          .references("id")
          .inTable("public.asmblyr_users")
          .onDelete("RESTRICT");
      });
    }
    await trx("public.asmblyr_profile_extension")
      .where({ id: 1 })
      .update({ collection_id: settings.internalId });
    return { collection: name, key: settings.primaryKey.name };
  });
}
