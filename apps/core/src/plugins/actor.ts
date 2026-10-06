import type { EndpointActor } from "@asmblyr-collaborative/kit";
import type { Knex } from "knex";
import type { Principal } from "../auth/principal.js";

export async function pluginActor(
  database: Knex,
  principal: Principal,
): Promise<EndpointActor> {
  const table =
    principal.kind === "user" ? "asmblyr_users" : "asmblyr_service_accounts";
  const columns =
    principal.kind === "user"
      ? ["display_name", "first_name", "last_name", "email"]
      : ["name"];
  const row = await database(table)
    .withSchema("public")
    .where({ id: principal.id })
    .first<Record<string, string | null>>(...columns);
  const name =
    principal.kind === "user"
      ? row?.display_name ||
        [row?.first_name, row?.last_name].filter(Boolean).join(" ") ||
        row?.email
      : row?.name;
  return {
    id: principal.id,
    kind: principal.kind,
    ...(typeof name === "string" && name ? { displayName: name } : {}),
  };
}
