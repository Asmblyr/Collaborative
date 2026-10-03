import type { Knex } from "knex";
import { authenticatePrincipal } from "../auth/principal.js";
import { AccessDeniedError } from "../permissions/access.js";

export async function requireSettingsAdministrator(
  database: Knex,
  request: { headers: { authorization?: string } },
) {
  const principal = await authenticatePrincipal(
    database,
    request.headers.authorization,
  );
  if (principal.kind !== "user" || !principal.superuser) {
    throw new AccessDeniedError();
  }
  return principal;
}
