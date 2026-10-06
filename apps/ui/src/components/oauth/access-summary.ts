import type { OAuthApplication } from "./types";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export function applicationAccessSummary(
  application: OAuthApplication,
  copy: UiCopy = originalCopy,
): string {
  if (application.accessMode === "all")
    return copy("Все активные пользователи");
  if (application.accessMode === "domains") {
    const domains = application.emailDomains.join(", ");
    if (!application.userIds.length) return domains;
    return copy("{{value0}} + {{value1}} польз.", {
      value0: domains,
      value1: application.userIds.length,
    });
  }
  if (!application.userIds.length) return copy("Вход запрещён всем");
  return copy("{{value0}} польз.", { value0: application.userIds.length });
}
