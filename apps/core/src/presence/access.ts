import type { Knex } from "knex";
import {
  settingsSections,
  type PresenceScope,
  type SettingsSection,
} from "@asmblyr-collaborative/contracts";
import {
  AccessDeniedError,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import { effectiveSettingsAccess } from "../settings/access.js";
import { findCollectionSettings } from "../collections/settings-repository.js";
import { getItem } from "../items/service.js";
import { ItemError } from "../items/validation.js";

const sections: Partial<Record<string, SettingsSection[]>> = {
  "/access": ["users", "policies"],
  "/services": ["services"],
  "/oauth-apps": ["oauth"],
  "/system-settings": [...settingsSections],
  "/system-settings/users": ["users"],
  "/system-settings/policies": ["policies"],
  "/system-settings/services": ["services"],
  "/system-settings/assistant": ["assistant"],
  "/system-settings/plugins": ["plugins"],
  "/system-settings/terms": ["terms"],
  "/system-settings/oauth": ["oauth"],
  "/files": ["files"],
};
/** Authorize the page on every heartbeat without returning any record fields. */
export async function presenceKey(
  db: Knex,
  access: Access,
  scope: PresenceScope,
): Promise<string> {
  if (scope.kind === "page") {
    if (
      ["/admin/collections", "/admin/settings/integrations"].includes(
        scope.page,
      ) &&
      !access.principal.superuser
    ) {
      throw new AccessDeniedError();
    }
    const page = scope.page.replace(
      /^\/admin\/settings(?=\/|$)/,
      "/system-settings",
    );
    const needed = sections[page];
    if (needed && !access.principal.superuser) {
      const allowed = await effectiveSettingsAccess(db, access.principal.id);
      if (!needed.some((section) => allowed.sections.includes(section))) {
        throw new AccessDeniedError();
      }
    }
    return JSON.stringify(["page", page]);
  }
  const grant = requireGrant(access, scope.collection, "read");
  const settings = await findCollectionSettings(db, scope.collection);
  if (!settings) {
    throw new ItemError("Collection not found", 404);
  }
  if (scope.kind === "collection") {
    return JSON.stringify([scope.kind, settings.internalId]);
  }
  const row = await getItem(db, scope.collection, scope.id, grant, "", access);
  return JSON.stringify([
    scope.kind,
    settings.internalId,
    String(row[settings.primaryKey.name]),
  ]);
}
