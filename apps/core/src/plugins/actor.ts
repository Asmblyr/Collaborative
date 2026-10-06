import type { EndpointActor } from "@asmblyr-collaborative/kit";
import type { Knex } from "knex";
import type { Principal } from "../auth/principal.js";

export async function pluginActor(
  database: Knex,
  principal: Principal,
): Promise<EndpointActor> {
  const table =
    principal.kind === "user" ? "asmblyr_users" : "asmblyr_service_accounts";
  const column = principal.kind === "user" ? "display_name" : "name";
  const row = await database(table)
    .withSchema("public")
    .where({ id: principal.id })
    .first<Record<string, unknown>>(column);
  const name = row?.[column];
  return {
    id: principal.id,
    kind: principal.kind,
    ...(typeof name === "string" && name ? { displayName: name } : {}),
  };
}
