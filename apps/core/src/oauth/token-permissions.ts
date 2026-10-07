import type { Knex } from "knex";
import { errors } from "oidc-provider";
import type { OAuthApplications } from "./applications.js";
import { findGrantBinding } from "./grant-bindings.js";
import { digest } from "./crypto.js";

export async function applicationTokenPermissions(
  db: Knex,
  apps: OAuthApplications,
  token: { clientId?: string; accountId?: string; grantId?: string },
): Promise<Record<string, unknown>> {
  const { clientId, accountId, grantId } = token;
  if (!clientId || !accountId || !(await apps.allowed(clientId, accountId))) {
    throw new errors.AccessDenied();
  }
  const app = await apps.row(clientId);
  if (!app?.policy_managed || !app.audience) {
    return {};
  }
  const binding = grantId
    ? await findGrantBinding(db, digest(grantId))
    : undefined;
  if (
    !binding ||
    binding.app_id !== clientId ||
    binding.user_id !== accountId
  ) {
    throw new errors.AccessDenied();
  }
  const currentScopes = await apps.serviceScopes(clientId, accountId);
  // A pending authorization must never gain permissions added after consent.
  const roles = currentScopes.filter((scope) =>
    binding.service_scopes.includes(scope),
  );
  return { resource_access: { [app.audience]: { roles } } };
}
