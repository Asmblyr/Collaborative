import type { Knex } from "knex";
import type {
  JsonValue,
  UserFormResult,
} from "@asmblyr-collaborative/contracts";
import type { AuthenticatedUser } from "./tokens.js";
import { readUserFormConfiguration } from "../system-collections/user-form-config.js";
import {
  profileBaseFields,
  displayFieldName,
} from "../system-collections/user-form-schema.js";
import { readUserProfile } from "./profile-repository.js";
import { readProfileDisplay } from "./profile-display.js";
import { updateProfile } from "./profile.js";
import { updateSystemRecord } from "../system-collections/records.js";
import { lockSystemCollection } from "../system-collections/repository.js";
import { reconcileForm } from "../collections/form-layout.js";
import { objectInput } from "../shared/input.js";
import {
  loadPrincipalAccess,
  requireGrant,
  AccessDeniedError,
} from "../permissions/access.js";
import { getItem } from "../items/service.js";
import { nativeProfileWriteFields } from "./profile-write-access.js";

export async function readUserForm(
  db: Knex,
  actor: AuthenticatedUser,
  userId: string,
  writable = true,
): Promise<UserFormResult> {
  const config = await readUserFormConfiguration(db);
  const own = actor.id === userId;
  const nativeWritable = await nativeProfileWriteFields(db, actor, userId);
  const user = await readUserProfile(db, userId);
  const display = await readProfileDisplay(db, userId, own);
  const projected = new Map(
    display.entries.map((entry) => [displayFieldName(entry.id), entry.value]),
  );
  const fields = config.fields.filter((field) => {
    if (field.name.startsWith("@display:")) {
      return projected.has(field.name);
    }
    return (
      field.managed || actor.superuser || (own && config.selfAccess[field.name])
    );
  });
  const custom = fields.filter((field) => !field.managed);
  const row = custom.length
    ? await db("public.asmblyr_users")
        .where({ id: userId })
        .first(...custom.map((field) => field.name))
    : {};
  const values: Record<string, JsonValue> = {};
  for (const field of fields) {
    if (field.name.startsWith("@display:")) {
      values[field.name] = projected.get(field.name) ?? null;
    } else if (field.managed) {
      values[field.name] = user[field.name as keyof typeof user] as JsonValue;
    } else {
      const value = row[field.name];
      values[field.name] = value instanceof Date ? value.toISOString() : value;
    }
  }
  return {
    user,
    fields,
    values,
    canEditAvatar: writable && nativeWritable.has("avatarId"),
    layout: reconcileForm(
      config.layout,
      fields.map((field) => field.name),
    ),
    readOnlyFields: fields
      .filter(
        (field) =>
          !writable ||
          field.name === "email" ||
          field.name.startsWith("@display:") ||
          (field.managed && !nativeWritable.has(field.name)) ||
          (!field.managed &&
            !actor.superuser &&
            config.selfAccess[field.name] !== "write"),
      )
      .map((field) => field.name),
  };
}

export async function saveUserForm(
  db: Knex,
  actor: AuthenticatedUser,
  userId: string,
  body: unknown,
): Promise<UserFormResult> {
  const input = objectInput(body, ["values", "avatarId"]);
  return db.transaction(async (trx) => {
    await lockSystemCollection(trx, "users", "ROW EXCLUSIVE");
    // Serialize permission changes with form writes; hidden/read-only fields are server enforced.
    await trx("public.asmblyr_user_form").where({ id: 1 }).forShare().first();
    const form = await readUserForm(trx, actor, userId);
    const values = objectInput(
      input.values,
      form.fields.map((field) => field.name),
    );
    if (
      Object.keys(values).some((name) => form.readOnlyFields.includes(name))
    ) {
      throw new AccessDeniedError();
    }
    const base = new Set(profileBaseFields.map((field) => field.name));
    const profile = Object.fromEntries(
      Object.entries(values).filter(([name]) => base.has(name)),
    );
    if (Object.hasOwn(input, "avatarId")) {
      profile.avatarId = input.avatarId;
    }
    const custom = Object.fromEntries(
      Object.entries(values).filter(([name]) => !base.has(name)),
    );
    if (Object.keys(custom).length) {
      if (!actor.superuser) {
        const access = await loadPrincipalAccess(trx, {
          ...actor,
          kind: "user",
        });
        for (const field of form.fields) {
          const value = custom[field.name];
          if (field.relation && value !== undefined && value !== null) {
            await getItem(
              trx,
              field.relation.collection,
              String(value),
              requireGrant(access, field.relation.collection, "read"),
              undefined,
              access,
            );
          }
        }
      }
      await updateSystemRecord(
        trx,
        "users",
        userId,
        { values: custom },
        actor.id,
      );
    }
    if (Object.keys(profile).length) {
      await updateProfile(trx, actor, profile, userId);
    }
    return readUserForm(trx, actor, userId);
  });
}
