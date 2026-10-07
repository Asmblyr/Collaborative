import type { Knex } from "knex";
import type {
  ProfileDisplayConfiguration,
  ProfileDisplayEntry,
} from "@asmblyr-collaborative/contracts";
import { InputError, objectInput, textInput } from "../shared/input.js";
import { securityEvent } from "./security-events.js";
import {
  parseDisplayPath,
  profileDisplaySchema,
} from "./profile-display-schema.js";

export interface StoredDisplayEntry extends ProfileDisplayEntry {
  signature: string;
}
export interface StoredDisplayConfiguration {
  title: string;
  entries: StoredDisplayEntry[];
}

export async function storedProfileDisplay(
  db: Knex,
): Promise<StoredDisplayConfiguration> {
  return await db("public.asmblyr_profile_display")
    .where({ id: 1 })
    .first("title", "entries");
}

export async function getProfileDisplayConfiguration(
  db: Knex,
): Promise<ProfileDisplayConfiguration> {
  const config = await storedProfileDisplay(db);
  return {
    title: config.title,
    entries: config.entries.map(({ id, label, path, selfVisible }) => ({
      id,
      label,
      path,
      selfVisible,
    })),
  };
}

function parseConfiguration(input: unknown): ProfileDisplayConfiguration {
  const body = objectInput(input, ["title", "entries"]);
  const title = textInput(body.title, 100, true);
  if (!Array.isArray(body.entries) || body.entries.length > 12) {
    throw new InputError("A profile display supports up to 12 entries");
  }
  const ids = new Set<string>();
  const entries = body.entries.map((value): ProfileDisplayEntry => {
    const entry = objectInput(value, ["id", "label", "path", "selfVisible"]);
    if (
      typeof entry.id !== "string" ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.selfVisible !== "boolean"
    ) {
      throw new InputError("Invalid profile display entry");
    }
    ids.add(entry.id);
    return {
      id: entry.id,
      label: textInput(entry.label, 100),
      path: parseDisplayPath(entry.path),
      selfVisible: entry.selfVisible,
    };
  });
  return { title, entries };
}

export async function saveProfileDisplayConfiguration(
  db: Knex,
  input: unknown,
  actorId: string,
): Promise<ProfileDisplayConfiguration> {
  const config = parseConfiguration(input);
  return db.transaction(async (trx) => {
    const schema = await profileDisplaySchema(trx);
    const entries = config.entries.map((entry) => ({
      ...entry,
      signature: schema.resolve(entry.path).signature,
    }));
    await trx("public.asmblyr_profile_display")
      .where({ id: 1 })
      .update({
        title: config.title,
        entries: JSON.stringify(entries),
      });
    await securityEvent(
      trx,
      actorId,
      "users.profile_display_configured",
      actorId,
      {
        entries: entries.map(({ id, path, selfVisible }) => ({
          id,
          path,
          selfVisible,
        })),
      },
    );
    return config;
  });
}
