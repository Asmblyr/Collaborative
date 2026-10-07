import type { Knex } from "knex";
import type {
  ProfileDisplayResult,
  ProfileDisplayValue,
} from "@asmblyr-collaborative/contracts";
import { InputError } from "../shared/input.js";
import { storedProfileDisplay } from "./profile-display-config.js";
import {
  profileDisplaySchema,
  type ProfileDisplayBinding,
} from "./profile-display-schema.js";
import { UserNotFoundError } from "./validation.js";

async function readValue(
  db: Knex,
  userId: string,
  binding: ProfileDisplayBinding,
): Promise<ProfileDisplayValue["value"]> {
  let value: unknown = userId;
  for (const step of binding.steps) {
    if (value === null || value === undefined) {
      return null;
    }
    const row = await db(step.table)
      .withSchema("public")
      .where(step.key, value as string)
      .first(step.field);
    value = row?.[step.field] ?? null;
  }
  if (value === null) {
    return null;
  }
  if (binding.type === "user") {
    const user = await db("public.asmblyr_users")
      .where({ id: value })
      .first("display_name", "first_name", "last_name", "email");
    if (!user) {
      return null;
    }
    return (
      user.display_name?.trim() ||
      [user.first_name, user.last_name].filter(Boolean).join(" ") ||
      user.email
    );
  }
  if (binding.type === "tags") {
    return Array.isArray(value) && value.every((tag) => typeof tag === "string")
      ? value
      : null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : null;
}

/** Explicit display grants disclose only configured paths rooted in this user.
 * They do not confer collection access or permit arbitrary paths from the caller. */
export async function readProfileDisplay(
  db: Knex,
  userId: string,
  own: boolean,
): Promise<ProfileDisplayResult> {
  return db.transaction(
    async (trx) => {
      const exists = await trx("public.asmblyr_users")
        .where({ id: userId })
        .first("id");
      if (!exists) {
        throw new UserNotFoundError();
      }
      const config = await storedProfileDisplay(trx);
      const selected = config.entries.filter(
        (entry) => !own || entry.selfVisible,
      );
      if (!selected.length) {
        return { title: config.title, entries: [] };
      }
      const schema = await profileDisplaySchema(trx);
      const entries: ProfileDisplayValue[] = [];
      for (const entry of selected) {
        let binding: ProfileDisplayBinding;
        try {
          binding = schema.resolve(entry.path);
        } catch (error) {
          if (error instanceof InputError) {
            continue;
          }
          throw error;
        }
        // Deleted/recreated columns or changed relation targets require reconfiguration.
        if (binding.signature !== entry.signature) {
          continue;
        }
        entries.push({
          id: entry.id,
          label: entry.label,
          type: binding.type,
          value: await readValue(trx, userId, binding),
        });
      }
      return { title: config.title, entries };
    },
    { isolationLevel: "repeatable read", readOnly: true },
  );
}
