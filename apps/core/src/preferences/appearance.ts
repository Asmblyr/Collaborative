import {
  themeStyles,
  uiLocales,
  type UserPreferences,
} from "@asmblyr-collaborative/contracts";
import type { Knex } from "knex";
import { objectInput } from "../shared/input.js";
import { AuthInputError } from "../auth/validation.js";

const table = "asmblyr_user_preferences";
export async function readAppearance(
  db: Knex,
  userId: string,
): Promise<UserPreferences> {
  const saved = await db(table)
    .where({ user_id: userId })
    .first("theme", "style", "locale", "timezone");
  return {
    theme: saved?.theme ?? null,
    style: saved?.style ?? "neutral",
    locale: saved?.locale ?? "ru",
    timezone: saved?.timezone ?? null,
  };
}

export async function saveAppearance(
  db: Knex,
  userId: string,
  input: unknown,
): Promise<UserPreferences> {
  const body = objectInput(input, ["theme", "style", "locale", "timezone"]);
  if (!Object.keys(body).length) {
    throw new AuthInputError("No preferences supplied");
  }
  const allowed = {
    theme: ["light", "dark", "system"],
    style: themeStyles,
    locale: uiLocales,
  };
  const patch: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(body)) {
    if (key === "timezone") {
      if (value === null) {
        patch.timezone = null;
        continue;
      }
      if (
        typeof value !== "string" ||
        value.length > 100 ||
        !/^[A-Za-z0-9_+\-/]+$/.test(value)
      ) {
        throw new AuthInputError("Invalid timezone");
      }
      try {
        patch.timezone = new Intl.DateTimeFormat("en", {
          timeZone: value,
        }).resolvedOptions().timeZone;
      } catch {
        throw new AuthInputError("Invalid timezone");
      }
      continue;
    }
    if (
      typeof value !== "string" ||
      !allowed[key as keyof typeof allowed].some((v) => v === value)
    ) {
      throw new AuthInputError(`Invalid ${key}`);
    }
    patch[key] = value;
  }
  return db.transaction(async (trx) => {
    await trx(table)
      .insert({ user_id: userId, ...patch })
      .onConflict("user_id")
      .merge(patch);
    return readAppearance(trx, userId);
  });
}
