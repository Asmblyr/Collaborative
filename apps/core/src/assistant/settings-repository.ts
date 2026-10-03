import type { Knex } from "knex";
import { createHash } from "node:crypto";
import { securityEvent } from "../auth/security-events.js";
import { initialAssistantDefaults, type AssistantDefaults } from "./settings.js";

export async function loadAssistantDefaults(database: Knex): Promise<AssistantDefaults> {
  const row = await database("asmblyr_settings").withSchema("public").where({ key: "assistant" }).first("value");
  return { ...initialAssistantDefaults, ...row?.value };
}

export async function saveAssistantDefaults(database: Knex, actorId: string, value: AssistantDefaults) {
  await database.transaction(async (trx) => {
    await trx("asmblyr_settings").withSchema("public").insert({ key: "assistant", value: JSON.stringify(value) })
      .onConflict("key").merge({ value: JSON.stringify(value), updated_at: trx.fn.now() });
    // Keep the text only in settings; the audit records its fingerprint, not a second prompt copy.
    await securityEvent(trx, actorId, "settings.assistant.update", actorId, { settings: { ...value,
      instructions: { source: value.instructions === null ? "default" : "custom", length: value.instructions?.length ?? 0,
        sha256: value.instructions === null ? null : createHash("sha256").update(value.instructions).digest("hex") },
    } });
  });
}
